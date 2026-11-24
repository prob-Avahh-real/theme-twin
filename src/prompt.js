/**
 * Build generation prompts from theme profile.
 */

import { THEME_META } from './themes.js';

const THEME_PROMPTS = {
  cinematic: 'cinematic lighting, shallow depth of field, film grain, slow camera move, dramatic atmosphere',
  neon: 'neon city night, vivid glow, high contrast cyan and magenta lights, rain reflections',
  nature: 'lush natural landscape, soft daylight, organic motion, wind in foliage, earthy tones',
  urban: 'modern city streets, architectural lines, cool metal tones, documentary motion',
  abstract: 'abstract motion graphics inspired by the scene, geometric light forms, stylized color fields',
  soft: 'soft focus portrait atmosphere, warm gentle light, dreamy haze, intimate mood',
};

/**
 * @param {object} profile analyzeVideo result
 * @param {string} themeId
 * @param {{ seed?: number, extra?: string }} [opts]
 */
export function buildTwinPrompt(profile, themeId, opts = {}) {
  const theme = THEME_META[themeId] || THEME_META.cinematic;
  const style = THEME_PROMPTS[themeId] || THEME_PROMPTS.cinematic;
  const palette = (profile?.palette || []).slice(0, 4).join(', ');
  const motion = profile?.stats?.motion ?? 0.35;
  const motionHint =
    motion > 0.55 ? 'dynamic camera and subject motion' : motion > 0.3 ? 'gentle motion' : 'subtle almost still motion';

  const parts = [
    `Same subject and scene theme as the reference, reinterpreted as a fresh ${theme.label} twin shot.`,
    style,
    motionHint,
    palette ? `dominant colors: ${palette}` : '',
    'Keep composition coherent; no text overlays, no watermarks, no logos.',
    opts.extra || '',
  ].filter(Boolean);

  if (opts.seed) parts.push(`variation ${opts.seed}`);
  return parts.join(' ');
}

export function buildNegativePrompt() {
  return 'blurry, low quality, watermark, text, logo, distorted faces, flicker';
}

/** Kling duration string: 5 or 10 */
export function klingDuration(sourceSec) {
  return sourceSec >= 7.5 ? '10' : '5';
}

/** Runway duration seconds 2–10 */
export function runwayDuration(sourceSec) {
  return Math.min(10, Math.max(2, Math.round(sourceSec || 5)));
}

/** Seedance duration 4–15 seconds (string for fal) */
export function seedanceDuration(sourceSec) {
  const n = Math.min(15, Math.max(4, Math.round(sourceSec || 5)));
  return String(n);
}

/** Aspect ratio helpers */
export function aspectFromSize(w, h) {
  if (!w || !h) {
    return { kling: '16:9', runway: '1280:720', seedance: '16:9' };
  }
  const r = w / h;
  if (r > 1.2) return { kling: '16:9', runway: '1280:720', seedance: '16:9' };
  if (r < 0.85) return { kling: '9:16', runway: '720:1280', seedance: '9:16' };
  return { kling: '1:1', runway: '960:960', seedance: '1:1' };
}
