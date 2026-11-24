# 影之身 (theme-twin)

视频 → 同类题材孪生视频，**音轨不变**。**打开即用**：本地默认；选视频自动分析+生成；云端无密钥回落本地。

## 平台

- 移动：Capacitor 6（`CapacitorHttp` 已开，便于直连云 API）
- 手表 / 戒指 / 手杖：同前；戒指下倾可切换引擎

## 云端流水线

1. 帧采样 + 题材 prompt（`src/prompt.js`）
2. Runway / 可灵 / Seedance（fal `seedance-2.0` 或 Runway `seedance2`）
3. 下载成片 → `remuxKeepOriginalAudio` 贴回原片音轨
4. 密钥仅 `localStorage`

HTML / `src/` 变更后：`npm run build`，再 `npx cap sync`。

## Harness / Loop（助手）

- 遵循根 `/Users/skat/AGENTS.md`：**Harness Engineering** + **Loop Engineering**
- Guide = 本文件；Sensor = 下方验证命令；同类失误第二次须沉淀规则或测试（棘轮）
- 开干前写清 **Done**；每切片过验证环；显式停止（成功 / 上限 / 无进展 / 人审）
- 详解：`docs/HARNESS_ENGINEERING.md`、`docs/LOOP_ENGINEERING.md`

## 验证环 / Done

```bash
npm install
npm test          # 若有
npm run build     # 或 build:web
npx cap sync android   # 若有 android/
# 可选：JAVA_HOME=…/openjdk@17 npm run apk:debug
```

**Done 示例**：测试通过（若有）+ web 产物进 `www/`/`dist/` + `cap sync` 无报错。可选穿戴未做可搁置，不纳入强制 Done。
