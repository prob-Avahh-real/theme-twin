/**
 * Runway Gen API — image_to_video / video_to_video + task poll.
 * Docs: https://docs.dev.runwayml.com  Base: https://api.dev.runwayml.com
 */

import { apiRequest, downloadUrl, sleep } from './http.js';
import { buildTwinPrompt, runwayDuration, aspectFromSize } from '../prompt.js';
import { captureKeyFrames } from './frames.js';

const BASE = 'https://api.dev.runwayml.com';
const VERSION = '2024-11-06';

function headers(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'X-Runway-Version': VERSION,
    'Content-Type': 'application/json',
  };
}

async function pollTask(apiKey, taskId, onProgress, signal) {
  const started = Date.now();
  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const task = await apiRequest({
      url: `${BASE}/v1/tasks/${taskId}`,
      method: 'GET',
      headers: headers(apiKey),
      signal,
    });
    const status = task.status;
    if (status === 'SUCCEEDED') {
      onProgress?.(1, 'runway:done');
      return task;
    }
    if (status === 'FAILED') {
      throw new Error(task.failure || task.failureCode || 'Runway task failed');
    }
    const elapsed = (Date.now() - started) / 1000;
    onProgress?.(Math.min(0.95, 0.15 + elapsed / 180), `runway:${String(status).toLowerCase()}`);
    await sleep(5000, signal);
  }
}

/**
 * Ephemeral upload → runway:// URI
 * @param {string} apiKey
 * @param {Blob} blob
 * @param {string} filename
 * @param {AbortSignal} [signal]
 */
export async function uploadEphemeral(apiKey, blob, filename, signal) {
  const slot = await apiRequest({
    url: `${BASE}/v1/uploads`,
    method: 'POST',
    headers: headers(apiKey),
    body: { filename, type: 'ephemeral' },
    signal,
  });
  const { uploadUrl, fields, runwayUri } = slot;
  if (!uploadUrl || !runwayUri) throw new Error('Runway upload slot incomplete');

  const form = new FormData();
  if (fields && typeof fields === 'object') {
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
  }
  form.append('file', blob, filename);

  // Presigned upload is usually S3 — use plain fetch (not JSON API)
  const up = await fetch(uploadUrl, { method: 'POST', body: form, signal });
  if (!up.ok) {
    const t = await up.text().catch(() => '');
    throw new Error(`Runway upload failed: HTTP ${up.status} ${t.slice(0, 160)}`);
  }
  return runwayUri;
}

/**
 * @param {object} ctx
 * @param {HTMLVideoElement} ctx.video
 * @param {object} ctx.profile
 * @param {string} ctx.themeId
 * @param {object} ctx.settings
 * @param {number} [ctx.seed]
 * @param {(p:number, phase:string)=>void} [ctx.onProgress]
 * @param {AbortSignal} [ctx.signal]
 * @param {File|Blob} [ctx.sourceFile] for v2v upload
 * @returns {Promise<{ blob: Blob, provider: string, model: string, duration: number, videoUrl: string }>}
 */
export async function generateWithRunway(ctx) {
  const { video, profile, themeId, settings, seed = 1, onProgress, signal, sourceFile } = ctx;
  const apiKey = settings.runwayApiKey?.trim();
  if (!apiKey) throw new Error('请先填写 Runway API Key');

  const prompt = buildTwinPrompt(profile, themeId, { seed });
  const duration = runwayDuration(profile.duration);
  const aspect = aspectFromSize(profile.width, profile.height);
  const mode = settings.runwayMode || 'i2v';
  const model = settings.runwayModel || (mode === 'v2v' ? 'gen4_aleph' : 'gen4_turbo');

  onProgress?.(0.05, 'runway:prepare');
  let body;

  if (mode === 'v2v') {
    const file = sourceFile || (await fetch(video.src).then((r) => r.blob()));
    if (file.size > 32 * 1024 * 1024) {
      throw new Error('视频超过 32MB，请改用 Runway 图生视频(i2v) 或压缩后再试');
    }
    onProgress?.(0.1, 'runway:upload');
    const videoUri = await uploadEphemeral(apiKey, file, 'source.mp4', signal);
    body = {
      model: model === 'gen4_turbo' ? 'gen4_aleph' : model,
      videoUri,
      promptText: prompt,
      ratio: aspect.runway,
    };
  } else {
    const frames = await captureKeyFrames(video, profile.duration);
    onProgress?.(0.12, 'runway:frame');
    // Prefer data URI for mid frame (under 5MB typical)
    let promptImage = frames.mid.dataUrl;
    if ((frames.mid.blob?.size || 0) > 4.5 * 1024 * 1024) {
      onProgress?.(0.15, 'runway:upload');
      promptImage = await uploadEphemeral(apiKey, frames.mid.blob, 'frame.jpg', signal);
    }
    body = {
      model: model === 'gen4_aleph' ? 'gen4_turbo' : model,
      promptImage,
      promptText: prompt,
      ratio: aspect.runway,
      duration,
      ...(seed ? { seed: seed % 2147483647 } : {}),
    };
  }

  onProgress?.(0.2, 'runway:submit');
  const endpoint = mode === 'v2v' ? '/v1/video_to_video' : '/v1/image_to_video';
  const created = await apiRequest({
    url: `${BASE}${endpoint}`,
    method: 'POST',
    headers: headers(apiKey),
    body,
    signal,
  });
  const taskId = created.id;
  if (!taskId) throw new Error('Runway 未返回 task id');

  const task = await pollTask(apiKey, taskId, onProgress, signal);
  const outUrl = Array.isArray(task.output) ? task.output[0] : task.output;
  if (!outUrl) throw new Error('Runway 无输出 URL');

  onProgress?.(0.97, 'runway:download');
  const blob = await downloadUrl(outUrl, signal);
  return {
    blob,
    provider: 'runway',
    model: body.model,
    duration,
    videoUrl: outUrl,
  };
}
