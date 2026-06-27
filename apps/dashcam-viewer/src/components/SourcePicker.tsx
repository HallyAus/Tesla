import { useCallback, useRef, useState } from 'react';
import {
  loadFromDataTransfer,
  loadFromFileList,
  pickDirectory,
} from '../lib/teslacam/loadDirectory';
import { currentPickerMode } from '../lib/teslacam/secureContext';
import type { ParsedLibrary } from '../lib/teslacam/types';

interface Props {
  onLibrary: (lib: ParsedLibrary) => void;
  onDemo: () => void;
  onError: (msg: string) => void;
  onBusyChange?: (busy: boolean) => void;
}

/**
 * Entry point: pick a real `TeslaCam` folder (File System Access API), fall
 * back to `<input webkitdirectory>` / drag-and-drop, or load the demo event.
 *
 * The primary affordance is chosen by `currentPickerMode()`:
 *   - `'picker'`   — secure context (HTTPS / localhost) *and* the File System
 *                    Access API is present: the native folder picker is offered.
 *   - `'dragdrop'` — insecure context (e.g. HA over plain HTTP) or no API:
 *                    drag-and-drop becomes the primary path and a friendly note
 *                    explains the picker needs HTTPS. Footage stays local either
 *                    way — drag-and-drop reads files entirely in the browser.
 */
export function SourcePicker({ onLibrary, onDemo, onError, onBusyChange }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const mode = currentPickerMode();
  const canPick = mode === 'picker';

  const run = useCallback(
    async (fn: () => Promise<ParsedLibrary>) => {
      setBusy(true);
      onBusyChange?.(true);
      try {
        const lib = await fn();
        if (lib.events.length === 0) {
          onError(
            'No TeslaCam clips found in that folder. Pick the folder that contains RecentClips / SavedClips / SentryClips (or the TeslaCam root).',
          );
        } else {
          onLibrary(lib);
        }
      } catch (err) {
        const e = err as Error;
        if (e.name === 'AbortError') {
          /* user cancelled the picker – not an error */
        } else if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
          onError('Permission to read that folder was denied. Please allow access and try again.');
        } else {
          onError(e.message || 'Failed to read folder.');
        }
      } finally {
        setBusy(false);
        onBusyChange?.(false);
      }
    },
    [onLibrary, onError, onBusyChange],
  );

  return (
    <div
      className={`picker ${dragOver ? 'picker--drag' : ''} ${
        canPick ? '' : 'picker--dragfirst'
      }`}
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

      {canPick ? (
        <>
          <div className="picker-actions">
            <button
              className="btn btn--primary"
              disabled={busy}
              onClick={() => void run(pickDirectory)}
            >
              Choose TeslaCam folder
            </button>
            <button className="btn" disabled={busy} onClick={onDemo}>
              Load sample event
            </button>
          </div>
          {busy && (
            <p className="picker-loading" role="status" aria-live="polite">
              <span className="spinner" aria-hidden="true" /> Reading folder…
            </p>
          )}
          <p className="picker-drop-hint">…or drag &amp; drop a TeslaCam folder here</p>
        </>
      ) : (
        <>
          {/* Insecure context / no File System Access API: drag-and-drop is the
              primary path. It reads files locally just like the picker. */}
          <p className="picker-drop-primary">
            Drag &amp; drop your <strong>TeslaCam</strong> folder anywhere on this
            panel to begin.
          </p>
          <div className="picker-actions">
            <button
              className="btn btn--primary"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              Or choose a folder…
            </button>
            <button className="btn" disabled={busy} onClick={onDemo}>
              Load sample event
            </button>
          </div>
          {busy && (
            <p className="picker-loading" role="status" aria-live="polite">
              <span className="spinner" aria-hidden="true" /> Reading folder…
            </p>
          )}
          <p className="picker-note">
            The one-click folder picker needs a <strong>secure (HTTPS)</strong>{' '}
            connection — e.g. access Home Assistant via Nabu Casa Remote or an
            HTTPS reverse proxy to enable it. Drag-and-drop and the folder chooser
            above work right now, and your footage still never leaves your browser.
          </p>
        </>
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
