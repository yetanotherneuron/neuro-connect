//! Neuro Server tray host.
//! Opens a console for live logs, runs neuro-server as a child, tray menu for control.

mod config_edit;
mod process;

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tao::{
    event::Event,
    event_loop::{ControlFlow, EventLoopBuilder},
};
use tray_icon::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    TrayIconBuilder,
};

#[derive(Debug)]
enum UserEvent {
    Menu(String),
}

fn main() -> anyhow::Result<()> {
    #[cfg(windows)]
    unsafe {
        // Ensure a console window stays open for live logs.
        let _ = windows_sys::Win32::System::Console::AllocConsole();
    }

    let root = discover_root();
    std::env::set_current_dir(&root)?;

    println!("========================================");
    println!("  Neuro Server (tray host)");
    println!("  Folder: {}", root.display());
    println!("  Tray icon: Start / Stop / Dev Mode / Quit");
    println!("========================================");
    println!();

    let state = Arc::new(Mutex::new(process::ServerState::new(root.clone())?));

    {
        let mut s = state.lock().unwrap();
        s.start()?;
    }

    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let proxy = event_loop.create_proxy();

    let menu = Menu::new();
    let item_start = MenuItem::new("Start server", true, None);
    let item_stop = MenuItem::new("Stop server", true, None);
    let item_restart = MenuItem::new("Restart server", true, None);
    let item_dev = MenuItem::new("Toggle Dev Mode", true, None);
    let item_cfg = MenuItem::new("Open server.toml", true, None);
    let item_quit = MenuItem::new("Quit", true, None);
    menu.append(&item_start)?;
    menu.append(&item_stop)?;
    menu.append(&item_restart)?;
    menu.append(&PredefinedMenuItem::separator())?;
    menu.append(&item_dev)?;
    menu.append(&item_cfg)?;
    menu.append(&PredefinedMenuItem::separator())?;
    menu.append(&item_quit)?;

    let icon = load_icon(&root);
    let mut _tray = TrayIconBuilder::new()
        .with_menu(Box::new(menu))
        .with_tooltip("Neuro Server")
        .with_icon(icon)
        .build()?;

    let start_id = item_start.id().0.clone();
    let stop_id = item_stop.id().0.clone();
    let restart_id = item_restart.id().0.clone();
    let dev_id = item_dev.id().0.clone();
    let cfg_id = item_cfg.id().0.clone();
    let quit_id = item_quit.id().0.clone();

    MenuEvent::set_event_handler(Some(move |event: MenuEvent| {
        let id = event.id.0.clone();
        let label = if id == start_id {
            "start"
        } else if id == stop_id {
            "stop"
        } else if id == restart_id {
            "restart"
        } else if id == dev_id {
            "dev"
        } else if id == cfg_id {
            "config"
        } else if id == quit_id {
            "quit"
        } else {
            return;
        };
        let _ = proxy.send_event(UserEvent::Menu(label.into()));
    }));

    let state_loop = state.clone();
    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        if let Event::UserEvent(UserEvent::Menu(action)) = event {
            let mut s = state_loop.lock().unwrap();
            match action.as_str() {
                "start" => {
                    if let Err(e) = s.start() {
                        eprintln!("[host] start failed: {e}");
                    }
                }
                "stop" => s.stop(),
                "restart" => {
                    if let Err(e) = s.restart() {
                        eprintln!("[host] restart failed: {e}");
                    }
                }
                "dev" => {
                    if let Err(e) = s.toggle_dev_mode() {
                        eprintln!("[host] toggle dev failed: {e}");
                    }
                }
                "config" => {
                    let path = s.config_path();
                    #[cfg(windows)]
                    {
                        let _ = std::process::Command::new("cmd")
                            .args(["/C", "start", "", &path.display().to_string()])
                            .spawn();
                    }
                    #[cfg(not(windows))]
                    {
                        let _ = std::process::Command::new("xdg-open").arg(&path).spawn();
                    }
                }
                "quit" => {
                    s.stop();
                    *control_flow = ControlFlow::Exit;
                }
                _ => {}
            }
        }
    });
}

fn discover_root() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            // Prefer folder that contains neuro-server.exe / server.toml
            if dir.join("neuro-server.exe").exists()
                || dir.join("neuro-server").exists()
                || dir.join("server.toml").exists()
            {
                return dir.to_path_buf();
            }
            // Running from target/release - walk up to repo or dist
            let candidates = [
                dir.to_path_buf(),
                dir.join("..").join("..").join("..").join("dist"),
                dir.join("..").join("..").join(".."),
            ];
            for c in candidates {
                if let Ok(c) = c.canonicalize() {
                    if c.join("server.toml").exists()
                        || c.join("neuro-server.exe").exists()
                        || c.join("configs").exists()
                    {
                        return c;
                    }
                }
            }
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn load_icon(root: &Path) -> tray_icon::Icon {
    let candidates = [
        root.join("icon.png"),
        root.join("assets").join("icons").join("icon.png"),
        root.join("apps")
            .join("desktop")
            .join("src-tauri")
            .join("icons")
            .join("icon.png"),
    ];
    for path in candidates {
        if let Ok(img) = image::open(&path) {
            let rgba = img.into_rgba8();
            let (w, h) = rgba.dimensions();
            if let Ok(icon) = tray_icon::Icon::from_rgba(rgba.into_raw(), w, h) {
                return icon;
            }
        }
    }
    // 16x16 purple fallback
    let mut rgba = vec![0u8; 16 * 16 * 4];
    for px in rgba.chunks_exact_mut(4) {
        px[0] = 124;
        px[1] = 58;
        px[2] = 237;
        px[3] = 255;
    }
    tray_icon::Icon::from_rgba(rgba, 16, 16).expect("fallback icon")
}
