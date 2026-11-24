/**
 * Canvas twin renderers — same duration / energy as source, different pixels.
 */

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function pickPalette(profile, fallback) {
  const p = profile?.palette?.length ? profile.palette : fallback;
  return p.map(hexToRgb);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {number} t  seconds
 * @param {object} profile
 * @param {string} themeId
 * @param {number} seed
 */
export function paintFrame(ctx, w, h, t, profile, themeId, seed = 1) {
  const motion = profile?.stats?.motion ?? 0.35;
  const brightness = profile?.stats?.brightness ?? 0.5;
  const speed = 0.4 + motion * 1.6;
  const id = themeId || profile?.themeId || 'cinematic';

  ctx.clearRect(0, 0, w, h);

  switch (id) {
    case 'neon':
      paintNeon(ctx, w, h, t, profile, speed, seed);
      break;
    case 'nature':
      paintNature(ctx, w, h, t, profile, speed, seed);
      break;
    case 'urban':
      paintUrban(ctx, w, h, t, profile, speed, seed);
      break;
    case 'abstract':
      paintAbstract(ctx, w, h, t, profile, speed, seed);
      break;
    case 'soft':
      paintSoft(ctx, w, h, t, profile, speed, seed, brightness);
      break;
    default:
      paintCinematic(ctx, w, h, t, profile, speed, seed, brightness);
  }
}

function paintCinematic(ctx, w, h, t, profile, speed, seed, brightness) {
  const cols = pickPalette(profile, ['#0b1218', '#1e4d5c', '#c45c3e', '#e8dcc8']);
  const g = ctx.createLinearGradient(0, 0, w, h);
  const shift = (Math.sin(t * speed * 0.5 + seed) + 1) / 2;
  g.addColorStop(0, `rgb(${cols[0].r},${cols[0].g},${cols[0].b})`);
  g.addColorStop(0.45 + shift * 0.1, `rgb(${cols[1].r},${cols[1].g},${cols[1].b})`);
  g.addColorStop(1, `rgb(${cols[2].r},${cols[2].g},${cols[2].b})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // letterbox bars
  const bar = h * (0.08 + (1 - brightness) * 0.04);
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, 0, w, bar);
  ctx.fillRect(0, h - bar, w, bar);

  // soft light sweep
  const x = ((t * speed * 40 + seed * 30) % (w * 1.4)) - w * 0.2;
  const lg = ctx.createLinearGradient(x, 0, x + w * 0.35, h);
  lg.addColorStop(0, 'rgba(232,220,200,0)');
  lg.addColorStop(0.5, 'rgba(232,220,200,0.12)');
  lg.addColorStop(1, 'rgba(232,220,200,0)');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, w, h);
}

function paintNeon(ctx, w, h, t, profile, speed, seed) {
  const cols = pickPalette(profile, ['#050510', '#2de2e6', '#f72585', '#7209b7']);
  ctx.fillStyle = `rgb(${cols[0].r},${cols[0].g},${cols[0].b})`;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 6; i++) {
    const c = cols[1 + (i % (cols.length - 1))];
    const y = ((i / 6) * h + Math.sin(t * speed + i + seed) * 40 + h) % h;
    ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${0.35 + (i % 3) * 0.15})`;
    ctx.lineWidth = 2 + (i % 3);
    ctx.shadowColor = `rgb(${c.r},${c.g},${c.b})`;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= w; x += 24) {
      ctx.lineTo(x, y + Math.sin(x * 0.02 + t * speed * 2 + i) * (12 + motionAmp(profile) * 30));
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
}

function paintNature(ctx, w, h, t, profile, speed, seed) {
  const cols = pickPalette(profile, ['#142018', '#3d6b4f', '#a3c9a8', '#c4a574']);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, `rgb(${cols[1].r},${cols[1].g},${cols[1].b})`);
  g.addColorStop(1, `rgb(${cols[0].r},${cols[0].g},${cols[0].b})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = `rgba(${cols[2].r},${cols[2].g},${cols[2].b},0.35)`;
  for (let i = 0; i < 5; i++) {
    const baseY = h * (0.55 + i * 0.08);
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 10) {
      const y = baseY + Math.sin(x * 0.01 + t * speed * 0.6 + i + seed) * (18 + i * 6);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
}

function paintUrban(ctx, w, h, t, profile, speed, seed) {
  const cols = pickPalette(profile, ['#111827', '#6b7280', '#f59e0b', '#1f2937']);
  ctx.fillStyle = `rgb(${cols[0].r},${cols[0].g},${cols[0].b})`;
  ctx.fillRect(0, 0, w, h);

  const cell = 36;
  const offset = Math.floor(t * speed * 20 + seed * 10) % cell;
  for (let y = -cell; y < h + cell; y += cell) {
    for (let x = -cell; x < w + cell; x += cell) {
      const on = ((x / cell + y / cell + Math.floor(t * speed)) | 0) % 5 === 0;
      if (!on) continue;
      const c = cols[1 + ((x + y) % (cols.length - 1))];
      ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},0.55)`;
      ctx.fillRect(x + offset * 0.2, y, cell - 4, cell - 4);
    }
  }

  ctx.fillStyle = `rgba(${cols[2].r},${cols[2].g},${cols[2].b},0.5)`;
  const scan = ((t * speed * 80) % (h + 40)) - 20;
  ctx.fillRect(0, scan, w, 3);
}

function paintAbstract(ctx, w, h, t, profile, speed, seed) {
  const cols = pickPalette(profile, ['#1d3557', '#2a9d8f', '#f4a261', '#e76f51']);
  ctx.fillStyle = `rgb(${cols[0].r},${cols[0].g},${cols[0].b})`;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 8; i++) {
    const c = cols[1 + (i % (cols.length - 1))];
    const cx = w * (0.2 + 0.6 * ((Math.sin(t * speed * 0.7 + i + seed) + 1) / 2));
    const cy = h * (0.2 + 0.6 * ((Math.cos(t * speed * 0.5 + i * 1.3) + 1) / 2));
    const r = 40 + i * 18 + Math.sin(t * speed + i) * 20;
    ctx.beginPath();
    ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${0.2 + (i % 3) * 0.08})`;
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintSoft(ctx, w, h, t, profile, speed, seed, brightness) {
  const cols = pickPalette(profile, ['#2c2420', '#d4a5a5', '#8b7355', '#f0e6de']);
  const g = ctx.createRadialGradient(
    w * (0.4 + 0.2 * Math.sin(t * speed * 0.3 + seed)),
    h * 0.4,
    20,
    w * 0.5,
    h * 0.5,
    Math.max(w, h) * 0.7,
  );
  g.addColorStop(0, `rgb(${cols[1].r},${cols[1].g},${cols[1].b})`);
  g.addColorStop(0.55, `rgb(${cols[2].r},${cols[2].g},${cols[2].b})`);
  g.addColorStop(1, `rgb(${cols[0].r},${cols[0].g},${cols[0].b})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = `rgba(${cols[3].r},${cols[3].g},${cols[3].b},${0.08 + brightness * 0.08})`;
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.48, w * 0.28, h * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
}

function motionAmp(profile) {
  return profile?.stats?.motion ?? 0.35;
}

/**
 * Render twin into canvas while driving original audio; return recorded Blob.
 * Audio comes from the source video element — never synthesized.
 *
 * @param {object} opts
 * @param {HTMLVideoElement} opts.sourceVideo  muted for display; audio routed via AudioContext
 * @param {HTMLCanvasElement} opts.canvas
 * @param {object} opts.profile
 * @param {string} opts.themeId
 * @param {number} [opts.seed]
 * @param {(p: number, phase: string) => void} [opts.onProgress]
 * @param {AbortSignal} [opts.signal]
 */
export async function generateTwin(opts) {
  const {
    sourceVideo,
    canvas,
    profile,
    themeId,
    seed = 1,
    onProgress,
    signal,
  } = opts;

  const duration = profile.duration || sourceVideo.duration || 5;
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioCtx();
  await audioCtx.resume();

  const sourceNode = audioCtx.createMediaElementSource(sourceVideo);
  const dest = audioCtx.createMediaStreamDestination();
  sourceNode.connect(dest);
  // monitor optional — keep silent in UI preview during record? connect for feedback:
  sourceNode.connect(audioCtx.destination);

  const fps = 30;
  const canvasStream = canvas.captureStream(fps);
  const tracks = [...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()];
  const combined = new MediaStream(tracks);

  const mime = pickMime();
  const recorder = new MediaRecorder(combined, mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000 } : undefined);
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data?.size) chunks.push(e.data);
  };

  const done = new Promise((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
    recorder.onerror = () => reject(new Error('MediaRecorder error'));
  });

  sourceVideo.pause();
  sourceVideo.currentTime = 0;
  sourceVideo.muted = false;
  sourceVideo.volume = 1;

  await waitSeeked(sourceVideo);

  recorder.start(200);
  onProgress?.(0, 'record');

  await sourceVideo.play();

  let raf = 0;
  const start = performance.now();

  await new Promise((resolve, reject) => {
    const tick = () => {
      if (signal?.aborted) {
        sourceVideo.pause();
        try {
          recorder.stop();
        } catch {
          /* ignore */
        }
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const t = sourceVideo.currentTime;
      paintFrame(ctx, w, h, t, profile, themeId, seed);
      onProgress?.(Math.min(1, t / duration), 'record');

      if (sourceVideo.ended || t >= duration - 0.05) {
        resolve();
        return;
      }
      // safety timeout
      if (performance.now() - start > (duration + 3) * 1000) {
        resolve();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });

  cancelAnimationFrame(raf);
  sourceVideo.pause();
  if (recorder.state !== 'inactive') recorder.stop();

  const blob = await done;

  try {
    sourceNode.disconnect();
  } catch {
    /* ignore */
  }
  await audioCtx.close();

  onProgress?.(1, 'done');
  return blob;
}

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

function waitSeeked(video) {
  if (video.readyState >= 2 && Math.abs(video.currentTime) < 0.1) return Promise.resolve();
  return new Promise((resolve) => {
    video.addEventListener('seeked', () => resolve(), { once: true });
    video.currentTime = 0;
  });
}

export { mix };
