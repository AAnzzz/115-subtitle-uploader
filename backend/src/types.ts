export type SubtitleStatus = "ready" | "needs_manual";

export interface SubtitleItem {
  id: string;
  localName: string;
  ext: string;
  size: number;
  detectedEpisode?: string;
  fallbackEpisode?: string;
  manualEpisode?: string;
  targetName: string;
  status: SubtitleStatus;
}

export interface PreviewResult {
  previewId: string;
  items: SubtitleItem[];
  validCount: number;
  needsFixCount: number;
  collisions: Array<{ itemId: string; originalName: string; resolvedName: string }>;
}

export interface UploadLog {
  time: string;
  level: "info" | "error";
  message: string;
  itemId?: string;
}

export type UploadTaskState = "pending" | "processing" | "completed" | "failed";
export type UploadItemState = "pending" | "processing" | "completed" | "failed";

export interface UploadTaskItem {
  itemId: string;
  tempPath: string;
  targetName: string;
  cid: string;
  state: UploadItemState;
  attempts: number;
  lastError?: string;
  updatedAt: string;
}

export interface UploadTask {
  id: string;
  previewId: string;
  state: UploadTaskState;
  total: number;
  success: number;
  failed: number;
  pending: number;
  processing: number;
  logs: UploadLog[];
  items: UploadTaskItem[];
  collisions: Array<{ itemId: string; originalName: string; resolvedName: string }>;
  failedItems: Array<{
    itemId: string;
    tempPath: string;
    targetName: string;
    cid: string;
    reason: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface StoredPreviewFile {
  id: string;
  previewId: string;
  originalName: string;
  ext: string;
  size: number;
  tempPath: string;
  detectedEpisode?: string;
  fallbackEpisode?: string;
}

