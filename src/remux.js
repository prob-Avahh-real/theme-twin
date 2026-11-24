/**
 * Browser remux helpers.
 * Primary path: generateTwin already records canvas video + original audio in one MediaRecorder.
 * This module covers downloading / naming and optional silent+audio pairing notes for CLI.
 */

export function twinFilename(sourceName, themeId) {
  const base = (sourceName || 'video').replace(/\.[^.]+$/, '');
  const safe = base.replace(/[^\w\u4e00-\u9fff-]+/g, '_').slice(0, 40) || 'twin';
  return `${safe}-twin-${themeId || 'style'}.webm`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * True when blob has an audio track (best-effort via MediaSource probing is heavy;
 * we trust generateTwin's combined stream and expose a simple size/type check).
 */
export function looksLikeVideoBlob(blob) {
  return Boolean(blob && blob.size > 1024 && /^video\//.test(blob.type || 'video/webm'));
}
