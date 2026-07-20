import { createContext, useCallback, useContext, useMemo, useState } from "react";
import "./Toast.css";

export type ToastKind = "error" | "info" | "success";

type ToastItem = { id: number; kind: ToastKind; text: string };

type ToastApi = {
  pushToast: (text: string, kind?: ToastKind) => void;
};

const ToastContext = createContext<ToastApi>({ pushToast: () => undefined });

const MAX_TOASTS = 4;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const pushToast = useCallback((text: string, kind: ToastKind = "error") => {
    const id = Date.now() + Math.random();
    setItems((prev) => [{ id, kind, text }, ...prev].slice(0, MAX_TOASTS));
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const api = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span>{t.text}</span>
            <button
              type="button"
              className="toast-close"
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
