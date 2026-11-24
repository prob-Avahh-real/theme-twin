/**
 * HTTP helper — uses CapacitorHttp on native (bypass CORS), fetch elsewhere.
 */

let capacitorHttp = null;

async function getCapacitorHttp() {
  if (capacitorHttp !== null) return capacitorHttp;
  try {
    const core = await import('@capacitor/core');
    if (core.Capacitor?.isNativePlatform?.() && core.CapacitorHttp) {
      capacitorHttp = core.CapacitorHttp;
      return capacitorHttp;
    }
  } catch {
    /* browser / no capacitor */
  }
  capacitorHttp = false;
  return false;
}

/**
 * @param {{ url: string, method?: string, headers?: Record<string,string>, body?: any, signal?: AbortSignal, responseType?: 'json'|'text'|'blob'|'arraybuffer' }} opts
 */
export async function apiRequest(opts) {
  const {
    url,
    method = 'GET',
    headers = {},
    body,
    signal,
    responseType = 'json',
  } = opts;

  const Http = await getCapacitorHttp();
  if (Http) {
    const options = {
      url,
      method,
      headers,
      data: body,
      responseType: responseType === 'blob' || responseType === 'arraybuffer' ? 'arraybuffer' : responseType,
    };
    // CapacitorHttp serializes objects as JSON when Content-Type is json
    if (typeof body === 'string') {
      options.data = body;
    }
    const res = await Http.request(options);
    if (res.status < 200 || res.status >= 300) {
      const msg = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      throw new Error(`HTTP ${res.status}: ${msg?.slice?.(0, 240) || 'request failed'}`);
    }
    if (responseType === 'blob') {
      const buf = res.data;
      const ab = buf instanceof ArrayBuffer ? buf : Uint8Array.from(atob(buf), (c) => c.charCodeAt(0)).buffer;
      return new Blob([ab]);
    }
    return res.data;
  }

  const init = { method, headers, signal };
  if (body !== undefined && body !== null) {
    init.body = typeof body === 'string' || body instanceof Blob || body instanceof FormData || body instanceof ArrayBuffer
      ? body
      : JSON.stringify(body);
  }
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 240) || res.statusText}`);
  }
  if (responseType === 'blob') return res.blob();
  if (responseType === 'text') return res.text();
  if (responseType === 'arraybuffer') return res.arrayBuffer();
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

export async function downloadUrl(url, signal) {
  return apiRequest({ url, method: 'GET', signal, responseType: 'blob' });
}

/** Sleep helper for polling */
export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}
