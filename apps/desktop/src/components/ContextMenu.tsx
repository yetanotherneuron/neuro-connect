import { useEffect, useRef, useState, type MouseEvent } from "react";
import "./ContextMenu.css";

export type MenuAction = { id: string; label: string; danger?: boolean; disabled?: boolean };

export function ContextMenu({
  x,
  y,
  items,
  onPick,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuAction[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: globalThis.MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="ctx-menu" style={{ left: x, top: y }} role="menu">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="menuitem"
          className={it.danger ? "danger" : undefined}
          disabled={it.disabled}
          onClick={() => {
            onPick(it.id);
            onClose();
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function useContextMenu() {
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: MenuAction[];
    onPick: (id: string) => void;
  } | null>(null);

  function openContextMenu(e: MouseEvent, items: MenuAction[], onPick: (id: string) => void) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items, onPick });
  }

  const node = menu ? (
    <ContextMenu
      x={menu.x}
      y={menu.y}
      items={menu.items}
      onPick={menu.onPick}
      onClose={() => setMenu(null)}
    />
  ) : null;

  return { openContextMenu, contextMenuNode: node };
}
