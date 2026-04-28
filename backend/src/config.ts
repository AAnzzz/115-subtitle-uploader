import path from "node:path";
import fs from "node:fs";

function resolveDataDir() {
  if (process.env.DATA_DIR && process.env.DATA_DIR.trim()) {
    return process.env.DATA_DIR;
  }
  return path.resolve(process.cwd(), "data");
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parseInteger(value: string | undefined, fallback: number, min: number): number {
  if (!value || !value.trim()) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.floor(parsed));
}

function parseCorsOrigins(rawValue: string | undefined): string[] {
  const defaults = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ];

  if (!rawValue || !rawValue.trim()) {
    return defaults;
  }

  const parsed = rawValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (parsed.length === 0 || parsed.includes("*")) {
    return defaults;
  }

  return parsed;
}

const isProduction = (process.env.NODE_ENV || "").toLowerCase() === "production";

function resolveFake115Bin(): string {
  const fromEnv = process.env.FAKE115_BIN?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const candidates = [
    path.resolve(process.cwd(), "bin", "fake115uploader.exe"),
    path.resolve(process.cwd(), "bin", "fake115uploader")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return "fake115uploader";
}

export const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || "0.0.0.0",
  appPassword: process.env.APP_PASSWORD || "admin123",
  encryptionKey: process.env.ENCRYPTION_KEY || "change-this-key",
  sessionCookieName: "sid",
  sessionTtlMs: Number(process.env.SESSION_TTL_MS || 1000 * 60 * 60 * 24 * 7),
  dataDir: resolveDataDir(),
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN),
  enforceOriginCheck: parseBoolean(process.env.ENFORCE_ORIGIN_CHECK, true),
  cookieSecure: parseBoolean(process.env.COOKIE_SECURE, isProduction),
  loginRateLimitMax: parseInteger(process.env.LOGIN_RATE_LIMIT_MAX, 8, 1),
  loginRateLimitWindowMs: parseInteger(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 60_000, 1_000),
  cleanupIntervalMs: parseInteger(process.env.CLEANUP_INTERVAL_MS, 30 * 60 * 1000, 60_000),
  previewTtlMs: parseInteger(process.env.PREVIEW_TTL_MS, 24 * 60 * 60 * 1000, 60_000),
  taskWorkspaceTtlMs: parseInteger(process.env.TASK_WORKSPACE_TTL_MS, 72 * 60 * 60 * 1000, 60_000),
  uploadConcurrency: parseInteger(process.env.UPLOAD_CONCURRENCY, 1, 1),
  uploadRetry: parseInteger(process.env.UPLOAD_RETRY, 2, 0),
  uploadRetryDelayMs: parseInteger(process.env.UPLOAD_RETRY_DELAY_MS, 1200, 100),
  fake115Bin: resolveFake115Bin(),
  frontendDistDir: process.env.FRONTEND_DIST_DIR || path.resolve(process.cwd(), "public")
};

export const paths = {
  dbFile: path.join(config.dataDir, "app.db"),
  previewsDir: path.join(config.dataDir, "previews"),
  tasksDir: path.join(config.dataDir, "tasks")
};

assertSecureProductionConfig();

function assertSecureProductionConfig() {
  if (!isProduction) {
    return;
  }

  const errors: string[] = [];
  if (!process.env.APP_PASSWORD || config.appPassword === "admin123") {
    errors.push("APP_PASSWORD must be set to a strong value in production.");
  }
  if (
    !process.env.ENCRYPTION_KEY ||
    config.encryptionKey === "change-this-key" ||
    config.encryptionKey.length < 16
  ) {
    errors.push("ENCRYPTION_KEY must be set to a strong value (at least 16 chars) in production.");
  }
  if (errors.length > 0) {
    throw new Error(`Unsafe production configuration:\n- ${errors.join("\n- ")}`);
  }
}

