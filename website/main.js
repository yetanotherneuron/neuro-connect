(function () {
  "use strict";

  var cfg = window.NEURO_SITE || {};
  var channel = cfg.defaultChannel === "release" ? "release" : "beta";
  var platform = detectPlatform();

  var els = {
    channelBeta: document.getElementById("channel-beta"),
    channelRelease: document.getElementById("channel-release"),
    platformHint: document.getElementById("platform-hint"),
    channelNote: document.getElementById("channel-note"),
    btnDirect: document.getElementById("btn-direct"),
    btnGithub: document.getElementById("btn-github"),
    heroDownload: document.getElementById("hero-download"),
    status: document.getElementById("download-status"),
    navGithub: document.getElementById("nav-github"),
    heroGithub: document.getElementById("hero-github"),
    footerGithub: document.getElementById("footer-github"),
    docsVps: document.getElementById("docs-vps"),
    footerLicense: document.getElementById("footer-license"),
  };

  applyConfigLinks();
  setChannel(channel);
  updatePlatformHint();

  if (els.channelBeta) {
    els.channelBeta.addEventListener("click", function () {
      setChannel("beta");
    });
  }
  if (els.channelRelease) {
    els.channelRelease.addEventListener("click", function () {
      setChannel("release");
    });
  }
  if (els.btnDirect) {
    els.btnDirect.addEventListener("click", function () {
      void directDownload();
    });
  }

  function applyConfigLinks() {
    var repo = cfg.githubRepoUrl || "https://github.com/yetanotherneuron/neuro-connect";
    var releases = cfg.githubReleasesUrl || repo + "/releases";
    setHref(els.btnGithub, releases);
    setHref(els.navGithub, repo);
    setHref(els.heroGithub, repo);
    setHref(els.footerGithub, repo);
    setHref(els.docsVps, cfg.docsVpsUrl);
    setHref(els.footerLicense, cfg.licenseUrl);
  }

  function setHref(el, url) {
    if (el && url) el.setAttribute("href", url);
  }

  function detectPlatform() {
    var ua = (navigator.userAgent || "").toLowerCase();
    var platformStr = (navigator.platform || "").toLowerCase();
    if (ua.indexOf("linux") >= 0 || platformStr.indexOf("linux") >= 0) {
      return "linux-x64";
    }
    return "windows-x64";
  }

  function updatePlatformHint() {
    if (!els.platformHint) return;
    var label = platform === "linux-x64" ? "Linux (x64)" : "Windows (x64)";
    els.platformHint.textContent = "Detected platform: " + label;
  }

  function setChannel(next) {
    channel = next === "release" ? "release" : "beta";
    if (els.channelBeta) {
      els.channelBeta.classList.toggle("is-active", channel === "beta");
    }
    if (els.channelRelease) {
      els.channelRelease.classList.toggle("is-active", channel === "release");
    }
    if (els.btnDirect) {
      els.btnDirect.textContent =
        channel === "beta" ? "Direct download (Beta)" : "Direct download (Release)";
    }
    if (els.heroDownload) {
      els.heroDownload.textContent =
        channel === "beta" ? "Download Beta" : "Download Release";
    }
    if (els.channelNote) {
      els.channelNote.textContent =
        channel === "beta"
          ? "Beta: enter any server IP or URL at login (including Find on LAN)."
          : "Release: connects only to the community server baked into the build.";
    }
    setStatus("", "");
  }

  function setStatus(message, kind) {
    if (!els.status) return;
    els.status.textContent = message || "";
    els.status.classList.remove("is-error", "is-ok");
    if (kind) els.status.classList.add(kind);
  }

  function baseUrl() {
    var base = (cfg.updateServerBase || "").trim().replace(/\/+$/, "");
    return base;
  }

  async function directDownload() {
    var base = baseUrl();
    var releases = cfg.githubReleasesUrl || "#";

    if (!base) {
      setStatus(
        "Direct download is not configured yet. Set updateServerBase in config.js, or use GitHub Releases.",
        "is-error"
      );
      return;
    }

    if (els.btnDirect) els.btnDirect.disabled = true;
    setStatus("Looking up latest " + channel + " build…", "");

    try {
      var url =
        base +
        "/api/updates/latest?channel=" +
        encodeURIComponent(channel) +
        "&platform=" +
        encodeURIComponent(platform);
      var res = await fetch(url);
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? "No " + channel + " build published for " + platform + " yet."
            : "Update server returned " + res.status
        );
      }
      var manifest = await res.json();
      if (!manifest || !manifest.filename) {
        throw new Error("Invalid update manifest");
      }
      var downloadUrl =
        base +
        "/api/updates/download/" +
        encodeURIComponent(manifest.channel || channel) +
        "/" +
        encodeURIComponent(manifest.platform || platform) +
        "/" +
        encodeURIComponent(manifest.filename);
      setStatus(
        "Downloading " +
          manifest.filename +
          (manifest.version ? " (v" + manifest.version + ")" : "") +
          "…",
        "is-ok"
      );
      window.location.href = downloadUrl;
    } catch (err) {
      var msg = err && err.message ? err.message : "Download failed";
      setStatus(msg + " Try GitHub Releases instead.", "is-error");
      console.warn("Direct download failed:", err);
      if (releases && releases !== "#") {
        /* leave GitHub button available */
      }
    } finally {
      if (els.btnDirect) els.btnDirect.disabled = false;
    }
  }
})();
