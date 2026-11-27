pub mod fs;

use crate::engine::ai::{AiEngine, CopilotRequest, CopilotResponse, ErrorTranslationRequest, ErrorTranslationResponse};
use crate::engine::dependencies::{DependencyEngine, InstalledLibrary, MissingLibrary};
use crate::engine::serial::{SerialDetector, SerialPortInfo};
use crate::engine::toolchain::{
    emit_upload_progress, BoardConfigOption, BoardInfo, BuildResult, ToolchainEngine,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SketchFilePayload {
    pub name: String,
    pub content: String,
}

fn prepare_sketch_path(
    code: Option<String>,
    sketch_path: Option<String>,
    files: Option<Vec<SketchFilePayload>>,
    window_label: Option<&str>,
) -> PathBuf {
    if let Some(ref c) = code {
        let raw_id = window_label.unwrap_or("default");
        let safe_id: String = raw_id
            .chars()
            .map(|ch| if ch.is_alphanumeric() || ch == '_' { ch } else { '_' })
            .collect();
        let s_dir = ToolchainEngine::get_staging_dir(raw_id);

        // Remove stale source files so closed tabs do not remain in the staging directory
        if let Ok(entries) = std::fs::read_dir(&s_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() {
                    if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                        if matches!(ext, "ino" | "cpp" | "c" | "h" | "hpp" | "pde") {
                            let _ = std::fs::remove_file(&p);
                        }
                    }
                }
            }
        }

        let main_name = format!("{}.ino", safe_id);
        let main_file = s_dir.join(&main_name);
        let _ = std::fs::write(&main_file, c);

        if let Some(extra_files) = files {
            let mut skipped_primary_ino = false;
            for f in extra_files {
                let file_name = PathBuf::from(&f.name)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();
                if file_name.is_empty() || file_name == main_name {
                    continue;
                }
                // Skip the active primary .ino tab that matches `code` to avoid duplicate setup()/loop()
                if file_name.ends_with(".ino") && !skipped_primary_ino && f.content == *c {
                    skipped_primary_ino = true;
                    continue;
                }
                let _ = std::fs::write(s_dir.join(&file_name), &f.content);
            }
        }

        main_file
    } else if let Some(ref p) = sketch_path {
        PathBuf::from(p)
    } else {
        ToolchainEngine::get_sketch_dir().join("sketch.ino")
    }
}

#[tauri::command]
pub async fn create_new_window(
    app: AppHandle,
    sketch_path: Option<String>,
) -> Result<String, String> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let label = format!("win_{}", timestamp);

    let url_str = if let Some(ref path) = sketch_path {
        format!("index.html?sketch={}", path)
    } else {
        "index.html".to_string()
    };

    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url_str.into()))
        .title("FlashCode")
        .inner_size(1280.0, 800.0)
        .min_inner_size(960.0, 600.0)
        .resizable(true)
        .maximized(false);

    if let Some(icon) = crate::app_window_icon() {
        builder = builder
            .icon(icon)
            .map_err(|e| format!("Failed to apply window icon: {}", e))?;
    }

    let window = builder.build().map_err(|e| format!("Failed to create new window: {}", e))?;
    let _ = window.show();
    let _ = window.set_focus();

    Ok(label)
}

#[tauri::command]
pub async fn focus_window(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        Ok(())
    } else {
        Err(format!("Window {} not found", label))
    }
}

#[tauri::command]
pub async fn get_default_boards() -> Vec<BoardInfo> {
    ToolchainEngine::get_default_boards().await
}

#[tauri::command]
pub async fn get_board_options(fqbn: String) -> Vec<BoardConfigOption> {
    ToolchainEngine::get_board_options(&fqbn).await
}

#[tauri::command]
pub fn detect_serial_ports() -> Vec<SerialPortInfo> {
    SerialDetector::list_ports()
}

#[tauri::command]
pub async fn compile_sketch(
    code: Option<String>,
    sketch_path: Option<String>,
    files: Option<Vec<SketchFilePayload>>,
    fqbn: String,
    window_label: Option<String>,
    app: AppHandle,
) -> Result<BuildResult, String> {
    let engine = ToolchainEngine::new();
    let path = prepare_sketch_path(code, sketch_path, files, window_label.as_deref());
    engine
        .compile(&path, &fqbn, Some(&app), window_label.as_deref(), "compile")
        .await
}

#[tauri::command]
pub async fn upload_sketch(
    code: Option<String>,
    sketch_path: Option<String>,
    files: Option<Vec<SketchFilePayload>>,
    fqbn: String,
    port: String,
    upload_speed: Option<String>,
    window_label: Option<String>,
    app: AppHandle,
) -> Result<BuildResult, String> {
    let engine = ToolchainEngine::new();
    let serial = crate::engine::serial::get_serial_monitor();
    let win_ref = window_label.as_deref();
    let path = prepare_sketch_path(code, sketch_path, files, win_ref);

    // 1. Compile firmware BEFORE pausing serial monitor so compile errors never reset the board
    emit_upload_progress(
        Some(&app),
        win_ref,
        "compile",
        "info",
        &format!("[Compiler] Compiling firmware for {}...", fqbn),
    );

    let compile_res = engine
        .compile(&path, &fqbn, Some(&app), win_ref, "compile")
        .await?;

    if !compile_res.success {
        emit_upload_progress(
            Some(&app),
            win_ref,
            "compile",
            "error",
            "[Upload Aborted] Compilation failed. Fix compiler errors before uploading.",
        );
        return Ok(compile_res);
    }

    emit_upload_progress(
        Some(&app),
        win_ref,
        "compile",
        "info",
        &format!(
            "[Compiler] Build ready in {}ms. Handing off port {} for flashing...",
            compile_res.elapsed_ms, port
        ),
    );

    // 2. Deterministically pause serial monitor & await OS handle release
    serial.pause_for_upload(&port, &app).await;

    // 3. Flash target board
    let upload_outcome = engine
        .upload(
            &path,
            &fqbn,
            &port,
            upload_speed.as_deref(),
            Some(&app),
            win_ref,
        )
        .await;

    // 4. Always resume serial monitor (with bounded USB re-enumeration backoff)
    if let Err(resume_err) = serial.resume_after_upload(&port, &app).await {
        emit_upload_progress(
            Some(&app),
            win_ref,
            "resume",
            "warning",
            &format!("[Serial Monitor Warning] {}", resume_err),
        );
    }

    match upload_outcome {
        Ok(res) => {
            if res.success {
                emit_upload_progress(
                    Some(&app),
                    win_ref,
                    "upload",
                    "info",
                    &format!(
                        "[Success] Firmware uploaded to {} in {}ms!",
                        port, res.elapsed_ms
                    ),
                );
            } else {
                emit_upload_progress(
                    Some(&app),
                    win_ref,
                    "upload",
                    "error",
                    "[Upload Failed] Flashing tool exited with an error.",
                );
            }
            Ok(res)
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn pause_serial_monitor(port: String, app: AppHandle) -> Result<bool, String> {
    Ok(crate::engine::serial::get_serial_monitor()
        .pause_for_upload(&port, &app)
        .await)
}

#[tauri::command]
pub async fn resume_serial_monitor(port: String, app: AppHandle) -> Result<(), String> {
    crate::engine::serial::get_serial_monitor()
        .resume_after_upload(&port, &app)
        .await
}

#[tauri::command]
pub async fn start_serial_monitor(
    port: String,
    baud_rate: u32,
    window_label: Option<String>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    crate::engine::serial::get_serial_monitor()
        .start(port, baud_rate, window_label, app)
        .await
}

#[tauri::command]
pub async fn stop_serial_monitor(
    port: Option<String>,
    window_label: Option<String>,
) -> Result<(), String> {
    crate::engine::serial::get_serial_monitor()
        .stop(port.as_deref(), window_label.as_deref())
        .await;
    Ok(())
}

#[tauri::command]
pub async fn send_serial_data(
    data: String,
    port: Option<String>,
    window_label: Option<String>,
) -> Result<(), String> {
    crate::engine::serial::get_serial_monitor()
        .write(&data, port.as_deref(), window_label.as_deref())
        .await
}

#[tauri::command]
pub async fn reset_target_board(
    port: Option<String>,
    window_label: Option<String>,
) -> Result<(), String> {
    crate::engine::serial::get_serial_monitor()
        .reset_board(port.as_deref(), window_label.as_deref())
        .await
}

#[tauri::command]
pub async fn get_port_lock_statuses() -> Vec<crate::engine::serial::PortLockStatus> {
    crate::engine::serial::get_serial_monitor().get_locked_ports().await
}

#[tauri::command]
pub async fn transfer_port_lock(
    port: String,
    window_label: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    crate::engine::serial::get_serial_monitor()
        .transfer_port_lock(&port, &window_label, &app)
        .await
}

#[tauri::command]
pub async fn ai_translate_error(
    req: ErrorTranslationRequest,
) -> ErrorTranslationResponse {
    let ai = AiEngine::new();
    ai.translate_error(req).await
}

#[tauri::command]
pub async fn ai_autocomplete(req: CopilotRequest) -> CopilotResponse {
    let ai = AiEngine::new();
    ai.autocomplete(req).await
}

#[tauri::command]
pub fn scan_missing_libraries(code: String) -> Vec<MissingLibrary> {
    DependencyEngine::scan_missing(&code)
}

#[tauri::command]
pub fn list_installed_libraries() -> Vec<InstalledLibrary> {
    DependencyEngine::list_installed()
}

#[tauri::command]
pub async fn install_library(library_name: String) -> Result<String, String> {
    DependencyEngine::install(&library_name).await
}

#[tauri::command]
pub fn get_uninstall_manifest() -> crate::engine::uninstall::UninstallManifest {
    crate::engine::uninstall::detect_uninstall_manifest()
}

#[tauri::command]
pub async fn perform_full_uninstall(app: AppHandle) -> Result<(), String> {
    let manifest = crate::engine::uninstall::detect_uninstall_manifest();
    if manifest.is_dev_build {
        return Err(
            "Self-uninstall is disabled during development builds to protect your source workspace."
                .to_string(),
        );
    }

    // Release all active serial monitor handles and port locks cleanly before exiting
    crate::engine::serial::get_serial_monitor()
        .stop(None, None)
        .await;

    // Launch detached OS reaper/uninstaller waiting for our PID to exit
    crate::engine::uninstall::spawn_detached_uninstall(&manifest)?;

    // Allow the invoke response to reach the UI before terminating cleanly
    let app_clone = app.clone();
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(80)).await;
        for (_, win) in app_clone.webview_windows() {
            let _ = win.close();
        }
        app_clone.exit(0);
    });

    Ok(())
}
