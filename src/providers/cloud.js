/**
 * Replace AI video audio with the original source audio track.
 * Plays AI video (muted visual via captureStream) + original MediaElement audio → MediaRecorder.
 */

function pickMime() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return '';
}

/**
 * @param {object} opts
 * @param {Blob} opts.aiBlob — cloud-generated video (audio ignored)
 * @param {string} opts.sourceUrl — original video object URL
 * @param {number} [opts.maxDuration]
 * @param {(p:number, phase:string)=>void} [opts.onProgress]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<Blob>}
 */
export async function remuxKeepOriginalAudio(opts) {
  const { aiBlob, sourceUrl, maxDuration, onProgress, signal } = opts;

  const aiUrl = URL.createObjectURL(aiBlob);
  const aiVideo = document.createElement('video');
  aiVideo.src = aiUrl;
  aiVideo.playsInline = true;
  aiVideo.muted = true;
  aiVideo.preload = 'auto';

  const srcVideo = document.createElement('video');
  srcVideo.src = sourceUrl;
  srcVideo.playsInline = true;
  srcVideo.preload = 'auto';

  try {
    await Promise.all([waitMeta(aiVideo), waitMeta(srcVideo)]);
    const duration = Math.min(
      aiVideo.duration || maxDuration || 5,
      srcVideo.duration || maxDuration || 5,
      maxDuration || Infinity,
    );

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx();
    await audioCtx.resume();
    const sourceNode = audioCtx.createMediaElementSource(srcVideo);
    const dest = audioCtx.createMediaStreamDestination();
    sourceNode.connect(dest);
    // no monitor to speakers during remux

    let videoStream;
    if (aiVideo.captureStream) {
      videoStream = aiVideo.captureStream();
    } else if (aiVideo.mozCaptureStream) {
      videoStream = aiVideo.mozCaptureStream();
    } else {
      // canvas fallback
      const canvas = document.createElement('canvas');
      canvas.width = aiVideo.videoWidth || 1280;
      canvas.height = aiVideo.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      videoStream = canvas.captureStream(30);
      const draw = () => {
        if (!aiVideo.paused && !aiVideo.ended) {
          ctx.drawImage(aiVideo, 0, 0, canvas.width, canvas.height);
          requestAnimationFrame(draw);
        }
      };
      aiVideo.addEventListener('play', () => requestAnimationFrame(draw), { once: true });
    }

    const tracks = [...videoStream.getVideoTracks(), ...dest.stream.getAudioTracks()];
    const combined = new MediaStream(tracks);
    const mime = pickMime();
    const recorder = new MediaRecorder(combined, mime ? { mimeType: mime, videoBitsPerSecond: 5_000_000 } : undefined);
    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data?.size) chunks.push(e.data);
    };

    const done = new Promise((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
      recorder.onerror = () => reject(new Error('remux MediaRecorder error'));
    });

    aiVideo.currentTime = 0;
    srcVideo.currentTime = 0;
    srcVideo.muted = false;
    srcVideo.volume = 1;
    await Promise.all([waitSeeked(aiVideo), waitSeeked(srcVideo)]);

    recorder.start(200);
    onProgress?.(0, 'remux');
    await Promise.all([aiVideo.play(), srcVideo.play()]);

    await new Promise((resolve, reject) => {
      const tick = () => {
        if (signal?.aborted) {
          aiVideo.pause();
          srcVideo.pause();
          try {
            recorder.stop();
          } catch {
            /* ignore */
          }
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        const t = Math.min(aiVideo.currentTime, srcVideo.currentTime);
        onProgress?.(Math.min(1, t / duration), 'remux');
        if (aiVideo.ended || srcVideo.ended || t >= duration - 0.05) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    aiVideo.pause();
    srcVideo.pause();
    if (recorder.state !== 'inactive') recorder.stop();
    const blob = await done;

    try {
      sourceNode.disconnect();
    } catch {
      /* ignore */
    }
    await audioCtx.close();
    onProgress?.(1, 'remux:done');
    return blob;
  } finally {
    URL.revokeObjectURL(aiUrl);
    aiVideo.removeAttribute('src');
    srcVideo.removeAttribute('src');
    aiVideo.load();
    srcVideo.load();
  }
}

function waitMeta(video) {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    video.addEventListener('loadedmetadata', () => resolve(), { once: true });
    video.addEventListener('error', () => reject(new Error('video metadata failed')), { once: true });
  });
}

function waitSeeked(video) {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime) < 0.05 && video.readyState >= 2) {
      resolve();
      return;
    }
    video.addEventListener('seeked', () => resolve(), { once: true });
    video.currentTime = 0;
  });
}
