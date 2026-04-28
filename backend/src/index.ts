import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import rateLimit from "@fastify/rate-limit";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { config } from "./config";
import { store } from "./db";
import { encryptText, decryptText } from "./crypto";
import {
  ensureAdminPasswordInitialized,
  loginWithPassword,
  updateAdminPassword,
  validateSession,
  verifyAdminPassword
} from "./services/auth";
import { client115 } from "./services/115client";
import { createPreviewDir, buildTempFilePath, cleanupWorkDirs } from "./services/storage";
import { detectEpisodeFromName } from "./utils/episode";
import { ensureUniqueName, renderTargetName, sanitizeFileBaseName } from "./utils/template";
import type { PreviewResult, SubtitleItem } from "./types";
import { taskManager } from "./services/taskManager";
import { ensureUploaderAvailable } from "./services/uploader";

async function bootstrap() {
  const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 * 200 });
  ensureAdminPasswordInitialized();

  const isAllowedOrigin = (origin?: string): boolean => {
    if (!origin) {
      return true;
    }
    return config.corsOrigins.includes(origin);
  };

  void app.register(cors, {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed."), false);
    },
    credentials: true
  });

  void app.register(cookie);
  void app.register(rateLimit, {
    global: false
  });
  void app.register(multipart, {
    limits: {
      files: 500,
      fileSize: 1024 * 1024 * 10
    }
  });

  const publicDir = config.frontendDistDir;
  await fs.mkdir(publicDir, { recursive: true }).catch(() => undefined);
  void app.register(fastifyStatic, {
    root: publicDir,
    prefix: "/"
  });

  app.addHook("preHandler", async (req, reply) => {
    if (!req.url.startsWith("/api")) {
      return;
    }

    if (
      config.enforceOriginCheck &&
      ["POST", "PUT", "PATCH", "DELETE"].includes(req.method.toUpperCase())
    ) {
      const origin = req.headers.origin;
      if (!isAllowedOrigin(origin)) {
        return reply.code(403).send({ message: "Origin check failed." });
      }
    }

    if (req.url.startsWith("/api/auth/login") || req.url.startsWith("/api/health")) {
      return;
    }

    const sid = req.cookies[config.sessionCookieName];
    if (!validateSession(sid)) {
      return reply.code(401).send({ message: "Not logged in or session expired." });
    }
  });

  app.post(
    "/api/auth/login",
    {
      config: {
        rateLimit: {
          max: config.loginRateLimitMax,
          timeWindow: config.loginRateLimitWindowMs
        }
      }
    },
    async (req, reply) => {
    const body = z.object({ password: z.string().min(1) }).parse(req.body);
    const token = loginWithPassword(body.password);
    if (!token) {
      return reply.code(401).send({ message: "Wrong password." });
    }

    reply.setCookie(config.sessionCookieName, token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: config.cookieSecure,
      maxAge: Math.floor(config.sessionTtlMs / 1000)
    });
      return { success: true };
    }
  );

  app.post("/api/auth/logout", async (req, reply) => {
    const sid = req.cookies[config.sessionCookieName];
    if (sid) {
      store.deleteSession(sid);
    }
    reply.clearCookie(config.sessionCookieName, { path: "/" });
    return { success: true };
  });

  app.get("/api/auth/me", async () => ({ authenticated: true }));

  app.post("/api/auth/password", async (req, reply) => {
    const body = z
      .object({
        currentPassword: z.string().min(1),
        newPassword: z
          .string()
          .min(6, "New password must be at least 6 characters.")
          .max(128, "New password is too long.")
      })
      .parse(req.body);

    if (!verifyAdminPassword(body.currentPassword)) {
      return reply.code(400).send({ message: "Current password is incorrect." });
    }

    updateAdminPassword(body.newPassword);

    const sid = req.cookies[config.sessionCookieName];
    if (sid) {
      // Force re-login after password change for safer session behavior.
      store.deleteSession(sid);
      reply.clearCookie(config.sessionCookieName, { path: "/" });
    }

    return { success: true };
  });

  app.get("/api/115/cookie/status", async (_req, reply) => {
    const encrypted = store.getSetting("cookie_115");
    if (!encrypted) {
      return reply.code(404).send({ valid: false, message: "No saved cookie yet." });
    }

    try {
      const plain = decryptText(encrypted);
      const result = await client115.validateCookie(plain);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ valid: false, message: msg });
    }
  });

  app.get("/api/115/cookie/meta", async () => {
    const meta = store.getSettingMeta("cookie_115");
    return {
      hasCookie: meta.exists,
      updatedAt: meta.updatedAt ?? null
    };
  });

  app.put("/api/115/cookie", async (req) => {
    const body = z.object({ cookie: z.string().min(10) }).parse(req.body);
    store.setSetting("cookie_115", encryptText(body.cookie.trim()));
    return { success: true };
  });

  app.get("/api/115/folders", async (req, reply) => {
    const encrypted = store.getSetting("cookie_115");
    if (!encrypted) {
      return reply.code(400).send({ message: "Please save 115 cookie first." });
    }
    const cookieRaw = decryptText(encrypted);
    const query = z
      .object({
        keyword: z.string().optional(),
        parentId: z.string().optional(),
        page: z.string().optional()
      })
      .parse(req.query);

    const folders = await client115.searchFolders({
      cookie: cookieRaw,
      keyword: query.keyword,
      parentId: query.parentId,
      page: query.page ? Number(query.page) : 1
    });

    return { items: folders };
  });

  app.get("/api/115/files", async (req, reply) => {
    const encrypted = store.getSetting("cookie_115");
    if (!encrypted) {
      return reply.code(400).send({ message: "Please save 115 cookie first." });
    }
    const cookieRaw = decryptText(encrypted);
    const query = z
      .object({
        cid: z.string().min(1),
        page: z.string().optional(),
        limit: z.string().optional(),
        keyword: z.string().optional()
      })
      .parse(req.query);

    const result = await client115.listFilesPage({
      cookie: cookieRaw,
      cid: query.cid,
      page: query.page ? Number(query.page) : 1,
      limit: query.limit ? Number(query.limit) : 20,
      keyword: query.keyword
    });

    return result;
  });

  app.post("/api/subtitles/preview", async (req, reply) => {
    const parts = req.parts();
    const allowedExts = new Set([".ass", ".srt", ".ssa"]);

    let template = "Azumanga Daioh S{season:2}E{episode:2} 1080p.x265.FLAC";
    let season = "01";

    const previewId = randomUUID();
    const previewDir = await createPreviewDir(previewId);

    const files: Array<{
      id: string;
      localName: string;
      ext: string;
      size: number;
      tempPath: string;
      detectedEpisode?: string;
      fallbackEpisode?: string;
    }> = [];

    for await (const part of parts) {
      if (part.type === "field") {
        if (part.fieldname === "template" && typeof part.value === "string") {
          template = part.value;
        }
        if (part.fieldname === "season" && typeof part.value === "string") {
          season = part.value;
        }
        continue;
      }

      const localName = part.filename || "unknown.ass";
      const ext = path.extname(localName).toLowerCase();
      if (!allowedExts.has(ext)) {
        part.file.resume();
        continue;
      }

      const tempPath = buildTempFilePath(previewDir, ext);
      const buffer = await part.toBuffer();
      await fs.writeFile(tempPath, buffer);

      const detected = detectEpisodeFromName(localName);
      files.push({
        id: randomUUID(),
        localName,
        ext,
        size: buffer.byteLength,
        tempPath,
        detectedEpisode: detected.episode,
        fallbackEpisode: detected.fallbackEpisode
      });
    }

    if (files.length === 0) {
      return reply
        .code(400)
        .send({ message: "No supported subtitle files found (.ass/.srt/.ssa)." });
    }

    store.createPreview(previewId);
    store.addPreviewFiles(
      files.map((item) => ({
        id: item.id,
        previewId,
        originalName: item.localName,
        ext: item.ext,
        size: item.size,
        tempPath: item.tempPath,
        detectedEpisode: item.detectedEpisode,
        fallbackEpisode: item.fallbackEpisode
      }))
    );

    const items: SubtitleItem[] = files.map((item) => {
      const status = item.detectedEpisode || item.fallbackEpisode ? "ready" : "needs_manual";
      const targetBase = renderTargetName({
        template,
        season,
        episode: item.detectedEpisode,
        fallbackEpisode: item.fallbackEpisode
      });
      const safeBase = sanitizeFileBaseName(targetBase);

      return {
        id: item.id,
        localName: item.localName,
        ext: item.ext,
        size: item.size,
        detectedEpisode: item.detectedEpisode,
        fallbackEpisode: item.fallbackEpisode,
        targetName: `${safeBase}${item.ext}`,
        status
      };
    });

    const result: PreviewResult = {
      previewId,
      items,
      validCount: items.filter((item) => item.status === "ready").length,
      needsFixCount: items.filter((item) => item.status === "needs_manual").length,
      collisions: []
    };

    return result;
  });

  app.post("/api/subtitles/upload", async (req, reply) => {
    const body = z
      .object({
        previewId: z.string().uuid(),
        cid: z.string().min(1),
        template: z.string().min(1),
        season: z.string().min(1).default("01"),
        manualEpisodes: z.record(z.string(), z.string()).optional(),
        customBaseNames: z.record(z.string(), z.string()).optional()
      })
      .parse(req.body);

    const encrypted = store.getSetting("cookie_115");
    if (!encrypted) {
      return reply.code(400).send({ message: "Please save 115 cookie first." });
    }

    try {
      ensureUploaderAvailable();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ message });
    }

    const cookieRaw = decryptText(encrypted);

    const previewFiles = store.getPreviewFiles(body.previewId);
    if (previewFiles.length === 0) {
      return reply.code(404).send({ message: "Preview session not found or expired." });
    }

    const occupied = await client115.listFileNames(cookieRaw, body.cid);
    const uploadItems: Array<{ itemId: string; tempPath: string; targetName: string; cid: string }> = [];
    const collisions: Array<{ itemId: string; originalName: string; resolvedName: string }> = [];

    for (const file of previewFiles) {
      const manualEpisode = body.manualEpisodes?.[file.id];
      const effectiveEpisode = manualEpisode || file.detectedEpisode;
      const effectiveFallback = manualEpisode || file.fallbackEpisode;

      if (!effectiveEpisode && !effectiveFallback) {
        return reply
          .code(400)
          .send({ message: `Missing episode number for file: ${file.originalName}` });
      }

      const customBaseName = body.customBaseNames?.[file.id];
      const targetBase = customBaseName
        ? customBaseName
        : renderTargetName({
            template: body.template,
            season: body.season,
            episode: effectiveEpisode,
            fallbackEpisode: effectiveFallback
          });
      const safeBase = sanitizeFileBaseName(targetBase);
      const desiredName = `${safeBase}${file.ext}`;
      const unique = ensureUniqueName(desiredName, occupied);

      if (unique.collided) {
        collisions.push({
          itemId: file.id,
          originalName: desiredName,
          resolvedName: unique.finalName
        });
      }

      uploadItems.push({
        itemId: file.id,
        tempPath: file.tempPath,
        targetName: unique.finalName,
        cid: body.cid
      });
    }

    const task = taskManager.createTask(body.previewId, uploadItems.length, collisions);
    void taskManager.runUpload(task.id, cookieRaw, uploadItems);

    return { taskId: task.id };
  });

  app.get("/api/tasks/:id", async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const task = taskManager.getTask(params.id);
    if (!task) {
      return reply.code(404).send({ message: "Task not found." });
    }
    return task;
  });

  app.get("/api/tasks", async (req) => {
    const query = z
      .object({
        page: z.string().optional(),
        limit: z.string().optional()
      })
      .parse(req.query);

    return store.listTasks({
      page: query.page ? Number(query.page) : 1,
      limit: query.limit ? Number(query.limit) : 20
    });
  });

  app.post("/api/tasks/:id/retry", async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const encrypted = store.getSetting("cookie_115");
    if (!encrypted) {
      return reply.code(400).send({ message: "Please save 115 cookie first." });
    }

    const cookieRaw = decryptText(encrypted);

    try {
      const task = await taskManager.retryTask(params.id, cookieRaw);
      return { taskId: task.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(400).send({ message });
    }
  });

  app.delete("/api/tasks/:id", async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const result = taskManager.deleteTask(params.id);
    if (!result.deleted) {
      const code = result.reason === "Task not found." ? 404 : 400;
      return reply.code(code).send({ message: result.reason || "Delete failed." });
    }
    return { success: true };
  });

  app.get("/api/health", async () => ({ ok: true }));

  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith("/api")) {
      return reply.code(404).send({ message: "Not Found" });
    }

    try {
      const indexPath = path.join(publicDir, "index.html");
      const html = await fs.readFile(indexPath, "utf8");
      reply.type("text/html").send(html);
    } catch {
      reply.type("text/plain").send("Frontend not built yet.");
    }
  });

  const runCleanup = async () => {
    const result = await cleanupWorkDirs({
      previewTtlMs: config.previewTtlMs,
      taskWorkspaceTtlMs: config.taskWorkspaceTtlMs
    });
    if (result.removedPreviewDirs > 0 || result.removedTaskDirs > 0) {
      app.log.info(
        {
          removedPreviewDirs: result.removedPreviewDirs,
          removedTaskDirs: result.removedTaskDirs
        },
        "workspace cleanup completed"
      );
    }
  };

  void runCleanup().catch((error) => {
    app.log.warn({ err: error }, "workspace cleanup failed");
  });

  const cleanupTimer = setInterval(() => {
    void runCleanup().catch((error) => {
      app.log.warn({ err: error }, "workspace cleanup failed");
    });
  }, config.cleanupIntervalMs);
  cleanupTimer.unref();

  app.listen({ port: config.port, host: config.host }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}

void bootstrap();
