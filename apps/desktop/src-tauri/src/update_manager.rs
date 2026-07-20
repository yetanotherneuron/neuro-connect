use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

pub async fn apply_update(
    url: String,
    expected_sha256: String,
    filename: String,
) -> Result<serde_json::Value, String> {
    let tmp = std::env::temp_dir().join(format!("neuro-update-{}", filename));
    let bytes = reqwest::get(&url)
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let got = format!("{:x}", hasher.finalize());
    if !expected_sha256.is_empty() && got != expected_sha256.to_lowercase() {
        return Err(format!(
            "hash mismatch: expected {expected_sha256}, got {got}"
        ));
    }

    {
        let mut f = File::create(&tmp).map_err(|e| e.to_string())?;
        f.write_all(&bytes).map_err(|e| e.to_string())?;
    }

    let lower = filename.to_lowercase();
    if lower.ends_with(".exe") || lower.ends_with(".msi") {
        Command::new(&tmp).spawn().map_err(|e| e.to_string())?;
        return Ok(serde_json::json!({ "ok": true, "mode": "installer", "path": tmp }));
    }

    // Portable zip: extract beside current exe when possible.
    if lower.ends_with(".zip") {
        let dest = portable_extract_dir()?;
        extract_zip(&tmp, &dest)?;
        return Ok(serde_json::json!({ "ok": true, "mode": "portable", "path": dest }));
    }

    Ok(serde_json::json!({ "ok": true, "mode": "downloaded", "path": tmp }))
}

fn portable_extract_dir() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    Ok(exe
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from(".")))
}

fn extract_zip(zip_path: &Path, dest: &Path) -> Result<(), String> {
    let file = File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = match file.enclosed_name() {
            Some(path) => dest.join(path),
            None => continue,
        };
        if file.name().ends_with('/') {
            std::fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
            }
            let mut outfile = File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
