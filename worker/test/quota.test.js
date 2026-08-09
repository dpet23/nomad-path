import test from 'node:test';
import assert from 'node:assert/strict';

import {rollPeriods, exhausted, capsFor, CAPS} from '../src/quota.js';

const at = iso => new Date(iso);
const NOW = at('2026-08-09T10:00:00Z');
const NEXT_DAY = at('2026-08-10T02:00:00Z');

const stored = {dayKey: '2026-08-09', dayCount: 5, monthKey: '2026-08', monthCount: 20};

test('the daily count resets when the day rolls, the monthly one does not', () => {
  // Keying monthCount off dayKey would reset the month every night, and the
  // monthly cap would never fire.
  assert.deepEqual(rollPeriods(stored, NEXT_DAY), {
    dayKey: '2026-08-10',
    dayCount: 0,
    monthKey: '2026-08',
    monthCount: 20
  });
});

test('an unreadable cap falls back rather than removing the limit', () => {
  // A variable deleted in the dashboard arrives as undefined and a mistyped one
  // as NaN. `count >= NaN` is always false, so getting this wrong leaves a cap
  // that looks configured and never fires.
  assert.deepEqual(capsFor({DAILY_CAP: '', MONTHLY_CAP: 'none'}), CAPS);
  assert.deepEqual(capsFor({DAILY_CAP: '1'}), {daily: 1, monthly: CAPS.monthly});
});

test('the cap fires on the request that reaches it, not before', () => {
  const caps = {daily: 40, monthly: 900};
  assert.equal(exhausted({...stored, dayCount: 39}, NOW, caps), null);
  assert.equal(exhausted({...stored, dayCount: 40}, NOW, caps).scope, 'daily');
});

test('a spent cap reports when it frees up', () => {
  // Feeds the banner the site shows, so a wrong instant is user-visible.
  assert.equal(
    exhausted({...stored, dayCount: CAPS.daily}, NOW).resetsAt,
    '2026-08-10T00:00:00.000Z'
  );
  assert.equal(
    exhausted({...stored, monthCount: CAPS.monthly}, NOW).resetsAt,
    '2026-09-01T00:00:00.000Z'
  );
});

test('the monthly cap is reported when both are spent', () => {
  // Deliberate: the longer wait is the more useful thing to tell a caller.
  const counts = {dayKey: '2026-08-09', dayCount: CAPS.daily, monthKey: '2026-08', monthCount: CAPS.monthly};
  assert.equal(exhausted(counts, NOW).scope, 'monthly');
});
