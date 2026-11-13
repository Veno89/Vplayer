import { useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialogFocus } from '../../hooks/useDialogFocus';

export function PlayerDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const id = useId();
  const { dialogRef, onKeyDown } = useDialogFocus(true, onClose);
  return createPortal(<div className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/50 p-4" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} onKeyDown={onKeyDown} className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-xl border border-slate-600 bg-slate-900 p-4 text-slate-200 shadow-2xl">
      <div className="mb-4 flex items-center justify-between gap-2"><h3 id={id} className="font-semibold text-white">{title}</h3><button aria-label={`Close ${title}`} onClick={onClose} className="rounded-sm p-1 hover:bg-slate-700"><X className="h-4 w-4" /></button></div>
      {children}
    </div>
  </div>, document.body);
}
