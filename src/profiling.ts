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
const PROFILING_ON = typeof NOMADPATH_PROFILING !== 'undefined' && NOMADPATH_PROFILING;

const profileTimed = <T>(name: string, fn: () => T): T => {
    performance.mark(`${name}:start`);
    try {
        return fn();
    } finally {
        performance.mark(`${name}:end`);
        performance.measure(name, `${name}:start`, `${name}:end`);
    }
};

const profileIdentity = <T>(_name: string, fn: () => T): T => fn();

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

/** Time a synchronous operation, emitting a `performance.measure(name)`. */
export const profile = PROFILING_ON ? profileTimed : profileIdentity;

/** Time an async operation, emitting a `performance.measure(name)`. */
export const profileAsync = PROFILING_ON ? profileAsyncTimed : profileAsyncIdentity;
