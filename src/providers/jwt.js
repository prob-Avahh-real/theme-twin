/**
 * Minimal HS256 JWT for Kling (Web Crypto / Node crypto).
 */

function b64urlFromBytes(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  const b64 = typeof btoa === 'function'
    ? btoa(bin)
    : Buffer.from(arr).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlFromString(str) {
  const enc = new TextEncoder().encode(str);
  return b64urlFromBytes(enc);
}

/**
 * @param {string} accessKey
 * @param {string} secretKey
 * @param {number} [ttlSec=1800]
 */
export async function createKlingJwt(accessKey, secretKey, ttlSec = 1800) {
  if (!accessKey || !secretKey) throw new Error('可灵需要 Access Key 与 Secret Key');
  const header = b64urlFromString(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64urlFromString(
    JSON.stringify({
      iss: accessKey,
      exp: now + ttlSec,
      nbf: now - 5,
    }),
  );
  const data = `${header}.${payload}`;

  if (!globalThis.crypto?.subtle) {
    throw new Error('当前环境不支持 Web Crypto，无法签发可灵 JWT');
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64urlFromBytes(sig)}`;
}
