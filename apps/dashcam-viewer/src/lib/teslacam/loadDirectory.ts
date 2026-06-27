/**
 * Browser-side directory walking. Produces `RawClipFile[]` for the pure parser.
 *
 * Supports three input shapes:
 *   1. File System Access API `FileSystemDirectoryHandle` (preferred).
 *   2. `FileList` from `<input type="file" webkitdirectory>`.
 *   3. Drag-and-drop `DataTransferItemList` (webkit entries).
 */

import {
  materializeLibrary,
  parseLibrary,
  type RawClipFile,
} from './parse';
import type { ClipSource, ParsedLibrary } from './types';

export function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

function fileToSource(file: File): ClipSource {
  const url = URL.createObjectURL(file);
  return { url, size: file.size, revoke: () => URL.revokeObjectURL(url) };
}

function rawFromFile(relativePath: string, file: File): RawClipFile {
  return {
    relativePath,
    name: file.name,
    getSource: async () => fileToSource(file),
    getText: async () => file.text(),
  };
}

/** Keep only files under a `TeslaCam` root, or everything if no such root exists. */
function filterToTeslaCam(files: RawClipFile[]): RawClipFile[] {
  const hasRoot = files.some((f) => /(^|\/)TeslaCam(\/|$)/i.test(f.relativePath));
  if (!hasRoot) return files;
  return files.filter((f) => /(^|\/)TeslaCam(\/|$)/i.test(f.relativePath));
}

// ---------------------------------------------------------------------------
// 1. File System Access API
// ---------------------------------------------------------------------------

interface FsDirEntry {
  kind: 'file' | 'directory';
  name: string;
}

interface FsDirectoryHandle extends FsDirEntry {
  kind: 'directory';
  entries: () => AsyncIterableIterator<[string, FsDirEntry]>;
  getFileHandle?: (name: string) => Promise<FsFileHandle>;
}

interface FsFileHandle extends FsDirEntry {
  kind: 'file';
  getFile: () => Promise<File>;
}

async function walkHandle(
  dir: FsDirectoryHandle,
  prefix: string,
  out: RawClipFile[],
): Promise<void> {
  for await (const [name, entry] of dir.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (entry.kind === 'directory') {
      await walkHandle(entry as FsDirectoryHandle, path, out);
    } else {
      const handle = entry as FsFileHandle;
      out.push({
        relativePath: path,
        name,
        getSource: async () => fileToSource(await handle.getFile()),
        getText: async () => (await handle.getFile()).text(),
      });
    }
  }
}

export async function loadFromDirectoryHandle(
  handle: FsDirectoryHandle,
): Promise<ParsedLibrary> {
  const out: RawClipFile[] = [];
  await walkHandle(handle, handle.name, out);
  return parseAndMaterialize(out);
}

export async function pickDirectory(): Promise<ParsedLibrary> {
  if (!supportsDirectoryPicker()) {
    throw new Error('File System Access API is not supported in this browser.');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handle = (await (window as any).showDirectoryPicker({
    mode: 'read',
  })) as FsDirectoryHandle;
  return loadFromDirectoryHandle(handle);
}

// ---------------------------------------------------------------------------
// 2. <input webkitdirectory> FileList
// ---------------------------------------------------------------------------

export async function loadFromFileList(files: FileList): Promise<ParsedLibrary> {
  const out: RawClipFile[] = [];
  for (const file of Array.from(files)) {
    // webkitRelativePath looks like "TeslaCam/SavedClips/.../front.mp4".
    const rel =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
      file.name;
    out.push(rawFromFile(rel, file));
  }
  return parseAndMaterialize(out);
}

// ---------------------------------------------------------------------------
// 3. Drag-and-drop (webkit filesystem entries)
// ---------------------------------------------------------------------------

interface FsWebkitEntry {
  isFile: boolean;
  isDirectory: boolean;
  fullPath: string;
  name: string;
}
interface FsWebkitFileEntry extends FsWebkitEntry {
  file: (cb: (f: File) => void, err: (e: unknown) => void) => void;
}
interface FsWebkitDirEntry extends FsWebkitEntry {
  createReader: () => {
    readEntries: (cb: (e: FsWebkitEntry[]) => void, err: (e: unknown) => void) => void;
  };
}

function readAllEntries(
  reader: ReturnType<FsWebkitDirEntry['createReader']>,
): Promise<FsWebkitEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FsWebkitEntry[] = [];
    const next = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all);
        } else {
          all.push(...batch);
          next();
        }
      }, reject);
    };
    next();
  });
}

async function walkWebkitEntry(
  entry: FsWebkitEntry,
  out: RawClipFile[],
): Promise<void> {
  if (entry.isFile) {
    const fileEntry = entry as FsWebkitFileEntry;
    const file = await new Promise<File>((res, rej) =>
      fileEntry.file(res, rej),
    );
    const rel = entry.fullPath.replace(/^\//, '');
    out.push(rawFromFile(rel, file));
  } else if (entry.isDirectory) {
    const dirEntry = entry as FsWebkitDirEntry;
    const children = await readAllEntries(dirEntry.createReader());
    for (const child of children) await walkWebkitEntry(child, out);
  }
}

export async function loadFromDataTransfer(
  dt: DataTransfer,
): Promise<ParsedLibrary> {
  const out: RawClipFile[] = [];
  const items = Array.from(dt.items);
  const entries = items
    .map((it) =>
      'webkitGetAsEntry' in it
        ? (it.webkitGetAsEntry() as FsWebkitEntry | null)
        : null,
    )
    .filter((e): e is FsWebkitEntry => e != null);

  if (entries.length > 0) {
    for (const entry of entries) await walkWebkitEntry(entry, out);
  } else if (dt.files.length > 0) {
    // Fallback: flat file drop with no directory entries.
    return loadFromFileList(dt.files);
  }
  return parseAndMaterialize(out);
}

// ---------------------------------------------------------------------------

async function parseAndMaterialize(raw: RawClipFile[]): Promise<ParsedLibrary> {
  const pending = parseLibrary({ files: filterToTeslaCam(raw) });
  return materializeLibrary(pending);
}
