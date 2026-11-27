import { spawn } from "node:child_process";
import { HOME, ARDUINO_CLI, SKETCH_DIR, readBody, sendJson } from "../utils.mjs";
import { validateFqbn } from "../utils/validate.mjs";
import {
  getBuildDir,
  isBuildUpToDate,
  queueCompile,
  getCompileLockState,
  getCompileQueue,
} from "../compiler/compiler.mjs";

export function resolveUploadSpeed(fqbn, speed) {
  if (speed && speed !== "auto") {
    return String(speed);
  }
  if (fqbn) {
    const match = fqbn.match(/(?:UploadSpeed|baud)=([0-9]+)/i);
    if (match && match[1]) {
      return match[1];
    }
    if (fqbn.includes("cpu=atmega328old")) {
      return "57600";
    }
    if (fqbn.includes("cpu=atmega168")) {
      return "19200";
    }
  }
  const lowerFqbn = (fqbn || "").toLowerCase();
  if (lowerFqbn.includes("esp32")) {
    return "921600";
  }
  if (lowerFqbn.includes("esp8266")) {
    return "460800";
  }
  if (lowerFqbn.includes("avr") || lowerFqbn.includes("uno") || lowerFqbn.includes("mega")) {
    return "115200";
  }
  return "921600";
}

let isUploadingActive = false;

export function getIsUploadingActive() {
  return isUploadingActive;
}

export function executeSingleUpload(fqbn, port, speed, onLog) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const buildDir = getBuildDir(fqbn);
    const args = [
      "upload",
      "-v",
      "-p",
      port,
      "--fqbn",
      fqbn,
      SKETCH_DIR,
      "--build-path",
      buildDir,
      "--no-color",
    ];
    if (speed && speed !== "auto") {
      args.push("--upload-property", `upload.speed=${String(speed)}`);
    }

    const env = { ...process.env, PATH: `${HOME}/.local/bin:${process.env.PATH}` };
    const child = spawn(ARDUINO_CLI, args, { env });

    let stdout = "";
    let stderr = "";
    let isSettled = false;

    // 60-second watchdog
    const watchdog = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        try { child.kill("SIGKILL"); } catch (e) {}
        resolve({
          success: false,
          exitCode: -1,
          elapsed_ms: Date.now() - startTime,
          stdout,
          stderr: stderr + "\nUpload process timed out after 60 seconds.",
        });
      }
    }, 60000);

    const handleChunk = (chunk, isErr) => {
      const text = chunk.toString();
      if (isErr) stderr += text;
      else stdout += text;

      const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          onLog(trimmed, isErr ? "stderr" : "stdout");
        }
      }
    };

    child.stdout.on("data", (d) => handleChunk(d, false));
    child.stderr.on("data", (d) => handleChunk(d, true));

    child.on("error", (err) => {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(watchdog);
        resolve({
          success: false,
          exitCode: -1,
          elapsed_ms: Date.now() - startTime,
          stdout,
          stderr: stderr + "\n" + String(err.message || err),
        });
      }
    });

    child.on("close", (exitCode) => {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(watchdog);
        resolve({
          success: exitCode === 0,
          exitCode,
          elapsed_ms: Date.now() - startTime,
          stdout,
          stderr,
        });
      }
    });
  });
}

export async function handleUploadRequest(req, res) {
  const { code, fqbn, port, files, uploadSpeed } = await readBody(req);
  if (!port || !fqbn) {
    return sendJson(res, { success: false, error: "Missing port or fqbn parameter" }, 400);
  }

  let validFqbn;
  try {
    validFqbn = validateFqbn(fqbn);
  } catch (err) {
    return sendJson(res, { success: false, error: err.message }, 400);
  }

  // Set streaming headers (NDJSON standard)
  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const sendEvent = (type, message, extra = {}) => {
    try {
      res.write(JSON.stringify({ type, message, ...extra }) + "\n");
    } catch (e) {}
  };

  const startTime = Date.now();
  let accumulatedStdout = "";
  let accumulatedStderr = "";

  const onLog = (line, streamType = "stdout") => {
    if (streamType === "stderr") accumulatedStderr += line + "\n";
    else accumulatedStdout += line + "\n";
    sendEvent(streamType, line);
  };

  isUploadingActive = true;
  try {
    // Step 1: Wait for any in-flight compile to finish before checking build freshness
    if (getCompileLockState()) {
      sendEvent("info", "[FlashCode Engine] Waiting for in-flight compilation to complete...");
      await getCompileQueue().catch(() => {});
    }

    // Step 2: Check if firmware binary is already built and up-to-date
    const alreadyBuilt = await isBuildUpToDate(code || "", fqbn, files);
    if (alreadyBuilt) {
      sendEvent("info", "[FlashCode Engine] Firmware binary is up to date — skipping recompile.");
    } else {
      sendEvent("info", `[Compiler] Compiling firmware for ${fqbn}...`);
      const compileStart = Date.now();
      const compileRes = await queueCompile(code || "", fqbn, "full", files, onLog, true);
      if (!compileRes.success) {
        if (compileRes.stdout) {
          compileRes.stdout.split("\n").filter(Boolean).forEach((l) => sendEvent("stdout", l));
        }
        if (compileRes.stderr) {
          compileRes.stderr.split("\n").filter(Boolean).forEach((l) => sendEvent("stderr", l));
        }
        sendEvent("error", "[Upload Aborted] Compilation failed. Please fix build errors before flashing.");
        sendEvent("done", "Build failed", {
          success: false,
          elapsed_ms: compileRes.elapsed_ms || 0,
          stdout: compileRes.stdout || "",
          stderr: compileRes.stderr || "Build failed before upload.",
        });
        return res.end();
      }
      const compileElapsed = Date.now() - compileStart;
      sendEvent("info", `[Compiler] Firmware built successfully in ${compileElapsed}ms.`);
    }

    // Step 3: Upload firmware
    const effectiveSpeed = resolveUploadSpeed(fqbn, uploadSpeed);
    sendEvent("info", `[Uploader] Connecting to ${port} for flashing (${fqbn} at ${effectiveSpeed} baud)...`);
    const isEsp = fqbn.toLowerCase().includes("esp32") || fqbn.toLowerCase().includes("esp8266");
    if (isEsp) {
      sendEvent("info", "[Uploader] ESP32 bootloader handshake initiated. (If auto-reset fails, hold the BOOT button on your board)");
    }

    const flashStartTime = Date.now();
    let uploadResult = await executeSingleUpload(fqbn, port, uploadSpeed, onLog);
    let flashElapsed = Date.now() - flashStartTime;

    // Step 4: Check for ESP32 baud rate negotiation timeout & auto-retry at safe 115200
    const combinedOutput = (uploadResult.stdout + "\n" + uploadResult.stderr).toLowerCase();
    const isPacketTimeout =
      combinedOutput.includes("timed out waiting for packet header") ||
      combinedOutput.includes("failed to connect to esp") ||
      combinedOutput.includes("no serial data received") ||
      combinedOutput.includes("packet content transfer error");

    if (!uploadResult.success && isEsp && isPacketTimeout && effectiveSpeed !== "115200") {
      sendEvent("warning", `[Uploader] High baud rate (${effectiveSpeed}) timed out during packet synchronization.`);
      sendEvent("info", "[Uploader] Automatically retrying upload at fail-safe 115200 baud...");

      // Wait 800ms for USB serial interface to settle after reset
      await new Promise((r) => setTimeout(r, 800));

      const retryFlashStart = Date.now();
      const retryResult = await executeSingleUpload(fqbn, port, "115200", onLog);
      flashElapsed += (Date.now() - retryFlashStart);
      uploadResult = retryResult;
    }

    // Step 5: Diagnostic guidance if still failed
    if (!uploadResult.success) {
      const errLower = (uploadResult.stdout + "\n" + uploadResult.stderr).toLowerCase();
      if (errLower.includes("permission denied") || errLower.includes("errno 13")) {
        sendEvent("error", `\n[Permission Error] Linux user '${process.env.USER}' does not have permission to access ${port}.`);
        sendEvent("info", `Run in terminal: sudo usermod -a -G dialout $USER && newgrp dialout`);
      } else if (
        errLower.includes("no such file or directory") ||
        errLower.includes("errno 2") ||
        errLower.includes("port doesn't exist")
      ) {
        sendEvent("error", `\n[Port Disconnected] Port ${port} was not found or was disconnected during reset.`);
        sendEvent("info", `Please check your USB data cable and verify the device appears in Port Selector.`);
      } else if (
        errLower.includes("device or resource busy") ||
        errLower.includes("errno 16") ||
        (errLower.includes("could not open port") && errLower.includes("busy"))
      ) {
        sendEvent("error", `\n[Port Busy] Port ${port} is currently locked by another application.`);
        sendEvent("info", `Close any other open serial monitors, minicom, or Arduino IDE and try again.`);
      } else if (
        errLower.includes("timed out waiting for packet header") ||
        errLower.includes("failed to connect to esp") ||
        errLower.includes("no serial data received")
      ) {
        sendEvent("warning", `\n[ESP32 Bootloader Guide] Your board failed to enter download mode automatically.`);
        sendEvent("warning", `How to flash this board:`);
        sendEvent("warning", `  1. Hold down the physical 'BOOT' (or 'IO0') button on your ESP32 board.`);
        sendEvent("warning", `  2. Click 'Upload' again while continuing to hold the BOOT button.`);
        sendEvent("warning", `  3. As soon as 'Connecting........' appears in this console, release the BOOT button.`);
      }
    }

    const totalElapsed = Date.now() - startTime;
    if (uploadResult.success) {
      sendEvent("info", `[Success] Firmware uploaded to ${port} in ${flashElapsed}ms (total: ${totalElapsed}ms)!`);
    } else {
      sendEvent("error", `[Upload Failed] esptool/avrdude exited with error code ${uploadResult.exitCode || 1}.`);
    }

    sendEvent("done", uploadResult.success ? "Upload successful" : "Upload failed", {
      success: uploadResult.success,
      elapsed_ms: flashElapsed,
      total_elapsed_ms: totalElapsed,
      stdout: accumulatedStdout,
      stderr: accumulatedStderr,
    });

    res.end();
  } catch (e) {
    sendEvent("error", `[Upload Exception] ${String(e.message || e)}`);
    sendEvent("done", "Exception during upload", {
      success: false,
      elapsed_ms: Date.now() - startTime,
      stdout: accumulatedStdout,
      stderr: accumulatedStderr + "\n" + String(e.message || e),
    });
    res.end();
  } finally {
    isUploadingActive = false;
  }
}
