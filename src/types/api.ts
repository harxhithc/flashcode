/**
 * FlashCode Shared API Types
 * Canonical TypeScript definitions matching server request/response shapes.
 */

// ==========================================
// 1. Compilation & Build Types
// ==========================================
export interface SketchFilePayload {
  name: string;
  content: string;
}

export interface CompileRequest {
  code: string;
  fqbn: string;
  mode?: "verify" | "full";
  files?: SketchFilePayload[];
}

export interface BuildResult {
  success: boolean;
  elapsed_ms: number;
  stdout: string;
  stderr: string;
  ccache_used: boolean;
  cached_build: boolean;
  ccache_hit?: boolean;
  turbo?: boolean;
  error?: string;
}

export interface PrewarmRequest {
  fqbn: string;
  code?: string;
  files?: SketchFilePayload[];
}

export interface PrewarmResponse {
  success: boolean;
  ready?: boolean;
  cached?: boolean;
  backgroundStarted?: boolean;
}

// ==========================================
// 2. Upload / Flashing Types
// ==========================================
export interface UploadRequest {
  code: string;
  fqbn: string;
  port: string;
  files?: SketchFilePayload[];
  uploadSpeed?: number | string;
}

export interface UploadStreamEvent {
  type: "info" | "stdout" | "stderr" | "warning" | "error" | "done";
  message: string;
  success?: boolean;
  elapsed_ms?: number;
  stdout?: string;
  stderr?: string;
}

// ==========================================
// 3. Hardware, Boards & Cores Types
// ==========================================
export interface BoardInfo {
  name: string;
  fqbn: string;
  architecture: string;
  family?: string;
  platformName?: string;
  platformId?: string;
  isInstalled?: boolean;
}

export interface CorePlatform {
  id: string;
  name: string;
  maintainer: string;
  website?: string;
  email?: string;
  installed: boolean;
  installedVersion?: string;
  latestVersion?: string;
  availableVersions: string[];
  boards: { name: string; fqbn?: string }[];
}

export interface SerialPortInfo {
  port_name: string;
  description: string;
  vendor_id?: string;
  product_id?: string;
  manufacturer?: string;
}

// ==========================================
// 4. Arduino Libraries Types
// ==========================================
export interface ArduinoLibrary {
  name: string;
  author: string;
  maintainer?: string;
  sentence: string;
  paragraph?: string;
  website?: string;
  category: string;
  latest_version: string;
  available_versions: string[];
  is_installed: boolean;
  has_update?: boolean;
  installed_version?: string | null;
  install_dir?: string;
}

export interface LibrarySearchResult {
  libraries: ArduinoLibrary[];
  total: number;
}

export interface MissingLibraryInfo {
  header: string;
  suggested_library: string;
  description: string;
}

// ==========================================
// 5. File System & Sketchbook Types
// ==========================================
export interface SketchFile {
  name: string;
  path: string;
  content: string;
  ext?: string;
  is_main?: boolean;
  size?: number;
  modified?: number;
}

export interface SketchbookEntry {
  name: string;
  dir_path: string;
  main_file: string;
  files: SketchFile[];
  modified: number;
}

// ==========================================
// 6. AI Copilot Types
// ==========================================
export interface ErrorTranslationResponse {
  summary: string;
  rootCause: string;
  fixSuggestions: string[];
  fixedCode?: string;
}

export interface AIProviderPreset {
  id: string;
  name: string;
  tagline: string;
  description: string;
  keyUrl: string;
  keyPlaceholder: string;
  defaultBaseUrl: string;
  defaultModel: string;
  topModels: { id: string; name: string; tag: string; desc: string }[];
  models: string[];
  requiresKey: boolean;
  protocol: "openai" | "anthropic";
}
