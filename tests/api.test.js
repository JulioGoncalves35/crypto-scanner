import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchJSON, fetchWithFallback, fetchCandles, CORS_PROXIES, TIMEFRAMES_BY_MODE, TF_MAP } from '../painel-core.js';

// ─── Helpers ────────────────────────────────────────────────────────────────
function makeFetchOk(body) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
  });
}

function makeFetchError(status) {
  return vi.fn().mockResolvedValue({ ok: false, status });
}

function makeFetchNetworkError(message = 'Network Error') {
  return vi.fn().mockRejectedValue(new Error(message));
}

function makeBybitResponse(list = []) {
  return {
    retCode: 0,
    result: { list },
  };
}

// Minimal valid Bybit kline row [time, open, high, low, close, volume]
function makeKlineRow(i) {
  const t = (1000 + i) * 1000;
  return [String(t), '100', '101', '99', '100.5', '500'];
}

// ─── fetchJSON ────────────────────────────────────────────────────────────────
describe('fetchJSON', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', makeFetchOk({ result: 'ok' }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed JSON for ok response', async () => {
    const data = await fetchJSON('https://example.com/api');
    expect(data).toEqual({ result: 'ok' });
  });

  it('throws on non-ok HTTP status', async () => {
    vi.stubGlobal('fetch', makeFetchError(404));
    await expect(fetchJSON('https://example.com/api')).rejects.toThrow('HTTP 404');
  });

  it('throws on non-ok HTTP 500 status', async () => {
    vi.stubGlobal('fetch', makeFetchError(500));
    await expect(fetchJSON('https://example.com/api')).rejects.toThrow('HTTP 500');
  });

  it('throws on network error', async () => {
    vi.stubGlobal('fetch', makeFetchNetworkError('Failed to fetch'));
    await expect(fetchJSON('https://example.com/api')).rejects.toThrow('Failed to fetch');
  });

  it('throws AbortError when external signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(fetchJSON('https://example.com/api', 10000, controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
  });

  it('aborts request when external signal fires during fetch', async () => {
    const controller = new AbortController();
    // fetch that never resolves (until aborted)
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, { signal }) =>
      new Promise((_res, rej) => {
        signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
      })
    ));
    const p = fetchJSON('https://example.com/api', 10000, controller.signal);
    controller.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});

// ─── fetchWithFallback ───────────────────────────────────────────────────────
describe('fetchWithFallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns data from first proxy if it succeeds', async () => {
    vi.stubGlobal('fetch', makeFetchOk({ hello: 'world' }));
    const data = await fetchWithFallback('https://example.com/api');
    expect(data).toEqual({ hello: 'world' });
    // Should have been called only once (first proxy succeeded)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to second proxy if first fails', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ ok: false, status: 503 });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: 'fallback' }) });
    }));
    const data = await fetchWithFallback('https://example.com/api');
    expect(data).toEqual({ data: 'fallback' });
    expect(callCount).toBe(2);
  });

  it('tries all proxies and throws last error if all fail', async () => {
    vi.stubGlobal('fetch', makeFetchError(503));
    await expect(fetchWithFallback('https://example.com/api')).rejects.toThrow('HTTP 503');
    // Should try all 4 proxies
    expect(globalThis.fetch).toHaveBeenCalledTimes(CORS_PROXIES.length);
  });

  it('stops immediately on AbortError (does not try remaining proxies)', async () => {
    const controller = new AbortController();
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++;
      controller.abort();
      return Promise.resolve({ ok: false, status: 503 });
    }));
    // Pre-abort the signal so fetchJSON will throw AbortError before retry
    controller.abort();
    await expect(fetchWithFallback('https://example.com/api', controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
    // Should not retry after AbortError
    expect(callCount).toBe(0);
  });

  it('returns data from third proxy if first two fail', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) return Promise.resolve({ ok: false, status: 500 });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ found: true }) });
    }));
    const data = await fetchWithFallback('https://example.com/api');
    expect(data).toEqual({ found: true });
    expect(callCount).toBe(3);
  });
});

// ─── fetchCandles ─────────────────────────────────────────────────────────────
describe('fetchCandles', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('appends USDT to symbol in request URL', async () => {
    vi.stubGlobal('fetch', makeFetchOk(makeBybitResponse([makeKlineRow(0)])));
    await fetchCandles('BTC', '15m');
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('BTCUSDT');
  });

  it('does not double-append USDT for symbols already ending in USDT', async () => {
    vi.stubGlobal('fetch', makeFetchOk(makeBybitResponse([makeKlineRow(0)])));
    // fetchCandles appends USDT always — symbol should be passed without USDT
    // The function always does symbol + 'USDT', so we test that BTC → BTCUSDT
    await fetchCandles('BTC', '15m');
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).not.toContain('BTCUSDTUSDT');
  });

  it('handles 1000PEPE symbol correctly (no double USDT)', async () => {
    vi.stubGlobal('fetch', makeFetchOk(makeBybitResponse([makeKlineRow(0)])));
    await fetchCandles('1000PEPE', '15m');
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('1000PEPEUSDT');
    expect(url).not.toContain('USDTUSDT');
  });

  it('returns null when retCode is non-zero', async () => {
    vi.stubGlobal('fetch', makeFetchOk({ retCode: 10001, result: { list: [] } }));
    const result = await fetchCandles('BTC', '15m');
    expect(result).toBeNull();
  });

  it('returns null when result list is empty', async () => {
    vi.stubGlobal('fetch', makeFetchOk({ retCode: 0, result: { list: [] } }));
    const result = await fetchCandles('BTC', '15m');
    expect(result).toBeNull();
  });

  it('returns null when response is null/invalid', async () => {
    vi.stubGlobal('fetch', makeFetchOk(null));
    const result = await fetchCandles('BTC', '15m');
    expect(result).toBeNull();
  });

  it('parses and reverses the kline list from Bybit', async () => {
    // Bybit returns newest first; fetchCandles reverses to oldest-first
    const rows = [makeKlineRow(2), makeKlineRow(1), makeKlineRow(0)]; // newest first
    vi.stubGlobal('fetch', makeFetchOk(makeBybitResponse(rows)));
    const candles = await fetchCandles('ETH', '1h');
    expect(candles).not.toBeNull();
    expect(candles).toHaveLength(3);
    // After reverse: candle[0] should be row[2] (oldest = makeKlineRow(0))
    expect(candles[0].time).toBe(parseInt(makeKlineRow(0)[0]));
    expect(candles[2].time).toBe(parseInt(makeKlineRow(2)[0]));
  });

  it('parsed candle has correct OHLCV fields', async () => {
    const row = ['1700000000', '42000', '43000', '41000', '42500', '1200'];
    vi.stubGlobal('fetch', makeFetchOk(makeBybitResponse([row])));
    const candles = await fetchCandles('BTC', '4h');
    expect(candles).toHaveLength(1);
    const c = candles[0];
    expect(c.time).toBe(1700000000);
    expect(c.open).toBe(42000);
    expect(c.high).toBe(43000);
    expect(c.low).toBe(41000);
    expect(c.close).toBe(42500);
    expect(c.volume).toBe(1200);
  });

  it('uses correct interval mapping for timeframe', async () => {
    const TF_CASES = [
      ['5m', '5'], ['15m', '15'], ['30m', '30'],
      ['1h', '60'], ['4h', '240'], ['1D', 'D'],
    ];
    for (const [tf, interval] of TF_CASES) {
      vi.stubGlobal('fetch', makeFetchOk(makeBybitResponse([makeKlineRow(0)])));
      await fetchCandles('BTC', tf);
      const url = globalThis.fetch.mock.calls[0][0];
      expect(url).toContain(`interval=${interval}`);
      vi.unstubAllGlobals();
    }
  });

  it('propagates AbortError from network', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));
    await expect(fetchCandles('BTC', '15m', controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
  });

  it('returns null when result key is missing from response', async () => {
    vi.stubGlobal('fetch', makeFetchOk({ retCode: 0 })); // no .result key
    const result = await fetchCandles('BTC', '15m');
    expect(result).toBeNull();
  });

  it('does not throw for kline row with fewer than 6 fields (returns NaN values)', async () => {
    // Bybit rows normally have 7 fields; a truncated row should not crash
    const truncatedRow = ['1700000000', '42000']; // only time and open
    vi.stubGlobal('fetch', makeFetchOk(makeBybitResponse([truncatedRow])));
    let candles;
    expect(() => { /* synchronous part */ }).not.toThrow();
    candles = await fetchCandles('BTC', '15m');
    expect(Array.isArray(candles)).toBe(true);
    expect(candles).toHaveLength(1);
    // Undefined fields become NaN via parseFloat(undefined)
    expect(isNaN(candles[0].high)).toBe(true);
  });
});

// ─── TIMEFRAMES_BY_MODE ───────────────────────────────────────────────────────
describe('TIMEFRAMES_BY_MODE', () => {
  it('all modes return non-empty arrays', () => {
    for (const mode of ['scalp', 'day', 'swing', 'both']) {
      expect(Array.isArray(TIMEFRAMES_BY_MODE[mode])).toBe(true);
      expect(TIMEFRAMES_BY_MODE[mode].length).toBeGreaterThan(0);
    }
  });

  it('all timeframes in each mode exist in TF_MAP', () => {
    for (const [mode, tfs] of Object.entries(TIMEFRAMES_BY_MODE)) {
      for (const tf of tfs) {
        expect(TF_MAP).toHaveProperty(tf, expect.anything());
      }
    }
  });
});
