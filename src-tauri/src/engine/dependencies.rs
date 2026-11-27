use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MissingLibrary {
    pub header: String,
    pub suggested_library: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledLibrary {
    pub name: String,
    pub version: String,
    pub location: String,
}

pub struct DependencyEngine;

impl DependencyEngine {
    /// Built-in headers that belong to the compiler or ESP32 / ESP8266 core
    fn is_builtin_core_header(header: &str) -> bool {
        let core_headers = [
            "Arduino.h", "WiFi.h", "WiFiClient.h", "WiFiServer.h", "WiFiUdp.h",
            "SPI.h", "Wire.h", "EEPROM.h", "FS.h", "SD.h", "SPIFFS.h", "LittleFS.h",
            "BluetoothSerial.h", "BLEDevice.h", "BLEServer.h", "BLEUtils.h",
            "esp_wifi.h", "esp_system.h", "esp_log.h", "freertos/FreeRTOS.h",
            "freertos/task.h", "driver/gpio.h", "driver/uart.h", "stdio.h",
            "stdlib.h", "string.h", "math.h", "stdint.h", "stdbool.h",
        ];
        core_headers.iter().any(|&h| h.eq_ignore_ascii_case(header))
    }

    fn resolve_cli() -> PathBuf {
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

    /// List libraries currently installed on the local machine
    pub fn list_installed() -> Vec<InstalledLibrary> {
        let cli_path = Self::resolve_cli();

        let output = Command::new(&cli_path)
            .args(["lib", "list", "--format", "json"])
            .output();

        if let Ok(out) = output {
            if out.status.success() {
                if let Ok(parsed) = serde_json::from_slice::<serde_json::Value>(&out.stdout) {
                    if let Some(installed) = parsed.get("installed_libraries") {
                        if let Some(arr) = installed.as_array() {
                            return arr
                                .iter()
                                .filter_map(|item| {
                                    let lib = item.get("library")?;
                                    let name = lib.get("name")?.as_str()?.to_string();
                                    let version = lib.get("version")?.as_str()?.to_string();
                                    let location = lib.get("location")?.as_str()?.to_string();
                                    Some(InstalledLibrary { name, version, location })
                                })
                                .collect();
                        }
                    }
                }
            }
        }

        Vec::new()
    }

    /// Scans sketch C++ code for missing #include directives
    pub fn scan_missing(code: &str) -> Vec<MissingLibrary> {
        let mut missing = Vec::new();
        let installed = Self::list_installed();
        let installed_names: HashSet<String> = installed
            .into_iter()
            .map(|l| l.name.to_lowercase())
            .collect();

        for line in code.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("#include") {
                let header = if let Some(start) = trimmed.find('<') {
                    if let Some(end) = trimmed.rfind('>') {
                        &trimmed[start + 1..end]
                    } else {
                        continue;
                    }
                } else if let Some(start) = trimmed.find('"') {
                    if let Some(end) = trimmed.rfind('"') {
                        if start != end {
                            &trimmed[start + 1..end]
                        } else {
                            continue;
                        }
                    } else {
                        continue;
                    }
                } else {
                    continue;
                };

                let header_clean = header.trim();
                if Self::is_builtin_core_header(header_clean) {
                    continue;
                }

                // Check common library mappings
                let (suggested_lib, desc) = match header_clean {
                    "WiFiManager.h" => (
                        "WiFiManager",
                        "ESP8266 & ESP32 WiFi connection manager with fallback web captive portal",
                    ),
                    "ArduinoJson.h" => (
                        "ArduinoJson",
                        "Efficient C++ JSON library for embedded IoT systems",
                    ),
                    "PubSubClient.h" => (
                        "PubSubClient",
                        "MQTT client library for publishing and subscribing messages",
                    ),
                    "DHT.h" => (
                        "DHT sensor library",
                        "Adafruit library for DHT11, DHT22 and AM2302 temperature & humidity sensors",
                    ),
                    "FastLED.h" => (
                        "FastLED",
                        "High performance LED animation library for WS2812B, APA102, and SK6812",
                    ),
                    "AsyncTCP.h" => (
                        "AsyncTCP",
                        "Asynchronous TCP library for ESP32",
                    ),
                    "ESPAsyncWebServer.h" => (
                        "ESPAsyncWebServer",
                        "Asynchronous HTTP and WebSocket server for ESP32 & ESP8266",
                    ),
                    "LiquidCrystal_I2C.h" => (
                        "LiquidCrystal I2C",
                        "I2C LCD display driver for 16x2 and 20x4 screens",
                    ),
                    _ => {
                        let name = header_clean
                            .strip_suffix(".h")
                            .unwrap_or(header_clean);
                        (name, "Arduino embedded library")
                    }
                };

                if !installed_names.contains(&suggested_lib.to_lowercase()) {
                    missing.push(MissingLibrary {
                        header: header_clean.to_string(),
                        suggested_library: suggested_lib.to_string(),
                        description: desc.to_string(),
                    });
                }
            }
        }

        missing
    }

    /// Install a library using arduino-cli asynchronously
    pub async fn install(library_name: &str) -> Result<String, String> {
        let cli_path = Self::resolve_cli();

        let output = tokio::process::Command::new(&cli_path)
            .args(["lib", "install", library_name])
            .output()
            .await
            .map_err(|e| format!("Failed to run arduino-cli lib install: {}", e))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }
}
