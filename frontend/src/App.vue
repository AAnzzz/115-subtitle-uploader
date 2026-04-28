<template>
  <div v-if="!authenticated" class="login-wrap">
    <el-card class="login-card soft-card">
      <template #header>
        <div class="card-title">115 字幕批量上传工具</div>
      </template>
      <div class="muted-text">登录后可保存 Cookie、批量重命名并上传字幕</div>
      <el-form @submit.prevent="doLogin" style="margin-top: 14px">
        <el-form-item label="管理员密码">
          <el-input v-model="password" show-password placeholder="请输入密码" />
        </el-form-item>
        <el-button type="primary" :loading="loggingIn" class="btn-primary" @click="doLogin">登录</el-button>
      </el-form>
    </el-card>
  </div>

  <div v-else class="page">
    <div class="hero-area">
      <div class="hero-content">
        <h1>115 字幕批量上传</h1>
        <p>先选择目标目录，再按目录内视频文件自动匹配并上传字幕。</p>
      </div>
      <div class="hero-actions">
        <el-button plain @click="openManageCenter">管理中心</el-button>
        <el-button @click="doLogout" plain>退出登录</el-button>
      </div>
    </div>

    <el-row :gutter="16">
      <el-col :xs="24" :lg="24">
        <el-card class="soft-card section-card">
          <template #header>
            <div class="card-title">115 Cookie 设置</div>
          </template>

          <el-alert
            v-if="cookieSaved"
            type="success"
            :closable="false"
            title="Cookie 已保存（出于安全原因不回显原值）"
            show-icon
          />
          <el-alert v-else type="warning" :closable="false" title="尚未保存 Cookie" show-icon />

          <el-form label-position="top" style="margin-top: 12px">
            <el-form-item label="粘贴新 Cookie（覆盖已有值）">
              <el-input v-model="cookieInput" type="textarea" :rows="4" placeholder="粘贴完整 Cookie" />
            </el-form-item>
            <div class="toolbar">
              <el-button type="primary" class="btn-primary" :loading="savingCookie" @click="saveCookieAction">
                保存 Cookie
              </el-button>
              <el-button :loading="checkingCookie" @click="checkCookie">验证 Cookie</el-button>
            </div>
            <p class="muted-text" v-if="cookieCheckMessage">{{ cookieCheckMessage }}</p>
          </el-form>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="soft-card section-card">
      <template #header>
        <div class="card-title">115 文件夹选择（支持子目录）</div>
      </template>

      <div class="folder-toolbar">
        <el-input v-model="folderKeyword" placeholder="搜索当前目录下子文件夹" clearable style="max-width: 320px" />
        <el-button :loading="searchingFolders" @click="loadFolders">搜索</el-button>
        <el-button @click="clearSearch">清空搜索</el-button>
        <el-button :disabled="folderTrail.length <= 1" @click="goParent">返回上级</el-button>
      </div>

      <div class="folder-trail">
        <span class="trail-label">当前位置：</span>
        <el-breadcrumb separator=">">
          <el-breadcrumb-item v-for="(node, index) in folderTrail" :key="node.cid">
            <a href="#" @click.prevent="jumpToTrail(index)">{{ node.name }}</a>
          </el-breadcrumb-item>
        </el-breadcrumb>
      </div>

      <el-table :data="folders" size="small" class="folder-table" v-loading="searchingFolders">
        <el-table-column prop="name" label="文件夹" min-width="320" />
        <el-table-column prop="cid" label="CID" width="180" />
        <el-table-column label="操作" width="260">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button size="small" @click="enterFolder(row)">进入子目录</el-button>
              <el-button size="small" type="success" @click="selectFolder(row)">选择此目录</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <p class="selected-folder" v-if="selectedFolder">
        已选择目录：{{ selectedFolder.name }}（CID: {{ selectedFolder.cid }}）
      </p>
    </el-card>

    <el-card v-if="selectedFolder" class="soft-card section-card">
      <template #header>
        <div class="card-title">目录文件列表</div>
      </template>

      <div class="folder-toolbar">
        <el-input v-model="fileKeyword" placeholder="搜索该目录中的文件名" clearable style="max-width: 320px" />
        <el-button :loading="loadingFolderFiles" @click="loadFolderFiles(1)">搜索文件</el-button>
        <el-button @click="clearFileSearch">清空</el-button>
      </div>

      <el-table :data="folderFiles" size="small" v-loading="loadingFolderFiles" class="folder-file-table">
        <el-table-column prop="name" label="文件名" min-width="360" />
        <el-table-column label="大小" width="130">
          <template #default="{ row }">
            {{ formatSize(row.size) }}
          </template>
        </el-table-column>
        <el-table-column label="修改时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.mtime) }}
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          background
          layout="total, prev, pager, next"
          :total="folderFileTotal"
          :page-size="folderFilePageSize"
          :current-page="folderFilePage"
          @current-change="onFolderFilePageChange"
        />
      </div>
    </el-card>

    <el-card class="soft-card section-card">
      <template #header>
        <div class="card-title">字幕来源与重命名</div>
      </template>

      <el-form label-position="top">
        <el-form-item label="选择重命名方式">
          <div class="rename-mode-switch" role="tablist" aria-label="重命名方式">
            <button
              type="button"
              class="mode-pill"
              :class="{ 'mode-pill-active': renameMode === 'template' }"
              @click="renameMode = 'template'"
            >
              按模板重命名
            </button>
            <button
              type="button"
              class="mode-pill"
              :class="{ 'mode-pill-active': renameMode === 'folder' }"
              @click="renameMode = 'folder'"
            >
              按目录视频文件名匹配
            </button>
          </div>
        </el-form-item>

        <el-row :gutter="12">
          <el-col :xs="24" :sm="8">
            <el-form-item label="季号">
              <el-input v-model="season" placeholder="01" :disabled="renameMode === 'folder'" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="16">
            <el-form-item label="选择本地字幕文件夹">
              <input type="file" webkitdirectory directory multiple @change="onFolderChange" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="重命名模板（模板模式使用）" v-if="renameMode === 'template'">
          <el-input v-model="template" placeholder="阿滋漫画大王 S{season:2}E{episode:2} 1080p.x265.FLAC" />
        </el-form-item>

        <div class="muted-text" style="margin: -6px 0 10px" v-if="renameMode === 'template'">
          简写可用：{季}、{集}；高级写法：{season:2}、{episode:2}；&& 为兜底集号。
        </div>

        <div class="muted-text">当前已选择 {{ selectedFiles.length }} 个字幕文件</div>
      </el-form>

      <div class="toolbar">
        <el-button type="primary" class="btn-primary" :loading="previewing" @click="buildPreview">生成预览</el-button>
        <el-button
          :disabled="!selectedFolder || renameMode !== 'folder'"
          :loading="matchingFolderFiles"
          @click="matchFromFolderFiles"
        >
          按目录文件名匹配重命名
        </el-button>
        <el-button :disabled="!Object.keys(matchedBaseNames).length" @click="clearMatchedNames">清空匹配</el-button>
        <el-button
          type="success"
          :disabled="!previewId || !selectedFolder"
          :loading="uploading"
          @click="startUploadAction"
        >
          开始上传
        </el-button>
      </div>

      <div class="preview-table" v-if="previewItems.length">
        <el-alert
          type="info"
          :closable="false"
          :title="`预览完成：可上传 ${validCount}，需人工修正 ${needsFixCount}`"
          show-icon
        />
        <el-table :data="previewPagedItems" size="small" style="margin-top: 10px">
          <el-table-column prop="localName" label="原文件名" min-width="250" />
          <el-table-column label="识别集数" width="100">
            <template #default="{ row }">
              {{ row.detectedEpisode || row.fallbackEpisode || "-" }}
            </template>
          </el-table-column>
          <el-table-column label="手动集数" width="120">
            <template #default="{ row }">
              <el-input v-model="manualEpisodes[row.id]" size="small" placeholder="如 01" />
            </template>
          </el-table-column>
          <el-table-column label="匹配到目录文件" min-width="220">
            <template #default="{ row }">
              {{ matchedSourceNames[row.id] || "-" }}
            </template>
          </el-table-column>
          <el-table-column label="目标文件名" min-width="280">
            <template #default="{ row }">
              {{ renderLiveName(row) }}
            </template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <span class="status-chip" :class="rowStatusClass(row)">
                {{ rowStatusText(row) }}
              </span>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap" style="margin-top: 10px">
          <el-pagination
            background
            layout="total, prev, pager, next"
            :total="previewItems.length"
            :page-size="previewPageSize"
            :current-page="previewPage"
            @current-change="onPreviewPageChange"
          />
        </div>
      </div>
    </el-card>

    <el-card v-if="currentTask" class="soft-card section-card">
      <template #header>
        <div class="card-title">任务进度</div>
      </template>
      <el-progress :percentage="taskPercent" :status="currentTask.state === 'failed' ? 'exception' : undefined" />
      <p class="task-summary">
        状态：{{ currentTask.state }} ｜ 成功 {{ currentTask.success }} / {{ currentTask.total }} ｜ 失败 {{ currentTask.failed }}
      </p>
      <el-button v-if="currentTask.failedItems.length" :loading="retrying" @click="retryFailedItems" type="warning">
        重试失败项
      </el-button>
      <div class="log-panel" style="margin-top: 10px">
        <div
          v-for="(log, index) in currentTask.logs"
          :key="`${log.time}-${index}`"
          class="log-line"
          :class="{ 'log-error': log.level === 'error' }"
        >
          [{{ log.time }}] {{ log.message }}
        </div>
      </div>
    </el-card>

    <el-drawer
      v-model="manageCenterVisible"
      title="管理中心"
      size="min(760px, 96vw)"
      destroy-on-close
      class="manage-drawer"
    >
      <el-card class="soft-card section-card">
        <template #header>
          <div class="card-title">账号安全</div>
        </template>
        <el-form label-position="top" class="password-form">
          <el-row :gutter="12">
            <el-col :xs="24" :md="8">
              <el-form-item label="当前密码">
                <el-input v-model="currentPassword" show-password placeholder="请输入当前密码" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :md="8">
              <el-form-item label="新密码（至少 6 位）">
                <el-input v-model="newPassword" show-password placeholder="请输入新密码" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :md="8">
              <el-form-item label="确认新密码">
                <el-input v-model="confirmNewPassword" show-password placeholder="请再次输入新密码" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-button type="warning" :loading="changingPassword" @click="changePasswordAction">
            修改密码
          </el-button>
        </el-form>
      </el-card>

      <el-card class="soft-card section-card">
        <template #header>
          <div class="card-title">任务历史</div>
        </template>
        <el-table :data="historyTasks" size="small" v-loading="loadingHistoryTasks">
          <el-table-column prop="id" label="任务 ID" min-width="220" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              {{ row.state }}
            </template>
          </el-table-column>
          <el-table-column label="进度" width="160">
            <template #default="{ row }">
              {{ row.success }}/{{ row.total }}（失败 {{ row.failed }}）
            </template>
          </el-table-column>
          <el-table-column label="更新时间" width="170">
            <template #default="{ row }">
              {{ formatIsoTime(row.updatedAt) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <div class="row-actions">
                <el-button size="small" @click="openHistoryTask(row.id)">查看详情</el-button>
                <el-button size="small" type="danger" plain @click="deleteHistoryTask(row.id)">删除</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination
            background
            layout="total, prev, pager, next"
            :total="historyTotal"
            :page-size="historyPageSize"
            :current-page="historyPage"
            @current-change="onHistoryPageChange"
          />
        </div>
      </el-card>

      <el-dialog
        v-model="historyDetailVisible"
        title="任务详情"
        width="min(920px, 96vw)"
        destroy-on-close
      >
        <template v-if="historyDetailTask">
          <el-descriptions :column="2" border size="small" style="margin-bottom: 12px">
            <el-descriptions-item label="任务 ID">{{ historyDetailTask.id }}</el-descriptions-item>
            <el-descriptions-item label="状态">{{ historyDetailTask.state }}</el-descriptions-item>
            <el-descriptions-item label="成功">{{ historyDetailTask.success }}</el-descriptions-item>
            <el-descriptions-item label="失败">{{ historyDetailTask.failed }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ formatIsoTime(historyDetailTask.createdAt) }}</el-descriptions-item>
            <el-descriptions-item label="更新时间">{{ formatIsoTime(historyDetailTask.updatedAt) }}</el-descriptions-item>
          </el-descriptions>

          <el-progress
            :percentage="
              historyDetailTask.total
                ? Math.round(((historyDetailTask.success + historyDetailTask.failed) / historyDetailTask.total) * 100)
                : 0
            "
            :status="historyDetailTask.state === 'failed' ? 'exception' : undefined"
          />

          <p class="task-summary">
            进度：{{ historyDetailTask.success }}/{{ historyDetailTask.total }} ｜ 失败 {{ historyDetailTask.failed }}
          </p>

          <div class="log-panel">
            <div
              v-for="(log, index) in historyDetailTask.logs"
              :key="`${log.time}-${index}`"
              class="log-line"
              :class="{ 'log-error': log.level === 'error' }"
            >
              [{{ log.time }}] {{ log.message }}
            </div>
          </div>
        </template>
      </el-dialog>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { FolderFileItem, FolderItem, PreviewResult, SubtitleItem, UploadTask } from "./api";
import {
  changePassword,
  cookieMeta,
  cookieStatus,
  deleteTask as deleteTaskApi,
  getTask,
  listTasks,
  listFolderFiles,
  login,
  logout,
  me,
  previewSubtitles,
  retryTask,
  saveCookie,
  searchFolders,
  startUpload
} from "./api";

interface TrailNode {
  cid: string;
  name: string;
}

const authenticated = ref(false);
const password = ref("");
const loggingIn = ref(false);
const manageCenterVisible = ref(false);
const currentPassword = ref("");
const newPassword = ref("");
const confirmNewPassword = ref("");
const changingPassword = ref(false);

const cookieInput = ref("");
const savingCookie = ref(false);
const checkingCookie = ref(false);
const cookieCheckMessage = ref("");
const cookieSaved = ref(false);

const template = ref("阿滋漫画大王 S{season:2}E{episode:2} 1080p.x265.FLAC");
const season = ref("01");
const renameMode = ref<"template" | "folder">("template");
const selectedFiles = ref<File[]>([]);

const folderKeyword = ref("");
const searchingFolders = ref(false);
const folders = ref<FolderItem[]>([]);
const selectedFolder = ref<FolderItem | null>(null);
const folderTrail = ref<TrailNode[]>([{ cid: "0", name: "根目录" }]);

const folderFiles = ref<FolderFileItem[]>([]);
const folderFilePage = ref(1);
const folderFilePageSize = ref(20);
const folderFileTotal = ref(0);
const fileKeyword = ref("");
const loadingFolderFiles = ref(false);

const previewing = ref(false);
const previewId = ref("");
const previewItems = ref<SubtitleItem[]>([]);
const previewPage = ref(1);
const previewPageSize = ref(10);
const validCount = ref(0);
const needsFixCount = ref(0);
const manualEpisodes = ref<Record<string, string>>({});
const matchedBaseNames = ref<Record<string, string>>({});
const matchedSourceNames = ref<Record<string, string>>({});
const matchingFolderFiles = ref(false);

const uploading = ref(false);
const currentTask = ref<UploadTask | null>(null);
const retrying = ref(false);
const historyTasks = ref<UploadTask[]>([]);
const historyPage = ref(1);
const historyPageSize = ref(10);
const historyTotal = ref(0);
const loadingHistoryTasks = ref(false);
const historyDetailVisible = ref(false);
const historyDetailTask = ref<UploadTask | null>(null);
let pollTimer: number | null = null;

const currentCid = computed(() => folderTrail.value[folderTrail.value.length - 1]?.cid || "0");

const taskPercent = computed(() => {
  if (!currentTask.value || currentTask.value.total === 0) {
    return 0;
  }
  const done = currentTask.value.success + currentTask.value.failed;
  return Math.round((done / currentTask.value.total) * 100);
});

const previewPagedItems = computed(() => {
  const start = (previewPage.value - 1) * previewPageSize.value;
  const end = start + previewPageSize.value;
  return previewItems.value.slice(start, end);
});

function stopPolling() {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function pollTask(taskId: string) {
  const data = await getTask(taskId);
  currentTask.value = data;
  if (data.state === "completed" || data.state === "failed") {
    stopPolling();
    uploading.value = false;
    retrying.value = false;
    void loadTaskHistory(historyPage.value);
  }
}

function startPolling(taskId: string) {
  stopPolling();
  void pollTask(taskId);
  pollTimer = window.setInterval(() => {
    void pollTask(taskId);
  }, 2000);
}

async function refreshCookieMeta() {
  try {
    const meta = await cookieMeta();
    cookieSaved.value = meta.hasCookie;
  } catch {
    cookieSaved.value = false;
  }
}

async function checkAuth() {
  try {
    await me();
    authenticated.value = true;
    await refreshCookieMeta();
    await loadFolders();
    await loadTaskHistory(1);
  } catch {
    authenticated.value = false;
  }
}

async function doLogin() {
  if (!password.value.trim()) {
    ElMessage.warning("请输入密码");
    return;
  }
  loggingIn.value = true;
  try {
    await login(password.value.trim());
    authenticated.value = true;
    password.value = "";
    await refreshCookieMeta();
    await loadFolders();
    await loadTaskHistory(1);
    ElMessage.success("登录成功");
  } catch (error) {
    ElMessage.error(getError(error));
  } finally {
    loggingIn.value = false;
  }
}

async function doLogout() {
  await logout();
  authenticated.value = false;
  manageCenterVisible.value = false;
  stopPolling();
  currentTask.value = null;
  historyTasks.value = [];
  historyTotal.value = 0;
}

function openManageCenter() {
  manageCenterVisible.value = true;
  void loadTaskHistory(1);
}

async function changePasswordAction() {
  if (!currentPassword.value.trim()) {
    ElMessage.warning("请输入当前密码");
    return;
  }
  if (newPassword.value.length < 6) {
    ElMessage.warning("新密码至少 6 位");
    return;
  }
  if (newPassword.value !== confirmNewPassword.value) {
    ElMessage.warning("两次输入的新密码不一致");
    return;
  }

  changingPassword.value = true;
  try {
    await changePassword({
      currentPassword: currentPassword.value,
      newPassword: newPassword.value
    });
    currentPassword.value = "";
    newPassword.value = "";
    confirmNewPassword.value = "";
    authenticated.value = false;
    stopPolling();
    ElMessage.success("密码修改成功，请重新登录");
  } catch (error) {
    ElMessage.error(getError(error));
  } finally {
    changingPassword.value = false;
  }
}

async function saveCookieAction() {
  if (!cookieInput.value.trim()) {
    ElMessage.warning("请先粘贴 Cookie");
    return;
  }
  savingCookie.value = true;
  try {
    await saveCookie(cookieInput.value.trim());
    cookieInput.value = "";
    await refreshCookieMeta();
    ElMessage.success("Cookie 已保存");
  } catch (error) {
    ElMessage.error(getError(error));
  } finally {
    savingCookie.value = false;
  }
}

async function checkCookie() {
  checkingCookie.value = true;
  try {
    const status = await cookieStatus();
    cookieCheckMessage.value = status.message;
    if (status.valid) {
      ElMessage.success("Cookie 可用");
    } else {
      ElMessage.warning(status.message);
    }
  } catch (error) {
    const msg = getError(error);
    cookieCheckMessage.value = msg;
    ElMessage.error(msg);
  } finally {
    checkingCookie.value = false;
  }
}

function onFolderChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  selectedFiles.value = files.filter((file) => {
    const name = file.name.toLowerCase();
    return [".ass", ".srt", ".ssa"].some((ext) => name.endsWith(ext));
  });

  const ignored = files.length - selectedFiles.value.length;
  if (ignored > 0) {
    ElMessage.info(`已过滤 ${ignored} 个非字幕文件`);
  }
  if (selectedFiles.value.length > 0) {
    ElMessage.success(`已选择 ${selectedFiles.value.length} 个字幕文件`);
  }
}

async function loadFolders() {
  searchingFolders.value = true;
  try {
    folders.value = await searchFolders({
      keyword: folderKeyword.value.trim() || undefined,
      parentId: currentCid.value
    });
  } catch (error) {
    ElMessage.error(getError(error));
  } finally {
    searchingFolders.value = false;
  }
}

function clearSearch() {
  folderKeyword.value = "";
  void loadFolders();
}

function enterFolder(row: FolderItem) {
  folderTrail.value.push({ cid: row.cid, name: row.name });
  folderKeyword.value = "";
  void loadFolders();
}

function goParent() {
  if (folderTrail.value.length <= 1) {
    return;
  }
  folderTrail.value.pop();
  folderKeyword.value = "";
  void loadFolders();
}

function jumpToTrail(index: number) {
  if (index < 0 || index >= folderTrail.value.length) {
    return;
  }
  folderTrail.value = folderTrail.value.slice(0, index + 1);
  folderKeyword.value = "";
  void loadFolders();
}

function selectFolder(row: FolderItem) {
  selectedFolder.value = row;
  folderFilePage.value = 1;
  fileKeyword.value = "";
  void loadFolderFiles(1);
  ElMessage.success(`已选择目录：${row.name}`);
}

async function loadFolderFiles(page = 1) {
  if (!selectedFolder.value) {
    return;
  }

  loadingFolderFiles.value = true;
  try {
    const result = await listFolderFiles({
      cid: selectedFolder.value.cid,
      page,
      limit: folderFilePageSize.value,
      keyword: fileKeyword.value.trim() || undefined
    });
    folderFiles.value = result.items;
    folderFilePage.value = result.page;
    folderFileTotal.value = result.total;
  } catch (error) {
    ElMessage.error(getError(error));
  } finally {
    loadingFolderFiles.value = false;
  }
}

function onFolderFilePageChange(page: number) {
  void loadFolderFiles(page);
}

function clearFileSearch() {
  fileKeyword.value = "";
  void loadFolderFiles(1);
}

function onPreviewPageChange(page: number) {
  previewPage.value = page;
}

async function buildPreview() {
  if (selectedFiles.value.length === 0) {
    ElMessage.warning("请先选择字幕文件夹");
    return;
  }
  if (renameMode.value === "folder" && !selectedFolder.value) {
    ElMessage.warning("目录匹配模式请先选择 115 目录");
    return;
  }

  previewing.value = true;
  try {
    const preview: PreviewResult = await previewSubtitles({
      template: template.value,
      season: season.value,
      files: selectedFiles.value
    });

    previewId.value = preview.previewId;
    previewItems.value = preview.items;
    previewPage.value = 1;
    validCount.value = preview.validCount;
    needsFixCount.value = preview.needsFixCount;

    const initialMap: Record<string, string> = {};
    for (const item of preview.items) {
      initialMap[item.id] = "";
    }
    manualEpisodes.value = initialMap;
    matchedBaseNames.value = {};
    matchedSourceNames.value = {};
    if (renameMode.value === "folder") {
      const count = await matchFromFolderFiles({ silent: true });
      if (count > 0) {
        ElMessage.success(`预览生成成功，已自动匹配 ${count} 个字幕`);
      } else {
        ElMessage.warning("预览已生成，但未匹配到目录视频文件");
      }
    } else {
      ElMessage.success("预览生成成功");
    }
  } catch (error) {
    ElMessage.error(getError(error));
  } finally {
    previewing.value = false;
  }
}

function pad(value: string, width: number): string {
  const cleaned = value.replace(/^0+/, "") || "0";
  return cleaned.padStart(width, "0");
}

function renderTemplateBase(
  templateText: string,
  seasonValue: string,
  episodeValue?: string,
  fallbackEpisodeValue?: string
): string {
  const safeSeason = seasonValue || "01";
  const season2 = pad(safeSeason, 2);
  const episode2 = episodeValue ? pad(episodeValue, 2) : "";

  const withSeason = templateText
    .replace(/\{season:(\d+)\}/gi, (_, width) => pad(safeSeason, Number(width)))
    .replace(/\{season\}/gi, season2)
    .replace(/\{季\}/g, season2);

  const withEpisode = withSeason
    .replace(/\{episode:(\d+)\}/gi, (_, width) => (episodeValue ? pad(episodeValue, Number(width)) : ""))
    .replace(/\{episode\}/gi, episode2)
    .replace(/\{集\}/g, episode2);

  return withEpisode.replace(/&&/g, fallbackEpisodeValue || "").replace(/\s+/g, " ").trim();
}

function detectEpisodeFromName(fileName: string): string | undefined {
  const withoutExt = fileName.replace(/\.[^.]+$/, "");

  const sxe = withoutExt.match(/S(\d{1,2})E(\d{1,3})/i);
  if (sxe?.[2]) {
    return sxe[2].replace(/^0+/, "") || "0";
  }

  const eOnly = withoutExt.match(/(?:^|[^A-Z0-9])EP?(\d{1,3})(?:[^A-Z0-9]|$)/i);
  if (eOnly?.[1]) {
    return eOnly[1].replace(/^0+/, "") || "0";
  }

  const number = withoutExt.match(/(?:^|[^\d])(\d{1,3})(?:[^\d]|$)/);
  if (number?.[1]) {
    return number[1].replace(/^0+/, "") || "0";
  }

  return undefined;
}

const VIDEO_EXTENSIONS = new Set([
  ".mkv",
  ".mp4",
  ".avi",
  ".mov",
  ".wmv",
  ".flv",
  ".ts",
  ".m2ts",
  ".webm",
  ".mpg",
  ".mpeg",
  ".rmvb",
  ".m4v"
]);

function isVideoFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  const dotIndex = lower.lastIndexOf(".");
  if (dotIndex < 0) {
    return false;
  }
  return VIDEO_EXTENSIONS.has(lower.slice(dotIndex));
}

function stripExt(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0) {
    return name;
  }
  return name.slice(0, dotIndex);
}

function getSubEpisode(item: SubtitleItem): string | undefined {
  const manual = (manualEpisodes.value[item.id] || "").trim();
  const raw = manual || item.detectedEpisode || item.fallbackEpisode;
  if (!raw) {
    return undefined;
  }
  return raw.replace(/^0+/, "") || "0";
}

async function fetchAllFolderFilesForMatch(): Promise<FolderFileItem[]> {
  if (!selectedFolder.value) {
    return [];
  }

  const firstPage = await listFolderFiles({
    cid: selectedFolder.value.cid,
    page: 1,
    limit: 100
  });

  const allItems = [...firstPage.items];
  const totalPages = Math.max(1, Math.ceil((firstPage.total || 0) / firstPage.limit));

  for (let page = 2; page <= totalPages; page += 1) {
    const pageResult = await listFolderFiles({
      cid: selectedFolder.value.cid,
      page,
      limit: 100
    });
    allItems.push(...pageResult.items);
  }

  return allItems;
}

async function matchFromFolderFiles(options: { silent?: boolean } = {}) {
  const { silent = false } = options;
  if (!previewItems.value.length) {
    if (!silent) {
      ElMessage.warning("请先生成字幕预览");
    }
    return 0;
  }
  if (!selectedFolder.value) {
    if (!silent) {
      ElMessage.warning("请先选择 115 目录");
    }
    return 0;
  }
  matchingFolderFiles.value = true;
  try {
    const filesForMatch = (await fetchAllFolderFilesForMatch()).filter((item) => isVideoFileName(item.name));
    if (!filesForMatch.length) {
      if (!silent) {
        ElMessage.warning("当前目录下没有可匹配的视频文件");
      }
      return 0;
    }

    const map = new Map<string, FolderFileItem>();
    for (const file of filesForMatch) {
      const episode = detectEpisodeFromName(file.name);
      if (!episode || map.has(episode)) {
        continue;
      }
      map.set(episode, file);
    }

    const matchedBase: Record<string, string> = {};
    const matchedSource: Record<string, string> = {};

    for (const item of previewItems.value) {
      const episode = getSubEpisode(item);
      if (!episode) {
        continue;
      }
      const matchedFile = map.get(episode);
      if (!matchedFile) {
        continue;
      }
      matchedBase[item.id] = stripExt(matchedFile.name);
      matchedSource[item.id] = matchedFile.name;
    }

    matchedBaseNames.value = matchedBase;
    matchedSourceNames.value = matchedSource;

    const count = Object.keys(matchedBase).length;
    if (!silent) {
      ElMessage.success(`已按视频文件名匹配 ${count} 个字幕`);
    }
    return count;
  } catch (error) {
    if (!silent) {
      ElMessage.error(getError(error));
    }
    return 0;
  } finally {
    matchingFolderFiles.value = false;
  }
}

function clearMatchedNames() {
  matchedBaseNames.value = {};
  matchedSourceNames.value = {};
  ElMessage.success("已清空匹配结果");
}

function renderLiveName(row: SubtitleItem): string {
  const matchedBase = matchedBaseNames.value[row.id];
  if (matchedBase) {
    return `${matchedBase}${row.ext}`;
  }

  const manual = (manualEpisodes.value[row.id] || "").trim();
  const episode = manual || row.detectedEpisode || "";
  const fallback = manual || row.fallbackEpisode || "";

  const base = renderTemplateBase(template.value, season.value, episode, fallback);
  return `${base}${row.ext}`;
}

function rowStatusText(row: SubtitleItem): string {
  if (matchedBaseNames.value[row.id]) {
    return "可上传";
  }

  const manual = (manualEpisodes.value[row.id] || "").trim();
  if (manual) {
    return "可上传";
  }
  if (row.status === "ready") {
    return "可上传";
  }
  return "需修正";
}

function rowStatusClass(row: SubtitleItem): string {
  return rowStatusText(row) === "可上传" ? "status-ready" : "status-manual";
}

async function startUploadAction() {
  if (!previewId.value) {
    ElMessage.warning("请先生成预览");
    return;
  }
  if (!selectedFolder.value) {
    ElMessage.warning("请先选择 115 目录");
    return;
  }
  if (renameMode.value === "folder" && Object.keys(matchedBaseNames.value).length === 0) {
    const count = await matchFromFolderFiles({ silent: true });
    if (count === 0) {
      ElMessage.warning("目录匹配模式未匹配到视频文件，请检查目录或命名");
      return;
    }
  }

  const manualMap: Record<string, string> = {};
  for (const item of previewItems.value) {
    const value = (manualEpisodes.value[item.id] || "").trim();
    if (value) {
      manualMap[item.id] = value;
    }
  }

  uploading.value = true;
  try {
    const { taskId } = await startUpload({
      previewId: previewId.value,
      cid: selectedFolder.value.cid,
      template: template.value,
      season: season.value,
      manualEpisodes: manualMap,
      customBaseNames: matchedBaseNames.value
    });
    startPolling(taskId);
    void loadTaskHistory(1);
    ElMessage.success("上传任务已启动");
  } catch (error) {
    uploading.value = false;
    ElMessage.error(getError(error));
  }
}

async function retryFailedItems() {
  if (!currentTask.value) {
    return;
  }

  retrying.value = true;
  try {
    const { taskId } = await retryTask(currentTask.value.id);
    startPolling(taskId);
    void loadTaskHistory(1);
    ElMessage.success("重试任务已启动");
  } catch (error) {
    retrying.value = false;
    ElMessage.error(getError(error));
  }
}

async function loadTaskHistory(page = 1) {
  loadingHistoryTasks.value = true;
  try {
    const result = await listTasks({
      page,
      limit: historyPageSize.value
    });
    historyTasks.value = result.items;
    historyTotal.value = result.total;
    historyPage.value = result.page;
  } catch (error) {
    ElMessage.error(getError(error));
  } finally {
    loadingHistoryTasks.value = false;
  }
}

function onHistoryPageChange(page: number) {
  void loadTaskHistory(page);
}

async function openHistoryTask(taskId: string) {
  try {
    const task = await getTask(taskId);
    historyDetailTask.value = task;
    historyDetailVisible.value = true;
  } catch (error) {
    ElMessage.error(getError(error));
  }
}

async function deleteHistoryTask(taskId: string) {
  try {
    await ElMessageBox.confirm("确认删除该任务历史吗？进行中的任务不可删除。", "删除确认", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消"
    });
    await deleteTaskApi(taskId);
    if (currentTask.value?.id === taskId) {
      currentTask.value = null;
      stopPolling();
    }
    if (historyDetailTask.value?.id === taskId) {
      historyDetailTask.value = null;
      historyDetailVisible.value = false;
    }
    await loadTaskHistory(historyPage.value);
    ElMessage.success("任务历史已删除");
  } catch (error) {
    if (typeof error === "string" && error === "cancel") {
      return;
    }
    const maybe = error as { message?: string };
    if (maybe?.message === "cancel") {
      return;
    }
    ElMessage.error(getError(error));
  }
}

function formatSize(size: number): string {
  if (!size || size <= 0) {
    return "-";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatTime(ts?: number): string {
  if (!ts || ts <= 0) {
    return "-";
  }
  const date = new Date(ts * 1000);
  return formatDateTime(date);
}

function formatIsoTime(value: string): string {
  const date = new Date(value);
  return formatDateTime(date);
}

function formatDateTime(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

function getError(error: unknown): string {
  if (typeof error === "object" && error && "response" in error) {
    const maybeResponse = error as {
      response?: {
        data?: { message?: string };
      };
    };
    return maybeResponse.response?.data?.message || "请求失败";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "请求失败";
}

onMounted(() => {
  void checkAuth();
});

onUnmounted(() => {
  stopPolling();
});

watch(renameMode, (mode) => {
  if (mode === "template") {
    matchedBaseNames.value = {};
    matchedSourceNames.value = {};
  }
});
</script>
