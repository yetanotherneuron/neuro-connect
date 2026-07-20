/**
 * Mobile-friendly shell mirroring the desktop layout.
 * TODO: Channel list, message stream, WebSocket, voice join.
 */
export function ShellScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        gridTemplateRows: "56px 1fr 64px",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-panel)",
        }}
      >
        <strong>Neuro Connect</strong>
        <button onClick={onLogout} style={{ color: "var(--muted)" }}>
          Log out
        </button>
      </header>
      <main style={{ padding: 16 }}>
        <h2 style={{ marginTop: 0 }}># general</h2>
        <p style={{ color: "var(--muted)" }}>
          TODO: Render Markdown messages from the server API. This scaffold is
          intentionally incomplete so the desktop MVP can ship first.
        </p>
        <div
          style={{
            marginTop: 24,
            padding: 16,
            borderRadius: 12,
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
          }}
        >
          <strong>Voice</strong>
          <p style={{ color: "var(--muted)", marginBottom: 0 }}>
            TODO: WebRTC / Opus in mobile browsers - PTT and open mic.
          </p>
        </div>
      </main>
      <footer
        style={{
          display: "flex",
          gap: 8,
          padding: 12,
          borderTop: "1px solid var(--border)",
          background: "var(--bg-panel)",
        }}
      >
        <input
          placeholder="Message #general"
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--bg)",
          }}
          disabled
        />
        <button
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            background: "var(--accent)",
            fontWeight: 600,
          }}
          disabled
        >
          Send
        </button>
      </footer>
    </div>
  );
}
