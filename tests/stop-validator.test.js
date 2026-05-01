import { describe, it, expect } from 'vitest';
import { isStopTighter } from '../backend/stop-validator.js';

describe('isStopTighter — BUY direction', () => {
  // For BUY, stop is below entry. Tighter = closer to entry = HIGHER price.

  it('returns true when new_stop is higher than current_stop', () => {
    expect(isStopTighter('buy', 100, 102)).toBe(true);
  });

  it('returns false when new_stop is lower than current_stop', () => {
    expect(isStopTighter('buy', 100, 98)).toBe(false);
  });

  it('returns false when new_stop equals current_stop', () => {
    expect(isStopTighter('buy', 100, 100)).toBe(false);
  });
});

describe('isStopTighter — SELL direction', () => {
  // For SELL, stop is above entry. Tighter = closer to entry = LOWER price.

  it('returns true when new_stop is lower than current_stop', () => {
    expect(isStopTighter('sell', 100, 98)).toBe(true);
  });

  it('returns false when new_stop is higher than current_stop', () => {
    expect(isStopTighter('sell', 100, 102)).toBe(false);
  });

  it('returns false when new_stop equals current_stop', () => {
    expect(isStopTighter('sell', 100, 100)).toBe(false);
  });
});

describe('isStopTighter — invalid input', () => {
  it('returns false for unknown direction', () => {
    expect(isStopTighter('hold', 100, 102)).toBe(false);
  });

  it('returns false when new_stop is not finite', () => {
    expect(isStopTighter('buy', 100, NaN)).toBe(false);
    expect(isStopTighter('buy', 100, Infinity)).toBe(false);
  });

  it('returns false when current_stop is not finite', () => {
    expect(isStopTighter('buy', NaN, 100)).toBe(false);
  });
});
