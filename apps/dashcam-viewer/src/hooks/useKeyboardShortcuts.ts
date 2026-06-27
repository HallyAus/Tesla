import { useEffect } from 'react';

export interface ShortcutHandlers {
  togglePlay: () => void;
  frameStep: (frames: number) => void;
  prevSegment: () => void;
  nextSegment: () => void;
  rewind: () => void;
  forward: () => void;
  seekPercent: (digit: number) => void;
  toggleFullscreen: () => void;
  snapshot: () => void;
  toggleHelp: () => void;
}

/**
 * Wire global keyboard shortcuts. Ignores keystrokes while the user is typing
 * in a form field. Returns nothing; it just attaches/detaches the listener.
 *
 * Bindings:
 *  space        play/pause
 *  ← / →        frame-step back/forward
 *  , / .        previous / next segment
 *  J / K / L    rewind / pause / forward (video-editor convention)
 *  0-9          seek to N×10%
 *  F            fullscreen
 *  S            snapshot
 *  ?            shortcuts help
 */
export function useKeyboardShortcuts(
  handlers: ShortcutHandlers,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          handlers.togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handlers.frameStep(-1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          handlers.frameStep(1);
          break;
        case ',':
          e.preventDefault();
          handlers.prevSegment();
          break;
        case '.':
          e.preventDefault();
          handlers.nextSegment();
          break;
        case 'j':
        case 'J':
          handlers.rewind();
          break;
        case 'k':
        case 'K':
          handlers.togglePlay();
          break;
        case 'l':
        case 'L':
          handlers.forward();
          break;
        case 'f':
        case 'F':
          handlers.toggleFullscreen();
          break;
        case 's':
        case 'S':
          handlers.snapshot();
          break;
        case '?':
          handlers.toggleHelp();
          break;
        default:
          if (e.key >= '0' && e.key <= '9') {
            handlers.seekPercent(Number(e.key));
          }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlers, enabled]);
}
