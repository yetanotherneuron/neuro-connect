use crate::config_edit;
use anyhow::Context;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread;

pub struct ServerState {
    root: PathBuf,
    child: Option<Child>,
}

impl ServerState {
    pub fn new(root: PathBuf) -> anyhow::Result<Self> {
        Ok(Self { root, child: None })
    }

    pub fn config_path(&self) -> PathBuf {
        self.root.join("server.toml")
    }

    pub fn core_bin(&self) -> PathBuf {
        #[cfg(windows)]
        {
            let candidates = [
                self.root.join("bin").join("neuro-server.exe"),
                self.root.join("neuro-server.exe"),
                self.root.join("target").join("release").join("neuro-server.exe"),
                self.root.join("target").join("debug").join("neuro-server.exe"),
            ];
            for c in &candidates {
                if c.exists() {
                    return c.clone();
                }
            }
            self.root.join("bin").join("neuro-server.exe")
        }
        #[cfg(not(windows))]
        {
            let candidates = [
                self.root.join("bin").join("neuro-server"),
                self.root.join("neuro-server"),
                self.root.join("target").join("release").join("neuro-server"),
                self.root.join("target").join("debug").join("neuro-server"),
            ];
            for c in &candidates {
                if c.exists() {
                    return c.clone();
                }
            }
            self.root.join("bin").join("neuro-server")
        }
    }

    pub fn ensure_config(&self) -> anyhow::Result<()> {
        let cfg = self.config_path();
        if !cfg.exists() {
            let example = self.root.join("configs").join("server.example.toml");
            if example.exists() {
                std::fs::copy(&example, &cfg)?;
                println!("[host] created server.toml from example");
            } else {
                anyhow::bail!("missing server.toml and configs/server.example.toml");
            }
        }
        Ok(())
    }

    pub fn start(&mut self) -> anyhow::Result<()> {
        if self.child.is_some() {
            println!("[host] server already running");
            return Ok(());
        }
        self.ensure_config()?;
        let bin = self.core_bin();
        if !bin.exists() {
            anyhow::bail!(
                "server core not found at {}\nBuild with scripts/build-server.bat first.",
                bin.display()
            );
        }
        let cfg = self.config_path();
        println!("[host] starting {} with {}", bin.display(), cfg.display());

        let mut cmd = Command::new(&bin);
        cmd.arg(&cfg)
            .current_dir(&self.root)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env("RUST_LOG", std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()));

        let mut child = cmd.spawn().with_context(|| format!("spawn {}", bin.display()))?;

        if let Some(out) = child.stdout.take() {
            thread::spawn(move || {
                let reader = BufReader::new(out);
                for line in reader.lines().flatten() {
                    println!("{line}");
                }
            });
        }
        if let Some(err) = child.stderr.take() {
            thread::spawn(move || {
                let reader = BufReader::new(err);
                for line in reader.lines().flatten() {
                    eprintln!("{line}");
                }
            });
        }

        self.child = Some(child);
        println!("[host] server started");
        Ok(())
    }

    pub fn stop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
            println!("[host] server stopped");
        } else {
            // Best-effort kill by name if we lost the handle
            #[cfg(windows)]
            {
                let _ = Command::new("taskkill")
                    .args(["/IM", "neuro-server.exe", "/F"])
                    .status();
            }
            #[cfg(not(windows))]
            {
                let _ = Command::new("pkill").args(["-f", "neuro-server"]).status();
            }
            println!("[host] stop requested");
        }
    }

    pub fn restart(&mut self) -> anyhow::Result<()> {
        self.stop();
        std::thread::sleep(std::time::Duration::from_millis(400));
        self.start()
    }

    pub fn toggle_dev_mode(&mut self) -> anyhow::Result<()> {
        self.ensure_config()?;
        let path = self.config_path();
        let now = config_edit::toggle_dev_mode(&path)?;
        println!(
            "[host] Dev Mode is now {}",
            if now { "ON" } else { "OFF" }
        );
        self.restart()?;
        Ok(())
    }
}

impl Drop for ServerState {
    fn drop(&mut self) {
        self.stop();
    }
}

#[allow(dead_code)]
pub fn path_exists(p: &Path) -> bool {
    p.exists()
}
