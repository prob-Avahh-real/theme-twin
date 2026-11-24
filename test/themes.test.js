import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyThemeFromStats, THEME_IDS, themeLabel } from '../src/themes.js';
import { twinFilename, looksLikeVideoBlob } from '../src/remux.js';

describe('classifyThemeFromStats', () => {
  it('picks neon for dark saturated footage', () => {
    assert.equal(
      classifyThemeFromStats({ brightness: 0.3, warmth: 0, motion: 0.4, saturation: 0.7 }),
      'neon',
    );
  });

  it('picks soft for bright warm calm footage', () => {
    assert.equal(
      classifyThemeFromStats({ brightness: 0.7, warmth: 0.4, motion: 0.2, saturation: 0.3 }),
      'soft',
    );
  });

  it('defaults to cinematic', () => {
    assert.equal(
      classifyThemeFromStats({ brightness: 0.45, warmth: 0, motion: 0.3, saturation: 0.4 }),
      'cinematic',
    );
  });

  it('only returns known theme ids', () => {
    const id = classifyThemeFromStats({ brightness: 0.2, warmth: -0.5, motion: 0.9, saturation: 0.8 });
    assert.ok(THEME_IDS.includes(id));
  });
});

describe('themeLabel', () => {
  it('returns Chinese labels', () => {
    assert.equal(themeLabel('cinematic'), '电影感');
    assert.equal(themeLabel('unknown'), 'unknown');
  });
});

describe('remux helpers', () => {
  it('builds twin filename', () => {
    assert.match(twinFilename('海边日落.mp4', 'neon'), /twin-neon\.webm$/);
  });

  it('validates video blob shape', () => {
    assert.equal(looksLikeVideoBlob(null), false);
    assert.equal(looksLikeVideoBlob({ size: 10, type: 'video/webm' }), false);
    assert.equal(looksLikeVideoBlob({ size: 5000, type: 'video/webm' }), true);
  });
});
