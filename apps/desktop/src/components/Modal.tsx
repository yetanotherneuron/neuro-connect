import { useEffect, useRef, useState, type ReactNode } from "react";
import "./Modal.css";

export function Modal({
  title,
  children,
  onClose,
  wide,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="nc-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className={`nc-modal${wide ? " wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p>{message}</p>
      <div className="nc-modal-actions">
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={danger ? "danger" : "primary"}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function PromptDialog({
  title,
  label,
  defaultValue = "",
  placeholder,
  confirmLabel = "OK",
  onConfirm,
  onCancel,
}: {
  title: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function submit() {
    const v = value.trim();
    if (!v) return;
    onConfirm(v);
  }

  return (
    <Modal title={title} onClose={onCancel}>
      <div className="nc-modal-fields">
        <label>
          {label}
          <input
            ref={inputRef}
            className="nc-input"
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
        </label>
      </div>
      <div className="nc-modal-actions">
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="primary" disabled={!value.trim()} onClick={submit}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function SelectDialog({
  title,
  label,
  options,
  defaultValue,
  confirmLabel = "OK",
  onConfirm,
  onCancel,
}: {
  title: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue || options[0]?.value || "");

  return (
    <Modal title={title} onClose={onCancel}>
      <div className="nc-modal-fields">
        <label>
          {label}
          <select className="nc-select" value={value} onChange={(e) => setValue(e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="nc-modal-actions">
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="primary" onClick={() => onConfirm(value)}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
