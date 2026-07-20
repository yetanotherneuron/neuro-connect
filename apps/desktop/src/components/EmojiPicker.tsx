import { useEffect, useRef } from "react";
import EmojiPicker, { Theme, type EmojiClickData } from "emoji-picker-react";
import "./EmojiPicker.css";

export function EmojiPickerPopover({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="nc-emoji-popover" ref={ref}>
      <EmojiPicker
        theme={Theme.DARK}
        width={320}
        height={380}
        searchPlaceHolder="Search emoji"
        previewConfig={{ showPreview: false }}
        onEmojiClick={(data: EmojiClickData) => onPick(data.emoji)}
      />
    </div>
  );
}
