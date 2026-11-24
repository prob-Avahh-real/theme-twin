/**
 * ByteDance Seedance 2.0 via fal.ai (default) or Runway seedance2.
 * Always request silent / ignore model audio — app remuxes original track.
 */

import { apiRequest, downloadUrl, sleep } from './http.js';
import { buildTwinPrompt, seedanceDuration, aspectFromSize } from '../prompt.js';
import { captureKeyFrames } from './frames.js';
import { uploadEphemeral } from './runway.js';

const FAL_QUEUE = 'https://queue.fal.run';

function falHeaders(key) {
  return {
    Authorization: `Key ${key}`,
    'Content-Type': 'application/json',
  };
}

/**
 * fal queue: submit → poll status → fetch result
 */
async function falSubscribe(modelId, input, apiKey, onProgress, signal) {
  onProgress?.(0.18, 'seedance:submit');
  const submitted = await apiRequest({
    url: `${FAL_QUEUE}/${modelId}`,
    method: 'POST',
    headers: falHeaders(apiKey),
    body: input,
    signal,
  });

  const requestId = submitted.request_id || submitted.requestId;
  if (!requestId) {
    // Some sync-style responses return the result directly
    if (submitted.video?.url) return submitted;
    throw new Error('Seedance(fal) 未返回 request_id');
  }

  const statusUrl =
    submitted.status_url || `${FAL_QUEUE}/${modelId}/requests/${requestId}/status`;
  const resultUrl =
    submitted.response_url || `${FAL_QUEUE}/${modelId}/requests/${requestId}`;

  const started = Date.now();
  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const st = await apiRequest({
      url: statusUrl,
      method: 'GET',
      headers: falHeaders(apiKey),
      signal,
    });
    const status = st.status || st.detail?.status;
    if (status === 'COMPLETED' || status === 'OK') break;
    if (status === 'FAILED' || status === 'ERROR' || status === 'CANCELLED') {
      throw new Error(st.error || st.detail || 'Seedance(fal) 任务失败');
    }
    const elapsed = (Date.now() - started) / 1000;
    onProgress?.(Math.min(0.92, 0.2 + elapsed / 200), `seedance:${String(status || 'queued').toLowerCase()}`);
    await sleep(4000, signal);
  }

  onProgress?.(0.94, 'seedance:result');
  const result = await apiRequest({
    url: resultUrl,
    method: 'GET',
    headers: falHeaders(apiKey),
    signal,
  });
  return result;
}

function extractFalVideoUrl(result) {
  if (result?.video?.url) return result.video.url;
  if (result?.data?.video?.url) return result.data.video.url;
  if (typeof result?.video === 'string') return result.video;
  if (Array.isArray(result?.video) && result.video[0]?.url) return result.video[0].url;
  return null;
}

async function generateViaFal(ctx) {
  const { video, profile, themeId, settings, seed = 1, onProgress, signal } = ctx;
  const apiKey = settings.seedanceFalKey?.trim();
  if (!apiKey) throw new Error('请先填写 fal.ai API Key（Seedance）');

  const prompt = buildTwinPrompt(profile, themeId, { seed });
  const duration = seedanceDuration(profile.duration);
  const aspect = aspectFromSize(profile.width, profile.height);
  const modelId = settings.seedanceModel || 'bytedance/seedance-2.0/image-to-video';
  const resolution = settings.seedanceResolution || '720p';

  onProgress?.(0.08, 'seedance:frame');
  const frames = await captureKeyFrames(video, profile.duration);

  const input = {
    prompt,
    image_url: frames.mid.dataUrl,
    end_image_url: frames.last.dataUrl,
    resolution,
    duration,
    aspect_ratio: aspect.seedance,
    generate_audio: false,
    seed: seed % 2147483647,
  };

  let result;
  try {
    result = await falSubscribe(modelId, input, apiKey, onProgress, signal);
  } catch (err) {
    // Some model variants reject end_image_url
    const msg = String(err.message || err);
    if (msg.includes('end_image') || msg.includes('422') || msg.includes('validation')) {
      delete input.end_image_url;
      result = await falSubscribe(modelId, input, apiKey, onProgress, signal);
    } else {
      throw err;
    }
  }

  const outUrl = extractFalVideoUrl(result);
  if (!outUrl) throw new Error('Seedance(fal) 无视频 URL');

  onProgress?.(0.97, 'seedance:download');
  const blob = await downloadUrl(outUrl, signal);
  return {
    blob,
    provider: 'seedance',
    model: modelId,
    duration: Number(duration),
    videoUrl: outUrl,
  };
}

/**
 * Runway seedance2 — image_to_video or video_to_video
 */
async function generateViaRunwaySeedance(ctx) {
  const settings = {
    ...ctx.settings,
    runwayApiKey: ctx.settings.runwayApiKey || ctx.settings.seedanceFalKey,
    runwayModel: 'seedance2',
    runwayMode: ctx.settings.seedanceMode === 'v2v' ? 'v2v' : 'i2v',
  };
  if (!settings.runwayApiKey?.trim()) {
    throw new Error('Runway 网关需要 Runway API Key（可在 Runway 或 Seedance 配置里填写）');
  }

  // Specialize seedance2 body: duration required for ITV; VTV uses promptVideo
  const { video, profile, themeId, seed = 1, onProgress, signal, sourceFile } = ctx;
  const prompt = buildTwinPrompt(profile, themeId, { seed });
  const duration = Math.min(15, Math.max(2, Number(seedanceDuration(profile.duration))));
  const aspect = aspectFromSize(profile.width, profile.height);
  const apiKey = settings.runwayApiKey.trim();

  const BASE = 'https://api.dev.runwayml.com';
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'X-Runway-Version': '2024-11-06',
    'Content-Type': 'application/json',
  };

  onProgress?.(0.08, 'seedance:prepare');
  let endpoint;
  let body;

  if (settings.runwayMode === 'v2v') {
    const file = sourceFile || (await fetch(video.src).then((r) => r.blob()));
    if (file.size > 32 * 1024 * 1024) {
      throw new Error('视频超过 32MB，请改用 Seedance 图生视频');
    }
    onProgress?.(0.12, 'seedance:upload');
    const promptVideo = await uploadEphemeral(apiKey, file, 'source.mp4', signal);
    endpoint = '/v1/video_to_video';
    body = {
      model: 'seedance2',
      promptVideo,
      promptText: prompt,
      ratio: aspect.runway,
    };
  } else {
    const frames = await captureKeyFrames(video, profile.duration);
    let promptImage = frames.mid.dataUrl;
    if ((frames.mid.blob?.size || 0) > 4.5 * 1024 * 1024) {
      promptImage = await uploadEphemeral(apiKey, frames.mid.blob, 'frame.jpg', signal);
    }
    endpoint = '/v1/image_to_video';
    body = {
      model: 'seedance2',
      promptImage,
      promptText: prompt,
      ratio: aspect.runway,
      duration,
    };
  }

  onProgress?.(0.2, 'seedance:submit');
  const created = await apiRequest({
    url: `${BASE}${endpoint}`,
    method: 'POST',
    headers,
    body,
    signal,
  });
  const taskId = created.id;
  if (!taskId) throw new Error('Seedance(Runway) 未返回 task id');

  // reuse runway polling via generateWithRunway path is messy — inline poll
  const started = Date.now();
  let task;
  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    task = await apiRequest({
      url: `${BASE}/v1/tasks/${taskId}`,
      method: 'GET',
      headers,
      signal,
    });
    if (task.status === 'SUCCEEDED') break;
    if (task.status === 'FAILED') throw new Error(task.failure || 'Seedance(Runway) 失败');
    const elapsed = (Date.now() - started) / 1000;
    onProgress?.(Math.min(0.95, 0.2 + elapsed / 200), `seedance:${String(task.status).toLowerCase()}`);
    await sleep(5000, signal);
  }

  const outUrl = Array.isArray(task.output) ? task.output[0] : task.output;
  if (!outUrl) throw new Error('Seedance(Runway) 无输出');
  onProgress?.(0.97, 'seedance:download');
  const blob = await downloadUrl(outUrl, signal);
  return {
    blob,
    provider: 'seedance',
    model: 'seedance2',
    duration,
    videoUrl: outUrl,
  };
}

/**
 * @param {object} ctx
 */
export async function generateWithSeedance(ctx) {
  const gateway = ctx.settings.seedanceGateway || 'fal';
  if (gateway === 'runway') {
    return generateViaRunwaySeedance(ctx);
  }
  return generateViaFal(ctx);
}
