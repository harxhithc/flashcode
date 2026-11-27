pub mod commands;
pub mod engine;

use commands::fs::{
    create_sketchbook_sketch, get_adjacent_sketch_files, get_sketchbook_sketches,
    open_file_dialog, read_file_content, save_as_dialog, write_file_content,
};
use commands::{
    ai_autocomplete, ai_translate_error, compile_sketch, create_new_window, detect_serial_ports,
    focus_window, get_board_options, get_default_boards, get_port_lock_statuses,
    get_uninstall_manifest, pause_serial_monitor, perform_full_uninstall, reset_target_board,
    resume_serial_monitor, send_serial_data, start_serial_monitor, stop_serial_monitor,
    transfer_port_lock, upload_sketch,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            read_file_content,
            write_file_content,
            open_file_dialog,
            save_as_dialog,
            get_adjacent_sketch_files,
            get_sketchbook_sketches,
            create_sketchbook_sketch,
            get_default_boards,
            get_board_options,
            detect_serial_ports,
            compile_sketch,
            upload_sketch,
            ai_translate_error,
            ai_autocomplete,
            start_serial_monitor,
            stop_serial_monitor,
            pause_serial_monitor,
            resume_serial_monitor,
            send_serial_data,
            reset_target_board,
            create_new_window,
            focus_window,
            get_port_lock_statuses,
            transfer_port_lock,
            get_uninstall_manifest,
            perform_full_uninstall,
        ])
        .run(tauri::generate_context!())
        .expect("error while running FlashCode application");
}
