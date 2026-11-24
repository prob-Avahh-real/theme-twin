import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveProvider } from '../src/settings.js';

describe('resolveProvider', () => {
  it('defaults to local', () => {
    assert.equal(resolveProvider({ provider: 'local' }), 'local');
  });
  it('falls back to local when runway has no key', () => {
    assert.equal(resolveProvider({ provider: 'runway', runwayApiKey: '' }), 'local');
  });
  it('uses runway when key present', () => {
    assert.equal(resolveProvider({ provider: 'runway', runwayApiKey: 'key_x' }), 'runway');
  });
  it('falls back seedance without fal key', () => {
    assert.equal(
      resolveProvider({ provider: 'seedance', seedanceGateway: 'fal', seedanceFalKey: '' }),
      'local',
    );
  });
});
