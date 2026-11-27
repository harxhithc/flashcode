use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OpenFileResult {
    pub success: bool,
    pub canceled: bool,
    pub fallback: bool,
    pub path: Option<String>,
    pub name: Option<String>,
    pub content: Option<String>,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SaveFileResult {
    pub success: bool,
    pub canceled: bool,
    pub fallback: bool,
    pub path: Option<String>,
    pub name: Option<String>,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SketchFileInfo {
    pub name: String,
    pub path: String,
    pub content: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SketchFilesResult {
    pub success: bool,
    pub sketch_dir: Option<String>,
    pub dir_name: Option<String>,
    pub primary_file_name: Option<String>,
    pub primary_file_path: Option<String>,
    pub active_file_path: Option<String>,
    pub files: Vec<SketchFileInfo>,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SketchbookFileItem {
    pub name: String,
    pub path: String,
    pub is_main: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SketchbookEntry {
    pub name: String,
    pub dir_path: String,
    pub main_file: String,
    pub files: Vec<SketchbookFileItem>,
    pub modified: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SketchbookResponse {
    pub sketchbook_dir: String,
    pub sketches: Vec<SketchbookEntry>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SketchCreateResult {
    pub success: bool,
    pub name: String,
    pub dir_path: String,
    pub main_file: String,
    pub content: String,
}

#[tauri::command]
pub fn read_file_content(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn write_file_content(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&path, content).map_err(|e| format!("Failed to save file: {}", e))
}

#[tauri::command]
pub fn open_file_dialog() -> Result<OpenFileResult, String> {
    let zenity_cmd = Command::new("zenity")
        .args([
            "--file-selection",
            "--title=Open Sketch / Source File",
            "--file-filter=FlashCode & Arduino Sketches (*.ino, *.flashcode, *.flash) | *.ino *.flashcode *.flash *.pde",
            "--file-filter=C/C++ Source Files (*.cpp, *.h) | *.cpp *.h *.c *.hpp",
            "--file-filter=All Files | *",
        ])
        .output();

    match zenity_cmd {
        Ok(output) => {
            if !output.status.success() {
                return Ok(OpenFileResult {
                    success: false,
                    canceled: true,
                    fallback: false,
                    path: None,
                    name: None,
                    content: None,
                    error: None,
                });
            }
            let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if path_str.is_empty() {
                return Ok(OpenFileResult {
                    success: false,
                    canceled: true,
                    fallback: false,
                    path: None,
                    name: None,
                    content: None,
                    error: None,
                });
            }
            let file_path = PathBuf::from(&path_str);
            let name = file_path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "sketch.ino".to_string());

            match fs::read_to_string(&file_path) {
                Ok(content) => Ok(OpenFileResult {
                    success: true,
                    canceled: false,
                    fallback: false,
                    path: Some(path_str),
                    name: Some(name),
                    content: Some(content),
                    error: None,
                }),
                Err(e) => Ok(OpenFileResult {
                    success: false,
                    canceled: false,
                    fallback: false,
                    path: Some(path_str),
                    name: Some(name),
                    content: None,
                    error: Some(format!("Failed to read file: {}", e)),
                }),
            }
        }
        Err(_) => {
            let kdialog_cmd = Command::new("kdialog")
                .args([
                    "--getopenfilename",
                    ".",
                    "*.ino *.flashcode *.cpp *.h *.c *.hpp | FlashCode & Arduino Sketches",
                ])
                .output();

            match kdialog_cmd {
                Ok(output) => {
                    if !output.status.success() {
                        return Ok(OpenFileResult {
                            success: false,
                            canceled: true,
                            fallback: false,
                            path: None,
                            name: None,
                            content: None,
                            error: None,
                        });
                    }
                    let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if path_str.is_empty() {
                        return Ok(OpenFileResult {
                            success: false,
                            canceled: true,
                            fallback: false,
                            path: None,
                            name: None,
                            content: None,
                            error: None,
                        });
                    }
                    let file_path = PathBuf::from(&path_str);
                    let name = file_path
                        .file_name()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_else(|| "sketch.ino".to_string());

                    match fs::read_to_string(&file_path) {
                        Ok(content) => Ok(OpenFileResult {
                            success: true,
                            canceled: false,
                            fallback: false,
                            path: Some(path_str),
                            name: Some(name),
                            content: Some(content),
                            error: None,
                        }),
                        Err(e) => Ok(OpenFileResult {
                            success: false,
                            canceled: false,
                            fallback: false,
                            path: Some(path_str),
                            name: Some(name),
                            content: None,
                            error: Some(format!("Failed to read file: {}", e)),
                        }),
                    }
                }
                Err(_) => Ok(OpenFileResult {
                    success: false,
                    canceled: false,
                    fallback: true,
                    path: None,
                    name: None,
                    content: None,
                    error: None,
                }),
            }
        }
    }
}

#[tauri::command]
pub fn save_as_dialog(current_name: Option<String>, content: String) -> Result<SaveFileResult, String> {
    let mut default_name = current_name.unwrap_or_else(|| "sketch.ino".to_string());
    if !default_name.ends_with(".ino") && !default_name.ends_with(".flashcode") && !default_name.ends_with(".cpp") {
        default_name.push_str(".ino");
    }

    let zenity_cmd = Command::new("zenity")
        .args([
            "--file-selection",
            "--save",
            "--confirm-overwrite",
            "--title=Save FlashCode Sketch",
            &format!("--filename={}", default_name),
            "--file-filter=FlashCode & Arduino Sketches (*.ino, *.flashcode) | *.ino *.flashcode",
            "--file-filter=All Files | *",
        ])
        .output();

    match zenity_cmd {
        Ok(output) => {
            if !output.status.success() {
                return Ok(SaveFileResult {
                    success: false,
                    canceled: true,
                    fallback: false,
                    path: None,
                    name: None,
                    error: None,
                });
            }
            let mut path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if path_str.is_empty() {
                return Ok(SaveFileResult {
                    success: false,
                    canceled: true,
                    fallback: false,
                    path: None,
                    name: None,
                    error: None,
                });
            }

            let mut path = PathBuf::from(&path_str);
            if path.extension().is_none() {
                path_str.push_str(".ino");
                path = PathBuf::from(&path_str);
            }

            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()).map(|s| s.to_string()) {
                if let Some(parent) = path.parent() {
                    let parent_name = parent.file_name().and_then(|s| s.to_str()).unwrap_or("");
                    if parent_name != stem {
                        let nested_dir = parent.join(&stem);
                        let _ = fs::create_dir_all(&nested_dir);
                        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("ino");
                        path = nested_dir.join(format!("{}.{}", stem, ext));
                        path_str = path.to_string_lossy().to_string();
                    }
                }
            }

            if let Some(p) = path.parent() {
                let _ = fs::create_dir_all(p);
            }

            match fs::write(&path, content) {
                Ok(_) => {
                    let name = path
                        .file_name()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_else(|| "sketch.ino".to_string());
                    Ok(SaveFileResult {
                        success: true,
                        canceled: false,
                        fallback: false,
                        path: Some(path_str),
                        name: Some(name),
                        error: None,
                    })
                }
                Err(e) => Ok(SaveFileResult {
                    success: false,
                    canceled: false,
                    fallback: false,
                    path: Some(path_str),
                    name: None,
                    error: Some(format!("Failed to save: {}", e)),
                }),
            }
        }
        Err(_) => {
            let kdialog_cmd = Command::new("kdialog")
                .args([
                    "--getsavefilename",
                    &default_name,
                    "*.ino *.flashcode | Arduino & FlashCode Sketches",
                ])
                .output();

            match kdialog_cmd {
                Ok(output) => {
                    if !output.status.success() {
                        return Ok(SaveFileResult {
                            success: false,
                            canceled: true,
                            fallback: false,
                            path: None,
                            name: None,
                            error: None,
                        });
                    }
                    let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if path_str.is_empty() {
                        return Ok(SaveFileResult {
                            success: false,
                            canceled: true,
                            fallback: false,
                            path: None,
                            name: None,
                            error: None,
                        });
                    }
                    let path = PathBuf::from(&path_str);
                    if let Some(p) = path.parent() {
                        let _ = fs::create_dir_all(p);
                    }
                    match fs::write(&path, content) {
                        Ok(_) => {
                            let name = path
                                .file_name()
                                .map(|s| s.to_string_lossy().to_string())
                                .unwrap_or_else(|| "sketch.ino".to_string());
                            Ok(SaveFileResult {
                                success: true,
                                canceled: false,
                                fallback: false,
                                path: Some(path_str),
                                name: Some(name),
                                error: None,
                            })
                        }
                        Err(e) => Ok(SaveFileResult {
                            success: false,
                            canceled: false,
                            fallback: false,
                            path: Some(path_str),
                            name: None,
                            error: Some(format!("Failed to save: {}", e)),
                        }),
                    }
                }
                Err(_) => Ok(SaveFileResult {
                    success: false,
                    canceled: false,
                    fallback: true,
                    path: None,
                    name: None,
                    error: None,
                }),
            }
        }
    }
}

#[tauri::command]
pub fn get_adjacent_sketch_files(file_path: String) -> Result<SketchFilesResult, String> {
    let target = PathBuf::from(&file_path);
    let parent = match target.parent() {
        Some(p) => p,
        None => {
            return Ok(SketchFilesResult {
                success: false,
                sketch_dir: None,
                dir_name: None,
                primary_file_name: None,
                primary_file_path: None,
                active_file_path: Some(file_path),
                files: Vec::new(),
                error: Some("File has no parent directory".to_string()),
            })
        }
    };

    let dir_name = parent.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let mut files = Vec::new();
    let mut primary_file_name = None;
    let mut primary_file_path = None;

    if let Ok(entries) = fs::read_dir(parent) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    if matches!(ext_lower.as_str(), "ino" | "cpp" | "c" | "h" | "hpp" | "flashcode") {
                        let name = p.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
                        let content = fs::read_to_string(&p).unwrap_or_default();
                        let p_str = p.to_string_lossy().to_string();

                        if ext_lower == "ino" || ext_lower == "flashcode" {
                            if primary_file_path.is_none() || name.starts_with(&dir_name) {
                                primary_file_name = Some(name.clone());
                                primary_file_path = Some(p_str.clone());
                            }
                        }

                        files.push(SketchFileInfo {
                            name,
                            path: p_str,
                            content,
                        });
                    }
                }
            }
        }
    }

    Ok(SketchFilesResult {
        success: !files.is_empty(),
        sketch_dir: Some(parent.to_string_lossy().to_string()),
        dir_name: Some(dir_name),
        primary_file_name,
        primary_file_path,
        active_file_path: Some(file_path),
        files,
        error: None,
    })
}

#[tauri::command]
pub fn get_sketchbook_sketches() -> Result<SketchbookResponse, String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let candidates = [
        format!("{}/Arduino", home),
        format!("{}/sketchbook", home),
        format!("{}/Documents/Arduino", home),
    ];

    let mut sketchbook_dir = format!("{}/Arduino", home);
    for c in &candidates {
        if Path::new(c).is_dir() {
            sketchbook_dir = c.clone();
            break;
        }
    }

    let mut sketches = Vec::new();
    let sb_path = PathBuf::from(&sketchbook_dir);
    if sb_path.is_dir() {
        if let Ok(entries) = fs::read_dir(&sb_path) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    let dir_name = p.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
                    if dir_name.starts_with('.') || dir_name == "libraries" || dir_name == "hardware" {
                        continue;
                    }

                    let mut files = Vec::new();
                    let mut main_file = String::new();
                    let mut max_modified = 0;

                    if let Ok(dir_entries) = fs::read_dir(&p) {
                        for de in dir_entries.flatten() {
                            let fpath = de.path();
                            if fpath.is_file() {
                                if let Some(ext) = fpath.extension().and_then(|s| s.to_str()) {
                                    if matches!(ext, "ino" | "cpp" | "h" | "c" | "hpp") {
                                        let fname = fpath.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
                                        let is_main = fname == format!("{}.ino", dir_name) || fname.ends_with(".ino");
                                        let path_str = fpath.to_string_lossy().to_string();
                                        if is_main && main_file.is_empty() {
                                            main_file = path_str.clone();
                                        }
                                        if let Ok(meta) = de.metadata() {
                                            if let Ok(mtime) = meta.modified() {
                                                let secs = mtime.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
                                                if secs > max_modified {
                                                    max_modified = secs;
                                                }
                                            }
                                        }
                                        files.push(SketchbookFileItem {
                                            name: fname,
                                            path: path_str,
                                            is_main,
                                        });
                                    }
                                }
                            }
                        }
                    }

                    if !files.is_empty() {
                        if main_file.is_empty() {
                            main_file = files[0].path.clone();
                        }
                        sketches.push(SketchbookEntry {
                            name: dir_name,
                            dir_path: p.to_string_lossy().to_string(),
                            main_file,
                            files,
                            modified: max_modified * 1000,
                        });
                    }
                }
            }
        }
    }

    Ok(SketchbookResponse {
        sketchbook_dir,
        sketches,
    })
}

#[tauri::command]
pub fn create_sketchbook_sketch(sketch_name: Option<String>) -> Result<SketchCreateResult, String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let sb_dir = format!("{}/Arduino", home);
    let name = sketch_name.unwrap_or_else(|| {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        format!("sketch_{}", ts)
    });

    let sketch_dir = PathBuf::from(&sb_dir).join(&name);
    let _ = fs::create_dir_all(&sketch_dir);
    let main_file_path = sketch_dir.join(format!("{}.ino", name));

    let default_content = "void setup() {\n  // put your setup code here, to run once:\n\n}\n\nvoid loop() {\n  // put your main code here, to run repeatedly:\n\n}\n".to_string();

    fs::write(&main_file_path, &default_content)
        .map_err(|e| format!("Failed to create sketch: {}", e))?;

    Ok(SketchCreateResult {
        success: true,
        name,
        dir_path: sketch_dir.to_string_lossy().to_string(),
        main_file: main_file_path.to_string_lossy().to_string(),
        content: default_content,
    })
}
