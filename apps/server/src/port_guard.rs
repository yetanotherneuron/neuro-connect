use std::io::{self, Write};
use std::net::SocketAddr;
use std::process::Command;

pub fn is_addr_in_use(err: &std::io::Error) -> bool {
    matches!(
        err.kind(),
        std::io::ErrorKind::AddrInUse | std::io::ErrorKind::PermissionDenied
    ) || {
        #[cfg(windows)]
        {
            err.raw_os_error() == Some(10048) // WSAEADDRINUSE
        }
        #[cfg(not(windows))]
        {
            err.raw_os_error() == Some(98) // EADDRINUSE
        }
    }
}

pub fn ask_terminate_and_free(addr: SocketAddr) -> anyhow::Result<bool> {
    let port = addr.port();
    eprintln!();
    eprintln!("Port {port} is already in use (another neuro-server may still be running).");
    if let Some(pid) = find_pid_on_port(port) {
        eprintln!("Process using that port: PID {pid}");
    } else {
        eprintln!("Could not identify the process automatically.");
    }
    eprint!("Terminate it and start this server instead? [y/N]: ");
    let _ = io::stderr().flush();

    let mut line = String::new();
    io::stdin().read_line(&mut line)?;
    let answer = line.trim().eq_ignore_ascii_case("y") || line.trim().eq_ignore_ascii_case("yes");
    if !answer {
        return Ok(false);
    }

    if let Some(pid) = find_pid_on_port(port) {
        terminate_pid(pid)?;
        // Brief pause so the OS releases the socket.
        std::thread::sleep(std::time::Duration::from_millis(400));
        Ok(true)
    } else {
        anyhow::bail!("no process found on port {port} to terminate");
    }
}

fn find_pid_on_port(port: u16) -> Option<u32> {
    #[cfg(windows)]
    {
        let output = Command::new("netstat")
            .args(["-ano", "-p", "tcp"])
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        let needle = format!(":{port}");
        for line in text.lines() {
            let line = line.trim();
            if !line.contains(&needle) {
                continue;
            }
            // Prefer LISTENING rows.
            if !line.to_ascii_uppercase().contains("LISTENING") {
                continue;
            }
            let parts: Vec<_> = line.split_whitespace().collect();
            if let Some(pid) = parts.last().and_then(|p| p.parse::<u32>().ok()) {
                if pid > 0 {
                    return Some(pid);
                }
            }
        }
        None
    }
    #[cfg(not(windows))]
    {
        // Prefer ss, then lsof, then fuser.
        if let Ok(output) = Command::new("ss").args(["-ltnp"]).output() {
            let text = String::from_utf8_lossy(&output.stdout);
            let needle = format!(":{port}");
            for line in text.lines() {
                if !line.contains(&needle) {
                    continue;
                }
                if let Some(start) = line.find("pid=") {
                    let rest = &line[start + 4..];
                    let pid: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
                    if let Ok(pid) = pid.parse::<u32>() {
                        return Some(pid);
                    }
                }
            }
        }
        if let Ok(output) = Command::new("lsof")
            .args(["-ti", &format!("tcp:{port}")])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            if let Some(pid) = text.lines().next().and_then(|s| s.trim().parse().ok()) {
                return Some(pid);
            }
        }
        None
    }
}

fn terminate_pid(pid: u32) -> anyhow::Result<()> {
    #[cfg(windows)]
    {
        let status = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .status()?;
        if !status.success() {
            anyhow::bail!("taskkill failed for PID {pid}");
        }
        eprintln!("Terminated PID {pid}.");
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let status = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .status()?;
        if !status.success() {
            let _ = Command::new("kill")
                .args(["-KILL", &pid.to_string()])
                .status()?;
        }
        eprintln!("Terminated PID {pid}.");
        Ok(())
    }
}
