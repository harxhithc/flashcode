import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import {
  SKETCH_DIR,
  HOME,
  readBody,
  sendJson,
  scanDirectory,
} from "../utils.mjs";
import { assertSafePath, sanitizeFileName } from "../utils/validate.mjs";

let pendingExternalFiles = [];

/**
 * 8.0 POST /api/fs/open-external (Queue file from OS double-click or CLI)
 */
export async function handleOpenExternal(req, res) {
  const body = await readBody(req);
  const filePath = body.path || body.filePath;
  if (filePath) {
    try {
      await fs.promises.access(filePath);
      if (!pendingExternalFiles.includes(filePath)) {
        pendingExternalFiles.push(filePath);
      }
      return sendJson(res, { success: true, queued: filePath });
    } catch (_) {}
  }
  return sendJson(res, { success: false, error: "File not found" }, 404);
}

/**
 * 8.0 GET /api/fs/pending-external (Fetch and drain queued external files)
 */
export async function handleGetPendingExternal(req, res) {
  const files = [...pendingExternalFiles];
  pendingExternalFiles = [];
  return sendJson(res, { files });
}

/**
 * 8.1 POST /api/fs/dialog/open-file (Native Zenity file picker)
 */
export async function handleOpenFileDialog(req, res) {
  const displayEnv = { ...process.env, DISPLAY: process.env.DISPLAY || ":0" };
  exec(
    `zenity --file-selection --title="Open Sketch / Source File" --file-filter="FlashCode & Arduino Sketches (*.ino, *.flashcode, *.flash) | *.ino *.flashcode *.flash *.pde" --file-filter="C/C++ Source Files (*.cpp, *.h) | *.cpp *.h *.c *.hpp" --file-filter="All Files | *"`,
    { env: displayEnv },
    (err, stdout) => {
      if (err || !stdout.trim()) {
        return sendJson(res, { canceled: true });
      }
      const filePath = stdout.trim();
      const name = path.basename(filePath);
      fs.promises.readFile(filePath, "utf-8")
        .then(content => sendJson(res, { success: true, path: filePath, name, content }))
        .catch(readErr => sendJson(res, { success: false, error: String(readErr) }, 500));
    }
  );
}

/**
 * 8.2 POST /api/fs/dialog/save-as (Native Zenity save dialog with Arduino directory structure)
 */
export async function handleSaveAsDialog(req, res) {
  const { current_name, content } = await readBody(req);
  const displayEnv = { ...process.env, DISPLAY: process.env.DISPLAY || ":0" };
  let defaultName = current_name || "sketch.ino";
  if (!defaultName.endsWith(".ino") && !defaultName.endsWith(".flashcode") && !defaultName.endsWith(".flash")) {
    defaultName += ".ino";
  }

  exec(
    `zenity --file-selection --save --confirm-overwrite --title="Save FlashCode Sketch" --filename="${defaultName}" --file-filter="FlashCode & Arduino Sketches (*.ino, *.flashcode) | *.ino *.flashcode" --file-filter="Arduino Sketch (*.ino) | *.ino" --file-filter="FlashCode Sketch (*.flashcode) | *.flashcode" --file-filter="All Files | *"`,
    { env: displayEnv },
    (err, stdout) => {
      if (err || !stdout.trim()) {
        return sendJson(res, { canceled: true });
      }
      let filePath = stdout.trim();
      let ext = path.extname(filePath);
      if (!ext) {
        filePath += ".ino";
        ext = ".ino";
      }

      // Arduino-style sketch structure:
      // If saving a sketch and parent directory name does not match sketch name,
      // create sketch folder: parentDir/sketchName/sketchName.ino
      const baseName = path.basename(filePath, ext);
      const parentDir = path.dirname(filePath);
      if ((ext === ".ino" || ext === ".flashcode" || ext === ".flash") && path.basename(parentDir) !== baseName) {
        filePath = path.join(parentDir, baseName, `${baseName}${ext}`);
      }

      fs.promises.mkdir(path.dirname(filePath), { recursive: true })
        .then(() => fs.promises.writeFile(filePath, content || "", "utf-8"))
        .then(() => sendJson(res, { success: true, path: filePath, name: path.basename(filePath) }))
        .catch(writeErr => sendJson(res, { success: false, error: String(writeErr) }, 500));
    }
  );
}

/**
 * 8.3 POST /api/fs/save (Direct Save File - Ctrl+S)
 */
export async function handleSaveFileDirect(req, res) {
  const { path: rawPath, content } = await readBody(req);
  if (!rawPath) {
    return sendJson(res, { success: false, error: "Missing file path" }, 400);
  }
  let filePath;
  try {
    filePath = assertSafePath(rawPath);
  } catch (err) {
    return sendJson(res, { success: false, error: err.message }, err.status || 403);
  }
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    // Atomic write: write to temp file then rename to prevent partial writes
    const tmp = filePath + ".tmp." + process.pid;
    await fs.promises.writeFile(tmp, content || "", "utf-8");
    await fs.promises.rename(tmp, filePath);
    return sendJson(res, { success: true, path: filePath, name: path.basename(filePath) });
  } catch (e) {
    return sendJson(res, { success: false, error: String(e) }, 500);
  }
}

/**
 * 8.4 POST /api/fs/read (Direct Read File)
 */
export async function handleReadFileDirect(req, res) {
  const { path: rawPath } = await readBody(req);
  if (!rawPath) {
    return sendJson(res, { success: false, error: "File not found" }, 404);
  }
  let filePath;
  try {
    filePath = assertSafePath(rawPath);
  } catch (err) {
    return sendJson(res, { success: false, error: err.message }, err.status || 403);
  }
  try {
    const content = await fs.promises.readFile(filePath, "utf-8");
    return sendJson(res, {
      success: true,
      path: filePath,
      name: path.basename(filePath),
      content,
    });
  } catch (e) {
    if (e.code === "ENOENT") {
      return sendJson(res, { success: false, error: "File not found" }, 404);
    }
    return sendJson(res, { success: false, error: String(e) }, 500);
  }
}

/**
 * 8.5 POST /api/fs/dialog/open-folder (Native Zenity directory picker)
 */
export async function handleOpenFolderDialog(req, res) {
  const displayEnv = { ...process.env, DISPLAY: process.env.DISPLAY || ":0" };
  exec(
    `zenity --file-selection --directory --title="Open Project Folder"`,
    { env: displayEnv },
    (err, stdout) => {
      if (err || !stdout.trim()) {
        return sendJson(res, { canceled: true });
      }
      const dirPath = stdout.trim();
      try {
        const files = scanDirectory(dirPath);
        return sendJson(res, {
          success: true,
          dirPath,
          name: path.basename(dirPath),
          files,
        });
      } catch (dirErr) {
        return sendJson(res, { success: false, error: String(dirErr) }, 500);
      }
    }
  );
}

/**
 * 8.6 POST /api/fs/list-dir (List Directory Files)
 */
export async function handleListDir(req, res) {
  const { dirPath: rawDir } = await readBody(req);
  let targetDir;
  try {
    targetDir = assertSafePath(rawDir || SKETCH_DIR);
  } catch (err) {
    return sendJson(res, { success: false, error: err.message }, err.status || 403);
  }
  try {
    const files = scanDirectory(targetDir);
    return sendJson(res, {
      success: true,
      dirPath: targetDir,
      name: path.basename(targetDir),
      files,
    });
  } catch (e) {
    return sendJson(res, { success: false, error: String(e) }, 500);
  }
}

/**
 * 8.7 POST /api/fs/create-file (Create New File in directory)
 */
export async function handleCreateFile(req, res) {
  const { dirPath: rawDir, fileName: rawName, content } = await readBody(req);
  if (!rawDir || !rawName) {
    return sendJson(res, { success: false, error: "Missing dirPath or fileName" }, 400);
  }
  let dirPath, safeName;
  try {
    dirPath = assertSafePath(rawDir);
    safeName = sanitizeFileName(rawName);
  } catch (err) {
    return sendJson(res, { success: false, error: err.message }, err.status || 400);
  }
  const fullPath = path.join(dirPath, safeName);
  try {
    await fs.promises.writeFile(fullPath, content || "", "utf-8");
    return sendJson(res, { success: true, path: fullPath, name: safeName });
  } catch (e) {
    return sendJson(res, { success: false, error: String(e) }, 500);
  }
}

/**
 * 8.8 POST /api/fs/sketch-files (Scan Sketch Files - Arduino IDE Multi-file Auto Import)
 */
export async function handleSketchFiles(req, res) {
  const body = await readBody(req);
  const rawPath = body.filePath || body.path;
  if (!rawPath) {
    return sendJson(res, { success: false, error: "Missing filePath" }, 400);
  }
  let targetPath;
  try {
    targetPath = assertSafePath(rawPath);
  } catch (err) {
    return sendJson(res, { success: false, error: err.message }, err.status || 403);
  }

  try {
    let stat;
    try {
      stat = await fs.promises.stat(targetPath);
    } catch (e) {
      if (e.code === "ENOENT") {
        return sendJson(res, { success: false, error: "File not found" }, 404);
      }
      throw e;
    }

    const isDir = stat.isDirectory();
    const sketchDir = isDir ? targetPath : path.dirname(targetPath);
    const targetFileName = isDir ? null : path.basename(targetPath);
    const dirName = path.basename(sketchDir);

    const SKETCH_EXTS = new Set([
      ".ino",
      ".pde",
      ".h",
      ".hpp",
      ".hh",
      ".cpp",
      ".c",
      ".cc",
      ".s",
      ".S",
    ]);

    const entries = await fs.promises.readdir(sketchDir, { withFileTypes: true });
    const eligibleEntries = [];

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) continue; // skip subfolders (build, libraries, etc.)

      const ext = path.extname(entry.name).toLowerCase();
      if (!SKETCH_EXTS.has(ext)) continue;

      const fullPath = path.join(sketchDir, entry.name);
      eligibleEntries.push({ name: entry.name, path: fullPath, ext });
    }

    const fileResults = await Promise.all(
      eligibleEntries.map(async ({ name, path: fullPath, ext }) => {
        try {
          const content = await fs.promises.readFile(fullPath, "utf-8");
          return { name, path: fullPath, content, ext };
        } catch (_) {
          return null;
        }
      })
    );
    const sketchFiles = fileResults.filter(Boolean);

    // Determine the primary .ino file
    let primaryFile = null;
    if (targetFileName && (targetFileName.endsWith(".ino") || targetFileName.endsWith(".pde"))) {
      primaryFile = sketchFiles.find((f) => f.name === targetFileName);
    }
    if (!primaryFile) {
      primaryFile = sketchFiles.find((f) => f.name === `${dirName}.ino` || f.name === `${dirName}.pde`);
    }
    if (!primaryFile) {
      primaryFile = sketchFiles.find((f) => f.ext === ".ino" || f.ext === ".pde");
    }
    if (!primaryFile && targetFileName) {
      primaryFile = sketchFiles.find((f) => f.name === targetFileName);
    }
    if (!primaryFile && sketchFiles.length > 0) {
      primaryFile = sketchFiles[0];
    }

    // Tab ordering (Arduino IDE convention):
    // 1. Primary .ino file (leftmost, main tab)
    // 2. Other .ino / .pde files (alphabetical)
    // 3. Header files (.h, .hpp, .hh) (alphabetical)
    // 4. Source files (.cpp, .c, .cc) (alphabetical)
    // 5. Any other sketch files (.s, etc.)
    const primaryName = primaryFile ? primaryFile.name : null;
    const otherInos = sketchFiles
      .filter((f) => f.name !== primaryName && (f.ext === ".ino" || f.ext === ".pde"))
      .sort((a, b) => a.name.localeCompare(b.name));
    const headers = sketchFiles
      .filter((f) => f.name !== primaryName && [".h", ".hpp", ".hh"].includes(f.ext))
      .sort((a, b) => a.name.localeCompare(b.name));
    const sources = sketchFiles
      .filter((f) => f.name !== primaryName && [".cpp", ".c", ".cc"].includes(f.ext))
      .sort((a, b) => a.name.localeCompare(b.name));
    const others = sketchFiles
      .filter(
        (f) =>
          f.name !== primaryName &&
          !otherInos.includes(f) &&
          !headers.includes(f) &&
          !sources.includes(f)
      )
      .sort((a, b) => a.name.localeCompare(b.name));

    const sortedFiles = [];
    if (primaryFile) sortedFiles.push(primaryFile);
    sortedFiles.push(...otherInos, ...headers, ...sources, ...others);

    return sendJson(res, {
      success: true,
      sketchDir,
      dirName,
      primaryFileName: primaryFile ? primaryFile.name : null,
      primaryFilePath: primaryFile ? primaryFile.path : null,
      activeFilePath: targetFileName ? targetPath : (primaryFile ? primaryFile.path : null),
      files: sortedFiles.map(({ name, path, content }) => ({ name, path, content })),
    });
  } catch (e) {
    return sendJson(res, { success: false, error: String(e) }, 500);
  }
}

// Helpers for Examples
function getInoInDir(dirPath) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isFile() && (ent.name.endsWith(".ino") || ent.name.endsWith(".pde"))) {
        return path.join(dirPath, ent.name);
      }
    }
  } catch (e) {}
  return null;
}

function scanExamplesFolder(examplesDir, categoryName) {
  const results = [];
  try {
    if (!fs.existsSync(examplesDir)) return results;
    const items = fs.readdirSync(examplesDir, { withFileTypes: true });
    for (const item of items) {
      if (item.isDirectory() && !item.name.startsWith(".")) {
        const fullPath = path.join(examplesDir, item.name);
        const inoPath = getInoInDir(fullPath);
        if (inoPath) {
          results.push({
            name: item.name,
            category: categoryName,
            dirPath: fullPath,
            inoPath: inoPath,
          });
        } else {
          try {
            const subItems = fs.readdirSync(fullPath, { withFileTypes: true });
            for (const sub of subItems) {
              if (sub.isDirectory() && !sub.name.startsWith(".")) {
                const subPath = path.join(fullPath, sub.name);
                const subIno = getInoInDir(subPath);
                if (subIno) {
                  results.push({
                    name: `${item.name}/${sub.name}`,
                    category: categoryName,
                    dirPath: subPath,
                    inoPath: subIno,
                  });
                }
              }
            }
          } catch (e) {}
        }
      }
    }
  } catch (e) {}
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

function buildCategoryMap(items) {
  const map = new Map();
  for (const item of items) {
    if (!map.has(item.category)) {
      map.set(item.category, []);
    }
    map.get(item.category).push(item);
  }
  const cats = [];
  for (const [name, exList] of map.entries()) {
    cats.push({
      name,
      examples: exList.sort((a, b) => a.name.localeCompare(b.name)),
    });
  }
  return cats.sort((a, b) => a.name.localeCompare(b.name));
}

let cachedExamples = null;
let cachedExamplesTimestamp = 0;

export function invalidateExamplesCache() {
  cachedExamples = null;
}

/**
 * 8.9 GET /api/examples (Scan Example Sketches from Built-in, Boards & Installed Libraries)
 */
export async function handleGetExamples(req, res) {
  const now = Date.now();
  if (cachedExamples && now - cachedExamplesTimestamp < 120000) {
    return sendJson(res, cachedExamples);
  }

  try {
    const groups = [];
    let totalCount = 0;

    // 1. Built-in Examples
    const builtInDir = path.resolve("./server/builtin_examples");
    const builtInItems = [];
    if (fs.existsSync(builtInDir)) {
      for (const cat of fs.readdirSync(builtInDir, { withFileTypes: true })) {
        if (cat.isDirectory() && !cat.name.startsWith(".")) {
          const catDir = path.join(builtInDir, cat.name);
          builtInItems.push(...scanExamplesFolder(catDir, cat.name));
        }
      }
    }
    if (builtInItems.length > 0) {
      groups.push({
        id: "builtin",
        title: "Built-in Examples",
        categories: buildCategoryMap(builtInItems),
        totalCount: builtInItems.length,
      });
      totalCount += builtInItems.length;
    }

    // 2. Core / Board Package Examples (ESP32, AVR, ESP8266, etc.)
    const packagesDir = path.join(HOME, ".arduino15/packages");
    if (fs.existsSync(packagesDir)) {
      for (const pkg of fs.readdirSync(packagesDir, { withFileTypes: true })) {
        if (pkg.isDirectory() && pkg.name !== "builtin" && !pkg.name.startsWith(".")) {
          const hwDir = path.join(packagesDir, pkg.name, "hardware");
          if (fs.existsSync(hwDir)) {
            for (const arch of fs.readdirSync(hwDir, { withFileTypes: true })) {
              if (arch.isDirectory() && !arch.name.startsWith(".")) {
                const archDir = path.join(hwDir, arch.name);
                for (const ver of fs.readdirSync(archDir, { withFileTypes: true })) {
                  if (ver.isDirectory() && !ver.name.startsWith(".")) {
                    const libsDir = path.join(archDir, ver.name, "libraries");
                    if (fs.existsSync(libsDir)) {
                      const coreItems = [];
                      for (const lib of fs.readdirSync(libsDir, { withFileTypes: true })) {
                        if (lib.isDirectory() && !lib.name.startsWith(".")) {
                          const exDir = path.join(libsDir, lib.name, "examples");
                          if (fs.existsSync(exDir)) {
                            coreItems.push(...scanExamplesFolder(exDir, lib.name));
                          }
                        }
                      }
                      if (coreItems.length > 0) {
                        const title = pkg.name.toUpperCase() === "ARDUINO"
                          ? `Arduino ${arch.name.toUpperCase()} Examples`
                          : `${pkg.name.toUpperCase()} Examples`;
                        groups.push({
                          id: `core-${pkg.name}-${arch.name}`,
                          title,
                          categories: buildCategoryMap(coreItems),
                          totalCount: coreItems.length,
                        });
                        totalCount += coreItems.length;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // 3. Custom / Installed User Libraries (~/Arduino/libraries)
    const userLibs = path.join(HOME, "Arduino/libraries");
    const userLibItems = [];
    if (fs.existsSync(userLibs)) {
      for (const lib of fs.readdirSync(userLibs, { withFileTypes: true })) {
        if (lib.isDirectory() && !lib.name.startsWith(".")) {
          const exDir = path.join(userLibs, lib.name, "examples");
          if (fs.existsSync(exDir)) {
            userLibItems.push(...scanExamplesFolder(exDir, lib.name));
          }
        }
      }
    }
    if (userLibItems.length > 0) {
      groups.push({
        id: "libraries",
        title: "Installed Libraries",
        categories: buildCategoryMap(userLibItems),
        totalCount: userLibItems.length,
      });
      totalCount += userLibItems.length;
    }

    // 4. Standard Libraries (~/.arduino15/libraries)
    const stdLibs = path.join(HOME, ".arduino15/libraries");
    const stdItems = [];
    if (fs.existsSync(stdLibs)) {
      for (const lib of fs.readdirSync(stdLibs, { withFileTypes: true })) {
        if (lib.isDirectory() && !lib.name.startsWith(".") && lib.name !== "Arduino_BuiltIn") {
          const exDir = path.join(stdLibs, lib.name, "examples");
          if (fs.existsSync(exDir)) {
            stdItems.push(...scanExamplesFolder(exDir, lib.name));
          }
        }
      }
    }
    if (stdItems.length > 0) {
      groups.push({
        id: "standard",
        title: "Standard Libraries",
        categories: buildCategoryMap(stdItems),
        totalCount: stdItems.length,
      });
      totalCount += stdItems.length;
    }

    const responsePayload = {
      success: true,
      groups,
      total: totalCount,
    };
    cachedExamples = responsePayload;
    cachedExamplesTimestamp = now;
    return sendJson(res, responsePayload);
  } catch (e) {
    return sendJson(res, { success: false, error: String(e) }, 500);
  }
}
