import { useEffect, useRef } from 'react';
import { LogOut, X } from 'lucide-react';

/* ─────────────────────────────────────────────────────────
   LogoutModal — confirmation dialog before signing out
   Props: isOpen, onCancel, onConfirm
───────────────────────────────────────────────────────── */
export default function LogoutModal({ isOpen, onCancel, onConfirm }) {
  const cancelBtnRef = useRef(null);

  /* Close on ESC key */
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onCancel]);

  /* Auto-focus Cancel when modal opens */
  useEffect(() => {
    if (isOpen) cancelBtnRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="logout-overlay"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-title"
    >
      <div
        className="logout-modal"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Red icon badge */}
        <div className="logout-modal__icon-wrap">
          <LogOut size={28} color="#ef4444" strokeWidth={2} />
        </div>

        {/* Title */}
        <h2 className="logout-modal__title" id="logout-title">Logout</h2>

        {/* Message */}
        <p className="logout-modal__message">
          Are you sure you want to logout from your account?
        </p>

        {/* Action buttons */}
        <div className="logout-modal__actions">
          <button
            ref={cancelBtnRef}
            className="logout-modal__btn logout-modal__btn--cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="logout-modal__btn logout-modal__btn--confirm"
            onClick={onConfirm}
          >
            <LogOut size={14} strokeWidth={2} />
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
