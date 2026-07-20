import { useEffect, useState } from "react";
import {
  GOLDBERG_DEFAULT_PORT,
  goldbergApplyBroadcasts,
  goldbergImportAssets,
  goldbergPrepareGame,
  goldbergStatus,
  localIpv4,
  type GoldbergStatus,
} from "../lib/native";
import {
  createGameHost,
  deleteGameHost,
  lookupGameHostCode,
} from "../lib/api";
import type { GameHostInfo } from "../lib/types";
import { useToast } from "./Toast";
import "./GameHostsView.css";

function hostIp(address: string): string {
  return address.split(":")[0]?.trim() || address.trim();
}

export function GameHostsView({
  gameHosts,
  localUserId,
  localDisplayName,
  activeServerId,
  canModerate,
  onGameHostsChange,
}: {
  gameHosts: GameHostInfo[];
  localUserId: string;
  localDisplayName: string;
  activeServerId?: string | null;
  canModerate: boolean;
  onGameHostsChange: (hosts: GameHostInfo[]) => void;
}) {
  const [hostMode, setHostMode] = useState<"direct" | "goldberg">("goldberg");
  const [gameForm, setGameForm] = useState({
    game_name: "",
    address: "",
    note: "",
    app_id: "",
    connect_command: "",
  });
  const [joinCode, setJoinCode] = useState("");
  const [lastPostedCode, setLastPostedCode] = useState<string | null>(null);
  const [gb, setGb] = useState<GoldbergStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const { pushToast } = useToast();

  useEffect(() => {
    void localIpv4().then((ip) => {
      if (!ip) return;
      setGameForm((f) => {
        const port = hostMode === "goldberg" ? GOLDBERG_DEFAULT_PORT : 24642;
        if (!f.address) return { ...f, address: `${ip}:${port}` };
        return f;
      });
    });
  }, []);

  useEffect(() => {
    void localIpv4().then((ip) => {
      if (!ip) return;
      setGameForm((f) => {
        const port = hostMode === "goldberg" ? GOLDBERG_DEFAULT_PORT : 24642;
        const curIp = hostIp(f.address);
        if (!f.address || curIp === ip) {
          return { ...f, address: `${ip}:${port}` };
        }
        return f;
      });
    });
  }, [hostMode]);

  useEffect(() => {
    void goldbergStatus()
      .then(setGb)
      .catch(() => setGb(null));
  }, []);

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      pushToast(`${label} copied`, "success");
    } catch {
      pushToast("Copy failed", "error");
    }
  }

  async function joinWithCode() {
    const code = joinCode.trim();
    if (!code) return;
    setBusy(true);
    try {
      const host = await lookupGameHostCode(code);
      onGameHostsChange([host, ...gameHosts.filter((h) => h.id !== host.id)]);
      const share = host.room_code || code.toUpperCase();
      if (host.kind === "goldberg") {
        await goldbergApplyBroadcasts([host.address]);
        pushToast(
          `Room ${share}: LAN peers set to ${hostIp(host.address)}. Start your prepared game.`,
          "success",
        );
      } else {
        await copyText("Address", host.address);
        pushToast(`Room ${share}: paste ${host.address} in the game join box`, "success");
      }
      if (host.connect_command) {
        await copyText("Connect command", host.connect_command);
      }
      setJoinCode("");
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "join failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function postHost() {
    setBusy(true);
    try {
      const host = await createGameHost({
        game_name: gameForm.game_name.trim(),
        address: gameForm.address.trim(),
        note: gameForm.note.trim() || undefined,
        kind: hostMode,
        app_id: hostMode === "goldberg" ? gameForm.app_id.trim() : undefined,
        connect_command: gameForm.connect_command.trim() || undefined,
        server_id: activeServerId,
      });
      onGameHostsChange([host, ...gameHosts.filter((h) => h.id !== host.id)]);
      setLastPostedCode(host.room_code);
      setGameForm((f) => ({ ...f, game_name: "", note: "", connect_command: "" }));
      await copyText("Room code", host.room_code);
      pushToast(`Room code ${host.room_code} — give this to friends`, "success");
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="game-hosts-view app-fade">
      <header className="game-hosts-header">
        <h2>Game Hosts</h2>
        <p className="muted">
          Host a LAN / Steam-LAN room. Friends join with your room code — not by guessing ports.
        </p>
      </header>

      <div className="game-hosts-body">
        <section className="hosts-section">
          <h3>Join with room code</h3>
          <div className="hosts-row">
            <input
              className="nc-input"
              placeholder="e.g. N7K2Q9"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") void joinWithCode();
              }}
            />
            <button
              type="button"
              className="primary"
              disabled={busy || !joinCode.trim()}
              onClick={() => void joinWithCode()}
            >
              Join room
            </button>
          </div>
        </section>

        <section className="hosts-section">
          <h3>Host a room</h3>
          <div className="host-mode-toggle">
            <button
              type="button"
              className={hostMode === "goldberg" ? "primary sm" : "ghost sm"}
              onClick={() => setHostMode("goldberg")}
            >
              Steam LAN (Goldberg)
            </button>
            <button
              type="button"
              className={hostMode === "direct" ? "primary sm" : "ghost sm"}
              onClick={() => setHostMode("direct")}
            >
              Direct IP:port
            </button>
          </div>

          {hostMode === "goldberg" && (
            <div className="goldberg-box">
              <p className="muted">
                {gb?.note ||
                  "Import a Goldberg Steam Emulator release once, then prepare the game folder."}
              </p>
              <div className="hosts-actions">
                <button
                  type="button"
                  className="ghost sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const s = await goldbergImportAssets();
                      setGb(s);
                      pushToast(
                        s.ready ? "Goldberg assets imported" : s.note,
                        s.ready ? "success" : "error",
                      );
                    } catch (e) {
                      if (String(e).includes("cancelled")) return;
                      pushToast(e instanceof Error ? e.message : "import failed", "error");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {gb?.ready ? "Re-import Goldberg" : "Import Goldberg release"}
                </button>
                <button
                  type="button"
                  className="primary sm"
                  disabled={busy || !gb?.ready || !gameForm.app_id.trim()}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const prep = await goldbergPrepareGame(
                        gameForm.app_id.trim(),
                        localDisplayName || "Player",
                      );
                      setGameForm((f) => ({
                        ...f,
                        address: f.address.includes(":")
                          ? `${hostIp(f.address)}:${prep.listen_port}`
                          : `${hostIp(f.address) || "127.0.0.1"}:${prep.listen_port}`,
                        game_name: f.game_name || `App ${prep.app_id}`,
                      }));
                      pushToast(
                        `Prepared ${prep.arch} game (port ${prep.listen_port}). Start the game, then Host a room.`,
                        "success",
                      );
                    } catch (e) {
                      if (String(e).includes("cancelled")) return;
                      pushToast(e instanceof Error ? e.message : "prepare failed", "error");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Prepare game folder
                </button>
              </div>
            </div>
          )}

          <div className="game-host-form">
            <input
              className="nc-input"
              placeholder="Game name"
              value={gameForm.game_name}
              onChange={(e) => setGameForm((f) => ({ ...f, game_name: e.target.value }))}
            />
            {hostMode === "goldberg" && (
              <input
                className="nc-input"
                placeholder="Steam AppID (steamdb.info)"
                value={gameForm.app_id}
                onChange={(e) => setGameForm((f) => ({ ...f, app_id: e.target.value }))}
              />
            )}
            <input
              className="nc-input"
              placeholder={
                hostMode === "goldberg"
                  ? `Your LAN IP:${GOLDBERG_DEFAULT_PORT}`
                  : "IP:port friends should use"
              }
              value={gameForm.address}
              onChange={(e) => setGameForm((f) => ({ ...f, address: e.target.value }))}
            />
            <input
              className="nc-input"
              placeholder="Note (optional)"
              value={gameForm.note}
              onChange={(e) => setGameForm((f) => ({ ...f, note: e.target.value }))}
            />
            <input
              className="nc-input"
              placeholder="Optional +connect_lobby … (rich presence)"
              value={gameForm.connect_command}
              onChange={(e) => setGameForm((f) => ({ ...f, connect_command: e.target.value }))}
            />
            <button
              type="button"
              className="primary sm"
              disabled={
                busy ||
                !gameForm.game_name.trim() ||
                !gameForm.address.trim() ||
                (hostMode === "goldberg" && !gameForm.app_id.trim())
              }
              onClick={() => void postHost()}
            >
              Host a room
            </button>
          </div>

          {lastPostedCode && (
            <div className="room-code-banner">
              <span className="muted">Give friends this code:</span>
              <strong className="room-code-value">{lastPostedCode}</strong>
              <button
                type="button"
                className="primary sm"
                onClick={() => void copyText("Room code", lastPostedCode)}
              >
                Copy code
              </button>
            </div>
          )}
        </section>

        <section className="hosts-section">
          <h3>Active rooms</h3>
          {gameHosts.length === 0 && <p className="muted">No active game rooms.</p>}
          {gameHosts.map((h) => (
            <div key={h.id} className="host-row">
              <div>
                <strong>{h.game_name}</strong>
                <div className="room-code-inline">
                  Code <kbd>{h.room_code}</kbd>
                  {h.kind === "goldberg" ? " · Steam LAN" : " · Direct"}
                </div>
                <div className="muted">
                  {h.address} · {h.user.display_name}
                  {h.app_id ? ` · app ${h.app_id}` : ""}
                  {h.note ? ` · ${h.note}` : ""}
                </div>
              </div>
              <div className="hosts-actions">
                <button
                  type="button"
                  className="primary sm"
                  onClick={() => void copyText("Room code", h.room_code)}
                >
                  Copy code
                </button>
                <button
                  type="button"
                  className="ghost sm"
                  onClick={async () => {
                    try {
                      if (h.kind === "goldberg") {
                        await goldbergApplyBroadcasts([h.address]);
                        pushToast(`LAN peers set to ${hostIp(h.address)}`, "success");
                      } else {
                        await copyText("Address", h.address);
                      }
                      if (h.connect_command) {
                        await copyText("Connect command", h.connect_command);
                      }
                    } catch (e) {
                      pushToast(e instanceof Error ? e.message : "failed", "error");
                    }
                  }}
                >
                  {h.kind === "goldberg" ? "Apply LAN" : "Copy IP"}
                </button>
                {(h.user.id === localUserId || canModerate) && (
                  <button
                    type="button"
                    className="danger sm"
                    onClick={async () => {
                      try {
                        await deleteGameHost(h.id);
                        onGameHostsChange(gameHosts.filter((x) => x.id !== h.id));
                        if (lastPostedCode === h.room_code) setLastPostedCode(null);
                      } catch (e) {
                        pushToast(e instanceof Error ? e.message : "failed", "error");
                      }
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
