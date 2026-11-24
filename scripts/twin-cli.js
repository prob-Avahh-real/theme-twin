#!/usr/bin/env node
/**
 * Desktop twin: analyze source → stylized silent video via ffmpeg → remux original audio.
 * Requires ffmpeg on PATH.
 *
 * Usage: npm run twin -- input.mp4 [--out twin.mp4] [--style cinematic|neon|nature|urban|abstract]
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { classifyThemeFromStats, THEME_IDS } from '../src/themes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function usage() {
  console.log(`Usage: npm run twin -- <input.mp4> [--out out.mp4] [--style ${THEME_IDS.join('|')}]`);
  process.exit(1);
}

function hasFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  return r.status === 0;
}

function ffprobeDuration(file) {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(r.stderr || 'ffprobe failed');
  return Math.max(0.5, parseFloat(r.stdout.trim()) || 5);
}

function parseArgs(argv) {
  const args = { input: null, out: null, style: null };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--out') args.out = rest[++i];
    else if (a === '--style') args.style = rest[++i];
    else if (a === '--help' || a === '-h') usage();
    else if (!a.startsWith('-') && !args.input) args.input = a;
  }
  return args;
}

/** Rough palette from a mid-frame screenshot via ffmpeg + raw RGB average. */
function sampleStats(input, tmpDir) {
  const frame = path.join(tmpDir, 'frame.png');
  spawnSync(
    'ffmpeg',
    ['-y', '-ss', '1', '-i', input, '-frames:v', '1', '-vf', 'scale=160:90', frame],
    { encoding: 'utf8' },
  );
  // Without image libs, use ffmpeg signalstats for brightness proxy
  const stats = spawnSync(
    'ffmpeg',
    ['-i', input, '-vf', 'signalstats,metadata=print:file=-', '-frames:v', '24', '-f', 'null', '-'],
    { encoding: 'utf8' },
  );
  const text = `${stats.stderr || ''}\n${stats.stdout || ''}`;
  const ys = [...text.matchAll(/YAVG=([0-9.]+)/g)].map((m) => parseFloat(m[1]));
  const yavg = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 100;
  const brightness = Math.min(1, Math.max(0, yavg / 255));
  const warmBias = brightness > 0.55 ? 0.2 : -0.1;
  const motion = 0.35;
  return {
    brightness,
    warmth: warmBias,
    motion,
    saturation: 0.45,
    palette: brightness > 0.5
      ? ['#c4b59a', '#2a3a44', '#6e8a92', '#d9784a']
      : ['#0d1b24', '#1e4d5c', '#c45c3e', '#e8dcc8'],
  };
}

function styleFilter(styleId, duration) {
  const map = {
    cinematic: `color=c=0x0b1218:s=1280x720:d=${duration},geq=r='40+20*sin(X/40+T)':g='50+15*sin(Y/50+T*0.7)':b='70+25*sin((X+Y)/60+T)'`,
    neon: `color=c=0x050510:s=1280x720:d=${duration},geq=r='20+80*sin(X/30+T*2)':g='10+40*sin(Y/20+T)':b='90+120*sin((X+Y)/25+T*1.5)'`,
    nature: `color=c=0x142018:s=1280x720:d=${duration},geq=r='30+20*sin(T)':g='70+40*sin(X/80+T*0.3)':b='40+15*sin(Y/70)'`,
    urban: `color=c=0x121418:s=1280x720:d=${duration},geq=r='50+30*sin(floor(X/40)+T)':g='55+20*sin(floor(Y/40)+T)':b='60+25*cos(T)'`,
    abstract: `color=c=0x101018:s=1280x720:d=${duration},geq=r='60+60*sin(X/20+Y/30+T)':g='40+50*cos(X/25-T)':b='80+40*sin(Y/15+T*0.8)'`,
    soft: `color=c=0x1a1614:s=1280x720:d=${duration},geq=r='90+30*sin(T*0.4)':g='70+20*sin(X/100)':b='60+15*cos(Y/90)'`,
  };
  return map[styleId] || map.cinematic;
}

function main() {
  if (!hasFfmpeg()) {
    console.error('ffmpeg not found on PATH');
    process.exit(1);
  }
  const args = parseArgs(process.argv);
  if (!args.input) usage();
  if (!fs.existsSync(args.input)) {
    console.error('Input not found:', args.input);
    process.exit(1);
  }

  const out = args.out || path.join(process.cwd(), `twin-${Date.now()}.mp4`);
  const tmpDir = fs.mkdtempSync(path.join(path.dirname(out) || process.cwd(), 'theme-twin-'));
  const silent = path.join(tmpDir, 'silent.mp4');

  try {
    const duration = ffprobeDuration(args.input);
    const stats = sampleStats(args.input, tmpDir);
    const style = args.style || classifyThemeFromStats(stats);
    console.log(`Duration ${duration.toFixed(1)}s · style=${style}`);

    const vf = styleFilter(style, duration);
    const gen = spawnSync(
      'ffmpeg',
      ['-y', '-f', 'lavfi', '-i', vf, '-t', String(duration), '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', silent],
      { encoding: 'utf8' },
    );
    if (gen.status !== 0) {
      console.error(gen.stderr);
      process.exit(1);
    }

    // Remux: new video + original audio, audio never re-encoded when possible
    const mux = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-i', silent,
        '-i', args.input,
        '-map', '0:v:0',
        '-map', '1:a:0?',
        '-c:v', 'copy',
        '-c:a', 'copy',
        '-shortest',
        '-movflags', '+faststart',
        out,
      ],
      { encoding: 'utf8' },
    );
    if (mux.status !== 0) {
      // fallback: re-encode audio if copy fails (codec mismatch)
      const mux2 = spawnSync(
        'ffmpeg',
        [
          '-y',
          '-i', silent,
          '-i', args.input,
          '-map', '0:v:0',
          '-map', '1:a:0?',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-shortest',
          '-movflags', '+faststart',
          out,
        ],
        { encoding: 'utf8' },
      );
      if (mux2.status !== 0) {
        console.error(mux2.stderr || mux.stderr);
        process.exit(1);
      }
    }
    console.log('Wrote', out);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();
