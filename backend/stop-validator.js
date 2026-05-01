/**
 * Pure validation: is `new_stop` tighter (closer to entry) than `current_stop`?
 *
 * For BUY: stop is below entry, so tighter means HIGHER (new > current).
 * For SELL: stop is above entry, so tighter means LOWER (new < current).
 *
 * Returns false for invalid input (unknown direction, NaN/Infinity values).
 * Equality returns false — no movement is not a tightening.
 */
export function isStopTighter(direction, current_stop, new_stop) {
  if (!Number.isFinite(current_stop) || !Number.isFinite(new_stop)) return false;
  if (direction === 'buy')  return new_stop > current_stop;
  if (direction === 'sell') return new_stop < current_stop;
  return false;
}
