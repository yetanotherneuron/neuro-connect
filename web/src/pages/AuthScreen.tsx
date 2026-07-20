/** TODO: Connect register/login to /api/auth/* */
import type { CSSProperties } from "react";

export function AuthScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "min(400px, 100%)",
          background: "rgba(14,14,20,0.95)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 24,
        }}
      >
        <h1 style={{ marginTop: 0 }}>Neuro Connect</h1>
        <p style={{ color: "var(--muted)" }}>
          Web / mobile scaffold. Full chat and voice will share the desktop design.
        </p>
        <input
          placeholder="username"
          style={field}
          disabled
          title="TODO: wire auth"
        />
        <input placeholder="password" type="password" style={field} disabled />
        <button
          style={{
            width: "100%",
            marginTop: 12,
            padding: 12,
            borderRadius: 8,
            background: "var(--accent)",
            fontWeight: 600,
          }}
          onClick={onContinue}
        >
          Preview UI (no API yet)
        </button>
      </div>
    </div>
  );
}

const field: CSSProperties = {
  width: "100%",
  marginTop: 8,
  padding: 10,
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg)",
};
