// Build-time constant. Replaced by @rollup/plugin-replace per output:
//   prod bundle      → false  (terser DCEs the profiling branch away)
//   profiling bundle → true
// Under vitest/tsc it is neither replaced nor defined at runtime, so we
// declare it and read it through a guarded default below.
declare const NOMADPATH_PROFILING: boolean;

// `typeof NOMADPATH_PROFILING` is a compile-time-safe probe: in the test/tsc
// context the identifier is undefined, so this evaluates to false without a
// ReferenceError. In a rollup build the identifier is replaced with a literal
// before this file is bundled, so the ternary folds to one branch.
// Exported so non-`profile()` profiling-only code (e.g. segment counting that
// merely *feeds* a measure) can be gated too — terser DCEs the `false` branch in
// the prod build, keeping that code absent, not just dormant.
export const PROFILING_ON = typeof NOMADPATH_PROFILING !== 'undefined' && NOMADPATH_PROFILING;

// Arbitrary structured payload attached to a measure. Propagates to the
// PerformanceObserver entry as `entry.detail` (e.g. `{ segments: 112541 }`).
type MeasureDetail = Record<string, unknown>;

const profileTimed = <T>(name: string, fn: () => T, detail?: MeasureDetail): T => {
    performance.mark(`${name}:start`);
    try {
        return fn();
    } finally {
        performance.mark(`${name}:end`);
        // Object-form signature so an optional `detail` rides through to the
        // PerformanceObserver entry; the 3-string form cannot carry detail.
        performance.measure(name, { start: `${name}:start`, end: `${name}:end`, detail });
    }
};

const profileIdentity = <T>(_name: string, fn: () => T, _detail?: MeasureDetail): T => fn();

const profileAsyncTimed = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    performance.mark(`${name}:start`);
    try {
        return await fn();
    } finally {
        performance.mark(`${name}:end`);
        performance.measure(name, `${name}:start`, `${name}:end`);
    }
};

const profileAsyncIdentity = <T>(_name: string, fn: () => Promise<T>): Promise<T> => fn();

/**
 * Time a synchronous operation, emitting a `performance.measure(name)`. An
 * optional `detail` payload (e.g. `{ segments: 112541 }`) rides through to the
 * PerformanceObserver entry as `entry.detail`. Folds to an identity wrapper in
 * prod (detail ignored, DCE'd).
 */
export const profile = PROFILING_ON ? profileTimed : profileIdentity;

/** Time an async operation, emitting a `performance.measure(name)`. */
export const profileAsync = PROFILING_ON ? profileAsyncTimed : profileAsyncIdentity;
