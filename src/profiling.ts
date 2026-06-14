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

/**
 * The slice of the MapLibre map API the time-to-rendered primitive needs: a
 * one-shot settle listener and its matching removal. Kept structural (not the
 * full `Map` type) so the primitive stays decoupled and unit-testable.
 */
export interface RenderSettleMap {
    once(type: 'idle', listener: () => void): unknown;
    off(type: 'idle', listener: () => void): unknown;
}

// Pending settle listeners keyed by measure name, so a new action for the same
// operation can cancel the prior one (last-wins). Without this, rapid repeats
// (e.g. fast toggling) would leak `once('idle')` handlers and emit overlapping
// measures. Lives at module scope: there is one render loop per map, and names
// are operation-scoped (`nomadpath.<op>`).
const pendingSettles = new Map<string, { map: RenderSettleMap; listener: () => void }>();

const profileToRenderedTimed = <T>(name: string, map: RenderSettleMap, trigger: () => T): T => {
    // Last-wins: cancel any in-flight settle for this operation before starting
    // a new one, so we never leak handlers or emit overlapping measures.
    const prior = pendingSettles.get(name);
    if (prior) {
        prior.map.off('idle', prior.listener);
        pendingSettles.delete(name);
    }

    const startMark = `${name}:start`;
    performance.mark(startMark);

    const listener = () => {
        pendingSettles.delete(name);
        performance.mark(`${name}:end`);
        performance.measure(name, startMark, `${name}:end`);
    };
    pendingSettles.set(name, { map, listener });
    map.once('idle', listener);

    return trigger();
};

const profileToRenderedIdentity = <T>(_name: string, _map: RenderSettleMap, trigger: () => T): T => trigger();

/** Time a synchronous operation, emitting a `performance.measure(name)`. */
export const profile = PROFILING_ON ? profileTimed : profileIdentity;

/** Time an async operation, emitting a `performance.measure(name)`. */
export const profileAsync = PROFILING_ON ? profileAsyncTimed : profileAsyncIdentity;

/**
 * Measure an operation's *time to rendered*: start a mark, run the (synchronous)
 * `trigger` that schedules the map work, and emit a `performance.measure(name)`
 * when the map next reaches `idle` (rendering settled). This captures the
 * deferred tessellation/repaint cost a user actually waits on — which the
 * synchronous `profile` wrappers cannot see, because `map.set*` calls are
 * fire-and-forget. Returns the trigger's value.
 */
export const profileToRendered = PROFILING_ON ? profileToRenderedTimed : profileToRenderedIdentity;
