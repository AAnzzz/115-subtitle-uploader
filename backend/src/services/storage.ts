import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { paths } from "../config";

export async function createPreviewDir(previewId: string): Promise<string> {
  const dir = path.join(paths.previewsDir, previewId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function buildTempFilePath(previewDir: string, ext: string): string {
  const safeExt = ext.toLowerCase();
  return path.join(previewDir, `${randomUUID()}${safeExt}`);
}

export async function ensureTaskDir(taskId: string): Promise<string> {
  const dir = path.join(paths.tasksDir, taskId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function cleanupWorkDirs(params: {
  previewTtlMs: number;
  taskWorkspaceTtlMs: number;
}): Promise<{ removedPreviewDirs: number; removedTaskDirs: number }> {
  const now = Date.now();
  const previewCutoff = now - params.previewTtlMs;
  const taskCutoff = now - params.taskWorkspaceTtlMs;

  const removedPreviewDirs = await cleanupOldSubdirs(paths.previewsDir, previewCutoff);
  const removedTaskDirs = await cleanupOldSubdirs(paths.tasksDir, taskCutoff);

  return {
    removedPreviewDirs,
    removedTaskDirs
  };
}

async function cleanupOldSubdirs(parentDir: string, cutoffMs: number): Promise<number> {
  let entries: Array<import("node:fs").Dirent> = [];
  try {
    entries = await fs.readdir(parentDir, { withFileTypes: true });
  } catch {
    return 0;
  }

  let removedCount = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const dirPath = path.join(parentDir, entry.name);
    try {
      const stat = await fs.stat(dirPath);
      if (stat.mtimeMs < cutoffMs) {
        await fs.rm(dirPath, { recursive: true, force: true });
        removedCount += 1;
      }
    } catch {
      // Ignore cleanup errors for individual directories.
    }
  }

  return removedCount;
}

