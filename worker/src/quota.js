// A circuit breaker, not throttling. With the cache working the Worker cannot
// come near these numbers however many people visit — at a 2.5 hour TTL the
// ceiling is around ten root requests a day — so hitting a cap means the cache
// stopped working, not that the site got popular.
//
// Periods are keyed on UTC. Google bills on US/Pacific, so the two are offset by
// several hours; a Google day can therefore overlap two of ours and allow up to
// twice the daily cap. That would matter if these counts were being compared
// against a bill, but nothing reads them except the cap, and 80 in a day is
// still far inside the monthly allowance.

export const CAPS = {daily: 40, monthly: 900};

// Read from the environment so a cap can be retuned, or dropped to 1 to prove
// the 429 path, without a commit and a deploy. Anything unusable falls back to
// the default: a variable deleted in the dashboard arrives as undefined, and
// neither that nor a typo should quietly mean "no limit".
export function capsFor(env) {
  return {
    daily: Number(env?.DAILY_CAP) || CAPS.daily,
    monthly: Number(env?.MONTHLY_CAP) || CAPS.monthly
  };
}

const startOfNextDay = now =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();

const startOfNextMonth = now =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

// The stored record as it applies now. A count belonging to a period that has
// since elapsed is dropped when next read, which is what makes the periods roll
// without anything having to run at midnight.
export function rollPeriods(stored, now) {
  const dayKey = now.toISOString().slice(0, 10);
  const monthKey = now.toISOString().slice(0, 7);
  return {
    dayKey,
    dayCount: stored?.dayKey === dayKey ? stored.dayCount : 0,
    monthKey,
    monthCount: stored?.monthKey === monthKey ? stored.monthCount : 0
  };
}

// Null when there is room, otherwise which cap is spent and when it frees up.
// resetsAt is an absolute instant, so the client needs no date handling of its
// own beyond formatting it.
export function exhausted(counts, now, caps = CAPS) {
  // Monthly first: when both are spent, the longer wait is the more useful thing
  // to report, and it is the one that maps to the free tier.
  if (counts.monthCount >= caps.monthly) {
    return {scope: 'monthly', resetsAt: startOfNextMonth(now)};
  }
  if (counts.dayCount >= caps.daily) {
    return {scope: 'daily', resetsAt: startOfNextDay(now)};
  }
  return null;
}
