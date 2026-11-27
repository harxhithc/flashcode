use serde::{Deserialize, Serialize};
use std::ffi::CString;
use std::fs;
#[cfg(unix)]
use std::os::unix::io::AsRawFd;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::Mutex;

#[cfg(unix)]
fn lock_file_exclusive(file: &std::fs::File) -> bool {
    unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) == 0 }
}

#[cfg(unix)]
fn unlock_file(file: &std::fs::File) {
    unsafe {
        libc::flock(file.as_raw_fd(), libc::LOCK_UN);
    }
}

#[cfg(unix)]
fn is_process_alive(pid: u32) -> bool {
    unsafe { libc::kill(pid as libc::pid_t, 0) == 0 }
}

#[cfg(not(unix))]
fn lock_file_exclusive(_file: &std::fs::File) -> bool {
    true
}

#[cfg(not(unix))]
fn unlock_file(_file: &std::fs::File) {}

#[cfg(not(unix))]
fn is_process_alive(pid: u32) -> bool {
    if pid == std::process::id() {
        return true;
    }
    std::process::Command::new("cmd")
        .args(["/C", &format!("tasklist /FI \"PID eq {}\" 2>nul | findstr {}", pid, pid)])
        .output()
        .map(|o| !o.stdout.is_empty())
        .unwrap_or(false)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerialPortInfo {
    pub port_name: String,
    pub description: String,
    pub vendor_id: Option<String>,
    pub product_id: Option<String>,
    pub manufacturer: Option<String>,
}

pub struct SerialDetector;

impl SerialDetector {
    /// Detects all active serial ports on Linux (ESP32, ESP8266, CH340, CP2102, FTDI)
    #[cfg(unix)]
    pub fn list_ports() -> Vec<SerialPortInfo> {
        let mut ports = Vec::new();

        // 1. Check /dev/serial/by-id if present
        let by_id = Path::new("/dev/serial/by-id");
        if by_id.exists() {
            if let Ok(entries) = fs::read_dir(by_id) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if let Ok(target) = fs::canonicalize(&path) {
                        let desc = entry.file_name().to_string_lossy().to_string();
                        let port_name = target.to_string_lossy().to_string();
                        ports.push(SerialPortInfo {
                            port_name,
                            description: desc,
                            vendor_id: None,
                            product_id: None,
                            manufacturer: None,
                        });
                    }
                }
            }
        }

        // 2. Scan /sys/class/tty for ttyUSB* and ttyACM*
        let tty_class = Path::new("/sys/class/tty");
        if tty_class.exists() {
            if let Ok(entries) = fs::read_dir(tty_class) {
                for entry in entries.flatten() {
                    let file_name = entry.file_name().to_string_lossy().to_string();
                    if file_name.starts_with("ttyUSB") || file_name.starts_with("ttyACM") {
                        let dev_path = format!("/dev/{}", file_name);

                        // Prevent duplicate if already found in by-id
                        if ports.iter().any(|p| p.port_name == dev_path) {
                            continue;
                        }

                        let device_path = entry.path().join("device");
                        let mut desc = "USB Serial Device".to_string();
                        let mut manufacturer = None;

                        // Check uevent file for vendor/product details
                        if let Ok(uevent) = fs::read_to_string(device_path.join("uevent")) {
                            if uevent.contains("1a86") || uevent.contains("7523") {
                                desc = "ESP8266 / ESP32 (CH340 USB-UART)".to_string();
                                manufacturer = Some("WCH".to_string());
                            } else if uevent.contains("10c4") || uevent.contains("ea60") {
                                desc = "ESP32 Dev Module (Silicon Labs CP2102)".to_string();
                                manufacturer = Some("Silicon Labs".to_string());
                            } else if uevent.contains("0403") {
                                desc = "FTDI USB-UART Device".to_string();
                                manufacturer = Some("FTDI".to_string());
                            }
                        }

                        ports.push(SerialPortInfo {
                            port_name: dev_path,
                            description: desc,
                            vendor_id: None,
                            product_id: None,
                            manufacturer,
                        });
                    }
                }
            }
        }

        ports
    }

    /// Detects serial COM ports on Windows
    #[cfg(windows)]
    pub fn list_ports() -> Vec<SerialPortInfo> {
        let mut ports = Vec::new();
        if let Ok(output) = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "[System.IO.Ports.SerialPort]::GetPortNames()",
            ])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                let p = line.trim().to_string();
                if p.starts_with("COM") && !ports.iter().any(|existing: &SerialPortInfo| existing.port_name == p) {
                    ports.push(SerialPortInfo {
                        port_name: p.clone(),
                        description: format!("Serial Device ({})", p),
                        vendor_id: None,
                        product_id: None,
                        manufacturer: None,
                    });
                }
            }
        }
        ports
    }

    #[cfg(not(any(unix, windows)))]
    pub fn list_ports() -> Vec<SerialPortInfo> {
        Vec::new()
    }
}

#[cfg(unix)]
fn baud_to_speed(baud: u32) -> libc::speed_t {
    match baud {
        300 => libc::B300,
        1200 => libc::B1200,
        2400 => libc::B2400,
        4800 => libc::B4800,
        9600 => libc::B9600,
        19200 => libc::B19200,
        38400 => libc::B38400,
        57600 => libc::B57600,
        115200 => libc::B115200,
        230400 => libc::B230400,
        460800 => libc::B460800,
        500000 => libc::B500000,
        576000 => libc::B576000,
        921600 => libc::B921600,
        1000000 => libc::B1000000,
        1152000 => libc::B1152000,
        1500000 => libc::B1500000,
        2000000 => libc::B2000000,
        2500000 => libc::B2500000,
        3000000 => libc::B3000000,
        3500000 => libc::B3500000,
        4000000 => libc::B4000000,
        _ => libc::B115200,
    }
}

#[cfg(unix)]
fn configure_termios(fd: libc::c_int, baud: u32) -> Result<(), String> {
    unsafe {
        let mut tio: libc::termios = std::mem::zeroed();
        if libc::tcgetattr(fd, &mut tio) != 0 {
            return Err("Failed to query terminal attributes".to_string());
        }

        libc::cfmakeraw(&mut tio);
        tio.c_cflag |= libc::CREAD | libc::CLOCAL;
        tio.c_cflag &= !libc::CRTSCTS; // No hardware flow control
        tio.c_cflag &= !libc::CSIZE;
        tio.c_cflag |= libc::CS8; // 8 data bits
        tio.c_cflag &= !libc::PARENB; // No parity
        tio.c_cflag &= !libc::CSTOPB; // 1 stop bit
        tio.c_cc[libc::VMIN] = 1;
        tio.c_cc[libc::VTIME] = 1;

        let speed = baud_to_speed(baud);
        libc::cfsetispeed(&mut tio, speed);
        libc::cfsetospeed(&mut tio, speed);

        if libc::tcsetattr(fd, libc::TCSANOW, &tio) != 0 {
            return Err("Failed to apply terminal baud rate".to_string());
        }
        libc::tcflush(fd, libc::TCIOFLUSH);

        // De-assert DTR and RTS lines so the ESP32/ESP8266 auto-reset circuit
        // does NOT pull EN/RST or GPIO0 low, preventing the chip from getting stuck in ROM bootloader
        let mut status: libc::c_int = 0;
        if libc::ioctl(fd, libc::TIOCMGET, &mut status) == 0 {
            status &= !libc::TIOCM_DTR;
            status &= !libc::TIOCM_RTS;
            let _ = libc::ioctl(fd, libc::TIOCMSET, &status);
        }
    }
    Ok(())
}

#[cfg(unix)]
fn set_termios_baud_only(fd: libc::c_int, baud: u32) -> Result<(), String> {
    unsafe {
        let mut tio: libc::termios = std::mem::zeroed();
        if libc::tcgetattr(fd, &mut tio) != 0 {
            return Err("Failed to query terminal attributes".to_string());
        }

        let speed = baud_to_speed(baud);
        libc::cfsetispeed(&mut tio, speed);
        libc::cfsetospeed(&mut tio, speed);

        if libc::tcsetattr(fd, libc::TCSANOW, &tio) != 0 {
            return Err("Failed to update baud rate in-place".to_string());
        }
    }
    Ok(())
}

/// Streaming UTF-8 Decoder that prevents split multibyte character corruption
/// across chunk boundaries by retaining incomplete trailing bytes.
#[derive(Debug, Default)]
pub struct StreamingUtf8Decoder {
    pending: Vec<u8>,
}

impl StreamingUtf8Decoder {
    pub fn new() -> Self {
        Self {
            pending: Vec::with_capacity(8192),
        }
    }

    pub fn push_bytes(&mut self, bytes: &[u8]) {
        self.pending.extend_from_slice(bytes);
    }

    pub fn has_pending(&self) -> bool {
        !self.pending.is_empty()
    }

    pub fn pending_len(&self) -> usize {
        self.pending.len()
    }

    pub fn decode_available(&mut self) -> Option<String> {
        if self.pending.is_empty() {
            return None;
        }

        let mut valid_end = 0;
        let mut result = String::new();
        let mut slice = &self.pending[..];

        loop {
            match std::str::from_utf8(slice) {
                Ok(s) => {
                    result.push_str(s);
                    valid_end += slice.len();
                    break;
                }
                Err(e) => {
                    let up_to = e.valid_up_to();
                    if up_to > 0 {
                        if let Ok(valid_str) = std::str::from_utf8(&slice[..up_to]) {
                            result.push_str(valid_str);
                        }
                        valid_end += up_to;
                    }
                    if let Some(err_len) = e.error_len() {
                        // Truly invalid sequence, insert replacement character and continue
                        result.push('\u{FFFD}');
                        valid_end += err_len;
                        slice = &slice[up_to + err_len..];
                    } else {
                        // Incomplete UTF-8 sequence at end of slice; keep in pending buffer
                        break;
                    }
                }
            }
        }

        if valid_end > 0 {
            self.pending.drain(0..valid_end);
        }

        if result.is_empty() {
            None
        } else {
            Some(result)
        }
    }

    pub fn flush_remaining(&mut self) -> Option<String> {
        if self.pending.is_empty() {
            None
        } else {
            let s = String::from_utf8_lossy(&self.pending).to_string();
            self.pending.clear();
            Some(s)
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortLockStatus {
    pub port_name: String,
    pub is_locked: bool,
    pub owner_window: Option<String>,
    pub owner_title: Option<String>,
    pub owner_pid: Option<u32>,
    pub is_external_process: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortLockMeta {
    pub pid: u32,
    pub window_label: Option<String>,
    pub port: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TakeoverRequest {
    pub requested_by_pid: u32,
    pub requested_by_window: String,
    pub timestamp: u64,
}

pub fn get_lock_dir() -> PathBuf {
    let base = std::env::var("XDG_CACHE_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
            PathBuf::from(home).join(".cache")
        });
    let dir = base.join("flashcode").join("port-locks");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub fn port_to_lock_filename(port: &str) -> String {
    let sanitized: String = port
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect();
    format!("{}.lock", sanitized)
}

pub fn port_to_takeover_filename(port: &str) -> String {
    let sanitized: String = port
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect();
    format!("{}.takeover", sanitized)
}

pub fn write_lock_meta(file: &std::fs::File, port: &str, window_label: Option<&str>) {
    use std::io::{Seek, SeekFrom, Write};
    let meta = PortLockMeta {
        pid: std::process::id(),
        window_label: window_label.map(ToString::to_string),
        port: port.to_string(),
        created_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
    };
    if let Ok(json_str) = serde_json::to_string(&meta) {
        let mut f = file;
        let _ = f.seek(SeekFrom::Start(0));
        let _ = f.set_len(0);
        let _ = f.write_all(json_str.as_bytes());
        let _ = f.flush();
    }
}

pub fn try_acquire_os_port_lock(
    port: &str,
    window_label: Option<&str>,
) -> Result<std::fs::File, (bool, Option<String>)> {
    let lock_path = get_lock_dir().join(port_to_lock_filename(port));
    let file = match std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(&lock_path)
    {
        Ok(f) => f,
        Err(_) => {
            let null_path = if cfg!(windows) { "NUL" } else { "/dev/null" };
            return Ok(std::fs::File::open(null_path).unwrap());
        }
    };

    let is_locked = lock_file_exclusive(&file);
    if is_locked {
        write_lock_meta(&file, port, window_label);
        Ok(file)
    } else {
        let content = std::fs::read_to_string(&lock_path).unwrap_or_default();
        let meta: Option<PortLockMeta> = serde_json::from_str(&content).ok();

        // Stale lock cleanup: if holder process is already dead, reclaim lock
        if let Some(ref m) = meta {
            let is_alive = is_process_alive(m.pid);
            if !is_alive {
                let _ = std::fs::remove_file(&lock_path);
                if let Ok(retry_file) = std::fs::OpenOptions::new()
                    .read(true)
                    .write(true)
                    .create(true)
                    .truncate(false)
                    .open(&lock_path)
                {
                    if lock_file_exclusive(&retry_file) {
                        write_lock_meta(&retry_file, port, window_label);
                        return Ok(retry_file);
                    }
                }
            }
        }

        let owner_desc = if let Some(m) = meta {
            format!("PID {} ({})", m.pid, m.window_label.as_deref().unwrap_or("window"))
        } else {
            "another FlashCode process".to_string()
        };
        Err((true, Some(owner_desc)))
    }
}

pub struct ActiveSerialSession {
    pub port: String,
    pub baud_rate: u32,
    pub window_label: Option<String>,
    #[cfg(unix)]
    pub native_fd: Option<libc::c_int>,
    #[cfg(not(unix))]
    pub native_fd: Option<i32>,
    pub shutdown_flag: Option<Arc<AtomicBool>>,
    pub closed_flag: Option<Arc<AtomicBool>>,
    pub reader_handle: Option<std::thread::JoinHandle<()>>,
    pub child: Option<Child>,
    pub stdin: Option<ChildStdin>,
    pub lock_file: Option<std::fs::File>,
}

#[derive(Debug, Clone)]
pub struct PausedSerialState {
    pub port: String,
    pub baud_rate: u32,
    pub window_label: Option<String>,
}

pub struct SerialMonitorManager {
    sessions: Arc<Mutex<std::collections::HashMap<String, Arc<Mutex<ActiveSerialSession>>>>>,
    uploading_ports: Arc<Mutex<std::collections::HashSet<String>>>,
    paused_uploads: Arc<Mutex<std::collections::HashMap<String, PausedSerialState>>>,
    op_lock: Arc<Mutex<()>>,
}

pub static SERIAL_MONITOR: OnceLock<SerialMonitorManager> = OnceLock::new();

pub fn get_serial_monitor() -> &'static SerialMonitorManager {
    SERIAL_MONITOR.get_or_init(SerialMonitorManager::new)
}

fn emit_serial(app: &AppHandle, win_label: Option<&str>, event: &str, data: &str) {
    use tauri::Manager;
    if let Some(lbl) = win_label {
        if let Some(win) = app.get_webview_window(lbl) {
            let _ = win.emit(event, data);
            return;
        }
    }
    let _ = app.emit(event, data);
}

fn emit_event<T: Serialize + Clone>(
    app: &AppHandle,
    win_label: Option<&str>,
    event: &str,
    data: T,
) {
    use tauri::Manager;
    if let Some(lbl) = win_label {
        if let Some(win) = app.get_webview_window(lbl) {
            let _ = win.emit(event, data.clone());
            return;
        }
    }
    let _ = app.emit(event, data);
}

fn emit_disconnect(app: &AppHandle, win_label: Option<&str>, port: &str) {
    use tauri::Manager;
    if let Some(lbl) = win_label {
        if let Some(win) = app.get_webview_window(lbl) {
            let _ = win.emit("serial-disconnected", port);
            return;
        }
    }
    let _ = app.emit("serial-disconnected", port);
}

impl SerialMonitorManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(std::collections::HashMap::new())),
            uploading_ports: Arc::new(Mutex::new(std::collections::HashSet::new())),
            paused_uploads: Arc::new(Mutex::new(std::collections::HashMap::new())),
            op_lock: Arc::new(Mutex::new(())),
        }
    }

    fn resolve_arduino_cli() -> PathBuf {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_else(|_| ".".to_string());
        let local_bin = PathBuf::from(&home).join(".local").join("bin");
        if local_bin.join("arduino-cli").exists() {
            local_bin.join("arduino-cli")
        } else if local_bin.join("arduino-cli.exe").exists() {
            local_bin.join("arduino-cli.exe")
        } else {
            PathBuf::from("arduino-cli")
        }
    }

    async fn stop_session_internal(sess: &mut ActiveSerialSession) {
        sess.stdin = None;

        if let Some(flag) = sess.shutdown_flag.take() {
            flag.store(true, Ordering::Relaxed);
        }

        // Wait cleanly for native reader thread to exit poll() and release fd before forcing close
        if let Some(handle) = sess.reader_handle.take() {
            let _ = tokio::time::timeout(
                std::time::Duration::from_millis(250),
                tokio::task::spawn_blocking(move || {
                    let _ = handle.join();
                }),
            )
            .await;
        }

        #[cfg(unix)]
        if let Some(closed) = sess.closed_flag.take() {
            if let Some(fd) = sess.native_fd.take() {
                if !closed.swap(true, Ordering::SeqCst) {
                    unsafe {
                        libc::close(fd);
                    }
                }
            }
        } else if let Some(fd) = sess.native_fd.take() {
            unsafe {
                libc::close(fd);
            }
        }
        #[cfg(not(unix))]
        {
            let _ = sess.native_fd.take();
        }

        if let Some(mut child) = sess.child.take() {
            let _ = child.kill().await;
            let _ = tokio::time::timeout(
                std::time::Duration::from_millis(500),
                child.wait(),
            )
            .await;
        }

        if let Some(lock_file) = sess.lock_file.take() {
            unlock_file(&lock_file);
            drop(lock_file);
            let lock_path = get_lock_dir().join(port_to_lock_filename(&sess.port));
            let _ = std::fs::remove_file(lock_path);
        }
    }

    pub async fn start(
        &self,
        port: String,
        baud_rate: u32,
        window_label: Option<String>,
        app: AppHandle,
    ) -> Result<(), String> {
        let _op = self.op_lock.lock().await;
        self.start_inner(port, baud_rate, window_label, app).await
    }

    async fn start_inner(
        &self,
        port: String,
        baud_rate: u32,
        window_label: Option<String>,
        app: AppHandle,
    ) -> Result<(), String> {
        {
            let uploading = self.uploading_ports.lock().await;
            if uploading.contains(&port) {
                return Err(format!("PORT_UPLOADING:{}", port));
            }
        }
        let rt_handle = tokio::runtime::Handle::current();

        // 1. Fast in-place baud rate switch if already connected to this port by the SAME window
        {
            let sessions = self.sessions.lock().await;
            if let Some(sess_arc) = sessions.get(&port) {
                let mut sess = sess_arc.lock().await;
                if sess.window_label == window_label {
                    #[cfg(unix)]
                    if let Some(fd) = sess.native_fd {
                        if let Ok(()) = set_termios_baud_only(fd, baud_rate) {
                            sess.baud_rate = baud_rate;
                            emit_serial(
                                &app,
                                window_label.as_deref(),
                                "serial-output",
                                &format!("\n[Serial Monitor] Baud rate switched to {} bps.\n", baud_rate),
                            );
                            return Ok(());
                        }
                    }
                } else {
                    // Port is locked by another window in this process!
                    let owner = sess.window_label.clone().unwrap_or_else(|| "another window".to_string());
                    return Err(format!("PORT_LOCKED:{}", owner));
                }
            }
        }

        // 1b. Check cross-process advisory lock
        let os_lock_file = match try_acquire_os_port_lock(&port, window_label.as_deref()) {
            Ok(f) => f,
            Err((_, owner_desc)) => {
                let owner = owner_desc.unwrap_or_else(|| "another FlashCode process".to_string());
                return Err(format!("PORT_LOCKED:{}", owner));
            }
        };

        // 2. If this window was previously monitoring a different port, release that old port
        if let Some(ref current_win) = window_label {
            let mut sessions = self.sessions.lock().await;
            let mut old_ports = Vec::new();
            for (p, s_arc) in sessions.iter() {
                let s = s_arc.lock().await;
                if s.window_label.as_deref() == Some(current_win.as_str()) && p != &port {
                    old_ports.push(p.clone());
                }
            }
            for p in old_ports {
                if let Some(old_sess_arc) = sessions.remove(&p) {
                    let mut old_sess = old_sess_arc.lock().await;
                    Self::stop_session_internal(&mut old_sess).await;
                }
            }
        }

        // 3. Stop any existing session on THIS port if owned by this window
        {
            let mut sessions = self.sessions.lock().await;
            if let Some(old_sess_arc) = sessions.remove(&port) {
                let mut old_sess = old_sess_arc.lock().await;
                Self::stop_session_internal(&mut old_sess).await;
            }
        }

        // 4. Attempt direct POSIX termios open for ultra-low latency & zero board reset
        #[cfg(unix)]
        {
            let c_port = match CString::new(port.clone()) {
                Ok(p) => p,
                Err(e) => return Err(format!("Invalid port path: {}", e)),
            };

            // Open with O_RDWR | O_NOCTTY | O_NONBLOCK first to prevent blocking on carrier-detect
            let raw_fd = unsafe {
                libc::open(
                    c_port.as_ptr(),
                    libc::O_RDWR | libc::O_NOCTTY | libc::O_NONBLOCK,
                )
            };

            if raw_fd >= 0 {
                // Clear O_NONBLOCK for clean blocking reads with poll
                unsafe {
                    let flags = libc::fcntl(raw_fd, libc::F_GETFL, 0);
                    if flags >= 0 {
                        libc::fcntl(raw_fd, libc::F_SETFL, flags & !libc::O_NONBLOCK);
                    }
                }

                if let Ok(()) = configure_termios(raw_fd, baud_rate) {
                    let shutdown_flag = Arc::new(AtomicBool::new(false));
                    let closed_flag = Arc::new(AtomicBool::new(false));

                    let session = Arc::new(Mutex::new(ActiveSerialSession {
                        port: port.clone(),
                        baud_rate,
                        window_label: window_label.clone(),
                        native_fd: Some(raw_fd),
                        shutdown_flag: Some(Arc::clone(&shutdown_flag)),
                        closed_flag: Some(Arc::clone(&closed_flag)),
                        reader_handle: None,
                        child: None,
                        stdin: None,
                        lock_file: Some(os_lock_file),
                    }));

                    {
                        let mut sessions = self.sessions.lock().await;
                        sessions.insert(port.clone(), Arc::clone(&session));
                    }

                    let app_clone = app.clone();
                    let port_name = port.clone();
                    let win_label = window_label.clone();
                    let sessions_ref = Arc::clone(&self.sessions);
                    let flag_reader = Arc::clone(&shutdown_flag);
                    let closed_reader = Arc::clone(&closed_flag);

                    // Spawn dedicated OS worker thread to stream serial data with zero IPC overhead
                    let reader_handle = std::thread::spawn(move || {
                        let mut pfd = libc::pollfd {
                            fd: raw_fd,
                            events: libc::POLLIN | libc::POLLERR | libc::POLLHUP,
                            revents: 0,
                        };
                        let mut buf = [0u8; 8192];
                        let mut decoder = StreamingUtf8Decoder::new();
                        let mut last_emit = std::time::Instant::now();
                        let mut last_takeover_check = std::time::Instant::now();
                        let batch_window = std::time::Duration::from_millis(12);

                        while !flag_reader.load(Ordering::Relaxed) {
                            // Periodic cross-process takeover request check
                            if last_takeover_check.elapsed() > std::time::Duration::from_millis(200) {
                                last_takeover_check = std::time::Instant::now();
                                let takeover_path = get_lock_dir().join(port_to_takeover_filename(&port_name));
                                if takeover_path.exists() {
                                    if let Ok(content) = std::fs::read_to_string(&takeover_path) {
                                        let req: Option<TakeoverRequest> = serde_json::from_str(&content).ok();
                                        let new_desc = req
                                            .map(|r| format!("PID {} (window '{}')", r.requested_by_pid, r.requested_by_window))
                                            .unwrap_or_else(|| "another FlashCode instance".to_string());

                                        emit_serial(
                                            &app_clone,
                                            win_label.as_deref(),
                                            "serial-output",
                                            &format!("\n[Serial Monitor] Port {} was taken over by {}.\n", port_name, new_desc),
                                        );
                                        emit_event(
                                            &app_clone,
                                            win_label.as_deref(),
                                            "port-taken-over",
                                            serde_json::json!({
                                                "port": port_name,
                                                "reason": "external_takeover"
                                            }),
                                        );
                                        let _ = std::fs::remove_file(&takeover_path);
                                        break;
                                    }
                                }
                            }

                            let ret = unsafe { libc::poll(&mut pfd, 1, 15) };
                            if ret > 0 {
                                if pfd.revents & (libc::POLLERR | libc::POLLNVAL) != 0 {
                                    break;
                                }
                                if pfd.revents & libc::POLLIN != 0 {
                                    let n = unsafe {
                                        libc::read(
                                            raw_fd,
                                            buf.as_mut_ptr() as *mut libc::c_void,
                                            buf.len(),
                                        )
                                    };
                                    if n > 0 {
                                        decoder.push_bytes(&buf[..n as usize]);
                                    } else if n < 0 {
                                        let err = std::io::Error::last_os_error();
                                        if let Some(code) = err.raw_os_error() {
                                            if code == libc::EAGAIN || code == libc::EINTR {
                                                // Non-blocking wait, continue
                                            } else if code == libc::EIO || code == libc::ENODEV || code == libc::EBADF {
                                                // Physical hardware disconnected
                                                break;
                                            }
                                        }
                                    }
                                } else if pfd.revents & libc::POLLHUP != 0 {
                                    let mut test_buf = [0u8; 1];
                                    let n = unsafe {
                                        libc::read(raw_fd, test_buf.as_mut_ptr() as *mut libc::c_void, 1)
                                    };
                                    if n < 0 {
                                        let err = std::io::Error::last_os_error();
                                        if let Some(code) = err.raw_os_error() {
                                            if code == libc::EIO || code == libc::ENODEV || code == libc::EBADF {
                                                break;
                                            }
                                        }
                                    }
                                }
                            }

                            // Flush micro-batch if 12ms elapsed or accumulated bytes >= 4096
                            if decoder.has_pending() {
                                if decoder.pending_len() >= 4096 || last_emit.elapsed() >= batch_window {
                                    if let Some(chunk) = decoder.decode_available() {
                                        emit_serial(&app_clone, win_label.as_deref(), "serial-output", &chunk);
                                        last_emit = std::time::Instant::now();
                                    }
                                }
                            }
                        }

                        // Flush any remaining characters on exit
                        if let Some(remaining) = decoder.flush_remaining() {
                            emit_serial(&app_clone, win_label.as_deref(), "serial-output", &remaining);
                        }

                        if !closed_reader.swap(true, Ordering::SeqCst) {
                            unsafe {
                                libc::close(raw_fd);
                            }
                        }

                        // Clean up session from registry when thread exits
                        let is_active_shutdown = flag_reader.load(Ordering::Relaxed);
                        rt_handle.spawn(async move {
                            let mut sessions = sessions_ref.lock().await;
                            if let Some(s_arc) = sessions.remove(&port_name) {
                                let mut s = s_arc.lock().await;
                                Self::stop_session_internal(&mut s).await;
                            }
                            if !is_active_shutdown {
                                emit_serial(
                                    &app_clone,
                                    win_label.as_deref(),
                                    "serial-output",
                                    &format!("\n[Serial Monitor] Port {} disconnected.\n", port_name),
                                );
                                emit_disconnect(&app_clone, win_label.as_deref(), &port_name);
                            }
                        });
                    });

                    {
                        let mut sess_guard = session.lock().await;
                        sess_guard.reader_handle = Some(reader_handle);
                    }

                    return Ok(());
                } else {
                    unsafe {
                        libc::close(raw_fd);
                    }
                }
            }
        }

        // 5. Fallback to arduino-cli monitor if native termios open failed
        let cli_path = Self::resolve_arduino_cli();
        let mut cmd = Command::new(&cli_path);
        cmd.args([
            "monitor",
            "-p",
            &port,
            "-c",
            &format!("baudrate={}", baud_rate),
            "-q",
            "--raw",
        ]);
        cmd.stdin(std::process::Stdio::piped());
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to start serial monitor process: {}", e))?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let stdin = child.stdin.take();
        let shutdown_flag = Arc::new(AtomicBool::new(false));

        let session = Arc::new(Mutex::new(ActiveSerialSession {
            port: port.clone(),
            baud_rate,
            window_label: window_label.clone(),
            native_fd: None,
            shutdown_flag: Some(Arc::clone(&shutdown_flag)),
            closed_flag: None,
            reader_handle: None,
            child: Some(child),
            stdin,
            lock_file: Some(os_lock_file),
        }));

        {
            let mut sessions = self.sessions.lock().await;
            sessions.insert(port.clone(), Arc::clone(&session));
        }

        let sessions_ref = Arc::clone(&self.sessions);
        let port_name = port.clone();
        let win_label = window_label.clone();

        if let Some(mut stdout) = stdout {
            let app_clone = app.clone();
            let port_for_eof = port_name.clone();
            let win_for_eof = win_label.clone();
            let flag_eof = Arc::clone(&shutdown_flag);
            tokio::spawn(async move {
                let mut buffer = [0u8; 8192];
                let mut decoder = StreamingUtf8Decoder::new();
                let mut last_emit = tokio::time::Instant::now();
                let batch_window = tokio::time::Duration::from_millis(12);

                loop {
                    tokio::select! {
                        res = stdout.read(&mut buffer) => {
                            match res {
                                Ok(0) => {
                                    if let Some(remaining) = decoder.flush_remaining() {
                                        emit_serial(&app_clone, win_for_eof.as_deref(), "serial-output", &remaining);
                                    }
                                    let was_intentional_stop = flag_eof.load(Ordering::Relaxed);
                                    let mut sessions = sessions_ref.lock().await;
                                    if let Some(s_arc) = sessions.remove(&port_for_eof) {
                                        let mut s = s_arc.lock().await;
                                        Self::stop_session_internal(&mut s).await;
                                    }
                                    if !was_intentional_stop {
                                        emit_serial(&app_clone, win_for_eof.as_deref(), "serial-output", "\n[Serial Monitor] Port closed or disconnected.\n");
                                        emit_disconnect(&app_clone, win_for_eof.as_deref(), &port_for_eof);
                                    }
                                    break;
                                }
                                Ok(n) => {
                                    decoder.push_bytes(&buffer[..n]);
                                    if decoder.pending_len() >= 4096 || last_emit.elapsed() >= batch_window {
                                        if let Some(chunk) = decoder.decode_available() {
                                            emit_serial(&app_clone, win_for_eof.as_deref(), "serial-output", &chunk);
                                            last_emit = tokio::time::Instant::now();
                                        }
                                    }
                                }
                                Err(_) => break,
                            }
                        }
                        _ = tokio::time::sleep(tokio::time::Duration::from_millis(10)), if decoder.has_pending() => {
                            if let Some(chunk) = decoder.decode_available() {
                                emit_serial(&app_clone, win_for_eof.as_deref(), "serial-output", &chunk);
                                last_emit = tokio::time::Instant::now();
                            }
                        }
                    }
                }
            });
        }

        if let Some(stderr) = stderr {
            let app_clone = app.clone();
            let win_err = win_label.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    emit_serial(&app_clone, win_err.as_deref(), "serial-output", &format!("\n[Serial Error] {}\n", line));
                }
            });
        }

        Ok(())
    }

    pub async fn stop(&self, port: Option<&str>, window_label: Option<&str>) {
        let _op = self.op_lock.lock().await;
        let mut sessions = self.sessions.lock().await;
        if let Some(p) = port {
            if let Some(s_arc) = sessions.remove(p) {
                let mut s = s_arc.lock().await;
                Self::stop_session_internal(&mut s).await;
            }
        } else if let Some(lbl) = window_label {
            let mut ports_to_remove = Vec::new();
            for (p, s_arc) in sessions.iter() {
                let s = s_arc.lock().await;
                if s.window_label.as_deref() == Some(lbl) {
                    ports_to_remove.push(p.clone());
                }
            }
            for p in ports_to_remove {
                if let Some(s_arc) = sessions.remove(&p) {
                    let mut s = s_arc.lock().await;
                    Self::stop_session_internal(&mut s).await;
                }
            }
        } else {
            let all_arcs: Vec<_> = sessions.drain().map(|(_, v)| v).collect();
            for s_arc in all_arcs {
                let mut s = s_arc.lock().await;
                Self::stop_session_internal(&mut s).await;
            }
        }
    }

    pub async fn stop_port(&self, port: &str) {
        self.stop(Some(port), None).await;
    }

    /// Deterministically pause an active serial monitor on `port` before flashing,
    /// waiting for thread teardown and OS driver handle release.
    pub async fn pause_for_upload(&self, port: &str, app: &AppHandle) -> bool {
        let _op = self.op_lock.lock().await;
        {
            let mut uploading = self.uploading_ports.lock().await;
            uploading.insert(port.to_string());
        }

        let mut stopped_state: Option<PausedSerialState> = None;
        {
            let mut sessions = self.sessions.lock().await;
            if let Some(s_arc) = sessions.remove(port) {
                let mut s = s_arc.lock().await;
                let state = PausedSerialState {
                    port: port.to_string(),
                    baud_rate: s.baud_rate,
                    window_label: s.window_label.clone(),
                };
                Self::stop_session_internal(&mut s).await;
                stopped_state = Some(state);
            }
        }

        if let Some(state) = stopped_state {
            emit_event(
                app,
                state.window_label.as_deref(),
                "serial-paused",
                serde_json::json!({
                    "port": state.port,
                    "baud_rate": state.baud_rate,
                }),
            );
            emit_serial(
                app,
                state.window_label.as_deref(),
                "serial-output",
                &format!("\n[Serial Monitor] Paused on {} for firmware upload.\n", port),
            );
            {
                let mut paused = self.paused_uploads.lock().await;
                paused.insert(port.to_string(), state);
            }
            // Allow OS USB-UART drivers (CH340/CP2102/FTDI) to release port handles cleanly
            tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
            true
        } else {
            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
            false
        }
    }

    /// Release upload port reservation and seamlessly restore any paused serial monitor session
    /// with bounded backoff retries to accommodate board reset and USB re-enumeration.
    pub async fn resume_after_upload(&self, port: &str, app: &AppHandle) -> Result<(), String> {
        let _op = self.op_lock.lock().await;
        {
            let mut uploading = self.uploading_ports.lock().await;
            uploading.remove(port);
        }

        let paused_state = {
            let mut paused = self.paused_uploads.lock().await;
            paused.remove(port)
        };

        let Some(state) = paused_state else {
            return Ok(());
        };

        // Initial settle window for bootloader reset / USB CDC re-enumeration
        tokio::time::sleep(tokio::time::Duration::from_millis(350)).await;

        let retry_delays_ms = [0u64, 250, 500, 900];
        let mut last_err = String::new();

        for delay in retry_delays_ms {
            if delay > 0 {
                tokio::time::sleep(tokio::time::Duration::from_millis(delay)).await;
            }
            match self
                .start_inner(
                    state.port.clone(),
                    state.baud_rate,
                    state.window_label.clone(),
                    app.clone(),
                )
                .await
            {
                Ok(()) => {
                    emit_event(
                        app,
                        state.window_label.as_deref(),
                        "serial-resumed",
                        serde_json::json!({
                            "port": state.port,
                            "baud_rate": state.baud_rate,
                        }),
                    );
                    emit_serial(
                        app,
                        state.window_label.as_deref(),
                        "serial-output",
                        &format!(
                            "\n[Serial Monitor] Resumed on {} at {} baud.\n",
                            state.port, state.baud_rate
                        ),
                    );
                    return Ok(());
                }
                Err(e) => {
                    last_err = e;
                }
            }
        }

        emit_event(
            app,
            state.window_label.as_deref(),
            "serial-resumed",
            serde_json::json!({
                "port": state.port,
                "baud_rate": state.baud_rate,
                "error": last_err,
            }),
        );
        emit_disconnect(app, state.window_label.as_deref(), &state.port);
        Err(format!(
            "Failed to resume serial monitor on {}: {}",
            state.port, last_err
        ))
    }

    pub async fn reset_board(
        &self,
        port: Option<&str>,
        window_label: Option<&str>,
    ) -> Result<(), String> {
        #[cfg(unix)]
        {
            let mut target_fd = None;
            let mut resolved_port = port.map(|s| s.to_string());

            {
                let sessions = self.sessions.lock().await;
                if let Some(p) = port {
                    if let Some(s_arc) = sessions.get(p) {
                        let s = s_arc.lock().await;
                        target_fd = s.native_fd;
                    }
                } else if let Some(lbl) = window_label {
                    for (p, s_arc) in sessions.iter() {
                        let s = s_arc.lock().await;
                        if s.window_label.as_deref() == Some(lbl) {
                            target_fd = s.native_fd;
                            resolved_port = Some(p.clone());
                            break;
                        }
                    }
                }
            }

            if let Some(fd) = target_fd {
                unsafe {
                    let mut status: libc::c_int = 0;
                    if libc::ioctl(fd, libc::TIOCMGET, &mut status) == 0 {
                        status |= libc::TIOCM_RTS | libc::TIOCM_DTR;
                        let _ = libc::ioctl(fd, libc::TIOCMSET, &status);

                        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

                        status &= !libc::TIOCM_DTR;
                        let _ = libc::ioctl(fd, libc::TIOCMSET, &status);

                        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

                        status &= !libc::TIOCM_RTS;
                        let _ = libc::ioctl(fd, libc::TIOCMSET, &status);
                        return Ok(());
                    } else {
                        return Err("Failed to query modem control lines via ioctl".to_string());
                    }
                }
            }

            if let Some(p) = resolved_port {
                let c_port = CString::new(p).map_err(|e| format!("Invalid port path: {}", e))?;
                let temp_fd = unsafe {
                    libc::open(
                        c_port.as_ptr(),
                        libc::O_RDWR | libc::O_NOCTTY | libc::O_NONBLOCK,
                    )
                };
                if temp_fd >= 0 {
                    unsafe {
                        let mut status: libc::c_int = 0;
                        if libc::ioctl(temp_fd, libc::TIOCMGET, &mut status) == 0 {
                            status |= libc::TIOCM_RTS | libc::TIOCM_DTR;
                            let _ = libc::ioctl(temp_fd, libc::TIOCMSET, &status);

                            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

                            status &= !libc::TIOCM_DTR;
                            let _ = libc::ioctl(temp_fd, libc::TIOCMSET, &status);

                            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

                            status &= !libc::TIOCM_RTS;
                            let _ = libc::ioctl(temp_fd, libc::TIOCMSET, &status);
                        }
                        libc::close(temp_fd);
                    }
                    return Ok(());
                } else {
                    return Err("Failed to open port for hardware reset".to_string());
                }
            }

            Err("No active port to reset".to_string())
        }
        #[cfg(not(unix))]
        {
            let _ = (port, window_label);
            Ok(())
        }
    }

    pub async fn write(
        &self,
        data: &str,
        port: Option<&str>,
        window_label: Option<&str>,
    ) -> Result<(), String> {
        let target_arc = {
            let sessions = self.sessions.lock().await;
            if let Some(p) = port {
                sessions.get(p).cloned()
            } else if let Some(lbl) = window_label {
                let mut found = None;
                for s_arc in sessions.values() {
                    let s = s_arc.lock().await;
                    if s.window_label.as_deref() == Some(lbl) {
                        found = Some(Arc::clone(s_arc));
                        break;
                    }
                }
                found
            } else {
                sessions.values().next().cloned()
            }
        };

        if let Some(s_arc) = target_arc {
            let mut sess = s_arc.lock().await;
            #[cfg(unix)]
            if let Some(fd) = sess.native_fd {
                let bytes = data.as_bytes();
                let mut total_written = 0;
                while total_written < bytes.len() {
                    let written = unsafe {
                        libc::write(
                            fd,
                            bytes[total_written..].as_ptr() as *const libc::c_void,
                            bytes.len() - total_written,
                        )
                    };
                    if written >= 0 {
                        total_written += written as usize;
                    } else {
                        let err = std::io::Error::last_os_error();
                        if err.raw_os_error() == Some(libc::EINTR) {
                            continue;
                        }
                        return Err(format!("Failed to write serial data: {}", err));
                    }
                }
                unsafe {
                    libc::tcdrain(fd);
                }
                return Ok(());
            }

            if let Some(stdin) = sess.stdin.as_mut() {
                stdin
                    .write_all(data.as_bytes())
                    .await
                    .map_err(|e| format!("Failed to write serial data: {}", e))?;
                stdin
                    .flush()
                    .await
                    .map_err(|e| format!("Failed to flush serial data: {}", e))?;
                Ok(())
            } else {
                Err("Serial monitor input stream is closed.".to_string())
            }
        } else {
            Err("No active serial monitor to write to.".to_string())
        }
    }

    pub async fn is_running(&self) -> bool {
        let sessions = self.sessions.lock().await;
        !sessions.is_empty()
    }

    pub async fn get_locked_ports(&self) -> Vec<PortLockStatus> {
        let mut list = Vec::new();
        let my_pid = std::process::id();

        // 1. Current process active sessions
        {
            let sessions = self.sessions.lock().await;
            for (port, s_arc) in sessions.iter() {
                let s = s_arc.lock().await;
                list.push(PortLockStatus {
                    port_name: port.clone(),
                    is_locked: true,
                    owner_window: s.window_label.clone(),
                    owner_title: None,
                    owner_pid: Some(my_pid),
                    is_external_process: false,
                });
            }
        }

        // 2. Scan OS lock files in ~/.cache/flashcode/port-locks/
        let lock_dir = get_lock_dir();
        if let Ok(entries) = std::fs::read_dir(&lock_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("lock") {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        if let Ok(meta) = serde_json::from_str::<PortLockMeta>(&content) {
                            if meta.pid != my_pid {
                                if let Ok(f) = std::fs::OpenOptions::new().read(true).write(true).open(&path) {
                                    if lock_file_exclusive(&f) {
                                        // Stale lock: holding process exited or crashed!
                                        unlock_file(&f);
                                        drop(f);
                                        let _ = std::fs::remove_file(&path);
                                    } else {
                                        // External process holds active lock
                                        if !list.iter().any(|p| p.port_name == meta.port) {
                                            list.push(PortLockStatus {
                                                port_name: meta.port,
                                                is_locked: true,
                                                owner_window: meta.window_label,
                                                owner_title: None,
                                                owner_pid: Some(meta.pid),
                                                is_external_process: true,
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        list
    }

    pub async fn transfer_port_lock(
        &self,
        port: &str,
        new_owner: &str,
        app: &AppHandle,
    ) -> Result<(), String> {
        let _op = self.op_lock.lock().await;

        // 1. In-process transfer (instant stream reparenting, zero hardware reset)
        {
            let sessions = self.sessions.lock().await;
            if let Some(s_arc) = sessions.get(port) {
                let mut s = s_arc.lock().await;
                let old_owner = s.window_label.clone();
                s.window_label = Some(new_owner.to_string());

                if let Some(ref lock_file) = s.lock_file {
                    write_lock_meta(lock_file, port, Some(new_owner));
                }

                // Notify previous owning window that port ownership has been moved
                if let Some(old_win) = old_owner {
                    emit_event(
                        app,
                        Some(&old_win),
                        "port-taken-over",
                        serde_json::json!({
                            "port": port,
                            "new_owner": new_owner,
                            "reason": "transferred"
                        }),
                    );
                    emit_disconnect(app, Some(&old_win), port);
                    emit_serial(
                        app,
                        Some(&old_win),
                        "serial-output",
                        &format!("\n[Serial Monitor] Port {} was transferred to window '{}'.\n", port, new_owner),
                    );
                }

                // Greet new window owner
                emit_serial(
                    app,
                    Some(new_owner),
                    "serial-output",
                    &format!("\n[Serial Monitor] Connected to port {} (transferred to this window).\n", port),
                );
                return Ok(());
            }
        }

        // 2. Cross-process transfer (cooperative handover via takeover protocol)
        let lock_path = get_lock_dir().join(port_to_lock_filename(port));
        if lock_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&lock_path) {
                if let Ok(meta) = serde_json::from_str::<PortLockMeta>(&content) {
                    let is_alive = is_process_alive(meta.pid);
                    if !is_alive {
                        let _ = std::fs::remove_file(&lock_path);
                    } else {
                        let takeover_path = get_lock_dir().join(port_to_takeover_filename(port));
                        let takeover_req = TakeoverRequest {
                            requested_by_pid: std::process::id(),
                            requested_by_window: new_owner.to_string(),
                            timestamp: std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_secs(),
                        };
                        if let Ok(json_str) = serde_json::to_string(&takeover_req) {
                            let _ = std::fs::write(&takeover_path, json_str);
                        }

                        // Wait up to 600ms for other FlashCode process to cleanly release
                        let start_wait = std::time::Instant::now();
                        while start_wait.elapsed() < std::time::Duration::from_millis(600) {
                            tokio::time::sleep(tokio::time::Duration::from_millis(40)).await;
                            if let Ok(f) = std::fs::OpenOptions::new().read(true).write(true).open(&lock_path) {
                                if lock_file_exclusive(&f) {
                                    unlock_file(&f);
                                    let _ = std::fs::remove_file(&takeover_path);
                                    drop(f);
                                    break;
                                }
                            } else {
                                break;
                            }
                        }
                    }
                }
            }
        }

        // Start serial monitor for new owner
        self.start(port.to_string(), 115200, Some(new_owner.to_string()), app.clone()).await?;
        emit_serial(
            app,
            Some(new_owner),
            "serial-output",
            &format!("\n[Serial Monitor] Successfully acquired port {}.\n", port),
        );
        Ok(())
    }
}
