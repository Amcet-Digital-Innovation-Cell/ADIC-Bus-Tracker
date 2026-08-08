import { useEffect } from "react";
import { User, ArrowLeft } from "lucide-react";

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
        background: 'rgba(0, 0, 0, 0.05)',
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'flex-start',
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'absolute',
          top: '75px',
          right: '30px',
          width: '330px',
          backgroundColor: '#2C3E50',
          borderRadius: '16px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          animation: 'modal-scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          {/* Circular back arrow button */}
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: '2px solid #ffffff',
              background: 'transparent',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              transition: 'background-color 0.2s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            title="Go back"
          >
            <ArrowLeft size={16} strokeWidth={2.5} />
          </button>

          {/* Title */}
          <h2 style={{
            color: '#ffffff',
            fontSize: '18px',
            fontWeight: 'normal',
            margin: 0,
            fontFamily: 'Arial, sans-serif',
          }}>
            Profile
          </h2>
        </div>

        {/* White inner card */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          width: '100%',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}>
          {/* Grey circular avatar with dark border */}
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            backgroundColor: '#d1d5db',
            border: '2px solid #374151',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <User size={26} color="#000000" fill="#000000" />
          </div>

          {/* Clickable email link */}
          <a
            href={`mailto:${email}`}
            style={{
              fontSize: '16px',
              color: '#000000',
              textDecoration: 'underline',
              fontFamily: 'Georgia, serif',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {email}
          </a>
        </div>
      </div>
    </div>
  );
}
