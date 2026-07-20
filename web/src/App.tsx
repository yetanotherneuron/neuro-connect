/**
 * Neuro Connect - Web client scaffold
 * TODO: Wire the same REST + WebSocket APIs as the desktop client.
 * TODO: Add WebRTC voice (Opus) for mobile browsers.
 * TODO: Service worker / PWA offline cache.
 */
import { useState } from "react";
import { AuthScreen } from "./pages/AuthScreen";
import { ShellScreen } from "./pages/ShellScreen";
import "./styles/global.css";

export function App() {
  const [authed, setAuthed] = useState(false);

  if (!authed) {
    return <AuthScreen onContinue={() => setAuthed(true)} />;
  }
  return <ShellScreen onLogout={() => setAuthed(false)} />;
}
