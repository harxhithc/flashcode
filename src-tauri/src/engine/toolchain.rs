use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Instant;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

pub const ESP32_INDEX_URL: &str =
    "https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json";
pub const ESP8266_INDEX_URL: &str =
    "https://arduino.esp8266.com/stable/package_esp8266com_index.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardInfo {
    pub name: String,
    pub fqbn: String,
    pub architecture: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub family: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_installed: Option<bool>,
}

pub const POPULAR_BOARD_FQBNS: &[&str] = &[
    "arduino:avr:uno",
    "arduino:avr:nano",
    "arduino:avr:mega",
    "esp32:esp32:esp32",
    "esp32:esp32:esp32s3",
    "esp32:esp32:esp32c3",
    "esp32:esp32:esp32c6",
    "esp32:esp32:nodemcu-32s",
    "esp32:esp32:nano_nora",
    "esp32:esp32:esp32cam",
    "esp32:esp32:XIAO_ESP32C3",
    "esp32:esp32:XIAO_ESP32S3",
    "arduino:avr:leonardo",
    "arduino:avr:pro",
    "arduino:avr:micro",
    "arduino:megaavr:nona4809",
    "arduino:renesas_uno:unor4wifi",
    "arduino:renesas_uno:minima",
    "arduino:samd:arduino_zero_edbg",
    "arduino:samd:mkrwifi1010",
    "arduino:samd:nano_33_iot",
    "esp8266:esp8266:nodemcuv2",
    "esp8266:esp8266:d1_mini",
    "esp8266:esp8266:generic",
    "rp2040:rp2040:rpipico",
    "rp2040:rp2040:rpipicow",
    "arduino:mbed_nano:nanorp2040connect",
    "STMicroelectronics:stm32:GenF1:pnum=BLUEPILL_F103C8",
    "STMicroelectronics:stm32:GenF4:pnum=BLACKPILL_F401CE",
    "teensy:avr:teensy40",
    "teensy:avr:teensy41",
];

pub fn derive_board_family(fqbn: &str, name: &str) -> String {
    let l_f = fqbn.to_lowercase();
    let l_n = name.to_lowercase();
    if l_f.starts_with("esp32:") || l_n.contains("esp32") {
        "ESP32".to_string()
    } else if l_f.starts_with("arduino:avr")
        || (l_f.starts_with("arduino:") && !l_f.contains("esp32"))
        || l_n.contains("arduino")
    {
        "Arduino".to_string()
    } else if l_f.starts_with("esp8266:") || l_n.contains("esp8266") || l_n.contains("nodemcu") {
        "ESP8266".to_string()
    } else if l_f.contains("rp2040") || l_n.contains("rp2040") || l_n.contains("pico") {
        "RP2040".to_string()
    } else if l_f.contains("stm32") || l_n.contains("stm32") {
        "STM32".to_string()
    } else if l_f.contains("samd") || l_n.contains("samd") {
        "SAMD".to_string()
    } else if l_f.contains("teensy") || l_n.contains("teensy") {
        "Teensy".to_string()
    } else {
        "Other".to_string()
    }
}

pub fn derive_board_architecture(fqbn: &str) -> String {
    let parts: Vec<&str> = fqbn.split(':').collect();
    if parts.len() >= 2 {
        parts[1].to_string()
    } else {
        "embedded".to_string()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardConfigOptionValue {
    pub value: String,
    pub value_label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardConfigOption {
    pub option: String,
    pub option_label: String,
    pub values: Vec<BoardConfigOptionValue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildResult {
    pub success: bool,
    pub elapsed_ms: u128,
    pub stdout: String,
    pub stderr: String,
    pub ccache_used: bool,
    pub cached_build: bool,
}

pub fn resolve_home_dir() -> String {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string())
}

pub fn emit_upload_progress(
    app: Option<&AppHandle>,
    window_label: Option<&str>,
    stage: &str,
    msg_type: &str,
    message: &str,
) {
    if let Some(app_handle) = app {
        use tauri::Manager;
        let payload = serde_json::json!({
            "stage": stage,
            "type": msg_type,
            "message": message,
        });
        if let Some(lbl) = window_label {
            if let Some(win) = app_handle.get_webview_window(lbl) {
                let _ = win.emit("upload-progress", payload);
                return;
            }
        }
        let _ = app_handle.emit("upload-progress", payload);
    }
}

pub struct ToolchainEngine {
    arduino_cli_path: PathBuf,
    ccache_path: Option<PathBuf>,
    ccache_dir: PathBuf,
    ccache_bin_dir: PathBuf,
}

impl ToolchainEngine {
    pub fn new() -> Self {
        let home = resolve_home_dir();
        let local_bin = PathBuf::from(&home).join(".local").join("bin");

        // Locate arduino-cli
        let arduino_cli_path = Self::resolve_arduino_cli();

        // Locate ccache
        let ccache_path = if local_bin.join("ccache").exists() {
            Some(local_bin.join("ccache"))
        } else if local_bin.join("ccache.exe").exists() {
            Some(local_bin.join("ccache.exe"))
        } else if std::process::Command::new("ccache").arg("--version").output().is_ok() {
            Some(PathBuf::from("ccache"))
        } else {
            None
        };

        let cache_base = PathBuf::from(&home).join(".cache").join("flashcode");
        let ccache_dir = cache_base.join("ccache");
        let ccache_bin_dir = cache_base.join("ccache-bin");
        let _ = std::fs::create_dir_all(&ccache_dir);

        Self {
            arduino_cli_path,
            ccache_path,
            ccache_dir,
            ccache_bin_dir,
        }
    }

    /// Return the persistent sketch cache directory
    pub fn get_sketch_dir() -> PathBuf {
        let home = resolve_home_dir();
        let sketch_dir = PathBuf::from(&home)
            .join(".cache")
            .join("flashcode")
            .join("sketch");
        let _ = std::fs::create_dir_all(&sketch_dir);
        sketch_dir
    }

    /// Return an isolated staging directory for a specific window/workspace
    pub fn get_staging_dir(id: &str) -> PathBuf {
        let home = resolve_home_dir();
        let safe_id = id.replace(|c: char| !c.is_alphanumeric() && c != '_', "_");
        let staging_dir = PathBuf::from(&home)
            .join(".cache")
            .join("flashcode")
            .join("staging")
            .join(safe_id);
        let _ = std::fs::create_dir_all(&staging_dir);
        staging_dir
    }

    /// Return an isolated build output directory per sketch path and FQBN
    pub fn get_build_dir(sketch_path: &Path, fqbn: &str) -> PathBuf {
        let home = resolve_home_dir();
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        sketch_path.to_string_lossy().hash(&mut hasher);
        fqbn.hash(&mut hasher);
        let hash_val = format!("{:016x}", hasher.finish());

        let build_dir = PathBuf::from(&home)
            .join(".cache")
            .join("flashcode")
            .join("builds")
            .join(hash_val);
        let _ = std::fs::create_dir_all(&build_dir);
        build_dir
    }

    pub fn resolve_arduino_cli() -> PathBuf {
        let home = resolve_home_dir();
        let local_bin = PathBuf::from(&home).join(".local").join("bin");
        if local_bin.join("arduino-cli").exists() {
            local_bin.join("arduino-cli")
        } else if local_bin.join("arduino-cli.exe").exists() {
            local_bin.join("arduino-cli.exe")
        } else {
            PathBuf::from("arduino-cli")
        }
    }

    /// Comprehensive bundled catalog of popular embedded board families (Arduino AVR, SAMD, ESP32, ESP8266, RP2040, STM32, Teensy)
    pub fn bundled_popular_boards() -> Vec<BoardInfo> {
        vec![
            // Arduino AVR Family
            BoardInfo {
                name: "Arduino Uno".to_string(),
                fqbn: "arduino:avr:uno".to_string(),
                architecture: "avr".to_string(),
                family: Some("Arduino".to_string()),
                platform_name: Some("Arduino AVR Boards".to_string()),
                platform_id: Some("arduino:avr".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Arduino Nano".to_string(),
                fqbn: "arduino:avr:nano".to_string(),
                architecture: "avr".to_string(),
                family: Some("Arduino".to_string()),
                platform_name: Some("Arduino AVR Boards".to_string()),
                platform_id: Some("arduino:avr".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Arduino Mega or Mega 2560".to_string(),
                fqbn: "arduino:avr:mega".to_string(),
                architecture: "avr".to_string(),
                family: Some("Arduino".to_string()),
                platform_name: Some("Arduino AVR Boards".to_string()),
                platform_id: Some("arduino:avr".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Arduino Leonardo".to_string(),
                fqbn: "arduino:avr:leonardo".to_string(),
                architecture: "avr".to_string(),
                family: Some("Arduino".to_string()),
                platform_name: Some("Arduino AVR Boards".to_string()),
                platform_id: Some("arduino:avr".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Arduino Micro".to_string(),
                fqbn: "arduino:avr:micro".to_string(),
                architecture: "avr".to_string(),
                family: Some("Arduino".to_string()),
                platform_name: Some("Arduino AVR Boards".to_string()),
                platform_id: Some("arduino:avr".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Arduino Pro or Pro Mini".to_string(),
                fqbn: "arduino:avr:pro".to_string(),
                architecture: "avr".to_string(),
                family: Some("Arduino".to_string()),
                platform_name: Some("Arduino AVR Boards".to_string()),
                platform_id: Some("arduino:avr".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Arduino Nano Every".to_string(),
                fqbn: "arduino:megaavr:nona4809".to_string(),
                architecture: "megaavr".to_string(),
                family: Some("Arduino".to_string()),
                platform_name: Some("Arduino megaAVR Boards".to_string()),
                platform_id: Some("arduino:megaavr".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Arduino Duemilanove or Diecimila".to_string(),
                fqbn: "arduino:avr:diecimila".to_string(),
                architecture: "avr".to_string(),
                family: Some("Arduino".to_string()),
                platform_name: Some("Arduino AVR Boards".to_string()),
                platform_id: Some("arduino:avr".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Arduino Mini".to_string(),
                fqbn: "arduino:avr:mini".to_string(),
                architecture: "avr".to_string(),
                family: Some("Arduino".to_string()),
                platform_name: Some("Arduino AVR Boards".to_string()),
                platform_id: Some("arduino:avr".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Arduino Ethernet".to_string(),
                fqbn: "arduino:avr:ethernet".to_string(),
                architecture: "avr".to_string(),
                family: Some("Arduino".to_string()),
                platform_name: Some("Arduino AVR Boards".to_string()),
                platform_id: Some("arduino:avr".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Arduino Fio".to_string(),
                fqbn: "arduino:avr:fio".to_string(),
                architecture: "avr".to_string(),
                family: Some("Arduino".to_string()),
                platform_name: Some("Arduino AVR Boards".to_string()),
                platform_id: Some("arduino:avr".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "LilyPad Arduino".to_string(),
                fqbn: "arduino:avr:lilypad".to_string(),
                architecture: "avr".to_string(),
                family: Some("Arduino".to_string()),
                platform_name: Some("Arduino AVR Boards".to_string()),
                platform_id: Some("arduino:avr".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Arduino Esplora".to_string(),
                fqbn: "arduino:avr:esplora".to_string(),
                architecture: "avr".to_string(),
                family: Some("Arduino".to_string()),
                platform_name: Some("Arduino AVR Boards".to_string()),
                platform_id: Some("arduino:avr".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Arduino Yún".to_string(),
                fqbn: "arduino:avr:yun".to_string(),
                architecture: "avr".to_string(),
                family: Some("Arduino".to_string()),
                platform_name: Some("Arduino AVR Boards".to_string()),
                platform_id: Some("arduino:avr".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Arduino Uno R4 WiFi".to_string(),
                fqbn: "arduino:renesas_uno:unor4wifi".to_string(),
                architecture: "renesas_uno".to_string(),
                family: Some("Arduino".to_string()),
                platform_name: Some("Arduino Renesas UNO R4 Boards".to_string()),
                platform_id: Some("arduino:renesas_uno".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Arduino Uno R4 Minima".to_string(),
                fqbn: "arduino:renesas_uno:minima".to_string(),
                architecture: "renesas_uno".to_string(),
                family: Some("Arduino".to_string()),
                platform_name: Some("Arduino Renesas UNO R4 Boards".to_string()),
                platform_id: Some("arduino:renesas_uno".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Arduino Nano 33 IoT".to_string(),
                fqbn: "arduino:samd:nano_33_iot".to_string(),
                architecture: "samd".to_string(),
                family: Some("Arduino".to_string()),
                platform_name: Some("Arduino SAMD Boards".to_string()),
                platform_id: Some("arduino:samd".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Arduino Nano 33 BLE".to_string(),
                fqbn: "arduino:mbed_nano:nano33ble".to_string(),
                architecture: "mbed_nano".to_string(),
                family: Some("Arduino".to_string()),
                platform_name: Some("Arduino Mbed OS Nano Boards".to_string()),
                platform_id: Some("arduino:mbed_nano".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Arduino Nano RP2040 Connect".to_string(),
                fqbn: "arduino:mbed_nano:nanorp2040connect".to_string(),
                architecture: "mbed_nano".to_string(),
                family: Some("RP2040".to_string()),
                platform_name: Some("Arduino Mbed OS Nano Boards".to_string()),
                platform_id: Some("arduino:mbed_nano".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Arduino MKR WiFi 1010".to_string(),
                fqbn: "arduino:samd:mkrwifi1010".to_string(),
                architecture: "samd".to_string(),
                family: Some("Arduino".to_string()),
                platform_name: Some("Arduino SAMD Boards".to_string()),
                platform_id: Some("arduino:samd".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Arduino MKR 1000 WiFi".to_string(),
                fqbn: "arduino:samd:mkr1000".to_string(),
                architecture: "samd".to_string(),
                family: Some("Arduino".to_string()),
                platform_name: Some("Arduino SAMD Boards".to_string()),
                platform_id: Some("arduino:samd".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Arduino Zero".to_string(),
                fqbn: "arduino:samd:arduino_zero_edbg".to_string(),
                architecture: "samd".to_string(),
                family: Some("Arduino".to_string()),
                platform_name: Some("Arduino SAMD Boards".to_string()),
                platform_id: Some("arduino:samd".to_string()),
                is_installed: Some(true),
            },

            // ESP32 Family (Espressif)
            BoardInfo {
                name: "ESP32 Dev Module".to_string(),
                fqbn: "esp32:esp32:esp32".to_string(),
                architecture: "esp32".to_string(),
                family: Some("ESP32".to_string()),
                platform_name: Some("esp32 by Espressif Systems".to_string()),
                platform_id: Some("esp32:esp32".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "ESP32-S3 Dev Module".to_string(),
                fqbn: "esp32:esp32:esp32s3".to_string(),
                architecture: "esp32".to_string(),
                family: Some("ESP32".to_string()),
                platform_name: Some("esp32 by Espressif Systems".to_string()),
                platform_id: Some("esp32:esp32".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "ESP32-C3 Dev Module".to_string(),
                fqbn: "esp32:esp32:esp32c3".to_string(),
                architecture: "esp32".to_string(),
                family: Some("ESP32".to_string()),
                platform_name: Some("esp32 by Espressif Systems".to_string()),
                platform_id: Some("esp32:esp32".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "ESP32-C6 Dev Module".to_string(),
                fqbn: "esp32:esp32:esp32c6".to_string(),
                architecture: "esp32".to_string(),
                family: Some("ESP32".to_string()),
                platform_name: Some("esp32 by Espressif Systems".to_string()),
                platform_id: Some("esp32:esp32".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "ESP32-S2 Dev Module".to_string(),
                fqbn: "esp32:esp32:esp32s2".to_string(),
                architecture: "esp32".to_string(),
                family: Some("ESP32".to_string()),
                platform_name: Some("esp32 by Espressif Systems".to_string()),
                platform_id: Some("esp32:esp32".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "ESP32-H2 Dev Module".to_string(),
                fqbn: "esp32:esp32:esp32h2".to_string(),
                architecture: "esp32".to_string(),
                family: Some("ESP32".to_string()),
                platform_name: Some("esp32 by Espressif Systems".to_string()),
                platform_id: Some("esp32:esp32".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "NodeMCU-32S".to_string(),
                fqbn: "esp32:esp32:nodemcu-32s".to_string(),
                architecture: "esp32".to_string(),
                family: Some("ESP32".to_string()),
                platform_name: Some("esp32 by Espressif Systems".to_string()),
                platform_id: Some("esp32:esp32".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Arduino Nano ESP32".to_string(),
                fqbn: "esp32:esp32:nano_nora".to_string(),
                architecture: "esp32".to_string(),
                family: Some("ESP32".to_string()),
                platform_name: Some("esp32 by Espressif Systems".to_string()),
                platform_id: Some("esp32:esp32".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "AI Thinker ESP32-CAM".to_string(),
                fqbn: "esp32:esp32:esp32cam".to_string(),
                architecture: "esp32".to_string(),
                family: Some("ESP32".to_string()),
                platform_name: Some("esp32 by Espressif Systems".to_string()),
                platform_id: Some("esp32:esp32".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "WEMOS D1 MINI ESP32".to_string(),
                fqbn: "esp32:esp32:d1_mini32".to_string(),
                architecture: "esp32".to_string(),
                family: Some("ESP32".to_string()),
                platform_name: Some("esp32 by Espressif Systems".to_string()),
                platform_id: Some("esp32:esp32".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Seeed Studio XIAO ESP32C3".to_string(),
                fqbn: "esp32:esp32:XIAO_ESP32C3".to_string(),
                architecture: "esp32".to_string(),
                family: Some("ESP32".to_string()),
                platform_name: Some("esp32 by Espressif Systems".to_string()),
                platform_id: Some("esp32:esp32".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Seeed Studio XIAO ESP32S3".to_string(),
                fqbn: "esp32:esp32:XIAO_ESP32S3".to_string(),
                architecture: "esp32".to_string(),
                family: Some("ESP32".to_string()),
                platform_name: Some("esp32 by Espressif Systems".to_string()),
                platform_id: Some("esp32:esp32".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "TTGO T-Beam".to_string(),
                fqbn: "esp32:esp32:t-beam".to_string(),
                architecture: "esp32".to_string(),
                family: Some("ESP32".to_string()),
                platform_name: Some("esp32 by Espressif Systems".to_string()),
                platform_id: Some("esp32:esp32".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Heltec WiFi LoRa 32".to_string(),
                fqbn: "esp32:esp32:heltec_wifi_lora_32".to_string(),
                architecture: "esp32".to_string(),
                family: Some("ESP32".to_string()),
                platform_name: Some("esp32 by Espressif Systems".to_string()),
                platform_id: Some("esp32:esp32".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Heltec WiFi LoRa 32(V2)".to_string(),
                fqbn: "esp32:esp32:heltec_wifi_lora_32_V2".to_string(),
                architecture: "esp32".to_string(),
                family: Some("ESP32".to_string()),
                platform_name: Some("esp32 by Espressif Systems".to_string()),
                platform_id: Some("esp32:esp32".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "M5Stack Core ESP32".to_string(),
                fqbn: "esp32:esp32:m5stack-core-esp32".to_string(),
                architecture: "esp32".to_string(),
                family: Some("ESP32".to_string()),
                platform_name: Some("esp32 by Espressif Systems".to_string()),
                platform_id: Some("esp32:esp32".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Adafruit Feather ESP32".to_string(),
                fqbn: "esp32:esp32:featheresp32".to_string(),
                architecture: "esp32".to_string(),
                family: Some("ESP32".to_string()),
                platform_name: Some("esp32 by Espressif Systems".to_string()),
                platform_id: Some("esp32:esp32".to_string()),
                is_installed: Some(true),
            },

            // ESP8266 Family
            BoardInfo {
                name: "NodeMCU 1.0 (ESP-12E Module)".to_string(),
                fqbn: "esp8266:esp8266:nodemcuv2".to_string(),
                architecture: "esp8266".to_string(),
                family: Some("ESP8266".to_string()),
                platform_name: Some("esp8266 by ESP8266 Community".to_string()),
                platform_id: Some("esp8266:esp8266".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "NodeMCU 0.9 (ESP-12 Module)".to_string(),
                fqbn: "esp8266:esp8266:nodemcu".to_string(),
                architecture: "esp8266".to_string(),
                family: Some("ESP8266".to_string()),
                platform_name: Some("esp8266 by ESP8266 Community".to_string()),
                platform_id: Some("esp8266:esp8266".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "LOLIN(WEMOS) D1 R2 & mini".to_string(),
                fqbn: "esp8266:esp8266:d1_mini".to_string(),
                architecture: "esp8266".to_string(),
                family: Some("ESP8266".to_string()),
                platform_name: Some("esp8266 by ESP8266 Community".to_string()),
                platform_id: Some("esp8266:esp8266".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "LOLIN(WEMOS) D1 mini Pro".to_string(),
                fqbn: "esp8266:esp8266:d1_mini_pro".to_string(),
                architecture: "esp8266".to_string(),
                family: Some("ESP8266".to_string()),
                platform_name: Some("esp8266 by ESP8266 Community".to_string()),
                platform_id: Some("esp8266:esp8266".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Generic ESP8266 Module".to_string(),
                fqbn: "esp8266:esp8266:generic".to_string(),
                architecture: "esp8266".to_string(),
                family: Some("ESP8266".to_string()),
                platform_name: Some("esp8266 by ESP8266 Community".to_string()),
                platform_id: Some("esp8266:esp8266".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Adafruit Feather HUZZAH ESP8266".to_string(),
                fqbn: "esp8266:esp8266:huzzah".to_string(),
                architecture: "esp8266".to_string(),
                family: Some("ESP8266".to_string()),
                platform_name: Some("esp8266 by ESP8266 Community".to_string()),
                platform_id: Some("esp8266:esp8266".to_string()),
                is_installed: Some(true),
            },

            // Raspberry Pi RP2040 Family
            BoardInfo {
                name: "Raspberry Pi Pico".to_string(),
                fqbn: "rp2040:rp2040:rpipico".to_string(),
                architecture: "rp2040".to_string(),
                family: Some("RP2040".to_string()),
                platform_name: Some("Raspberry Pi Pico/RP2040".to_string()),
                platform_id: Some("rp2040:rp2040".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Raspberry Pi Pico W".to_string(),
                fqbn: "rp2040:rp2040:rpipicow".to_string(),
                architecture: "rp2040".to_string(),
                family: Some("RP2040".to_string()),
                platform_name: Some("Raspberry Pi Pico/RP2040".to_string()),
                platform_id: Some("rp2040:rp2040".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Seeed Studio XIAO RP2040".to_string(),
                fqbn: "rp2040:rp2040:seeed_xiao_rp2040".to_string(),
                architecture: "rp2040".to_string(),
                family: Some("RP2040".to_string()),
                platform_name: Some("Raspberry Pi Pico/RP2040".to_string()),
                platform_id: Some("rp2040:rp2040".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Adafruit Feather RP2040".to_string(),
                fqbn: "rp2040:rp2040:adafruit_feather".to_string(),
                architecture: "rp2040".to_string(),
                family: Some("RP2040".to_string()),
                platform_name: Some("Raspberry Pi Pico/RP2040".to_string()),
                platform_id: Some("rp2040:rp2040".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Waveshare RP2040-Zero".to_string(),
                fqbn: "rp2040:rp2040:waveshare_rp2040_zero".to_string(),
                architecture: "rp2040".to_string(),
                family: Some("RP2040".to_string()),
                platform_name: Some("Raspberry Pi Pico/RP2040".to_string()),
                platform_id: Some("rp2040:rp2040".to_string()),
                is_installed: Some(true),
            },

            // STM32 Family
            BoardInfo {
                name: "Generic STM32F103C series (Blue Pill)".to_string(),
                fqbn: "STMicroelectronics:stm32:GenF1:pnum=BLUEPILL_F103C8".to_string(),
                architecture: "stm32".to_string(),
                family: Some("STM32".to_string()),
                platform_name: Some("STM32 MCU based boards".to_string()),
                platform_id: Some("STMicroelectronics:stm32".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Generic STM32F401 / STM32F411 (Black Pill)".to_string(),
                fqbn: "STMicroelectronics:stm32:GenF4:pnum=BLACKPILL_F401CE".to_string(),
                architecture: "stm32".to_string(),
                family: Some("STM32".to_string()),
                platform_name: Some("STM32 MCU based boards".to_string()),
                platform_id: Some("STMicroelectronics:stm32".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Nucleo-64".to_string(),
                fqbn: "STMicroelectronics:stm32:Nucleo_64".to_string(),
                architecture: "stm32".to_string(),
                family: Some("STM32".to_string()),
                platform_name: Some("STM32 MCU based boards".to_string()),
                platform_id: Some("STMicroelectronics:stm32".to_string()),
                is_installed: Some(true),
            },

            // Teensy Family
            BoardInfo {
                name: "Teensy 4.0".to_string(),
                fqbn: "teensy:avr:teensy40".to_string(),
                architecture: "avr".to_string(),
                family: Some("Teensy".to_string()),
                platform_name: Some("Teensy".to_string()),
                platform_id: Some("teensy:avr".to_string()),
                is_installed: Some(true),
            },
            BoardInfo {
                name: "Teensy 4.1".to_string(),
                fqbn: "teensy:avr:teensy41".to_string(),
                architecture: "avr".to_string(),
                family: Some("Teensy".to_string()),
                platform_name: Some("Teensy".to_string()),
                platform_id: Some("teensy:avr".to_string()),
                is_installed: Some(true),
            },
        ]
    }

    /// Return all supported embedded boards: dynamically discovered from arduino-cli
    /// and seamlessly merged with the complete bundled popular board family catalog.
    pub async fn get_default_boards() -> Vec<BoardInfo> {
        let mut map: std::collections::HashMap<String, BoardInfo> = std::collections::HashMap::new();
        let cli_path = Self::resolve_arduino_cli();

        // 1. Discover all boards installed in arduino-cli board listall --format json
        if let Ok(output) = Command::new(&cli_path)
            .args(["board", "listall", "--format", "json"])
            .output()
            .await
        {
            if output.status.success() {
                if let Ok(json_str) = std::str::from_utf8(&output.stdout) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
                        if let Some(boards) = val.get("boards").and_then(|b| b.as_array()) {
                            for b in boards {
                                if let (Some(name), Some(fqbn)) = (
                                    b.get("name").and_then(|n| n.as_str()),
                                    b.get("fqbn").and_then(|f| f.as_str()),
                                ) {
                                    if fqbn.is_empty() {
                                        continue;
                                    }
                                    let family = derive_board_family(fqbn, name);
                                    let arch = derive_board_architecture(fqbn);
                                    let platform_name = b
                                        .get("platform")
                                        .and_then(|p| p.get("release"))
                                        .and_then(|r| r.get("name"))
                                        .and_then(|n| n.as_str())
                                        .unwrap_or(&family)
                                        .to_string();
                                    let platform_id = b
                                        .get("platform")
                                        .and_then(|p| p.get("metadata"))
                                        .and_then(|m| m.get("id"))
                                        .and_then(|i| i.as_str())
                                        .map(|s| s.to_string())
                                        .unwrap_or_else(|| {
                                            fqbn.split(':').take(2).collect::<Vec<_>>().join(":")
                                        });

                                    map.insert(
                                        fqbn.to_string(),
                                        BoardInfo {
                                            name: name.to_string(),
                                            fqbn: fqbn.to_string(),
                                            architecture: arch,
                                            family: Some(family),
                                            platform_name: Some(platform_name),
                                            platform_id: Some(platform_id),
                                            is_installed: Some(true),
                                        },
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }

        // 2. Merge bundled popular boards if not already present
        for bundled in Self::bundled_popular_boards() {
            if !map.contains_key(&bundled.fqbn) {
                map.insert(bundled.fqbn.clone(), bundled);
            }
        }

        // 3. Collect and sort: popular boards first in defined order, then alphabetical by name
        let mut list: Vec<BoardInfo> = map.into_values().collect();
        list.sort_by(|a, b| {
            let pos_a = POPULAR_BOARD_FQBNS.iter().position(|&x| x == a.fqbn);
            let pos_b = POPULAR_BOARD_FQBNS.iter().position(|&x| x == b.fqbn);
            match (pos_a, pos_b) {
                (Some(idx_a), Some(idx_b)) => idx_a.cmp(&idx_b),
                (Some(_), None) => std::cmp::Ordering::Less,
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (None, None) => a.name.cmp(&b.name),
            }
        });

        list
    }

    /// Fetch configurable board options (e.g. Processor / Old Bootloader, CPU Freq, Flash Size)
    pub async fn get_board_options(fqbn: &str) -> Vec<BoardConfigOption> {
        let base_fqbn: String = fqbn.split(':').take(3).collect::<Vec<_>>().join(":");
        if base_fqbn.is_empty() {
            return Vec::new();
        }

        let cli_path = Self::resolve_arduino_cli();
        let output = match Command::new(&cli_path)
            .args(["board", "details", "--fqbn", &base_fqbn, "--format", "json"])
            .output()
            .await
        {
            Ok(o) if o.status.success() => o,
            _ => return Vec::new(),
        };

        let json_str = match std::str::from_utf8(&output.stdout) {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };

        let parsed: serde_json::Value = match serde_json::from_str(json_str) {
            Ok(v) => v,
            Err(_) => return Vec::new(),
        };

        let mut options = Vec::new();
        if let Some(raw_opts) = parsed.get("config_options").and_then(|v| v.as_array()) {
            for opt in raw_opts {
                let option = opt
                    .get("option")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                if option.is_empty() {
                    continue;
                }
                let option_label = opt
                    .get("option_label")
                    .and_then(|v| v.as_str())
                    .unwrap_or(&option)
                    .to_string();

                let mut values = Vec::new();
                let mut default_value = None;
                if let Some(raw_vals) = opt.get("values").and_then(|v| v.as_array()) {
                    for val in raw_vals {
                        let v_id = val
                            .get("value")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        if v_id.is_empty() {
                            continue;
                        }
                        let v_label = val
                            .get("value_label")
                            .and_then(|v| v.as_str())
                            .unwrap_or(&v_id)
                            .to_string();
                        let selected = val.get("selected").and_then(|v| v.as_bool());
                        if selected == Some(true) && default_value.is_none() {
                            default_value = Some(v_id.clone());
                        }
                        values.push(BoardConfigOptionValue {
                            value: v_id,
                            value_label: v_label,
                            selected,
                        });
                    }
                }
                if default_value.is_none() {
                    default_value = values.first().map(|v| v.value.clone());
                }

                options.push(BoardConfigOption {
                    option,
                    option_label,
                    values,
                    default_value,
                });
            }
        }

        options
    }

    /// Setup symlinked compiler wrappers on Unix so arduino-cli invokes ccache safely via compiler.path
    #[cfg(unix)]
    fn ensure_ccache_symlinks(&self) -> Option<String> {
        use std::collections::HashSet;
        use std::os::unix::fs::symlink;

        let ccache = self.ccache_path.as_ref()?;
        if std::fs::create_dir_all(&self.ccache_bin_dir).is_err() {
            return None;
        }

        let home = resolve_home_dir();
        let packages_dir = PathBuf::from(&home).join(".arduino15").join("packages");
        let mut discovered_bin_dirs: HashSet<PathBuf> = HashSet::new();

        fn walk_bins(dir: &Path, depth: usize, found: &mut HashSet<PathBuf>) {
            if depth > 6 {
                return;
            }
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                            if name == "bin" {
                                found.insert(path);
                            } else if !name.starts_with('.') {
                                walk_bins(&path, depth + 1, found);
                            }
                        }
                    }
                }
            }
        }

        if packages_dir.exists() {
            walk_bins(&packages_dir, 0, &mut discovered_bin_dirs);
        }

        for bin_dir in &discovered_bin_dirs {
            if let Ok(entries) = std::fs::read_dir(bin_dir) {
                for entry in entries.flatten() {
                    let target = entry.path();
                    let fname = entry.file_name().to_string_lossy().to_string();
                    let link_path = self.ccache_bin_dir.join(&fname);
                    let is_compiler = fname.ends_with("-gcc")
                        || fname.ends_with("-g++")
                        || fname.ends_with("-c++")
                        || fname == "gcc"
                        || fname == "g++";

                    let _ = std::fs::remove_file(&link_path);
                    if is_compiler {
                        if symlink(ccache, &link_path).is_err() {
                            return None;
                        }
                        let real_link = self.ccache_bin_dir.join(format!("{}-real", fname));
                        let _ = std::fs::remove_file(&real_link);
                        let _ = symlink(&target, &real_link);
                    } else {
                        let _ = symlink(&target, &link_path);
                    }
                }
            }
        }

        let extra: Vec<String> = discovered_bin_dirs
            .into_iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect();
        Some(extra.join(":"))
    }

    #[cfg(not(unix))]
    fn ensure_ccache_symlinks(&self) -> Option<String> {
        let _ = (&self.ccache_path, &self.ccache_bin_dir);
        None
    }

    /// Execute an arduino-cli command while streaming stdout/stderr lines via upload-progress events
    async fn run_streaming_command(
        mut cmd: Command,
        app: Option<&AppHandle>,
        window_label: Option<&str>,
        stage: &str,
        spawn_err_prefix: &str,
    ) -> Result<(bool, String, String), String> {
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("{}: {}", spawn_err_prefix, e))?;

        let stdout_pipe = child.stdout.take();
        let stderr_pipe = child.stderr.take();

        let stdout_task = async {
            let mut collected = String::new();
            if let Some(out) = stdout_pipe {
                let mut reader = BufReader::new(out).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        emit_upload_progress(app, window_label, stage, "stdout", trimmed);
                    }
                    collected.push_str(&line);
                    collected.push('\n');
                }
            }
            collected
        };

        let stderr_task = async {
            let mut collected = String::new();
            if let Some(err) = stderr_pipe {
                let mut reader = BufReader::new(err).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        emit_upload_progress(app, window_label, stage, "stderr", trimmed);
                    }
                    collected.push_str(&line);
                    collected.push('\n');
                }
            }
            collected
        };

        let (collected_stdout, collected_stderr, status_res) =
            tokio::join!(stdout_task, stderr_task, child.wait());

        let status = status_res.map_err(|e| format!("{}: {}", spawn_err_prefix, e))?;
        Ok((status.success(), collected_stdout, collected_stderr))
    }

    /// Compile a sketch using arduino-cli with clean flags and safe ccache wrapper
    pub async fn compile(
        &self,
        sketch_path: &Path,
        fqbn: &str,
        app: Option<&AppHandle>,
        window_label: Option<&str>,
        stage: &str,
    ) -> Result<BuildResult, String> {
        let start = Instant::now();
        let build_dir = Self::get_build_dir(sketch_path, fqbn);
        let mut cmd = Command::new(&self.arduino_cli_path);

        cmd.arg("compile")
            .arg("--fqbn")
            .arg(fqbn)
            .arg(sketch_path)
            .arg("--build-path")
            .arg(&build_dir)
            .arg("--no-color");

        // Parallel jobs equal to CPU threads
        let cpus = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4);
        cmd.arg("--jobs").arg(cpus.to_string());

        // Safe ccache symlink wrapper on Unix (never overwrite compiler.c.cmd directly)
        let mut ccache_used = false;
        if let Some(extra_path) = self.ensure_ccache_symlinks() {
            let ccache_bin_str = self.ccache_bin_dir.to_string_lossy();
            cmd.arg("--build-property")
                .arg(format!("compiler.path={}/", ccache_bin_str));

            if fqbn.starts_with("arduino:avr") {
                cmd.arg("--build-property")
                    .arg("compiler.c.elf.cmd=avr-gcc-real");
            } else if fqbn.starts_with("esp32:") || fqbn.starts_with("esp8266:") {
                cmd.arg("--build-property")
                    .arg("compiler.c.elf.cmd={compiler.prefix}g++-real");
            } else {
                cmd.arg("--build-property")
                    .arg("compiler.c.elf.cmd={compiler.c.elf.cmd}-real");
            }

            let base_path = std::env::var("PATH").unwrap_or_default();
            let home = resolve_home_dir();
            let new_path = if extra_path.is_empty() {
                format!("{}:{}/.local/bin:{}", ccache_bin_str, home, base_path)
            } else {
                format!(
                    "{}:{}/.local/bin:{}:{}",
                    ccache_bin_str, home, extra_path, base_path
                )
            };
            cmd.env("PATH", new_path);
            cmd.env("CCACHE_DIR", &self.ccache_dir);
            cmd.env("CCACHE_MAXSIZE", "5G");
            cmd.env(
                "CCACHE_SLOPPINESS",
                "file_stat_matches,include_file_mtime,pch_defines,time_macros",
            );
            ccache_used = true;
        } else {
            let _ = &self.ccache_dir;
        }

        let (success, collected_stdout, collected_stderr) = Self::run_streaming_command(
            cmd,
            app,
            window_label,
            stage,
            "Failed to spawn arduino-cli",
        )
        .await?;

        let elapsed = start.elapsed().as_millis();
        let cached_build = collected_stdout.contains("Using previously compiled file")
            || collected_stdout.contains("cached");

        Ok(BuildResult {
            success,
            elapsed_ms: elapsed,
            stdout: collected_stdout,
            stderr: collected_stderr,
            ccache_used,
            cached_build,
        })
    }

    async fn run_single_upload(
        &self,
        sketch_path: &Path,
        build_dir: &Path,
        fqbn: &str,
        port: &str,
        explicit_speed: Option<&str>,
        app: Option<&AppHandle>,
        window_label: Option<&str>,
    ) -> Result<(bool, String, String), String> {
        let mut cmd = Command::new(&self.arduino_cli_path);
        cmd.arg("upload")
            .arg("-v")
            .arg("-p")
            .arg(port)
            .arg("--fqbn")
            .arg(fqbn)
            .arg(sketch_path)
            .arg("--build-path")
            .arg(build_dir)
            .arg("--no-color");

        if let Some(spd) = explicit_speed {
            if !spd.is_empty() && spd != "auto" {
                cmd.arg("--upload-property")
                    .arg(format!("upload.speed={}", spd));
            }
        }

        Self::run_streaming_command(
            cmd,
            app,
            window_label,
            "upload",
            "Upload command failed",
        )
        .await
    }

    /// Upload a sketch to the microcontroller via selected serial port with auto-retry and diagnostics
    pub async fn upload(
        &self,
        sketch_path: &Path,
        fqbn: &str,
        port: &str,
        upload_speed: Option<&str>,
        app: Option<&AppHandle>,
        window_label: Option<&str>,
    ) -> Result<BuildResult, String> {
        let start = Instant::now();
        let build_dir = Self::get_build_dir(sketch_path, fqbn);
        let explicit_speed = upload_speed.filter(|s| !s.is_empty() && *s != "auto");

        let (mut success, mut stdout, mut stderr) = self
            .run_single_upload(
                sketch_path,
                &build_dir,
                fqbn,
                port,
                explicit_speed,
                app,
                window_label,
            )
            .await?;

        let fqbn_lower = fqbn.to_lowercase();
        let is_esp = fqbn_lower.contains("esp32") || fqbn_lower.contains("esp8266");
        let combined_lower = format!("{}\n{}", stdout, stderr).to_lowercase();

        // ESP32/ESP8266 packet sync timeout automatic fallback to 115200 baud
        let is_packet_timeout = combined_lower.contains("timed out waiting for packet header")
            || combined_lower.contains("failed to connect to esp")
            || combined_lower.contains("no serial data received")
            || combined_lower.contains("packet content transfer error");

        if !success && is_esp && is_packet_timeout && explicit_speed != Some("115200") {
            let msg = "[Uploader] High baud rate timed out; retrying upload at fail-safe 115200 baud...";
            emit_upload_progress(app, window_label, "upload", "warning", msg);
            tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;

            let (retry_ok, retry_out, retry_err) = self
                .run_single_upload(
                    sketch_path,
                    &build_dir,
                    fqbn,
                    port,
                    Some("115200"),
                    app,
                    window_label,
                )
                .await?;
            success = retry_ok;
            stdout.push_str(&retry_out);
            stderr.push_str(&retry_err);
        }

        if !success {
            let diag_lower = format!("{}\n{}", stdout, stderr).to_lowercase();
            let hint = if diag_lower.contains("permission denied") || diag_lower.contains("errno 13") {
                Some(format!(
                    "[Permission Error] Insufficient permissions to access {}. On Linux run: sudo usermod -a -G dialout $USER",
                    port
                ))
            } else if diag_lower.contains("device or resource busy")
                || diag_lower.contains("access is denied")
                || (diag_lower.contains("could not open port") && diag_lower.contains("busy"))
            {
                Some(format!(
                    "[Port Busy] Port {} is locked by another application. Close other serial monitors and retry.",
                    port
                ))
            } else if fqbn_lower.starts_with("arduino:avr:nano")
                && !fqbn_lower.contains("atmega328old")
                && (diag_lower.contains("stk500_getsync")
                    || diag_lower.contains("not in sync")
                    || diag_lower.contains("programmer is not responding"))
            {
                Some(
                    "[Nano Bootloader Guide] Board sync failed at 115200 baud. If using a Nano clone/classic Nano, click 'Config' next to the board selector and switch Processor to 'ATmega328P (Old Bootloader)' (57600 baud)."
                        .to_string(),
                )
            } else if is_esp
                && (diag_lower.contains("timed out waiting for packet header")
                    || diag_lower.contains("failed to connect to esp"))
            {
                Some(
                    "[ESP32 Bootloader Guide] Hold the BOOT/IO0 button while clicking Upload, then release when 'Connecting...' appears."
                        .to_string(),
                )
            } else {
                None
            };

            if let Some(h) = hint {
                emit_upload_progress(app, window_label, "upload", "warning", &h);
                stderr.push('\n');
                stderr.push_str(&h);
            }
        }

        Ok(BuildResult {
            success,
            elapsed_ms: start.elapsed().as_millis(),
            stdout,
            stderr,
            ccache_used: false,
            cached_build: false,
        })
    }
}
