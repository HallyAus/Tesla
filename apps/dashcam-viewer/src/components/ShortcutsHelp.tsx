interface Props {
  onClose: () => void;
}

const SHORTCUTS: Array<[string, string]> = [
  ['Space / K', 'Play / pause'],
  ['← / →', 'Step one frame back / forward'],
  [', / .', 'Previous / next segment'],
  ['J / L', 'Rewind / fast-forward'],
  ['0 – 9', 'Seek to 0%–90%'],
  ['F', 'Toggle fullscreen'],
  ['S', 'Snapshot current frame (PNG)'],
  ['?', 'Toggle this help'],
];

/** Modal overlay listing keyboard shortcuts. */
export function ShortcutsHelp({ onClose }: Props) {
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Keyboard shortcuts</h2>
          <button className="btn btn--ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <dl className="shortcuts">
          {SHORTCUTS.map(([keys, desc]) => (
            <div className="shortcut-row" key={keys}>
              <dt>
                <kbd>{keys}</kbd>
              </dt>
              <dd>{desc}</dd>
            </div>
          ))}
        </dl>
        <p className="modal-foot">Press ? again to close.</p>
      </div>
    </div>
  );
}
