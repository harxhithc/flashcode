// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    {
        // Fix blank screen on Linux with Nvidia, Wayland, or Mesa GPU drivers
        // WebKitGTK 4.1 DMA-BUF renderer fails on many drivers, rendering a blank canvas.
        if std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    flashcode_lib::run()
}
