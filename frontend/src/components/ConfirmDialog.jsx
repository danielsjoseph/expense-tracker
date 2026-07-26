import { useEffect, useRef, useState } from 'react';

// Must match the CSS transition-duration on .dialog-backdrop/.dialog-card —
// the DOM node stays mounted this long after close() so the exit
// transition (reverse of the entrance) actually gets to play instead of
// the modal just vanishing.
const TRANSITION_MS = 180;

/** A small in-app confirmation modal, styled to match the rest of the app
 * (unlike window.confirm(), which is the browser's own unstyled dialog).
 * Fades/scales in and out, and closes on Escape or a backdrop click, same
 * as clicking Cancel. */
export default function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const confirmRef = useRef(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Mounting and marking it visible in the same tick wouldn't transition
      // (the browser needs a frame with the "before" state painted first).
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    setVisible(false);
    const timeout = setTimeout(() => setMounted(false), TRANSITION_MS);
    return () => clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!visible) return undefined;
    confirmRef.current?.focus();
    function handleKeyDown(event) {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible, onCancel]);

  if (!mounted) return null;

  return (
    <div className={`dialog-backdrop ${visible ? 'visible' : ''}`} onClick={onCancel}>
      <div
        className={`dialog-card ${visible ? 'visible' : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        {message && <p className="muted">{message}</p>}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button type="button" className="secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmRef}
            className={danger ? 'danger-solid' : ''}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
