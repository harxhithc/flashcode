use crate::engine::toolchain::resolve_home_dir;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Stdio;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UninstallManifest {
    pub install_type: String,
    pub executable_path: String,
    pub uninstaller_path: Option<String>,
    pub is_deb_package: bool,
    pub is_dev_build: bool,
    pub target_paths: Vec<String>,
    pub protected_paths: Vec<String>,
}

/// Returns true if running from a Cargo dev/target directory or debug build,
/// preventing accidental deletion of workspace development artifacts.
pub fn is_development_build(exe_path: Option<&Path>) -> bool {
    if cfg!(debug_assertions) {
        return true;
    }
    if let Some(p) = exe_path {
        let norm = p.to_string_lossy().replace('\\', "/");
        if norm.contains("/src-tauri/target/") {
            return true;
        }
    }
    false
}

/// POSIX single-quote shell escaping so paths containing spaces or quotes cannot inject commands.
pub fn sh_quote(input: &str) -> String {
    format!("'{}'", input.replace('\'', "'\\''"))
}

fn push_existing_path(list: &mut Vec<String>, path: PathBuf) {
    if path.exists() {
        let s = path.to_string_lossy().to_string();
        if !list.contains(&s) {
            list.push(s);
        }
    }
}

fn detect_protected_user_paths(home: &str) -> Vec<String> {
    let mut protected = Vec::new();
    let home_path = PathBuf::from(home);

    for rel in ["Arduino", "Documents/Arduino", "sketchbook", ".arduino15"] {
        push_existing_path(&mut protected, home_path.join(rel));
    }

    #[cfg(windows)]
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        push_existing_path(&mut protected, PathBuf::from(local_app_data).join("Arduino15"));
    }

    if protected.is_empty() {
        protected.push(home_path.join("Arduino").to_string_lossy().to_string());
    }
    protected
}

#[cfg(unix)]
pub fn detect_uninstall_manifest() -> UninstallManifest {
    let home = resolve_home_dir();
    let home_path = PathBuf::from(&home);
    let exe = std::env::current_exe().ok();
    let is_dev_build = is_development_build(exe.as_deref());

    let appimage_env = std::env::var("APPIMAGE").ok().filter(|s| !s.is_empty());
    let exe_str = appimage_env
        .clone()
        .or_else(|| exe.as_ref().map(|p| p.to_string_lossy().to_string()))
        .unwrap_or_default();

    let is_deb_package = ["flash-code", "flashcode"].iter().any(|pkg| {
        std::process::Command::new("dpkg-query")
            .args(["-W", "-f=${Status}", pkg])
            .output()
            .map(|o| {
                o.status.success()
                    && String::from_utf8_lossy(&o.stdout).contains("install ok installed")
            })
            .unwrap_or(false)
    });

    let install_type = if is_dev_build {
        "Development Build (Protected)".to_string()
    } else if appimage_env.is_some() {
        "Linux AppImage".to_string()
    } else if is_deb_package {
        "Debian / Ubuntu Package (.deb)".to_string()
    } else {
        "Linux Standalone Binary".to_string()
    };

    let mut targets = Vec::new();

    if !is_dev_build {
        if let Some(ref ai) = appimage_env {
            push_existing_path(&mut targets, PathBuf::from(ai));
        } else if !is_deb_package {
            if let Some(ref e) = exe {
                // Only self-delete user-local standalone binaries; system paths belong to dpkg
                let s = e.to_string_lossy();
                if !s.starts_with("/usr/") && !s.starts_with("/bin/") {
                    push_existing_path(&mut targets, e.clone());
                }
            }
        }
        push_existing_path(&mut targets, home_path.join(".local/bin/flashcode"));
    }

    let xdg_config = std::env::var("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| home_path.join(".config"));
    let xdg_data = std::env::var("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| home_path.join(".local/share"));
    let xdg_cache = std::env::var("XDG_CACHE_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| home_path.join(".cache"));

    // Desktop shortcuts & AppImageLauncher desktop entries
    let apps_dir = xdg_data.join("applications");
    push_existing_path(&mut targets, apps_dir.join("flashcode.desktop"));
    push_existing_path(&mut targets, apps_dir.join("com.flashcode.ide.desktop"));
    if let Ok(entries) = std::fs::read_dir(&apps_dir) {
        for entry in entries.flatten() {
            let fname = entry.file_name().to_string_lossy().to_lowercase();
            if fname.ends_with(".desktop") && fname.contains("flashcode") {
                push_existing_path(&mut targets, entry.path());
            }
        }
    }

    // Icons & MIME entries
    for size in ["32x32", "64x64", "128x128", "256x256", "512x512", "scalable"] {
        for name in ["flashcode.png", "flashcode.svg", "com.flashcode.ide.png", "com.flashcode.ide.svg"] {
            push_existing_path(
                &mut targets,
                xdg_data.join("icons/hicolor").join(size).join("apps").join(name),
            );
        }
    }
    push_existing_path(&mut targets, xdg_data.join("mime/application/x-flashcode.xml"));
    push_existing_path(&mut targets, xdg_data.join("mime/packages/flashcode.xml"));

    // App configs, WebKitGTK storage, and caches
    for rel in ["flashcode", "flashcode-app", "com.flashcode.ide"] {
        push_existing_path(&mut targets, xdg_config.join(rel));
    }
    for rel in ["com.flashcode.ide", "flashcode"] {
        push_existing_path(&mut targets, xdg_data.join(rel));
    }
    for rel in ["flashcode", "flashcode-app", "flashcode_ccache_bin", "com.flashcode.ide"] {
        push_existing_path(&mut targets, xdg_cache.join(rel));
    }

    UninstallManifest {
        install_type,
        executable_path: exe_str,
        uninstaller_path: None,
        is_deb_package,
        is_dev_build,
        target_paths: targets,
        protected_paths: detect_protected_user_paths(&home),
    }
}

#[cfg(windows)]
pub fn detect_uninstall_manifest() -> UninstallManifest {
    let home = resolve_home_dir();
    let home_path = PathBuf::from(&home);
    let exe = std::env::current_exe().ok();
    let is_dev_build = is_development_build(exe.as_deref());
    let exe_str = exe
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut uninstaller_path: Option<String> = None;
    if !is_dev_build {
        if let Some(ref e) = exe {
            if let Some(dir) = e.parent() {
                for candidate in ["uninstall.exe", "Uninstall.exe"] {
                    let u = dir.join(candidate);
                    if u.exists() {
                        uninstaller_path = Some(u.to_string_lossy().to_string());
                        break;
                    }
                }
            }
        }
    }

    let install_type = if is_dev_build {
        "Development Build (Protected)".to_string()
    } else if uninstaller_path.is_some() {
        "Windows Installer (NSIS)".to_string()
    } else {
        "Windows Standalone Executable".to_string()
    };

    let mut targets = Vec::new();
    if !is_dev_build {
        if uninstaller_path.is_none() {
            if let Some(ref e) = exe {
                push_existing_path(&mut targets, e.clone());
            }
        }
    }

    if let Ok(app_data) = std::env::var("APPDATA") {
        let p = PathBuf::from(app_data);
        for rel in ["com.flashcode.ide", "flashcode", "FlashCode"] {
            push_existing_path(&mut targets, p.join(rel));
        }
    }
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let p = PathBuf::from(local_app_data);
        for rel in ["com.flashcode.ide", "flashcode", "FlashCode"] {
            push_existing_path(&mut targets, p.join(rel));
        }
    }
    push_existing_path(&mut targets, home_path.join(".cache/flashcode"));
    push_existing_path(&mut targets, home_path.join(".config/flashcode"));

    UninstallManifest {
        install_type,
        executable_path: exe_str,
        uninstaller_path,
        is_deb_package: false,
        is_dev_build,
        target_paths: targets,
        protected_paths: detect_protected_user_paths(&home),
    }
}

pub fn build_unix_uninstall_script(pid: u32, manifest: &UninstallManifest) -> String {
    let mut lines = vec![
        "#!/bin/sh".to_string(),
        format!("TARGET_PID={}", pid),
        "i=0".to_string(),
        "while [ \"$i\" -lt 100 ]; do".to_string(),
        "  if ! kill -0 \"$TARGET_PID\" 2>/dev/null; then".to_string(),
        "    break".to_string(),
        "  fi".to_string(),
        "  sleep 0.1".to_string(),
        "  i=$((i + 1))".to_string(),
        "done".to_string(),
        "sleep 0.2".to_string(),
    ];

    if manifest.is_deb_package && !manifest.is_dev_build {
        lines.push(
            "if command -v pkexec >/dev/null 2>&1; then pkexec sh -c 'for p in flash-code flashcode; do dpkg-query -W -f=\"${Status}\" \"$p\" 2>/dev/null | grep -q \"install ok installed\" && (apt-get purge -y \"$p\" || dpkg --purge \"$p\"); done' >/dev/null 2>&1 || true; fi"
                .to_string(),
        );
    }

    for path in &manifest.target_paths {
        lines.push(format!("rm -rf {} 2>/dev/null || true", sh_quote(path)));
    }

    let home = resolve_home_dir();
    let xdg_data = std::env::var("XDG_DATA_HOME")
        .unwrap_or_else(|_| format!("{}/.local/share", home));
    let apps_dir = format!("{}/applications", xdg_data);
    let mime_dir = format!("{}/mime", xdg_data);

    lines.push(format!(
        "command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database {} >/dev/null 2>&1 || true",
        sh_quote(&apps_dir)
    ));
    lines.push(format!(
        "command -v update-mime-database >/dev/null 2>&1 && update-mime-database {} >/dev/null 2>&1 || true",
        sh_quote(&mime_dir)
    ));
    lines.push("rm -f \"$0\"".to_string());

    lines.join("\n") + "\n"
}

#[cfg(windows)]
pub fn build_windows_uninstall_script(pid: u32, manifest: &UninstallManifest) -> String {
    let mut lines = vec![
        "@echo off".to_string(),
        format!("set \"TARGET_PID={}\"", pid),
        "set /a COUNT=0".to_string(),
        ":waitloop".to_string(),
        "tasklist /FI \"PID eq %TARGET_PID%\" 2>nul | find \"%TARGET_PID%\" >nul".to_string(),
        "if errorlevel 1 goto cleanup".to_string(),
        "set /a COUNT+=1".to_string(),
        "if %COUNT% GEQ 100 goto cleanup".to_string(),
        "ping -n 2 127.0.0.1 >nul".to_string(),
        "goto waitloop".to_string(),
        ":cleanup".to_string(),
        "ping -n 2 127.0.0.1 >nul".to_string(),
    ];

    if let Some(ref uninstaller) = manifest.uninstaller_path {
        lines.push(format!("if exist \"{}\" start /wait \"\" \"{}\" /S", uninstaller, uninstaller));
        lines.push("ping -n 3 127.0.0.1 >nul".to_string());
    }

    for path in &manifest.target_paths {
        let p = path.replace('/', "\\");
        lines.push(format!("if exist \"{}\" (", p));
        lines.push(format!("  rmdir /s /q \"{}\" 2>nul", p));
        lines.push(format!("  del /f /q \"{}\" 2>nul", p));
        lines.push(")".to_string());
    }

    lines.push("del /f /q \"%~f0\" >nul 2>&1".to_string());
    lines.join("\r\n") + "\r\n"
}

#[cfg(unix)]
pub fn spawn_detached_uninstall(manifest: &UninstallManifest) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    use std::os::unix::process::CommandExt;

    let pid = std::process::id();
    let script_path = std::env::temp_dir().join(format!("flashcode_uninstall_{}.sh", pid));
    let script = build_unix_uninstall_script(pid, manifest);

    std::fs::write(&script_path, script)
        .map_err(|e| format!("Failed to prepare uninstall script: {}", e))?;
    let _ = std::fs::set_permissions(&script_path, std::fs::Permissions::from_mode(0o700));

    let mut cmd = std::process::Command::new("sh");
    cmd.arg(&script_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    unsafe {
        cmd.pre_exec(|| {
            libc::setsid();
            Ok(())
        });
    }

    cmd.spawn()
        .map_err(|e| format!("Failed to launch detached uninstaller: {}", e))?;
    Ok(())
}

#[cfg(windows)]
pub fn spawn_detached_uninstall(manifest: &UninstallManifest) -> Result<(), String> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const DETACHED_PROCESS: u32 = 0x0000_0008;

    let pid = std::process::id();
    let script_path = std::env::temp_dir().join(format!("flashcode_uninstall_{}.cmd", pid));
    let script = build_windows_uninstall_script(pid, manifest);

    std::fs::write(&script_path, script)
        .map_err(|e| format!("Failed to prepare Windows uninstall script: {}", e))?;

    std::process::Command::new("cmd")
        .args(["/C", &script_path.to_string_lossy()])
        .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to launch Windows uninstaller: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sh_quote_escapes_single_quotes_safely() {
        assert_eq!(sh_quote("/tmp/my app's dir"), "'/tmp/my app'\\''s dir'");
    }

    #[test]
    fn detects_dev_build_correctly() {
        assert!(is_development_build(Some(Path::new("/repo/src-tauri/target/release/flashcode"))));
        assert!(is_development_build(Some(Path::new("C:\\work\\src-tauri\\target\\debug\\flashcode.exe"))));
    }

    #[test]
    fn builds_valid_unix_uninstall_script() {
        let manifest = UninstallManifest {
            install_type: "Linux AppImage".to_string(),
            executable_path: "/home/user/FlashCode (1).AppImage".to_string(),
            uninstaller_path: None,
            is_deb_package: false,
            is_dev_build: false,
            target_paths: vec![
                "/home/user/FlashCode (1).AppImage".to_string(),
                "/home/user/.cache/flashcode".to_string(),
            ],
            protected_paths: vec!["/home/user/Arduino".to_string()],
        };
        let script = build_unix_uninstall_script(4242, &manifest);
        assert!(script.contains("TARGET_PID=4242"));
        assert!(script.contains("'/home/user/FlashCode (1).AppImage'"));
        assert!(script.contains("rm -f \"$0\""));
    }
}
