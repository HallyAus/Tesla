import { useCallback, useRef, useState } from 'react';
import {
  loadFromDataTransfer,
  loadFromFileList,
  pickDirectory,
  supportsDirectoryPicker,
} from '../lib/teslacam/loadDirectory';
import type { ParsedLibrary } from '../lib/teslacam/types';

interface Props {
  onLibrary: (lib: ParsedLibrary) => void;
  onDemo: () => void;
  onError: (msg: string) => void;
}

/**
 * Entry point: pick a real `TeslaCam` folder (File System Access API), fall
 * back to `<input webkitdirectory>` / drag-and-drop, or load the demo event.
 */
export function SourcePicker({ onLibrary, onDemo, onError }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const canPick = supportsDirectoryPicker();

  const run = useCallback(
    async (fn: () => Promise<ParsedLibrary>) => {
      setBusy(true);
      try {
        const lib = await fn();
        if (lib.events.length === 0) {
          onError('No TeslaCam clips found in that folder.');
        } else {
          onLibrary(lib);
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          onError((err as Error).message || 'Failed to read folder.');
        }
      } finally {
        setBusy(false);
      }
    },
    [onLibrary, onError],
  );

  return (
    <div
      className={`picker ${dragOver ? 'picker--drag' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void run(() => loadFromDataTransfer(e.dataTransfer));
      }}
    >
      <h2>Open TeslaCam footage</h2>
      <p className="picker-sub">
        100% local. Nothing is uploaded — files are read directly in your browser.
      </p>

      <div className="picker-actions">
        {canPick ? (
          <button
            className="btn btn--primary"
            disabled={busy}
            onClick={() => void run(pickDirectory)}
          >
            Choose TeslaCam folder
          </button>
        ) : (
          <button
            className="btn btn--primary"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            Choose TeslaCam folder
          </button>
        )}

        <button className="btn" disabled={busy} onClick={onDemo}>
          Load sample event
        </button>
      </div>

      <p className="picker-drop-hint">…or drag &amp; drop a TeslaCam folder here</p>

      {!canPick && (
        <p className="picker-note">
          Your browser lacks the File System Access API; using the
          folder-input fallback. For the best experience use a Chromium-based
          browser (Chrome / Edge).
        </p>
      )}

      {/* webkitdirectory fallback input */}
      <input
        ref={inputRef}
        type="file"
        // @ts-expect-error non-standard but widely supported attribute
        webkitdirectory=""
        directory=""
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void run(() => loadFromFileList(e.target.files!));
          }
        }}
      />
    </div>
  );
}
