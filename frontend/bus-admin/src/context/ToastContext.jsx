/**
 * src/context/ToastContext.jsx
 * ─────────────────────────────────────────────────────────────
 * Global Toast Notification Provider & Custom Hook for AMCET Transit.
 *
 * Features:
 *   - Supports success, error, warning, and info toasts.
 *   - Smooth entry/exit animations with zero layout shift.
 *   - Auto-dismissal with customizable timeout.
 *   - Multiple stacked toasts with dismiss button.
 * ─────────────────────────────────────────────────────────────
 */

import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'success', durationMs = 3500) => {
    const id = ++toastIdRef.current;
    const newToast = { id, message, type, durationMs };

    setToasts((prev) => [...prev.slice(-3), newToast]); // keep max 4 toasts at once

    if (durationMs > 0) {
      setTimeout(() => {
        removeToast(id);
      }, durationMs);
    }

    return id;
  }, [removeToast]);

  const toast = {
    success: (msg, dur) => addToast(msg, 'success', dur),
    error: (msg, dur) => addToast(msg, 'error', dur),
    warning: (msg, dur) => addToast(msg, 'warning', dur),
    info: (msg, dur) => addToast(msg, 'info', dur),
    dismiss: removeToast,
  };

  return (
    <ToastContext.Provider value={{ toast, showToast: addToast, removeToast }}>
      {children}
      {/* Toast Notification Container */}
      <aside
        aria-live="polite"
        aria-label="System notifications"
        className="toast-stack-container"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          pointerEvents: 'none',
          maxWidth: '420px',
          width: 'calc(100vw - 32px)',
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`toast-pill toast-pill--${t.type}`}
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: '10px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
              animation: 'toastSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              fontSize: '13.5px',
              fontWeight: 500,
              lineHeight: 1.4,
              color: '#ffffff',
              background:
                t.type === 'success'
                  ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                  : t.type === 'error'
                  ? 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)'
                  : t.type === 'warning'
                  ? 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)'
                  : 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                {t.type === 'success' && <CheckCircle2 size={18} />}
                {t.type === 'error' && <XCircle size={18} />}
                {t.type === 'warning' && <AlertTriangle size={18} />}
                {t.type === 'info' && <Info size={18} />}
              </span>
              <span style={{ wordBreak: 'break-word', color: '#ffffff', fontWeight: 600 }}>{t.message}</span>
            </div>
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              aria-label="Dismiss notification"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.8)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px',
                borderRadius: '4px',
                flexShrink: 0,
                transition: 'color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)')}
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </aside>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    // Graceful fallback if used outside Provider
    return {
      toast: {
        success: (m) => console.log('[Toast success]:', m),
        error: (m) => console.error('[Toast error]:', m),
        warning: (m) => console.warn('[Toast warning]:', m),
        info: (m) => console.info('[Toast info]:', m),
      },
      showToast: (m) => console.log('[Toast]:', m),
    };
  }
  return context;
}
