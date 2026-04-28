import PQueue from "p-queue";
import { randomUUID } from "node:crypto";
import { ensureTaskDir } from "./storage";
import type { UploadTask } from "../types";
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

  createTask(previewId: string, total: number, collisions: UploadTask["collisions"]): UploadTask {
    const task: UploadTask = {
      id: randomUUID(),
      previewId,
      state: "queued",
      total,
      success: 0,
      failed: 0,
      logs: [],
      collisions,
      failedItems: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.tasks.set(task.id, task);
    store.saveTask(task);
    return task;
  }

  getTask(id: string): UploadTask | null {
    return this.tasks.get(id) || store.getTask(id);
  }

  appendLog(taskId: string, level: "info" | "error", message: string, itemId?: string) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }
    task.logs.push({
      time: new Date().toISOString(),
      level,
      message,
      itemId
    });
    task.updatedAt = new Date().toISOString();
    store.saveTask(task);
  }

  async runUpload(taskId: string, cookie: string, items: UploadJobItem[]) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    task.state = "running";
    task.updatedAt = new Date().toISOString();
    store.saveTask(task);

    const workspaceDir = await ensureTaskDir(taskId);
    const queue = new PQueue({ concurrency: config.uploadConcurrency });

    for (const item of items) {
      queue.add(async () => {
        let completed = false;
        let lastReason = "Unknown error.";
        const attempts = Math.max(1, config.uploadRetry + 1);

        for (let attempt = 1; attempt <= attempts; attempt += 1) {
          try {
            const attemptPrefix = attempts > 1 ? `[${attempt}/${attempts}] ` : "";
            this.appendLog(taskId, "info", `${attemptPrefix}Start upload: ${item.targetName}`, item.itemId);
            await uploadWithFake115({
              cookie,
              cid: item.cid,
              sourcePath: item.tempPath,
              uploadName: item.targetName,
              workspaceDir
            });
            completed = true;
            this.markUploadSuccess(task, taskId, item);
            break;
          } catch (error) {
            lastReason = error instanceof Error ? error.message : String(error);

            const existsAfterFailure = await this.confirmUploadedAfterFailure(
              cookie,
              item.cid,
              item.targetName
            );
            if (existsAfterFailure) {
              completed = true;
              this.markUploadSuccess(task, taskId, item, "Uploader reported failure, but file exists in target folder. Treated as success.");
              break;
            }

            if (attempt < attempts) {
              this.appendLog(
                taskId,
                "error",
                `Upload attempt ${attempt}/${attempts} failed: ${item.targetName} - ${lastReason}. Retrying...`,
                item.itemId
              );
              await sleep(config.uploadRetryDelayMs * attempt);
            }
          }
        }

        if (!completed) {
          task.failed += 1;
          task.failedItems.push({
            itemId: item.itemId,
            tempPath: item.tempPath,
            targetName: item.targetName,
            cid: item.cid,
            reason: lastReason
          });
          this.appendLog(taskId, "error", `Upload failed: ${item.targetName} - ${lastReason}`, item.itemId);
        }

        task.updatedAt = new Date().toISOString();
        store.saveTask(task);
      });
    }

    await queue.onIdle();

    if (task.success === 0 && task.failed > 0) {
      task.state = "failed";
    } else {
      task.state = "completed";
    }
    task.updatedAt = new Date().toISOString();
    this.appendLog(taskId, "info", "Task finished");
    store.saveTask(task);
  }

  async retryTask(taskId: string, cookie: string) {
    const oldTask = this.getTask(taskId);
    if (!oldTask || oldTask.failedItems.length === 0) {
      throw new Error("No failed items to retry.");
    }

    const retryTask = this.createTask(oldTask.previewId, oldTask.failedItems.length, []);
    const retryItems = oldTask.failedItems.map((item) => ({
      itemId: item.itemId,
      tempPath: item.tempPath,
      targetName: item.targetName,
      cid: item.cid
    }));

    void this.runUpload(retryTask.id, cookie, retryItems);
    return retryTask;
  }

  deleteTask(taskId: string): { deleted: boolean; reason?: string } {
    const task = this.getTask(taskId);
    if (!task) {
      return { deleted: false, reason: "Task not found." };
    }

    if (task.state === "queued" || task.state === "running") {
      return { deleted: false, reason: "Task is still running." };
    }

    this.tasks.delete(taskId);
    store.deleteTask(taskId);
    return { deleted: true };
  }

  private markUploadSuccess(
    task: UploadTask,
    taskId: string,
    item: UploadJobItem,
    note?: string
  ) {
    task.success += 1;
    this.addSuccessfulName(item.cid, item.targetName);
    if (note) {
      this.appendLog(taskId, "info", note, item.itemId);
    }
    this.appendLog(taskId, "info", `Upload success: ${item.targetName}`, item.itemId);
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
