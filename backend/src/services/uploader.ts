import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config";

export async function uploadWithFake115(params: {
  cookie: string;
  cid: string;
  sourcePath: string;
  uploadName: string;
  workspaceDir: string;
}): Promise<void> {
  const uploadPath = path.join(params.workspaceDir, params.uploadName);
  const uploaderConfigPath = path.join(params.workspaceDir, `fake115uploader-${randomUUID()}.json`);
  await fs.copyFile(params.sourcePath, uploadPath);
  await writeUploaderConfigFile(uploaderConfigPath, params.cookie);

  try {
    // Avoid exposing cookie via process arguments (-k). Use temporary config file instead.
    await runProcess(config.fake115Bin, ["-l", uploaderConfigPath, "-c", params.cid, "-u", uploadPath]);
  } finally {
    await fs.rm(uploadPath, { force: true }).catch(() => undefined);
    await fs.rm(uploaderConfigPath, { force: true }).catch(() => undefined);
  }
}

export function ensureUploaderAvailable(): void {
  const probe = spawnSync(config.fake115Bin, ["-h"], {
    encoding: "utf8"
  });

  if (probe.error) {
    const err = probe.error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      throw new Error(
        `Uploader not found: ${config.fake115Bin}. Please install fake115uploader, or set FAKE115_BIN to the executable path.`
      );
    }
    throw new Error(`Uploader probe failed: ${err.message}`);
  }
}

async function runProcess(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });

    child.on("error", (error) => {
      reject(new Error(`Uploader failed to start: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else if (looksLikeUploadSuccess(output)) {
        // fake115uploader may return non-zero when keyboard shutdown times out,
        // even though upload summary reports all files succeeded.
        resolve();
      } else {
        reject(new Error(`Uploader failed (exit ${code}): ${output.trim() || "no output"}`));
      }
    });
  });
}

function looksLikeUploadSuccess(output: string): boolean {
  if (!output) {
    return false;
  }

  const normalized = output.replace(/\s+/g, " ");
  const hasSuccessCount =
    /\u4e0a\u4f20\u6210\u529f\u7684\u6587\u4ef6\uff08\d+\uff09/.test(normalized) ||
    /upload success/i.test(normalized);
  const hasZeroFailed =
    /\u4e0a\u4f20\u5931\u8d25\u7684\u6587\u4ef6\uff080\uff09/.test(normalized) ||
    /upload failed files?\s*\(0\)/i.test(normalized);
  const hasKeyboardTimeout =
    /\u5173\u95ed\s*keyboard.*\u8d85\u65f6/.test(normalized) ||
    /keyboard.*timeout/i.test(normalized);
  return hasSuccessCount && hasZeroFailed && hasKeyboardTimeout;
}

async function writeUploaderConfigFile(filePath: string, cookie: string): Promise<void> {
  const payload = {
    cookies: cookie,
    cid: 0,
    resultDir: "",
    httpRetry: 0,
    httpProxy: "",
    ossProxy: "",
    partsNum: 0
  };

  await fs.writeFile(filePath, JSON.stringify(payload), {
    encoding: "utf8",
    mode: 0o600
  });
}
