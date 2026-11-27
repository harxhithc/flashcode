#!/usr/bin/env node

/**
 * FlashCode Automated Release Orchestrator
 * 
 * Usage:
 *   pnpm release             # Automatically bumps patch version (e.g. 0.2.0 -> 0.2.1)
 *   pnpm release minor       # Bumps minor version (e.g. 0.2.0 -> 0.3.0)
 *   pnpm release major       # Bumps major version (e.g. 0.2.0 -> 1.0.0)
 *   pnpm release 0.2.5       # Sets exact version
 *   pnpm release --dry-run   # Tests the release process without committing/pushing
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

// ANSI Color Helpers
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

function run(cmd, options = {}) {
  try {
    return execSync(cmd, { cwd: REPO_ROOT, stdio: options.silent ? "pipe" : "inherit", encoding: "utf-8", ...options });
  } catch (err) {
    if (options.ignoreError) return null;
    throw err;
  }
}

function runQuiet(cmd) {
  try {
    return execSync(cmd, { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
  } catch (err) {
    return "";
  }
}

console.log(`\n${cyan(bold("⚡ FlashCode: Automated Release Orchestrator"))}`);
console.log(cyan("------------------------------------------------------------"));

// 1. Read current version from package.json
const pkgPath = path.join(REPO_ROOT, "package.json");
const tauriConfPath = path.join(REPO_ROOT, "src-tauri", "tauri.conf.json");
const cargoTomlPath = path.join(REPO_ROOT, "src-tauri", "Cargo.toml");
const settingsModalPath = path.join(REPO_ROOT, "src", "components", "modals", "SettingsModal.tsx");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
const currentVersion = pkg.version;
console.log(`📌 Current Version: ${bold(currentVersion)}`);

// 2. Parse target version or increment type
const rawArgs = process.argv.slice(2).filter((a) => a !== "--dry-run");
const isDryRun = process.argv.includes("--dry-run");
const bumpArg = rawArgs[0] || "patch";

const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const match = currentVersion.match(semverRegex);
if (!match) {
  console.error(red(`✖ Error: Current version "${currentVersion}" is not standard semver (X.Y.Z)`));
  process.exit(1);
}

let [_, major, minor, patch] = match.map((n, i) => (i > 0 && i < 4 ? parseInt(n, 10) : n));
let newVersion = "";

if (bumpArg === "patch") {
  newVersion = `${major}.${minor}.${patch + 1}`;
} else if (bumpArg === "minor") {
  newVersion = `${major}.${minor + 1}.0`;
} else if (bumpArg === "major") {
  newVersion = `${major + 1}.0.0`;
} else {
  // Explicit version provided (e.g. "0.2.1" or "v0.2.1")
  const cleaned = bumpArg.replace(/^v/, "");
  if (!semverRegex.test(cleaned)) {
    console.error(red(`✖ Error: Invalid version "${bumpArg}". Expected format: X.Y.Z or patch|minor|major`));
    process.exit(1);
  }
  newVersion = cleaned;
}

if (newVersion === currentVersion) {
  console.error(red(`✖ Error: Target version is identical to current version (${currentVersion}). Bump required.`));
  process.exit(1);
}

const tag = `v${newVersion}`;
console.log(`🎯 Target Release:  ${green(bold(newVersion))} (Tag: ${bold(tag)})`);
if (isDryRun) {
  console.log(yellow("⚠️  Running in --dry-run mode (no files modified, no git tag created)"));
}

// 3. Verify git state
const gitStatus = runQuiet("git status --porcelain");
const hasUncommittedChanges = gitStatus.length > 0;
if (hasUncommittedChanges) {
  console.log(yellow("ℹ️  Note: You have uncommitted changes in your working tree."));
  console.log("   They will be included alongside the version bump in the release commit.");
}

if (isDryRun) {
  console.log(green(`\n✔ [Dry Run] Would bump version in package.json, tauri.conf.json, and Cargo.toml to ${newVersion}`));
  console.log(green(`✔ [Dry Run] Would commit and create tag ${tag}`));
  console.log(green(`✔ [Dry Run] Would push to origin with --tags to trigger GitHub Actions release\n`));
  process.exit(0);
}

// 4. Update package.json
console.log(`\n✏️  Updating configuration files...`);
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
console.log(`   ✔ Updated ${bold("package.json")}`);

// 5. Update src-tauri/tauri.conf.json
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf-8"));
tauriConf.version = newVersion;
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + "\n", "utf-8");
console.log(`   ✔ Updated ${bold("src-tauri/tauri.conf.json")}`);

// 6. Update src-tauri/Cargo.toml
let cargoContent = fs.readFileSync(cargoTomlPath, "utf-8");
cargoContent = cargoContent.replace(
  /(\[package\][\s\S]*?^version\s*=\s*")[^"]+(")/m,
  `$1${newVersion}$2`
);
fs.writeFileSync(cargoTomlPath, cargoContent, "utf-8");
console.log(`   ✔ Updated ${bold("src-tauri/Cargo.toml")}`);

// 7. Update fallback version in SettingsModal.tsx if exists
if (fs.existsSync(settingsModalPath)) {
  let settingsContent = fs.readFileSync(settingsModalPath, "utf-8");
  settingsContent = settingsContent.replace(
    /createSignal\(["'][0-9.]+["']\)/,
    `createSignal("${newVersion}")`
  );
  fs.writeFileSync(settingsModalPath, settingsContent, "utf-8");
  console.log(`   ✔ Updated ${bold("src/components/modals/SettingsModal.tsx")}`);
}

// 8. Update Cargo.lock
console.log(`📦 Synchronizing Cargo.lock...`);
try {
  run("cargo check --manifest-path src-tauri/Cargo.toml", { silent: true });
  console.log(`   ✔ Synchronized ${bold("src-tauri/Cargo.lock")}`);
} catch (e) {
  console.log(yellow("   ⚠️  Cargo check skipped or had warnings, continuing..."));
}

// 9. Git commit & tag (resolve author identity with fallback if shell strips global gitconfig)
console.log(`\n🔖 Creating git commit and tag ${bold(tag)}...`);
let gitUserName = runQuiet("git config user.name") || runQuiet("git log -1 --format=%an");
let gitUserEmail = runQuiet("git config user.email") || runQuiet("git log -1 --format=%ae");
const gitEnv = {
  ...process.env,
  ...(gitUserName ? { GIT_AUTHOR_NAME: gitUserName, GIT_COMMITTER_NAME: gitUserName } : {}),
  ...(gitUserEmail ? { GIT_AUTHOR_EMAIL: gitUserEmail, GIT_COMMITTER_EMAIL: gitUserEmail } : {}),
};
run(`git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock src/components/modals/SettingsModal.tsx`);
run(`git commit -m "chore(release): v${newVersion}"`, { env: gitEnv });
run(`git tag -a "${tag}" -m "Release ${tag}"`, { env: gitEnv });
console.log(`   ✔ Tag ${bold(tag)} created.`);

// 10. Git push
console.log(`\n🚀 Pushing to GitHub...`);
try {
  run(`git push origin HEAD --tags`);
  console.log(green(`\n✔ Successfully pushed release commit and tag ${tag} to GitHub!`));
  console.log(`\n============================================================`);
  console.log(`🎉 ${bold("Release " + tag + " is now in flight!")}`);
  console.log(`============================================================`);
  console.log(`GitHub Actions will now:`);
  console.log(`  1. Build release binaries (Windows .exe, Linux .AppImage, .deb)`);
  console.log(`  2. Sign update artifacts with Ed25519`);
  console.log(`  3. Publish the GitHub Release with latest.json`);
  console.log(`\nTrack build progress live at:`);
  console.log(`  👉 ${cyan("https://github.com/harxhithc/flashcode/actions")}`);
  console.log(`============================================================\n`);
} catch (err) {
  console.log(yellow(`\n⚠️  The tag ${tag} was created locally, but automatic push requires authentication.`));
  console.log(`   To complete the release, run:`);
  console.log(`   ${cyan(bold(`git push origin HEAD --tags`))}\n`);
}
