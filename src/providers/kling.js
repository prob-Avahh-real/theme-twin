/**
 * 可灵 Kling image2video — sound off, then remux original audio in app.
 * Auth: JWT HS256 from Access Key + Secret Key
 */

import { apiRequest, downloadUrl, sleep } from './http.js';
import { createKlingJwt } from './jwt.js';
import { buildTwinPrompt, buildNegativePrompt, klingDuration, aspectFromSize } from '../prompt.js';
import { captureKeyFrames } from './frames.js';

async function authHeaders(settings) {
  const token = await createKlingJwt(settings.klingAccessKey?.trim(), settings.klingSecretKey?.trim());
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function baseUrl(settings) {
  return (settings.klingBaseUrl || 'https://api-beijing.klingai.com').replace(/\/$/, '');
}

async function pollKling(settings, taskId, onProgress, signal) {
  const started = Date.now();
  const base = baseUrl(settings);
  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const headers = await authHeaders(settings);
    const res = await apiRequest({
      url: `${base}/v1/videos/image2video/${taskId}`,
      method: 'GET',
      headers,
      signal,
    });
    const data = res.data || res;
    const status = data.task_status || data.status;
    if (status === 'succeed' || status === 'SUCCEEDED') {
      onProgress?.(1, 'kling:done');
      return data;
    }
    if (status === 'failed' || status === 'FAILED') {
      throw new Error(data.task_status_msg || data.message || '可灵任务失败');
    }
    const elapsed = (Date.now() - started) / 1000;
    onProgress?.(Math.min(0.95, 0.15 + elapsed / 240), `kling:${status || 'pending'}`);
    await sleep(5000, signal);
  }
}

function extractVideoUrl(taskData) {
  const works = taskData.task_result?.videos || taskData.task_result?.images || [];
  if (works[0]?.url) return works[0].url;
  if (works[0]?.video_url) return works[0].video_url;
  if (taskData.output?.[0]) return taskData.output[0];
  return null;
}

/**
 * @param {object} ctx — same shape as runway
 */
export async function generateWithKling(ctx) {
  const { video, profile, themeId, settings, seed = 1, onProgress, signal } = ctx;
  if (!settings.klingAccessKey?.trim() || !settings.klingSecretKey?.trim()) {
    throw new Error('请先填写可灵 Access Key 与 Secret Key');
  }

  const prompt = buildTwinPrompt(profile, themeId, { seed });
  const duration = klingDuration(profile.duration);
  const aspect = aspectFromSize(profile.width, profile.height);
  const model = settings.klingModel || 'kling-v2-1';
  const mode = settings.klingMode || 'std';

  onProgress?.(0.05, 'kling:frame');
  const frames = await captureKeyFrames(video, profile.duration);

  const body = {
    model_name: model,
    image: frames.mid.base64,
    image_tail: frames.last.base64,
    prompt,
    negative_prompt: buildNegativePrompt(),
    mode,
    aspect_ratio: aspect.kling,
    duration: String(duration),
    sound: 'off',
  };

  // Some models reject image_tail — retry without if needed
  onProgress?.(0.15, 'kling:submit');
  const headers = await authHeaders(settings);
  const base = baseUrl(settings);

  let created;
  try {
    created = await apiRequest({
      url: `${base}/v1/videos/image2video`,
      method: 'POST',
      headers,
      body,
      signal,
    });
  } catch (err) {
    const msg = String(err.message || err);
    if (msg.includes('image_tail') || msg.includes('1201') || msg.includes('parameter')) {
      delete body.image_tail;
      created = await apiRequest({
        url: `${base}/v1/videos/image2video`,
        method: 'POST',
        headers: await authHeaders(settings),
        body,
        signal,
      });
    } else {
      throw err;
    }
  }

  const taskId = created.data?.task_id || created.task_id || created.id;
  if (!taskId) throw new Error('可灵未返回 task_id');

  const task = await pollKling(settings, taskId, onProgress, signal);
  const outUrl = extractVideoUrl(task);
  if (!outUrl) throw new Error('可灵无视频 URL');

  onProgress?.(0.97, 'kling:download');
  const blob = await downloadUrl(outUrl, signal);
  return {
    blob,
    provider: 'kling',
    model,
    duration: Number(duration),
    videoUrl: outUrl,
  };
}
