import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTwinPrompt, klingDuration, runwayDuration, seedanceDuration, aspectFromSize } from '../src/prompt.js';
import { createKlingJwt } from '../src/providers/jwt.js';

describe('buildTwinPrompt', () => {
  it('includes theme and palette', () => {
    const p = buildTwinPrompt(
      { palette: ['#112233', '#aabbcc'], stats: { motion: 0.6 } },
      'neon',
      { seed: 7 },
    );
    assert.match(p, /neon|霓虹|cyan/i);
    assert.match(p, /#112233/);
    assert.match(p, /variation 7/);
  });
});

describe('duration helpers', () => {
  it('maps kling to 5 or 10', () => {
    assert.equal(klingDuration(3), '5');
    assert.equal(klingDuration(9), '10');
  });
  it('clamps runway 2-10', () => {
    assert.equal(runwayDuration(1), 2);
    assert.equal(runwayDuration(7.4), 7);
    assert.equal(runwayDuration(30), 10);
  });
  it('clamps seedance 4-15 as string', () => {
    assert.equal(seedanceDuration(2), '4');
    assert.equal(seedanceDuration(8), '8');
    assert.equal(seedanceDuration(40), '15');
  });
});

describe('aspectFromSize', () => {
  it('picks landscape / portrait / square', () => {
    assert.equal(aspectFromSize(1280, 720).kling, '16:9');
    assert.equal(aspectFromSize(720, 1280).runway, '720:1280');
    assert.equal(aspectFromSize(1000, 1000).seedance, '1:1');
  });
});

describe('createKlingJwt', () => {
  it('returns three-part HS256 token', async () => {
    const token = await createKlingJwt('ak_test', 'sk_secret_value');
    const parts = token.split('.');
    assert.equal(parts.length, 3);
    assert.ok(parts[0].length > 10);
    assert.ok(parts[2].length > 10);
  });
});
