import { useState } from "react";
import type { UpdateManifest } from "../lib/types";
import { downloadAndApplyUpdate } from "../lib/native";
import { updateDownloadUrl } from "../lib/api";
import "./UpdateModal.css";

export function UpdateModal({
  manifest,
  onLater,
}: {
  manifest: UpdateManifest;
  onLater: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("Idle");
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setBusy(true);
    setError(null);
    setProgress("Downloading update…");
    try {
      const url = updateDownloadUrl(manifest.channel, manifest.platform, manifest.filename);
      setProgress("Verifying and installing…");
      await downloadAndApplyUpdate(url, manifest.sha256, manifest.filename);
      setProgress("Installer launched. You can close this app.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "update failed");
      setBusy(false);
      setProgress("Idle");
    }
  }

  return (
    <div className="update-overlay">
      <div className="update-modal app-fade">
        <h2>Update available</h2>
        <p className="update-version">
          Version <strong>{manifest.version}</strong> ({manifest.channel})
        </p>
        {manifest.notes && <p className="update-notes">{manifest.notes}</p>}
        <p className="muted update-progress">{progress}</p>
        {error && <p className="update-error">{error}</p>}
        <div className="update-actions">
          <button type="button" className="primary" disabled={busy} onClick={() => void apply()}>
            Update now
          </button>
          <button type="button" className="ghost" disabled={busy} onClick={onLater}>
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
