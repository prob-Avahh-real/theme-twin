import { analyzeVideo } from './analyze.js';
import { paintFrame } from './generate.js';
import { THEME_IDS, THEME_META, themeLabel } from './themes.js';
import { twinFilename, downloadBlob, looksLikeVideoBlob } from './remux.js';
import { saveTwin, listTwins, deleteTwin, makeId } from './library.js';
import { createWearableInput } from './wearable-input.js';
import { loadSettings, saveSettings, PROVIDERS, resolveProvider } from './settings.js';
import { generateTwinWithProvider } from './providers/index.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  file: null,
  sourceUrl: null,
  profile: null,
  themeId: 'cinematic',
  seed: 1,
  twinBlob: null,
  twinUrl: null,
  busy: false,
  abort: null,
  settings: loadSettings(),
};

const els = {
  file: $('#fileInput'),
  pick: $('#pickBtn'),
  again: $('#againBtn'),
  sourceVideo: $('#sourceVideo'),
  previewCanvas: $('#previewCanvas'),
  twinVideo: $('#twinVideo'),
  stageHint: $('#stageHint'),
  status: $('#status'),
  progress: $('#progress'),
  progressFill: $('#progressFill'),
  themeGrid: $('#themeGrid'),
  engineGrid: $('#engineGrid'),
  analyzeBtn: $('#analyzeBtn'),
  generateBtn: $('#generateBtn'),
  downloadBtn: $('#downloadBtn'),
  reshuffleBtn: $('#reshuffleBtn'),
  settingsBtn: $('#settingsBtn'),
  settingsPanel: $('#settingsPanel'),
  advancedToggle: $('#advancedToggle'),
  advancedPanel: $('#advancedPanel'),
  saveSettingsBtn: $('#saveSettingsBtn'),
  closeSettingsBtn: $('#closeSettingsBtn'),
  stage: $('#stage'),
  library: $('#library'),
  wearBtn: $('#wearBtn'),
  meta: $('#meta'),
  runwayApiKey: $('#runwayApiKey'),
  runwayMode: $('#runwayMode'),
  runwayModel: $('#runwayModel'),
  klingAccessKey: $('#klingAccessKey'),
  klingSecretKey: $('#klingSecretKey'),
  klingModel: $('#klingModel'),
  klingMode: $('#klingMode'),
  klingBaseUrl: $('#klingBaseUrl'),
  settingsRunway: $('#settingsRunway'),
  settingsKling: $('#settingsKling'),
  settingsSeedance: $('#settingsSeedance'),
  seedanceGateway: $('#seedanceGateway'),
  seedanceFalKey: $('#seedanceFalKey'),
  seedanceModel: $('#seedanceModel'),
  seedanceResolution: $('#seedanceResolution'),
  seedanceMode: $('#seedanceMode'),
};

function setStatus(text) {
  els.status.textContent = text || '';
}

function setProgress(p, show = true) {
  els.progress.hidden = !show;
  els.progressFill.style.width = `${Math.round(clamp01(p) * 100)}%`;
}

function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}

function setBusy(busy) {
  state.busy = busy;
  els.analyzeBtn.disabled = busy || !state.file;
  els.generateBtn.disabled = busy || !state.profile;
  els.downloadBtn.disabled = busy || !state.twinBlob;
  els.again.disabled = busy || !state.file;
  els.reshuffleBtn.disabled = busy || !state.profile;
  els.pick.disabled = busy;
  els.settingsBtn.disabled = busy;
  els.advancedToggle.disabled = busy;
}

function revoke(url) {
  if (url) URL.revokeObjectURL(url);
}

function showHint(show) {
  els.stageHint.hidden = !show;
}

function effectiveProvider() {
  return resolveProvider(state.settings);
}

function renderThemes() {
  els.themeGrid.innerHTML = THEME_IDS.map((id) => {
    const m = THEME_META[id];
    const active = id === state.themeId ? 'is-active' : '';
    return `<button type="button" class="theme-chip ${active}" data-theme="${id}">
      <span class="theme-chip__label">${m.label}</span>
      <span class="theme-chip__blurb">${m.blurb}</span>
    </button>`;
  }).join('');
}

function renderEngines() {
  els.engineGrid.innerHTML = PROVIDERS.map((p) => {
    const active = p.id === state.settings.provider ? 'is-active' : '';
    return `<button type="button" class="engine-chip ${active}" data-provider="${p.id}">
      <span class="engine-chip__label">${p.label}</span>
      <span class="engine-chip__blurb">${p.blurb}</span>
    </button>`;
  }).join('');
  syncSettingsVisibility();
}

function syncSettingsVisibility() {
  const p = state.settings.provider;
  els.settingsRunway.style.display = p === 'runway' ? 'block' : 'none';
  els.settingsKling.style.display = p === 'kling' ? 'block' : 'none';
  els.settingsSeedance.style.display = p === 'seedance' ? 'block' : 'none';
}

function fillSettingsForm() {
  const s = state.settings;
  els.runwayApiKey.value = s.runwayApiKey || '';
  els.runwayMode.value = s.runwayMode || 'i2v';
  els.runwayModel.value = s.runwayModel || 'gen4_turbo';
  els.klingAccessKey.value = s.klingAccessKey || '';
  els.klingSecretKey.value = s.klingSecretKey || '';
  els.klingModel.value = s.klingModel || 'kling-v2-1';
  els.klingMode.value = s.klingMode || 'std';
  els.klingBaseUrl.value = s.klingBaseUrl || 'https://api-beijing.klingai.com';
  els.seedanceGateway.value = s.seedanceGateway || 'fal';
  els.seedanceFalKey.value = s.seedanceFalKey || '';
  els.seedanceModel.value = s.seedanceModel || 'bytedance/seedance-2.0/image-to-video';
  els.seedanceResolution.value = s.seedanceResolution || '720p';
  els.seedanceMode.value = s.seedanceMode || 'i2v';
  syncSettingsVisibility();
}

function readSettingsForm() {
  return {
    runwayApiKey: els.runwayApiKey.value.trim(),
    runwayMode: els.runwayMode.value,
    runwayModel: els.runwayModel.value,
    klingAccessKey: els.klingAccessKey.value.trim(),
    klingSecretKey: els.klingSecretKey.value.trim(),
    klingModel: els.klingModel.value,
    klingMode: els.klingMode.value,
    klingBaseUrl: els.klingBaseUrl.value.trim() || 'https://api-beijing.klingai.com',
    seedanceGateway: els.seedanceGateway.value,
    seedanceFalKey: els.seedanceFalKey.value.trim(),
    seedanceModel: els.seedanceModel.value,
    seedanceResolution: els.seedanceResolution.value,
    seedanceMode: els.seedanceMode.value,
  };
}

function updateMeta() {
  if (!state.profile) {
    els.meta.textContent = '打开即用：选视频后自动识别题材并本地生成；未配密钥的云端引擎会自动回落本地。';
    return;
  }
  const s = state.profile.stats;
  const wanted = state.settings.provider;
  const used = effectiveProvider();
  const eng = PROVIDERS.find((p) => p.id === used)?.label || used;
  const fallback = wanted !== used ? `（${wanted} 无密钥→本地）` : '';
  els.meta.textContent = `${eng}${fallback} · ${themeLabel(state.themeId)} · ${state.profile.duration.toFixed(1)}s · 种子 ${state.seed}`;
}

function fitCanvas(video) {
  const maxW = 960;
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const scale = Math.min(1, maxW / vw);
  els.previewCanvas.width = Math.round(vw * scale);
  els.previewCanvas.height = Math.round(vh * scale);
}

function previewTheme() {
  if (!state.profile) return;
  const ctx = els.previewCanvas.getContext('2d');
  const t = (performance.now() / 1000) % Math.max(1, state.profile.duration);
  paintFrame(ctx, els.previewCanvas.width, els.previewCanvas.height, t, state.profile, state.themeId, state.seed);
}

let previewRaf = 0;
function startPreviewLoop() {
  cancelAnimationFrame(previewRaf);
  const loop = () => {
    previewTheme();
    previewRaf = requestAnimationFrame(loop);
  };
  previewRaf = requestAnimationFrame(loop);
}

function stopPreviewLoop() {
  cancelAnimationFrame(previewRaf);
}

async function onFile(file) {
  if (!file || !file.type.startsWith('video/')) {
    setStatus('请选择视频文件');
    return;
  }
  revoke(state.sourceUrl);
  revoke(state.twinUrl);
  state.file = file;
  state.sourceUrl = URL.createObjectURL(file);
  state.profile = null;
  state.twinBlob = null;
  state.twinUrl = null;
  state.seed = 1 + Math.floor(Math.random() * 99);
  els.sourceVideo.src = state.sourceUrl;
  els.twinVideo.removeAttribute('src');
  els.twinVideo.load();
  els.stage.dataset.mode = 'source';
  showHint(false);
  updateMeta();
  await els.sourceVideo.play().catch(() => {});
  els.sourceVideo.pause();
  // Instant pipeline: analyze → generate
  await runInstantPipeline();
}

async function runAnalyze({ silent = false } = {}) {
  if (!state.file) return false;
  if (!silent) {
    setBusy(true);
    setStatus('正在识别题材…');
    setProgress(0, true);
  }
  try {
    await ensureVideoReady(els.sourceVideo);
    fitCanvas(els.sourceVideo);
    const profile = await analyzeVideo(els.sourceVideo, (p) => {
      if (!silent) setProgress(p * 0.35);
      else setProgress(p * 0.35);
    });
    state.profile = profile;
    state.themeId = profile.themeId;
    renderThemes();
    updateMeta();
    els.stage.dataset.mode = 'preview';
    startPreviewLoop();
    if (!silent) setStatus(`题材：${themeLabel(profile.themeId)}`);
    return true;
  } catch (err) {
    console.error(err);
    setStatus(`分析失败：${err.message || err}`);
    return false;
  } finally {
    if (!silent) {
      setProgress(0, false);
      setBusy(false);
    }
  }
}

function createWorkVideo() {
  const v = document.createElement('video');
  v.src = state.sourceUrl;
  v.playsInline = true;
  v.preload = 'auto';
  v.crossOrigin = 'anonymous';
  return v;
}

function phaseLabel(phase) {
  if (!phase) return '';
  if (phase.startsWith('runway:')) return `Runway ${phase.slice(7)}`;
  if (phase.startsWith('kling:')) return `可灵 ${phase.slice(6)}`;
  if (phase.startsWith('seedance:')) return `Seedance ${phase.slice(9)}`;
  if (phase.startsWith('remux')) return '贴回原声';
  if (phase === 'record') return '本地录制';
  return phase;
}

async function runGenerate({ fromInstant = false } = {}) {
  if (!state.profile) return;
  if (state.busy && !fromInstant) return;

  const wanted = state.settings.provider || 'local';
  const provider = effectiveProvider();
  if (wanted !== provider) {
    setStatus(`${wanted} 未配置密钥，改用本地即时生成…`);
  }

  if (!fromInstant) {
    setBusy(true);
    setProgress(0, true);
  }
  stopPreviewLoop();
  setStatus(provider === 'local' ? '正在本地生成孪生片…' : `云端 ${provider} 生成中…`);
  state.abort = new AbortController();

  const workVideo = createWorkVideo();
  try {
    await ensureVideoReady(workVideo);
    fitCanvas(workVideo);
    const result = await generateTwinWithProvider({
      provider,
      video: workVideo,
      canvas: els.previewCanvas,
      profile: state.profile,
      themeId: state.themeId,
      settings: state.settings,
      seed: state.seed,
      sourceUrl: state.sourceUrl,
      sourceFile: state.file,
      signal: state.abort.signal,
      onProgress: (p, phase) => {
        setProgress(fromInstant ? 0.35 + p * 0.65 : p);
        if (phase) setStatus(`${phaseLabel(phase)}… ${Math.round(p * 100)}%`);
      },
    });

    if (!looksLikeVideoBlob(result.blob)) throw new Error('导出结果无效');

    revoke(state.twinUrl);
    state.twinBlob = result.blob;
    state.twinUrl = URL.createObjectURL(result.blob);
    els.twinVideo.src = state.twinUrl;
    els.stage.dataset.mode = 'twin';
    setStatus(`完成 · 音轨已保留 · 点播放预览或下载`);
    els.twinVideo.play().catch(() => {});

    await saveTwin({
      id: makeId(),
      createdAt: Date.now(),
      themeId: state.themeId,
      seed: state.seed,
      provider: result.provider,
      model: result.model,
      sourceName: state.file?.name || 'video',
      duration: result.duration || state.profile.duration,
      blob: result.blob,
    });
    await refreshLibrary();
  } catch (err) {
    if (err?.name === 'AbortError') setStatus('已取消');
    else {
      console.error(err);
      setStatus(`生成失败：${err.message || err}`);
    }
    if (state.profile) startPreviewLoop();
  } finally {
    workVideo.removeAttribute('src');
    workVideo.load();
    setProgress(0, false);
    setBusy(false);
    state.abort = null;
  }
}

/** One-shot: pick video → analyze → generate */
async function runInstantPipeline() {
  if (!state.file || state.busy) return;
  setBusy(true);
  setProgress(0, true);
  setStatus('打开即用：识别题材中…');
  try {
    const ok = await runAnalyze({ silent: true });
    if (!ok || !state.profile) return;
    setStatus('打开即用：正在生成孪生片…');
    await runGenerate({ fromInstant: true });
  } finally {
    setBusy(false);
    setProgress(0, false);
  }
}

async function runAgain() {
  if (!state.file || state.busy) return;
  state.seed = 1 + Math.floor(Math.random() * 999);
  updateMeta();
  if (!state.profile) {
    await runInstantPipeline();
    return;
  }
  await runGenerate();
}

function ensureVideoReady(video) {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onMeta = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('视频无法加载'));
    };
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('error', onErr);
    };
    video.addEventListener('loadedmetadata', onMeta, { once: true });
    video.addEventListener('error', onErr, { once: true });
  });
}

function cycleTheme(dir) {
  const i = THEME_IDS.indexOf(state.themeId);
  const next = THEME_IDS[(i + dir + THEME_IDS.length) % THEME_IDS.length];
  state.themeId = next;
  renderThemes();
  updateMeta();
}

function cycleEngine(dir) {
  const ids = PROVIDERS.map((p) => p.id);
  const i = ids.indexOf(state.settings.provider);
  const next = ids[(i + dir + ids.length) % ids.length];
  state.settings = saveSettings({ provider: next });
  renderEngines();
  updateMeta();
}

function reshuffle() {
  state.seed = 1 + Math.floor(Math.random() * 999);
  updateMeta();
  setStatus(`新种子 ${state.seed}`);
}

function download() {
  if (!state.twinBlob) return;
  downloadBlob(state.twinBlob, twinFilename(state.file?.name, state.themeId));
}

async function refreshLibrary() {
  const rows = await listTwins();
  if (!rows.length) {
    els.library.innerHTML = '<p class="lib-empty">尚无成片</p>';
    return;
  }
  els.library.innerHTML = rows
    .slice(0, 12)
    .map(
      (r) => `<article class="lib-card" data-id="${r.id}">
      <div class="lib-card__body">
        <strong>${themeLabel(r.themeId)} · ${r.provider || 'local'}</strong>
        <span>${r.sourceName || 'video'} · ${(r.duration || 0).toFixed(1)}s</span>
      </div>
      <div class="lib-card__actions">
        <button type="button" data-act="play">播放</button>
        <button type="button" data-act="dl">下载</button>
        <button type="button" data-act="del">删</button>
      </div>
    </article>`,
    )
    .join('');
}

async function onLibraryClick(e) {
  const card = e.target.closest('.lib-card');
  if (!card) return;
  const act = e.target.getAttribute('data-act');
  if (!act) return;
  const rows = await listTwins();
  const row = rows.find((r) => r.id === card.dataset.id);
  if (!row) return;
  if (act === 'play' && row.blob) {
    revoke(state.twinUrl);
    state.twinBlob = row.blob;
    state.twinUrl = URL.createObjectURL(row.blob);
    els.twinVideo.src = state.twinUrl;
    els.stage.dataset.mode = 'twin';
    showHint(false);
    els.twinVideo.play().catch(() => {});
  } else if (act === 'dl' && row.blob) {
    downloadBlob(row.blob, twinFilename(row.sourceName, row.themeId));
  } else if (act === 'del') {
    await deleteTwin(row.id);
    await refreshLibrary();
  }
}

function togglePlayback() {
  const v = els.stage.dataset.mode === 'twin' ? els.twinVideo : els.sourceVideo;
  if (v.paused) v.play().catch(() => {});
  else v.pause();
}

function openPicker() {
  if (state.busy) return;
  els.file.click();
}

const wear = createWearableInput({
  onRingShake: () => {
    if (state.busy) return;
    if (state.twinBlob) togglePlayback();
    else if (state.file) runAgain();
    else openPicker();
  },
  onRingTiltLeft: () => cycleTheme(-1),
  onRingTiltRight: () => cycleTheme(1),
  onRingTiltUp: () => togglePlayback(),
  onRingTiltDown: () => cycleEngine(1),
  onCaneTap: () => {
    if (state.busy) return;
    if (state.twinBlob) togglePlayback();
    else if (state.file) runAgain();
    else openPicker();
  },
  onCaneSwingLeft: () => cycleTheme(-1),
  onCaneSwingRight: () => cycleTheme(1),
});

els.pick.addEventListener('click', openPicker);
els.again.addEventListener('click', runAgain);
els.file.addEventListener('change', () => onFile(els.file.files?.[0]));
els.analyzeBtn.addEventListener('click', () => runAnalyze());
els.generateBtn.addEventListener('click', () => runGenerate());
els.downloadBtn.addEventListener('click', download);
els.reshuffleBtn.addEventListener('click', reshuffle);
els.advancedToggle.addEventListener('click', () => {
  els.advancedPanel.hidden = !els.advancedPanel.hidden;
  els.advancedToggle.textContent = els.advancedPanel.hidden
    ? '高级选项（引擎 / 风格 / 密钥）'
    : '收起高级选项';
});
els.settingsBtn.addEventListener('click', () => {
  els.settingsPanel.hidden = !els.settingsPanel.hidden;
  if (!els.settingsPanel.hidden) fillSettingsForm();
});
els.closeSettingsBtn.addEventListener('click', () => {
  els.settingsPanel.hidden = true;
});
els.saveSettingsBtn.addEventListener('click', () => {
  state.settings = saveSettings({
    ...readSettingsForm(),
    provider: state.settings.provider,
  });
  setStatus('已保存。未配密钥的云端引擎仍会自动回落本地。');
  updateMeta();
});
els.themeGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-theme]');
  if (!btn) return;
  state.themeId = btn.dataset.theme;
  renderThemes();
  updateMeta();
});
els.engineGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-provider]');
  if (!btn) return;
  state.settings = saveSettings({ provider: btn.dataset.provider });
  renderEngines();
  updateMeta();
  if (btn.dataset.provider !== 'local') {
    els.settingsPanel.hidden = false;
    fillSettingsForm();
  }
});
els.library.addEventListener('click', onLibraryClick);
els.stage.addEventListener('click', (e) => {
  // Don't steal clicks from twin video controls
  if (e.target.closest('#twinVideo') && els.stage.dataset.mode === 'twin') return;
  if (!state.file || els.stage.dataset.mode === 'source') openPicker();
});
els.wearBtn.addEventListener('click', async () => {
  const ok = await wear.requestPermission();
  if (!ok) {
    setStatus('需要运动权限才能用戒指/手杖');
    return;
  }
  if (wear.listening) {
    wear.stop();
    els.wearBtn.classList.remove('is-on');
    els.wearBtn.textContent = '戒指/手杖';
  } else {
    wear.start();
    els.wearBtn.classList.add('is-on');
    els.wearBtn.textContent = '传感开';
  }
});

document.body.addEventListener('dragover', (e) => {
  e.preventDefault();
});
document.body.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f) onFile(f);
});

// Prefer local on first paint for instant use if previous cloud choice has no keys
if (state.settings.provider !== 'local' && effectiveProvider() === 'local') {
  // keep preferred provider in storage, just use local until keys exist
}

renderThemes();
renderEngines();
fillSettingsForm();
updateMeta();
setBusy(false);
showHint(true);
refreshLibrary();
requestAnimationFrame(() => document.body.classList.add('ready'));
