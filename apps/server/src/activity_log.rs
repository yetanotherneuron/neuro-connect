//! Pretty console activity lines for operators watching the server terminal.

use chrono::Local;

pub fn activity(kind: &str, detail: &str) {
    let ts = Local::now().format("%H:%M:%S");
    println!("[{ts}] {kind:<12} {detail}");
}

pub fn banner(bind: &str, dev_mode: bool) {
    println!();
    println!("========================================");
    println!("  Neuro Connect Server");
    println!("  Listening: http://{bind}");
    println!("  Dev mode:  {}", if dev_mode { "ON" } else { "off" });
    println!("  Logs:      login / logout / chat / admin");
    println!("  Press Ctrl+C to stop");
    println!("========================================");
    println!();
}
