import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { paths } from "./config";
import type { StoredPreviewFile, UploadTask } from "./types";

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

ensureDir(path.dirname(paths.dbFile));
ensureDir(paths.previewsDir);
ensureDir(paths.tasksDir);

const db = new Database(paths.dbFile);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS preview_sessions (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS preview_files (
  id TEXT PRIMARY KEY,
  preview_id TEXT NOT NULL,
  original_name TEXT NOT NULL,
  ext TEXT NOT NULL,
  size INTEGER NOT NULL,
  temp_path TEXT NOT NULL,
  detected_episode TEXT,
  fallback_episode TEXT,
  FOREIGN KEY (preview_id) REFERENCES preview_sessions(id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`);

export const store = {
  getSetting(key: string): string | null {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  },
  getSettingMeta(key: string): { exists: boolean; updatedAt?: number } {
    const row = db
      .prepare("SELECT updated_at as updatedAt FROM settings WHERE key = ?")
      .get(key) as
      | { updatedAt: number }
      | undefined;
    if (!row) {
      return { exists: false };
    }
    return { exists: true, updatedAt: row.updatedAt };
  },
  setSetting(key: string, value: string) {
    const now = Date.now();
    db.prepare(
      "INSERT INTO settings(key, value, updated_at) VALUES(@key, @value, @updated) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    ).run({ key, value, updated: now });
  },
  createSession(id: string, expiresAt: number) {
    db.prepare("INSERT INTO sessions(id, created_at, expires_at) VALUES(?, ?, ?)").run(
      id,
      Date.now(),
      expiresAt
    );
  },
  cleanupSessions() {
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
  },
  hasSession(id: string): boolean {
    const row = db.prepare("SELECT id FROM sessions WHERE id = ? AND expires_at > ?").get(id, Date.now());
    return Boolean(row);
  },
  deleteSession(id: string) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  },
  createPreview(previewId: string) {
    db.prepare("INSERT INTO preview_sessions(id, created_at) VALUES(?, ?)").run(previewId, Date.now());
  },
  addPreviewFiles(files: StoredPreviewFile[]) {
    const stmt = db.prepare(
      "INSERT INTO preview_files(id, preview_id, original_name, ext, size, temp_path, detected_episode, fallback_episode) VALUES(@id, @previewId, @originalName, @ext, @size, @tempPath, @detectedEpisode, @fallbackEpisode)"
    );
    const tx = db.transaction((records: StoredPreviewFile[]) => {
      for (const record of records) {
        stmt.run(record);
      }
    });
    tx(files);
  },
  getPreviewFiles(previewId: string): StoredPreviewFile[] {
    return db
      .prepare(
        "SELECT id, preview_id as previewId, original_name as originalName, ext, size, temp_path as tempPath, detected_episode as detectedEpisode, fallback_episode as fallbackEpisode FROM preview_files WHERE preview_id = ?"
      )
      .all(previewId) as StoredPreviewFile[];
  },
  saveTask(task: UploadTask) {
    db.prepare(
      "INSERT INTO tasks(id, payload, updated_at) VALUES(@id, @payload, @updated) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at"
    ).run({ id: task.id, payload: JSON.stringify(task), updated: Date.now() });
  },
  getTask(id: string): UploadTask | null {
    const row = db.prepare("SELECT payload FROM tasks WHERE id = ?").get(id) as
      | { payload: string }
      | undefined;
    return row ? (JSON.parse(row.payload) as UploadTask) : null;
  },
  deleteTask(id: string) {
    db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  },
  listTasks(params?: { page?: number; limit?: number }): {
    items: UploadTask[];
    total: number;
    page: number;
    limit: number;
  } {
    const page = Math.max(1, Math.floor(params?.page ?? 1));
    const limit = Math.min(100, Math.max(1, Math.floor(params?.limit ?? 20)));
    const offset = (page - 1) * limit;

    const totalRow = db.prepare("SELECT COUNT(1) as total FROM tasks").get() as { total: number };
    const rows = db
      .prepare("SELECT payload FROM tasks ORDER BY updated_at DESC LIMIT ? OFFSET ?")
      .all(limit, offset) as Array<{ payload: string }>;

    return {
      items: rows.map((row) => JSON.parse(row.payload) as UploadTask),
      total: totalRow.total,
      page,
      limit
    };
  }
};

