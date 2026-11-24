/**
 * Persist provider settings in localStorage (device-local keys).
 */

const KEY = 'theme-twin.settings.v1';

export const PROVIDERS = [
  { id: 'local', label: '本地风格', blurb: '离线 Canvas，不耗额度' },
  { id: 'runway', label: 'Runway', blurb: 'image→video / video→video' },
  { id: 'kling', label: '可灵 Kling', blurb: '图生视频，关闭模型音轨' },
  { id: 'seedance', label: 'Seedance', blurb: '字节 Seedance 2.0' },
];

const DEFAULTS = {
  provider: 'local',
  runwayApiKey: '',
  runwayModel: 'gen4_turbo',
  runwayMode: 'i2v', // i2v | v2v
  klingAccessKey: '',
  klingSecretKey: '',
  klingModel: 'kling-v2-1',
  klingMode: 'std', // std | pro
  klingBaseUrl: 'https://api-beijing.klingai.com',
  /** fal | runway — fal.ai Seedance 2.0, or Runway model seedance2 */
  seedanceGateway: 'fal',
  seedanceFalKey: '',
  seedanceModel: 'bytedance/seedance-2.0/image-to-video',
  seedanceResolution: '720p',
  seedanceMode: 'i2v', // i2v | v2v (v2v only via Runway gateway)
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(partial) {
  const next = { ...loadSettings(), ...partial };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

/** Cloud needs keys; otherwise always fall back to local so the app is instantly usable. */
export function resolveProvider(settings = loadSettings()) {
  const p = settings.provider || 'local';
  if (p === 'local') return 'local';
  if (p === 'runway' && settings.runwayApiKey?.trim()) return 'runway';
  if (p === 'kling' && settings.klingAccessKey?.trim() && settings.klingSecretKey?.trim()) return 'kling';
  if (p === 'seedance') {
    const gw = settings.seedanceGateway || 'fal';
    if (gw === 'fal' && settings.seedanceFalKey?.trim()) return 'seedance';
    if (gw === 'runway' && settings.runwayApiKey?.trim()) return 'seedance';
  }
  return 'local';
}

export function providerReady(settings = loadSettings()) {
  const wanted = settings.provider || 'local';
  return resolveProvider(settings) === wanted;
}

export function maskSecret(s) {
  if (!s) return '';
  if (s.length <= 8) return '••••';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}
