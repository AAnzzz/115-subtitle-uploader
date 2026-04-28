# 115 Cookie 字幕批量上传工具

单用户 Web 工具：登录后保存 115 Cookie、批量重命名字幕、上传到 115 指定目录。

## 主要功能
- 管理员密码登录（默认首次为 `admin123`）
- 管理中心（非一级区域）
  - 修改管理员密码
  - 查看任务历史（分页）
  - 删除任务历史（进行中任务不可删除）
- 115 Cookie 保存与可用性验证
- 目录选择支持子目录导航与搜索
- 目录文件列表分页
- 本地字幕文件夹上传（`.ass/.srt/.ssa`）
- 两种重命名模式
  - 按模板重命名
  - 按目录视频文件名匹配（仅匹配视频扩展名，不匹配 `.jpg` 等）
- 预览表格分页
- 批量上传任务进度、日志、失败重试
- 重名自动加后缀：`name (1).ext`、`name (2).ext`
- 登录接口限流（防暴力尝试）
- 预览/任务临时目录自动清理（防磁盘堆积）

## 重命名占位符
支持两套写法：
- 简写：`{季}`、`{集}`
- 完整：`{season:2}`、`{episode:2}`、`{season}`、`{episode}`
- 兜底：`&&`（使用从源文件识别到的原始集号串）

示例模板：
`阿滋漫画大王 S{season:2}E{episode:2} 1080p.x265.FLAC`

## 技术栈
- 前端：Vue 3 + Vite + Element Plus
- 后端：Fastify + TypeScript + SQLite (better-sqlite3)
- 上传执行器：`fake115uploader`（Cookie 方式）
- 依赖已精简：移除未使用的 `pinia`、`vue-router`、`@element-plus/icons-vue`、`nanoid`

## 本地开发

### 上传器二进制（无需全局安装）
放置到：
- Windows: `backend/bin/fake115uploader.exe`
- Linux/macOS: `backend/bin/fake115uploader`

后端会自动探测该路径，也可通过 `FAKE115_BIN` 覆盖。

### Backend
```bash
cd backend
npm install
npm run dev
```

可用脚本：
- `npm run dev`：开发模式
- `npm run typecheck`：仅类型检查
- `npm run build`：构建到 `dist/`
- `npm run start`：运行构建产物
- `npm run test`：构建 + 单元测试

### Frontend
```bash
cd frontend
npm install
npm run dev
```

可用脚本：
- `npm run dev`：开发模式
- `npm run typecheck`：仅类型检查
- `npm run build`：类型检查 + 生产构建
- `npm run preview`：预览构建产物

## Docker 部署（Debian 12 VPS）
1. 修改 `docker-compose.yml` 关键环境变量：
- `APP_PASSWORD`
- `ENCRYPTION_KEY`
- `CORS_ORIGIN`
- `COOKIE_SECURE`（HTTPS 反代后应为 `true`）
- 可选：`UPLOAD_CONCURRENCY`、`UPLOAD_RETRY`、`UPLOAD_RETRY_DELAY_MS`
- 可选：`LOGIN_RATE_LIMIT_MAX`、`LOGIN_RATE_LIMIT_WINDOW_MS`
- 可选：`CLEANUP_INTERVAL_MS`、`PREVIEW_TTL_MS`、`TASK_WORKSPACE_TTL_MS`

2. 启动：
```bash
docker compose up -d --build
```

3. 访问：
`http://<YOUR_VPS_IP>:3000`

## 自动化发布（减少手工上传）
推荐：把代码托管到 GitHub，然后由 CI 自动打包镜像到 GHCR，VPS 只做拉取更新。

项目已提供工作流：
- `.github/workflows/docker-image.yml`
- `.github/workflows/dockerhub-image.yml`

流程：
1. 推送代码到 GitHub（`main` 分支或 `v*` tag）。
2. GitHub Actions 自动构建并推送镜像：
   - `ghcr.io/<你的用户名>/115-subtitle-uploader:latest`
3. Dockge 的 Stack 改用 `image:` 而不是 `build:`：
   - `image: ghcr.io/<你的用户名>/115-subtitle-uploader:latest`
4. 每次更新只需在 Dockge 执行 `Pull` + `Recreate`（无需手工打包上传 VPS）。

Docker Hub 自动发布配置：
1. 在 GitHub 仓库 `Settings -> Secrets and variables -> Actions` 新增 secrets：
   - `DOCKERHUB_USERNAME`
   - `DOCKERHUB_TOKEN`（Docker Hub Access Token）
2. 推送到 `main` 或打 `v*` tag 后，会自动推送镜像到：
   - `<DOCKERHUB_USERNAME>/115-subtitle-uploader`

## 任务执行说明
- 关闭浏览器页面后，任务仍会继续执行。
- 仅当 VPS 上后端进程（或容器）停止时，任务才会中断。

## API
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/password`（修改管理员密码）
- `GET /api/115/cookie/status`
- `GET /api/115/cookie/meta`
- `PUT /api/115/cookie`
- `GET /api/115/folders?keyword=&parentId=&page=`
- `GET /api/115/files?cid=&page=&limit=&keyword=`
- `POST /api/subtitles/preview`
- `POST /api/subtitles/upload`
- `GET /api/tasks?page=&limit=`
- `GET /api/tasks/:id`
- `POST /api/tasks/:id/retry`
- `DELETE /api/tasks/:id`

## 安全与存储
- 115 Cookie 以 AES-GCM 加密后存入 SQLite
- 管理员密码以 `scrypt + salt` 哈希存储（非明文）
- 上传器调用改为临时配置文件传 Cookie，避免命令行参数直接暴露 Cookie
- 数据库文件：`backend/data/app.db`（或 `DATA_DIR` 指定目录）
- 生产环境建议放在 HTTPS 反向代理后（Nginx/Caddy）
