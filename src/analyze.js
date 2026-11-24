import { classifyThemeFromStats } from './themes.js';

const SAMPLE_COUNT = 18;
const SAMPLE_W = 96;
const SAMPLE_H = 54;

function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function quantizeColor(r, g, b) {
  const q = (v) => Math.round(v / 32) * 32;
  return `${q(r)},${q(g)},${q(b)}`;
}

function toHex(r, g, b) {
  const h = (n) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Sample frames from a video element / blob URL and build a ThemeProfile.
 * @param {HTMLVideoElement} video
 * @param {(p: number) => void} [onProgress]
 */
export async function analyzeVideo(video, onProgress) {
  if (!video.duration || !Number.isFinite(video.duration)) {
    await waitEvent(video, 'loadedmetadata');
  }
  const duration = Math.max(0.5, video.duration || 5);
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_W;
  canvas.height = SAMPLE_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const colorCounts = new Map();
  let sumL = 0;
  let sumS = 0;
  let sumWarm = 0;
  let motionSum = 0;
  let prev = null;
  const times = [];

  for (let i = 0; i < SAMPLE_COUNT; i++) {
    times.push((duration * (i + 0.5)) / SAMPLE_COUNT);
  }

  for (let i = 0; i < times.length; i++) {
    await seekVideo(video, times[i]);
    ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
    const { data } = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
    let frameL = 0;
    let frameS = 0;
    let frameWarm = 0;
    let pixels = 0;

    for (let p = 0; p < data.length; p += 16) {
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const { h, s, l } = rgbToHsl(r, g, b);
      frameL += l;
      frameS += s;
      // warm: red/orange hues, cool: blue/cyan
      const warm = h < 0.12 || h > 0.9 ? 1 : h > 0.45 && h < 0.7 ? -1 : 0;
      frameWarm += warm;
      const key = quantizeColor(r, g, b);
      colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
      pixels++;
    }

    frameL /= pixels;
    frameS /= pixels;
    frameWarm /= pixels;
    sumL += frameL;
    sumS += frameS;
    sumWarm += frameWarm;

    if (prev) {
      let diff = 0;
      for (let p = 0; p < data.length; p += 16) {
        diff += Math.abs(data[p] - prev[p]) + Math.abs(data[p + 1] - prev[p + 1]) + Math.abs(data[p + 2] - prev[p + 2]);
      }
      motionSum += diff / (pixels * 3 * 255);
    }
    prev = data.slice();
    onProgress?.((i + 1) / times.length);
  }

  const n = times.length;
  const brightness = clamp01(sumL / n);
  const saturation = clamp01(sumS / n);
  const warmth = clamp01((sumWarm / n + 1) / 2) * 2 - 1; // -1..1
  const motion = clamp01(motionSum / Math.max(1, n - 1));

  const palette = [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key]) => {
      const [r, g, b] = key.split(',').map(Number);
      return toHex(r, g, b);
    });

  const stats = { brightness, saturation, warmth, motion, palette };
  const themeId = classifyThemeFromStats(stats);

  return {
    duration,
    width: video.videoWidth || 1280,
    height: video.videoHeight || 720,
    themeId,
    stats,
    palette,
    analyzedAt: Date.now(),
  };
}

function waitEvent(el, name) {
  return new Promise((resolve, reject) => {
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error(`${name} failed`));
    };
    const cleanup = () => {
      el.removeEventListener(name, onOk);
      el.removeEventListener('error', onErr);
    };
    el.addEventListener(name, onOk, { once: true });
    el.addEventListener('error', onErr, { once: true });
  });
}

function seekVideo(video, time) {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('seek failed'));
    };
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onErr);
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onErr, { once: true });
    video.currentTime = Math.min(time, Math.max(0, (video.duration || time) - 0.05));
  });
}
