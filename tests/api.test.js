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

  it('strips trailing USDT before appending — prevents BTCUSDTUSDT for custom coins', async () => {
    vi.stubGlobal('fetch', makeFetchOk(makeBybitResponse([makeKlineRow(0)])));
    // If a user enters "BTCUSDT" as a custom coin, the URL must be BTCUSDT (not BTCUSDTUSDT)
    await fetchCandles('BTCUSDT', '15m');
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('BTCUSDT');
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

// ─── fetchCandles: in-progress candle drop ───────────────────────────────────
// Bybit's kline endpoint returns the in-progress (still-open) candle as the
// most recent element. Pattern detectors that rely on body/range ratios
// (Marubozu, Doji, etc.) trigger spuriously on partial candles, so fetchCandles
// drops the last element when `candle.time + TF_INTERVAL_MS[tf] > Date.now()`.
describe('fetchCandles — in-progress candle drop', () => {
  // Builds a Bybit kline row [time, open, high, low, close, volume] at a given timestamp (ms)
  function makeKlineRowAt(timeMs) {
    return [String(timeMs), '100', '101', '99', '100.5', '500'];
  }

  const FIXED_NOW = 1730000000000; // 2024-10-27, well after epoch — keeps math intuitive

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('drops the most recent 15m candle when it is still in progress', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    // 15m interval = 900_000 ms. Newest candle opened 10s ago → partial → must be dropped.
    const partialT = FIXED_NOW - 10_000;
    const closedT  = FIXED_NOW - 15 * 60 * 1000; // opened 15m ago = just completed at boundary
    const olderT   = closedT - 15 * 60 * 1000;
    // Bybit returns newest-first; fetchCandles reverses to oldest-first
    const rows = [makeKlineRowAt(partialT), makeKlineRowAt(closedT), makeKlineRowAt(olderT)];
    vi.stubGlobal('fetch', makeFetchOk(makeBybitResponse(rows)));
    const candles = await fetchCandles('BTC', '15m');
    expect(candles).toHaveLength(2);
    // Last surviving candle is the one that closed exactly at FIXED_NOW (boundary stays)
    expect(candles[candles.length - 1].time).toBe(closedT);
    // The partial candle is gone
    expect(candles.some(c => c.time === partialT)).toBe(false);
  });

  it('keeps every candle when the newest one has already closed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    // Newest opened 16m ago: 16m > 15m interval → fully closed → must be kept
    const newestClosedT = FIXED_NOW - 16 * 60 * 1000;
    const olderT        = newestClosedT - 15 * 60 * 1000;
    const rows = [makeKlineRowAt(newestClosedT), makeKlineRowAt(olderT)];
    vi.stubGlobal('fetch', makeFetchOk(makeBybitResponse(rows)));
    const candles = await fetchCandles('BTC', '15m');
    expect(candles).toHaveLength(2);
    expect(candles[candles.length - 1].time).toBe(newestClosedT);
  });

  it('keeps the candle when its close-time equals Date.now() exactly (strict > boundary)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    // candle.time + intervalMs === Date.now()  ⇒  the `>` check must NOT drop it
    const justClosedT = FIXED_NOW - 15 * 60 * 1000;
    const olderT      = justClosedT - 15 * 60 * 1000;
    const rows = [makeKlineRowAt(justClosedT), makeKlineRowAt(olderT)];
    vi.stubGlobal('fetch', makeFetchOk(makeBybitResponse(rows)));
    const candles = await fetchCandles('BTC', '15m');
    expect(candles).toHaveLength(2);
    expect(candles[candles.length - 1].time).toBe(justClosedT);
  });

  it('drops in-progress 5m candle (interval = 300_000 ms)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    const partialT = FIXED_NOW - 30_000; // 30s into a 5m candle
    const closedT  = partialT - 5 * 60 * 1000;
    const rows = [makeKlineRowAt(partialT), makeKlineRowAt(closedT)];
    vi.stubGlobal('fetch', makeFetchOk(makeBybitResponse(rows)));
    const candles = await fetchCandles('BTC', '5m');
    expect(candles).toHaveLength(1);
    expect(candles[0].time).toBe(closedT);
  });

  it('drops in-progress 1D candle (interval = 86_400_000 ms)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    const partialT = FIXED_NOW - 60 * 60 * 1000; // 1h into a 1D candle
    const closedT  = partialT - 86_400_000;
    const rows = [makeKlineRowAt(partialT), makeKlineRowAt(closedT)];
    vi.stubGlobal('fetch', makeFetchOk(makeBybitResponse(rows)));
    const candles = await fetchCandles('BTC', '1D');
    expect(candles).toHaveLength(1);
    expect(candles[0].time).toBe(closedT);
  });

  it('drops a 4h candle that is 3h59m into its window (almost-closed is still in-progress)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    // 4h = 14_400_000 ms. Newest opened 3h59m ago → 60s remaining → still open
    const partialT = FIXED_NOW - (4 * 60 * 60 * 1000 - 60 * 1000);
    const closedT  = partialT - 4 * 60 * 60 * 1000;
    const rows = [makeKlineRowAt(partialT), makeKlineRowAt(closedT)];
    vi.stubGlobal('fetch', makeFetchOk(makeBybitResponse(rows)));
    const candles = await fetchCandles('BTC', '4h');
    expect(candles).toHaveLength(1);
    expect(candles[0].time).toBe(closedT);
  });

  it('returns an empty array when the only candle returned is in-progress', async () => {
    // Documents current behavior: the early-return check uses raw list length
    // (so we pass the !list.length guard), but the pop afterwards leaves us empty.
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    const rows = [makeKlineRowAt(FIXED_NOW - 10_000)];
    vi.stubGlobal('fetch', makeFetchOk(makeBybitResponse(rows)));
    const candles = await fetchCandles('BTC', '15m');
    expect(candles).toEqual([]);
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
