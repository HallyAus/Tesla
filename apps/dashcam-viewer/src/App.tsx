import { useCallback, useState } from 'react';
import type { ClipEvent, ParsedLibrary } from './lib/teslacam/types';
import type { PlayableEvent } from './lib/player/model';
import { playableFromClipEvent } from './lib/player/fromLibrary';
import { generateDemoEvent } from './lib/demo/generate';
import { SourcePicker } from './components/SourcePicker';
import { EventList } from './components/EventList';
import { Player } from './components/Player';

export default function App() {
  const [library, setLibrary] = useState<ParsedLibrary | null>(null);
  const [event, setEvent] = useState<PlayableEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectClipEvent = useCallback((ce: ClipEvent) => {
    setEvent((prev) => {
      prev?.dispose?.();
      return playableFromClipEvent(ce);
    });
  }, []);

  const onLibrary = useCallback(
    (lib: ParsedLibrary) => {
      setError(null);
      setLibrary(lib);
      if (lib.events.length > 0) selectClipEvent(lib.events[0]);
    },
    [selectClipEvent],
  );

  const onDemo = useCallback(() => {
    setError(null);
    setLibrary(null);
    setEvent((prev) => {
      prev?.dispose?.();
      return generateDemoEvent();
    });
  }, []);

  const reset = useCallback(() => {
    setEvent((prev) => {
      prev?.dispose?.();
      return null;
    });
    setLibrary(null);
    setError(null);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">▣</span>
          <span>TeslaCam Viewer</span>
        </div>
        {event && (
          <button className="btn btn--ghost" onClick={reset}>
            Open another source
          </button>
        )}
      </header>

      {error && (
        <div className="banner banner--error" role="alert">
          <span>{error}</span>
          <button
            className="banner-dismiss"
            onClick={() => setError(null)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {!event ? (
        <main className="app-main app-main--center">
          <SourcePicker
            onLibrary={onLibrary}
            onDemo={onDemo}
            onError={setError}
            onBusyChange={setLoading}
          />
        </main>
      ) : (
        <main className="app-main">
          {library && library.events.length > 0 && (
            <nav className="sidebar" aria-label="Events">
              <h2 className="sidebar-title">
                Events <span className="count">{library.events.length}</span>
              </h2>
              <EventList
                events={library.events}
                selectedId={event.source === 'folder' ? event.id : null}
                onSelect={selectClipEvent}
              />
              {library.warnings.length > 0 && (
                <details className="warnings">
                  <summary>{library.warnings.length} warning(s)</summary>
                  <ul>
                    {library.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </details>
              )}
            </nav>
          )}
          <Player event={event} onError={setError} />
        </main>
      )}

      {loading && (
        <div className="loading-overlay" role="status" aria-live="polite">
          <span className="spinner spinner--lg" aria-hidden="true" />
          <span>Reading TeslaCam folder…</span>
        </div>
      )}

      <footer className="app-footer">
        Local-first · no upload · open-source TeslaCam / Sentry viewer ·{' '}
        <span className="footer-hint">press ? for shortcuts</span>
      </footer>
    </div>
  );
}
