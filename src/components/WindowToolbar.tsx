import {
  forwardRef,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

export function WindowToolbar({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex shrink-0 items-center gap-1"
    >
      {children}
    </div>
  );
}

interface ToolButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tooltip?: string;
}

/** Shared window tools, with a portal so hints also work near clipped window edges. */
export const WindowToolButton = forwardRef<HTMLButtonElement, ToolButtonProps>(
  function WindowToolButton(
    { label, tooltip = label, className = '', children, ...props },
    ref
  ) {
    const id = useId();
    const anchor = useRef<HTMLSpanElement>(null);
    const hint = useRef<HTMLDivElement>(null);
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const [position, setPosition] = useState({ left: 0, top: 0 });
    const open = (hovered || focused) && !dismissed;
    useLayoutEffect(() => {
      if (!open) return;
      const place = () => {
        const rect = anchor.current?.getBoundingClientRect();
        const size = hint.current?.getBoundingClientRect();
        if (!rect || !size) return;
        const left = Math.max(
          8,
          Math.min(
            rect.left + (rect.width - size.width) / 2,
            window.innerWidth - size.width - 8
          )
        );
        const top =
          rect.bottom + size.height + 14 <= window.innerHeight
            ? rect.bottom + 6
            : Math.max(8, rect.top - size.height - 6);
        setPosition({ left, top });
      };
      place();
      window.addEventListener('resize', place);
      window.addEventListener('scroll', place, true);
      return () => {
        window.removeEventListener('resize', place);
        window.removeEventListener('scroll', place, true);
      };
    }, [open, tooltip]);
    return (
      <span
        ref={anchor}
        className="inline-flex shrink-0"
        onMouseEnter={() => {
          setHovered(true);
          setDismissed(false);
        }}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => {
          setFocused(true);
          setDismissed(false);
        }}
        onBlurCapture={() => setFocused(false)}
        onKeyDownCapture={(event) => {
          if (event.key === 'Escape') setDismissed(true);
        }}
      >
        <button
          {...props}
          ref={ref}
          type={props.type ?? 'button'}
          aria-label={label}
          aria-describedby={open ? id : undefined}
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-400 disabled:cursor-not-allowed disabled:opacity-35 ${className}`}
        >
          {children}
        </button>
        {open &&
          createPortal(
            <div
              ref={hint}
              id={id}
              role="tooltip"
              className="pointer-events-none fixed z-[10003] max-w-[min(18rem,calc(100vw-16px))] rounded-md border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 shadow-xl"
              style={position}
            >
              {tooltip}
            </div>,
            document.body
          )}
      </span>
    );
  }
);
