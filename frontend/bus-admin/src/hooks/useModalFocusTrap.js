/**
 * src/hooks/useModalFocusTrap.js
 * ─────────────────────────────────────────────────────────────
 * Accessible Modal Focus Trap & Keyboard Navigation Hook.
 *
 * Capabilities:
 *   1. Traps Tab and Shift+Tab navigation strictly inside open modal.
 *   2. Automatically focuses the first interactive field upon opening.
 *   3. Restores focus to the triggering element upon closing.
 *   4. Listens for Escape key to close the modal smoothly.
 *   5. Disables background body scrolling while modal is open.
 * ─────────────────────────────────────────────────────────────
 */

import { useEffect, useRef } from 'react';

export function useModalFocusTrap(isOpen, onClose) {
  const modalRef = useRef(null);
  const previousActiveElementRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    // Save previously focused element to restore when closed
    previousActiveElementRef.current = document.activeElement;

    // Disable body scroll
    const originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus first interactive element inside modal
    const focusableSelectors = [
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'button:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const timer = setTimeout(() => {
      if (modalRef.current) {
        const focusable = modalRef.current.querySelectorAll(focusableSelectors);
        if (focusable.length > 0) {
          focusable[0].focus();
        } else {
          modalRef.current.focus?.();
        }
      }
    }, 50);

    // Keyboard handlers (Tab trap & Escape close)
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }

      if (e.key === 'Tab') {
        if (!modalRef.current) return;
        const focusable = Array.from(modalRef.current.querySelectorAll(focusableSelectors));
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          // Shift + Tab
          if (document.activeElement === first || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          // Tab
          if (document.activeElement === last || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalBodyOverflow;
      window.removeEventListener('keydown', handleKeyDown);

      // Restore focus
      if (previousActiveElementRef.current?.focus) {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  return modalRef;
}
