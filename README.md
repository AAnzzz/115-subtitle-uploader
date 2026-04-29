# 115 Subtitle Uploader

一个面向单用户场景的 115 字幕批量上传工具。  
核心流程是保存 115 Cookie，选择 115 目录，导入本地字幕，预览重命名结果，然后批量上传。

## 功能

- 管理员登录与密码修改
- 115 Cookie 保存与有效性验证
- 115 目录搜索、子目录浏览、目录文件分页查看
- 本地字幕文件夹导入，支持 `.ass`、`.srt`、`.ssa`
- 两种重命名方式
  - 按模板重命名
  - 按目录内视频文件名自动匹配
- 上传前预览、手动修正集数、冲突自动重命名
- 任务历史、失败重试、详细日志
- 暗色模式切换

## 稳定性

- 上传任务状态实时写入 SQLite
- 服务或容器重启后可恢复未完成任务
- Cookie 使用加密存储
- 管理员密码使用哈希存储

## Docker Compose 部署

默认推荐直接使用 Docker Hub 镜像：

```yaml
services:
  app:
    image: anzzzzz/115-subtitle-uploader:latest
    container_name: subtitle-115-app
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      APP_PASSWORD: "请改成你的密码"
      ENCRYPTION_KEY: "请改成至少16位随机字符串"
      CORS_ORIGIN: "http://localhost:3000"
      ENFORCE_ORIGIN_CHECK: "true"
    volumes:
      - ./data:/app/backend/data
```

启动：

```bash
docker compose up -d
```

## 部署说明

- `APP_PASSWORD` 与 `ENCRYPTION_KEY` 必须修改后再启动
- `./data:/app/backend/data` 用于持久化 Cookie、任务历史与数据库
- 如果你不是通过 `http://localhost:3000` 访问，而是通过服务器 IP 或域名访问，需要把 `CORS_ORIGIN` 改成实际访问地址

## 适用场景

- 批量整理番剧、剧集、电影字幕
- 按季集号统一命名字幕
- 根据网盘目录中的视频文件名自动对齐字幕文件名
