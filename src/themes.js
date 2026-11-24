/** Theme presets for twin generation. */

export const THEME_IDS = ['cinematic', 'neon', 'nature', 'urban', 'abstract', 'soft'];

export const THEME_META = {
  cinematic: {
    id: 'cinematic',
    label: '电影感',
    blurb: '低对比光影、缓慢推移',
    accents: ['#c45c3e', '#1e4d5c', '#e8dcc8'],
  },
  neon: {
    id: 'neon',
    label: '霓虹',
    blurb: '高饱和脉冲、夜色扫光',
    accents: ['#2de2e6', '#f72585', '#0a0a12'],
  },
  nature: {
    id: 'nature',
    label: '自然',
    blurb: '有机起伏、草木色温',
    accents: ['#3d6b4f', '#a3c9a8', '#1a2e22'],
  },
  urban: {
    id: 'urban',
    label: '都市',
    blurb: '网格节奏、冷灰金属',
    accents: ['#6b7280', '#f59e0b', '#111827'],
  },
  abstract: {
    id: 'abstract',
    label: '抽象',
    blurb: '几何碎裂、节拍形变',
    accents: ['#f4a261', '#2a9d8f', '#1d3557'],
  },
  soft: {
    id: 'soft',
    label: '柔焦',
    blurb: '雾面渐变、人像氛围',
    accents: ['#d4a5a5', '#8b7355', '#2c2420'],
  },
};

/**
 * Map analysis stats → closest theme id.
 * @param {{ brightness: number, warmth: number, motion: number, saturation: number }} stats
 */
export function classifyThemeFromStats(stats) {
  const { brightness = 0.5, warmth = 0, motion = 0.3, saturation = 0.4 } = stats || {};
  if (saturation > 0.55 && brightness < 0.45) return 'neon';
  if (warmth > 0.25 && brightness > 0.55 && motion < 0.35) return 'soft';
  if (warmth < -0.1 && motion > 0.45) return 'urban';
  if (warmth > 0.05 && saturation < 0.45 && brightness > 0.35) return 'nature';
  if (motion > 0.55 || saturation > 0.6) return 'abstract';
  return 'cinematic';
}

export function themeLabel(id) {
  return THEME_META[id]?.label || id;
}
