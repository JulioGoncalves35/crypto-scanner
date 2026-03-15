/**
 * Test fixtures: synthetic OHLCV candle data for deterministic tests.
 */

/**
 * Generate a simple uptrending candle series.
 * @param {number} count - number of candles
 * @param {number} startPrice
 * @param {number} step - price increment per candle
 */
export function makeTrendingCandles(count, startPrice = 100, step = 1) {
  const candles = [];
  for (let i = 0; i < count; i++) {
    const close = startPrice + i * step;
    const open  = close - step * 0.5;
    candles.push({
      time:   1000000 + i * 60000,
      open,
      high:   close + step * 0.3,
      low:    open  - step * 0.2,
      close,
      volume: 1000 + i * 10,
    });
  }
  return candles;
}

/**
 * Generate a flat (sideways) candle series, all same price.
 */
export function makeFlatCandles(count, price = 100) {
  return Array.from({ length: count }, (_, i) => ({
    time:   1000000 + i * 60000,
    open:   price,
    high:   price + 0.1,
    low:    price - 0.1,
    close:  price,
    volume: 1000,
  }));
}

/**
 * Generate a downtrending candle series.
 */
export function makeDowntrendCandles(count, startPrice = 200, step = 1) {
  const candles = [];
  for (let i = 0; i < count; i++) {
    const close = startPrice - i * step;
    const open  = close + step * 0.5;
    candles.push({
      time:   1000000 + i * 60000,
      open,
      high:   open  + step * 0.3,
      low:    close - step * 0.2,
      close,
      volume: 1000 + i * 10,
    });
  }
  return candles;
}

/**
 * A minimal 4-candle sequence for candlestick pattern tests.
 * Returns candles with controlled OHLCV values.
 */
export function makePatternCandles(overrides = []) {
  const base = [
    { time: 1, open: 100, high: 105, low: 98,  close: 103, volume: 1000 },
    { time: 2, open: 103, high: 108, low: 101, close: 107, volume: 1200 },
    { time: 3, open: 107, high: 110, low: 105, close: 106, volume: 900  },
    { time: 4, open: 106, high: 109, low: 104, close: 108, volume: 1100 },
  ];
  overrides.forEach((ov, i) => {
    if (ov && i < base.length) Object.assign(base[i], ov);
  });
  return base;
}
