use std::path::Path;

/// Flip `dev_mode = true/false` in server.toml. Returns the new value.
pub fn toggle_dev_mode(path: &Path) -> anyhow::Result<bool> {
    let raw = std::fs::read_to_string(path)?;
    let mut enabled = false;
    let mut found = false;
    let mut out = String::new();
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("dev_mode") && trimmed.contains('=') {
            found = true;
            let currently_on = trimmed.contains("true");
            enabled = !currently_on;
            out.push_str(&format!("dev_mode = {}\n", enabled));
        } else {
            out.push_str(line);
            out.push('\n');
        }
    }
    if !found {
        enabled = true;
        out.push_str("\ndev_mode = true\n");
    }
    std::fs::write(path, out)?;
    Ok(enabled)
}
