# 影之身 (theme-twin)

输入一段视频 → 自动识别题材 → 生成同类题材新画面 → **音轨原样保留**。

**打开即用**：默认本地引擎，选视频后自动分析并生成；云端未配密钥时自动回落本地。引擎 / 密钥收在「高级选项」。

默认交付：**Android / iOS** + **手表 / 戒指 / 手杖**；网页仅调试。

## 生成引擎

| 引擎 | 说明 |
|------|------|
| **本地风格** | Canvas 离线孪生，不耗 API |
| **Runway** | `image_to_video`（默认）或 `video_to_video`（Aleph）；密钥存在本机 |
| **可灵 Kling** | `image2video`，强制 `sound: off`，再贴回原片音轨 |
| **Seedance** | fal.ai Seedance 2.0（默认）或 Runway `seedance2`；`generate_audio=false` |

云端流程：抽关键帧 → 按题材拼 prompt → 轮询任务 → 下载成片 → **丢弃模型音轨，MediaRecorder 贴回原声**。

## 流水线

1. **选视频** — 相册 / 文件 / 拖放（自动分析并生成）
2. **识别题材** — 色板 / 亮度 / 冷暖 / 动感 → 风格
3. **可选**：高级里换引擎 + 填密钥
4. **预览 / 下载** / IndexedDB

桌面批量（本地 ffmpeg 风格，非云端）：

```bash
npm run twin -- input.mp4 --out twin.mp4 --style cinematic
```

## 密钥

- Runway：`https://dev.runwayml.com` → API Secret → App 内「引擎密钥」
- 可灵：开发者后台 Access Key + Secret Key（JWT HS256）
- Seedance：fal.ai Key（[fal.ai](https://fal.ai)），或复用 Runway Key 走 `seedance2`
- 仅存 `localStorage`，不上传到影之身服务器

浏览器直接调云 API 可能遇 CORS；**Android / iOS 已启用 CapacitorHttp** 绕过。

## 命令

```bash
npm install
npm test
npm run build
npm start
npm run sync:android
npm run sync:ios
```

## 结构

```
src/
  analyze.js / themes.js / prompt.js / generate.js
  settings.js
  providers/
    index.js      # 引擎编排 + 原声 remux
    runway.js     # Runway I2V / V2V
    kling.js      # 可灵 image2video
    seedance.js   # fal Seedance 2.0 / Runway seedance2
    cloud.js      # 贴回原声音轨
    jwt.js / http.js / frames.js
```
