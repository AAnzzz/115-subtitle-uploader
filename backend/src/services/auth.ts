import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { config } from "../config";
import { store } from "../db";

const ADMIN_PASSWORD_KEY = "admin_password_hash";
const SCRYPT_KEYLEN = 64;

export function createSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function ensureAdminPasswordInitialized() {
  const current = store.getSetting(ADMIN_PASSWORD_KEY);
  if (current) {
    return;
  }
  store.setSetting(ADMIN_PASSWORD_KEY, hashPassword(config.appPassword));
}

export function loginWithPassword(password: string): string | null {
  if (!verifyAdminPassword(password)) {
    return null;
  }
  const token = createSessionToken();
  const expiresAt = Date.now() + config.sessionTtlMs;
  store.createSession(token, expiresAt);
  return token;
}

export function verifyAdminPassword(password: string): boolean {
  const hash = store.getSetting(ADMIN_PASSWORD_KEY);
  if (!hash) {
    // Backward-compatible fallback before initialization.
    return password === config.appPassword;
  }
  return verifyPassword(password, hash);
}

export function updateAdminPassword(newPassword: string) {
  const hashed = hashPassword(newPassword);
  store.setSetting(ADMIN_PASSWORD_KEY, hashed);
}

export function validateSession(token: string | undefined): boolean {
  if (!token) {
    return false;
  }
  store.cleanupSessions();
  return store.hasSession(token);
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password: string, encoded: string): boolean {
  const [algo, salt, hashHex] = encoded.split("$");
  if (algo !== "scrypt" || !salt || !hashHex) {
    return false;
  }

  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}

