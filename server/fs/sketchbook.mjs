import fs from "node:fs";
import path from "node:path";
import { SKETCHBOOK_DIR, readBody, sendJson } from "../utils.mjs";
import { assertSafePath, sanitizeFileName } from "../utils/validate.mjs";

/**
 * 5.1 GET /api/sketchbook (Scans ~/Arduino for user sketches and multi-file structures)
 */
export async function handleGetSketchbook(req, res) {
  try {
    await fs.promises.mkdir(SKETCHBOOK_DIR, { recursive: true });

    let topEntries;
    try {
      topEntries = await fs.promises.readdir(SKETCHBOOK_DIR, { withFileTypes: true });
    } catch {
      return sendJson(res, { sketchbook_dir: SKETCHBOOK_DIR, sketches: [] });
    }

    const SKETCH_EXTS = new Set([".ino", ".cpp", ".c", ".h", ".hpp", ".json"]);

    const sketchPromises = topEntries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith(".") && entry.name.toLowerCase() !== "libraries")
      .map(async (entry) => {
        const dirPath = path.join(SKETCHBOOK_DIR, entry.name);
        try {
          const [filesInDir, dirStat] = await Promise.all([
            fs.promises.readdir(dirPath, { withFileTypes: true }),
            fs.promises.stat(dirPath),
          ]);

          const sketchFiles = [];
          let mainFile = null;

          await Promise.all(filesInDir.filter(f => f.isFile()).map(async (f) => {
            const ext = path.extname(f.name).toLowerCase();
            if (!SKETCH_EXTS.has(ext)) return;
            const fullPath = path.join(dirPath, f.name);
            const stat = await fs.promises.stat(fullPath);
            const isMain =
              f.name.toLowerCase() === `${entry.name.toLowerCase()}.ino` ||
              f.name.toLowerCase() === "sketch.ino" ||
              ext === ".ino";
            if (isMain && !mainFile) {
              mainFile = fullPath;
            }
            sketchFiles.push({
              name: f.name,
              path: fullPath,
              is_main: isMain,
              size: stat.size,
              modified: stat.mtimeMs,
            });
          }));

          const hasIno = sketchFiles.some(f => f.name === `${entry.name}.ino`);
          if (sketchFiles.length > 0 || hasIno) {
            return {
              name: entry.name,
              dir_path: dirPath,
              main_file: mainFile || (sketchFiles[0]?.path ?? path.join(dirPath, `${entry.name}.ino`)),
              files: sketchFiles,
              modified: dirStat.mtimeMs,
            };
          }
        } catch (_) {}
        return null;
      });

    const results = await Promise.all(sketchPromises);
    const sketches = results.filter(Boolean);
    sketches.sort((a, b) => b.modified - a.modified);

    return sendJson(res, { sketchbook_dir: SKETCHBOOK_DIR, sketches });
  } catch (e) {
    return sendJson(res, { sketchbook_dir: SKETCHBOOK_DIR, sketches: [] });
  }
}

/**
 * 5.2 POST /api/sketchbook/create (Create new organized sketch in ~/Arduino)
 */
export async function handleCreateSketchbookSketch(req, res) {
  const { sketch_name } = await readBody(req);
  const dateStr = new Date().toISOString().slice(5, 10).replace("-", "");
  const cleanName = (sketch_name || `sketch_${dateStr}_${Math.floor(Math.random() * 900 + 100)}`)
    .replace(/[^a-zA-Z0-9_-]/g, "_");

  const targetDir = path.join(SKETCHBOOK_DIR, cleanName);
  await fs.promises.mkdir(targetDir, { recursive: true });

  const mainFile = path.join(targetDir, `${cleanName}.ino`);
  const defaultContent = `void setup() {\n  // put your setup code here, to run once:\n  Serial.begin(115200);\n}\n\nvoid loop() {\n  // put your main code here, to run repeatedly:\n  delay(10);\n}\n`;

  try {
    await fs.promises.access(mainFile);
    // file exists, don't overwrite
  } catch {
    await fs.promises.writeFile(mainFile, defaultContent, "utf-8");
  }

  return sendJson(res, {
    success: true,
    name: cleanName,
    dir_path: targetDir,
    main_file: mainFile,
    content: defaultContent,
  });
}

/**
 * 5.3 POST /api/sketch/add-file (Add a new file .h / .cpp to a sketch)
 */
export async function handleAddSketchFile(req, res) {
  const { dir_path, file_name, content } = await readBody(req);
  if (!dir_path || !file_name) {
    return sendJson(res, { success: false, error: "Missing dir_path or file_name" }, 400);
  }

  let safeDir, cleanFileName;
  try {
    safeDir = assertSafePath(dir_path);
    cleanFileName = sanitizeFileName(file_name);
  } catch (err) {
    return sendJson(res, { success: false, error: err.message }, err.status || 400);
  }

  const targetPath = path.join(safeDir, cleanFileName);

  let defaultContent = content || "";
  if (!content) {
    if (cleanFileName.endsWith(".h") || cleanFileName.endsWith(".hpp")) {
      const guard = cleanFileName.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
      defaultContent = `#ifndef ${guard}\n#define ${guard}\n\n#include <Arduino.h>\n\n// Declarations here\n\n#endif // ${guard}\n`;
    } else if (cleanFileName.endsWith(".cpp") || cleanFileName.endsWith(".c")) {
      const headerName = cleanFileName.replace(/\.(cpp|c)$/, ".h");
      defaultContent = `#include "${headerName}"\n\n// Definitions here\n`;
    }
  }

  await fs.promises.writeFile(targetPath, defaultContent, "utf-8");

  return sendJson(res, {
    success: true,
    path: targetPath,
    name: cleanFileName,
    content: defaultContent,
  });
}

/**
 * 5.4 POST /api/sketch/files (List all files belonging to a sketch)
 */
export async function handleGetSketchFiles(req, res) {
  const { dir_path } = await readBody(req);
  if (!dir_path) {
    return sendJson(res, { success: false, files: [] });
  }

  let safeDir;
  try {
    safeDir = assertSafePath(dir_path);
  } catch (err) {
    return sendJson(res, { success: false, error: err.message, files: [] }, err.status || 403);
  }

  try {
    let entries;
    try {
      entries = await fs.promises.readdir(safeDir, { withFileTypes: true });
    } catch (e) {
      if (e.code === "ENOENT") return sendJson(res, { success: false, files: [] });
      throw e;
    }

    const SKETCH_EXTS = new Set([".ino", ".cpp", ".c", ".h", ".hpp", ".json"]);
    const filePaths = [];
    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SKETCH_EXTS.has(ext)) {
          filePaths.push({ name: entry.name, path: path.join(dir_path, entry.name), ext });
        }
      }
    }

    const files = await Promise.all(
      filePaths.map(async ({ name, path: p, ext }) => {
        const content = await fs.promises.readFile(p, "utf-8");
        return { name, path: p, is_main: ext === ".ino", content };
      })
    );

    return sendJson(res, { success: true, files });
  } catch (e) {
    return sendJson(res, { success: false, error: e.message, files: [] });
  }
}
