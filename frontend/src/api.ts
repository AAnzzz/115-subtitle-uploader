import axios from "axios";

export interface FolderItem {
  cid: string;
  name: string;
  parentId?: string;
}

export interface FolderFileItem {
  id: string;
  name: string;
  size: number;
  sha1?: string;
  pickCode?: string;
  mtime?: number;
}

export interface FolderFilesPage {
  items: FolderFileItem[];
  total: number;
  page: number;
  limit: number;
}

export interface SubtitleItem {
  id: string;
  localName: string;
  ext: string;
  size: number;
  detectedEpisode?: string;
  fallbackEpisode?: string;
  manualEpisode?: string;
  targetName: string;
  status: "ready" | "needs_manual";
}

export interface PreviewResult {
  previewId: string;
  items: SubtitleItem[];
  validCount: number;
  needsFixCount: number;
  collisions: Array<{ itemId: string; originalName: string; resolvedName: string }>;
}

export interface UploadTask {
  id: string;
  previewId: string;
  state: "pending" | "processing" | "completed" | "failed";
  total: number;
  success: number;
  failed: number;
  pending: number;
  processing: number;
  logs: Array<{ time: string; level: "info" | "error"; message: string; itemId?: string }>;
  items: Array<{
    itemId: string;
    tempPath: string;
    targetName: string;
    cid: string;
    state: "pending" | "processing" | "completed" | "failed";
    attempts: number;
    lastError?: string;
    updatedAt: string;
  }>;
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

export interface UploadTaskPage {
  items: UploadTask[];
  total: number;
  page: number;
  limit: number;
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || "/",
  withCredentials: true
});

export async function login(password: string) {
  await api.post("/api/auth/login", { password });
}

export async function me() {
  return (await api.get<{ authenticated: boolean }>("/api/auth/me")).data;
}

export async function logout() {
  await api.post("/api/auth/logout");
}

export async function changePassword(payload: { currentPassword: string; newPassword: string }) {
  await api.post("/api/auth/password", payload);
}

export async function saveCookie(cookie: string) {
  await api.put("/api/115/cookie", { cookie });
}

export async function cookieStatus() {
  return (await api.get<{ valid: boolean; message: string }>("/api/115/cookie/status")).data;
}

export async function cookieMeta() {
  return (await api.get<{ hasCookie: boolean; updatedAt: number | null }>("/api/115/cookie/meta")).data;
}

export async function searchFolders(params: { keyword?: string; parentId?: string; page?: number }) {
  return (
    await api.get<{ items: FolderItem[] }>("/api/115/folders", {
      params
    })
  ).data.items;
}

export async function listFolderFiles(params: {
  cid: string;
  page?: number;
  limit?: number;
  keyword?: string;
}) {
  return (
    await api.get<FolderFilesPage>("/api/115/files", {
      params
    })
  ).data;
}

export async function previewSubtitles(params: {
  template: string;
  season: string;
  files: File[];
}) {
  const form = new FormData();
  form.append("template", params.template);
  form.append("season", params.season);
  for (const file of params.files) {
    form.append("files", file);
  }

  return (await api.post<PreviewResult>("/api/subtitles/preview", form)).data;
}

export async function startUpload(payload: {
  previewId: string;
  cid: string;
  template: string;
  season: string;
  manualEpisodes: Record<string, string>;
  customBaseNames?: Record<string, string>;
}) {
  return (await api.post<{ taskId: string }>("/api/subtitles/upload", payload)).data;
}

export async function getTask(id: string) {
  return (await api.get<UploadTask>(`/api/tasks/${id}`)).data;
}

export async function listTasks(params?: { page?: number; limit?: number }) {
  return (
    await api.get<UploadTaskPage>("/api/tasks", {
      params
    })
  ).data;
}

export async function retryTask(id: string) {
  return (await api.post<{ taskId: string }>(`/api/tasks/${id}/retry`)).data;
}

export async function deleteTask(id: string) {
  await api.delete(`/api/tasks/${id}`);
}
