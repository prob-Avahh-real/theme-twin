/**
 * Extract JPEG frames from a video element for cloud providers.
 */

/**
 * @param {HTMLVideoElement} video
 * @param {number} timeSec
 * @param {{ maxEdge?: number, quality?: number }} [opts]
 * @returns {Promise<{ dataUrl: string, base64: string, blob: Blob, width: number, height: number }>}
 */
export async function captureFrame(video, timeSec, opts = {}) {
  const maxEdge = opts.maxEdge ?? 1280;
  const quality = opts.quality ?? 0.88;
  await seek(video, timeSec);
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const scale = Math.min(1, maxEdge / Math.max(vw, vh));
  const w = Math.max(2, Math.round(vw * scale));
  const h = Math.max(2, Math.round(vh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const base64 = dataUrl.split(',')[1] || '';
  const blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
  return { dataUrl, base64, blob, width: w, height: h };
}

/**
 * Grab first + last (+ mid) frames for stronger twin prompts.
 */
export async function captureKeyFrames(video, duration) {
  const d = Math.max(0.5, duration || video.duration || 5);
  const first = await captureFrame(video, Math.min(0.2, d * 0.05));
  const mid = await captureFrame(video, d * 0.5);
  const last = await captureFrame(video, Math.max(0, d - 0.15));
  return { first, mid, last };
}

function seek(video, time) {
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
    video.currentTime = Math.min(Math.max(0, time), Math.max(0, (video.duration || time) - 0.05));
  });
}
