import PQueue from "p-queue";
import { randomUUID } from "node:crypto";
import { ensureTaskDir } from "./storage";
import type { UploadTask, UploadTaskItem, UploadTaskState } from "../types";
import { store } from "../db";
import { uploadWithFake115 } from "./uploader";
import { client115 } from "./115client";
import { config } from "../config";

export interface UploadJobItem {
  itemId: string;
  tempPath: string;
  targetName: string;
  cid: string;
}

class TaskManager {
  private tasks = new Map<string, UploadTask>();
  private successfulNamesCache = new Map<string, Set<string>>();
  private runningTaskIds = new Set<string>();

  createTask(previewId: string, items: UploadJobItem[], collisions: UploadTask["collisions"]): UploadTask {
    const now = new Date().toISOString();
    const taskItems: UploadTaskItem[] = items.map((item) => ({
      itemId: item.itemId,
      tempPath: item.tempPath,
      targetName: item.targetName,
      cid: item.cid,
      state: "pending",
      attempts: 0,
      updatedAt: now
    }));

    const task: UploadTask = {
      id: randomUUID(),
      previewId,
      state: "pending",
      total: taskItems.length,
      success: 0,
      failed: 0,
      pending: taskItems.length,
      processing: 0,
      logs: [],
      items: taskItems,
      collisions,
      failedItems: [],
      createdAt: now,
      updatedAt: now
    };

    this.tasks.set(task.id, task);
    this.persistTask(task);
    return task;
  }

  getTask(id: string): UploadTask | null {
    const inMemory = this.tasks.get(id);
    if (inMemory) {
      return inMemory;
    }

    const stored = store.getTask(id);
    if (!stored) {
      return null;
    }
    const normalized = this.normalizeTask(stored);
    this.tasks.set(normalized.id, normalized);
    return normalized;
  }

  appendLog(taskId: string, level: "info" | "error", message: string, itemId?: string) {
    const task = this.getTask(taskId);
    if (!task) {
      return;
    }
    task.logs.push({
      time: new Date().toISOString(),
      level,
      message,
      itemId
    });
    this.persistTask(task);
  }

  async resumePendingTasks(cookie: string | null): Promise<number> {
    const resumable = store
      .listTasksByStates(["pending", "processing", "queued", "running"])
      .map((task) => this.normalizeTask(task));

    if (resumable.length === 0) {
      return 0;
    }

    for (const task of resumable) {
      this.tasks.set(task.id, task);
    }

    if (!cookie) {
      for (const task of resumable) {
        this.appendLog(task.id, "error", "Found unfinished task after restart, but cookie is missing. Waiting for next retry trigger.");
      }
      return 0;
    }

    for (const task of resumable) {
      this.appendLog(task.id, "info", "Task recovered after restart. Resuming unfinished items.");
      void this.runUpload(task.id, cookie);
    }
    return resumable.length;
  }

  async runUpload(taskId: string, cookie: string) {
    if (this.runningTaskIds.has(taskId)) {
      return;
    }

    const task = this.getTask(taskId);
    if (!task) {
      return;
    }

    const pendingItems = this.preparePendingItems(task);
    if (pendingItems.length === 0) {
      this.finalizeTask(task);
      this.persistTask(task);
      return;
    }

    task.state = "processing";
    this.persistTask(task);

    this.runningTaskIds.add(taskId);
    try {
      const workspaceDir = await ensureTaskDir(taskId);
      const queue = new PQueue({ concurrency: config.uploadConcurrency });

      for (const item of pendingItems) {
        queue.add(async () => {
          await this.processUploadItem(task, item, cookie, workspaceDir);
        });
      }

      await queue.onIdle();
      this.finalizeTask(task);
      this.appendLog(task.id, "info", "Task finished");
      this.persistTask(task);
    } finally {
      this.runningTaskIds.delete(taskId);
    }
  }

  async retryTask(taskId: string, cookie: string) {
    const oldTask = this.getTask(taskId);
    if (!oldTask) {
      throw new Error("Task not found.");
    }
    const retryItems = oldTask.items
      .filter((item) => item.state === "failed")
      .map<UploadJobItem>((item) => ({
        itemId: item.itemId,
        tempPath: item.tempPath,
        targetName: item.targetName,
        cid: item.cid
      }));

    if (retryItems.length === 0) {
      throw new Error("No failed items to retry.");
    }

    const retryTask = this.createTask(oldTask.previewId, retryItems, []);
    this.appendLog(retryTask.id, "info", `Retry task created from ${taskId}.`);
    void this.runUpload(retryTask.id, cookie);
    return retryTask;
  }

  deleteTask(taskId: string): { deleted: boolean; reason?: string } {
    const task = this.getTask(taskId);
    if (!task) {
      return { deleted: false, reason: "Task not found." };
    }

    if (task.state === "pending" || task.state === "processing") {
      return { deleted: false, reason: "Task is still running." };
    }

    this.tasks.delete(taskId);
    store.deleteTask(taskId);
    return { deleted: true };
  }

  private preparePendingItems(task: UploadTask): UploadTaskItem[] {
    const pending: UploadTaskItem[] = [];
    for (const item of task.items) {
      if (item.state === "processing") {
        item.state = "pending";
        item.updatedAt = new Date().toISOString();
      }
      if (item.state === "pending") {
        pending.push(item);
      }
    }
    this.persistTask(task);
    return pending;
  }

  private async processUploadItem(
    task: UploadTask,
    item: UploadTaskItem,
    cookie: string,
    workspaceDir: string
  ): Promise<void> {
    const attempts = Math.max(1, config.uploadRetry + 1);
    let completed = false;
    let lastReason = "Unknown error.";

    item.state = "processing";
    item.updatedAt = new Date().toISOString();
    this.persistTask(task);

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      item.attempts += 1;
      item.updatedAt = new Date().toISOString();
      this.persistTask(task);
      try {
        const attemptPrefix = attempts > 1 ? `[${attempt}/${attempts}] ` : "";
        this.appendLog(task.id, "info", `${attemptPrefix}Start upload: ${item.targetName}`, item.itemId);
        await uploadWithFake115({
          cookie,
          cid: item.cid,
          sourcePath: item.tempPath,
          uploadName: item.targetName,
          workspaceDir
        });
        completed = true;
        item.state = "completed";
        item.lastError = undefined;
        item.updatedAt = new Date().toISOString();
        this.addSuccessfulName(item.cid, item.targetName);
        this.appendLog(task.id, "info", `Upload success: ${item.targetName}`, item.itemId);
        this.persistTask(task);
        break;
      } catch (error) {
        lastReason = error instanceof Error ? error.message : String(error);
        const existsAfterFailure = await this.confirmUploadedAfterFailure(cookie, item.cid, item.targetName);
        if (existsAfterFailure) {
          completed = true;
          item.state = "completed";
          item.lastError = undefined;
          item.updatedAt = new Date().toISOString();
          this.appendLog(
            task.id,
            "info",
            "Uploader reported failure, but file exists in target folder. Treated as success.",
            item.itemId
          );
          this.appendLog(task.id, "info", `Upload success: ${item.targetName}`, item.itemId);
          this.persistTask(task);
          break;
        }

        if (attempt < attempts) {
          this.appendLog(
            task.id,
            "error",
            `Upload attempt ${attempt}/${attempts} failed: ${item.targetName} - ${lastReason}. Retrying...`,
            item.itemId
          );
          await sleep(config.uploadRetryDelayMs * attempt);
        }
      }
    }

    if (!completed) {
      item.state = "failed";
      item.lastError = lastReason;
      item.updatedAt = new Date().toISOString();
      this.appendLog(task.id, "error", `Upload failed: ${item.targetName} - ${lastReason}`, item.itemId);
      this.persistTask(task);
    }
  }

  private finalizeTask(task: UploadTask) {
    this.refreshTaskCounters(task);
    task.state = task.failed > 0 ? "failed" : "completed";
    if (task.pending > 0 || task.processing > 0) {
      task.state = "processing";
    }
  }

  private persistTask(task: UploadTask) {
    this.refreshTaskCounters(task);
    task.updatedAt = new Date().toISOString();
    this.tasks.set(task.id, task);
    store.saveTask(task);
  }

  private refreshTaskCounters(task: UploadTask) {
    const counts = {
      pending: 0,
      processing: 0,
      success: 0,
      failed: 0
    };

    for (const item of task.items) {
      if (item.state === "pending") {
        counts.pending += 1;
      } else if (item.state === "processing") {
        counts.processing += 1;
      } else if (item.state === "completed") {
        counts.success += 1;
      } else if (item.state === "failed") {
        counts.failed += 1;
      }
    }

    task.total = task.items.length;
    task.pending = counts.pending;
    task.processing = counts.processing;
    task.success = counts.success;
    task.failed = counts.failed;
    task.failedItems = task.items
      .filter((item) => item.state === "failed")
      .map((item) => ({
        itemId: item.itemId,
        tempPath: item.tempPath,
        targetName: item.targetName,
        cid: item.cid,
        reason: item.lastError || "Unknown error."
      }));
  }

  private normalizeTask(task: UploadTask): UploadTask {
    const stateMap: Record<string, UploadTaskState> = {
      queued: "pending",
      running: "processing",
      pending: "pending",
      processing: "processing",
      completed: "completed",
      failed: "failed"
    };
    const normalizedState = stateMap[String(task.state)] || "failed";
    const now = new Date().toISOString();

    const items =
      Array.isArray(task.items) && task.items.length > 0
        ? task.items.map((item) => ({
            ...item,
            state: item.state === "pending" || item.state === "processing" || item.state === "completed" || item.state === "failed"
              ? item.state
              : "failed",
            attempts: Number.isFinite(item.attempts) ? item.attempts : 0,
            updatedAt: item.updatedAt || task.updatedAt || now
          }))
        : [];

    const normalized: UploadTask = {
      ...task,
      state: normalizedState,
      pending: task.pending ?? 0,
      processing: task.processing ?? 0,
      items
    };

    this.refreshTaskCounters(normalized);
    if (normalized.items.length > 0 && normalized.pending + normalized.processing > 0) {
      normalized.state = normalizedState === "completed" ? "processing" : normalizedState;
    }
    return normalized;
  }

  private addSuccessfulName(cid: string, targetName: string) {
    let names = this.successfulNamesCache.get(cid);
    if (!names) {
      names = new Set<string>();
      this.successfulNamesCache.set(cid, names);
    }
    names.add(targetName);
  }

  private hasSuccessfulName(cid: string, targetName: string): boolean {
    const names = this.successfulNamesCache.get(cid);
    return names?.has(targetName) ?? false;
  }

  private async confirmUploadedAfterFailure(
    cookie: string,
    cid: string,
    targetName: string
  ): Promise<boolean> {
    if (this.hasSuccessfulName(cid, targetName)) {
      return true;
    }

    try {
      const exists = await client115.fileExistsByName({
        cookie,
        cid,
        fileName: targetName
      });
      if (exists) {
        this.addSuccessfulName(cid, targetName);
      }
      return exists;
    } catch {
      return false;
    }
  }
}

export const taskManager = new TaskManager();

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
