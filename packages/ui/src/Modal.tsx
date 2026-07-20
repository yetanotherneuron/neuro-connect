import type { ReactNode } from "react";
import { Button } from "./Button";

export function Modal({
  title,
  open,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="nc-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className={`nc-modal ${wide ? "nc-modal--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="nc-modal__head">
          <h2>{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </header>
        <div className="nc-modal__body">{children}</div>
        {footer && <footer className="nc-modal__foot">{footer}</footer>}
      </div>
    </div>
  );
}
