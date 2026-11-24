/**
 * Cloud generation orchestrator: provider → AI silent/ignored-audio video → remux original audio.
 */

import { generateWithRunway } from './runway.js';
import { generateWithKling } from './kling.js';
import { generateWithSeedance } from './seedance.js';
import { remuxKeepOriginalAudio } from './cloud.js';
import { generateTwin } from '../generate.js';

const CLOUD = {
  runway: generateWithRunway,
  kling: generateWithKling,
  seedance: generateWithSeedance,
};

/**
 * @param {object} ctx
 * @param {'local'|'runway'|'kling'|'seedance'} ctx.provider
 */
export async function generateTwinWithProvider(ctx) {
  const provider = ctx.provider || ctx.settings?.provider || 'local';

  if (provider === 'local') {
    return {
      blob: await generateTwin({
        sourceVideo: ctx.video,
        canvas: ctx.canvas,
        profile: ctx.profile,
        themeId: ctx.themeId,
        seed: ctx.seed,
        onProgress: ctx.onProgress,
        signal: ctx.signal,
      }),
      provider: 'local',
      model: 'canvas',
      duration: ctx.profile.duration,
    };
  }

  const cloudFn = CLOUD[provider];
  if (!cloudFn) throw new Error(`未知引擎：${provider}`);

  const cloud = await cloudFn({
    video: ctx.video,
    profile: ctx.profile,
    themeId: ctx.themeId,
    settings: ctx.settings,
    seed: ctx.seed,
    onProgress: (p, phase) => ctx.onProgress?.(p * 0.85, phase),
    signal: ctx.signal,
    sourceFile: ctx.sourceFile,
  });

  ctx.onProgress?.(0.86, 'remux');
  const blob = await remuxKeepOriginalAudio({
    aiBlob: cloud.blob,
    sourceUrl: ctx.sourceUrl,
    maxDuration: cloud.duration,
    onProgress: (p, phase) => ctx.onProgress?.(0.86 + p * 0.14, phase),
    signal: ctx.signal,
  });

  return {
    blob,
    provider: cloud.provider,
    model: cloud.model,
    duration: cloud.duration,
  };
}

export { generateWithRunway, generateWithKling, generateWithSeedance, remuxKeepOriginalAudio };
