import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'button:not(:disabled)',
  '[href]',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useDialogFocus(active: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => {
      const dialog = dialogRef.current;
      dialog?.querySelector<HTMLElement>('[autofocus], input, button:not(:disabled)')?.focus();
      if (dialog && !dialog.contains(document.activeElement)) dialog.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      previouslyFocused?.focus();
    };
  }, [active]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    ).filter(element => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return { dialogRef, onKeyDown };
}
