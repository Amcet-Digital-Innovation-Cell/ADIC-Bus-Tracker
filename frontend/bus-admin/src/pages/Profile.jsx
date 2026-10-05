import { useEffect } from "react";
import { User, X } from "lucide-react";

export default function Profile({ isOpen, onClose, email = "admin@example.com" }) {

  /* Close on ESC key */
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'transparent',
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'flex-start',
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'absolute',
          top: '72px',
          right: '20px',
          width: '310px',
          backgroundColor: 'var(--color-navy)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.12)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          animation: 'slide-down 0.18s cubic-bezier(0.16,1,0.3,1)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ color: '#ffffff', fontSize: '15px', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
            Profile
          </h2>
          <button
            onClick={onClose}
            style={{
              width: '28px', height: '28px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; e.currentTarget.style.color = '#ffffff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
            title="Close"
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>

        {/* White inner card */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: 'var(--radius-md)',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          overflow: 'hidden',
        }}>
          {/* Avatar */}
          <div style={{
            width: '42px', height: '42px',
            borderRadius: '50%',
            backgroundColor: '#e2e8f0',
            border: '2px solid #cbd5e0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <User size={22} color="#4a5568" strokeWidth={2} />
          </div>

          {/* Email */}
          <a
            href={`mailto:${email}`}
            style={{
              fontSize: '13.5px',
              color: 'var(--color-text-secondary)',
              textDecoration: 'none',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--color-blue)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-secondary)'}
          >
            {email}
          </a>
        </div>
      </div>
    </div>
  );
}
