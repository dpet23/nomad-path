/**
 * Runtime predicates used by CAPABILITIES entries. Each predicate returns
 * a one-line error message, or null when the value is valid.
 */

type CheckResult = string | null;

/** Predicate run against a top-level property value. */
export type Check = (value: unknown, ctx: CheckContext) => CheckResult;

/** Predicate run against a single entry inside a parallel array. */
export type EntryCheck = (value: unknown) => CheckResult;

export interface CheckContext {
    /** Length of the track's coordinate array; used for parallel-array length pairing. */
    coordsLen: number;
    /** When true, parallel-array entries may be null. */
    nullable?: boolean;
    /** Predicate for each entry of a parallel array. */
    entry?: EntryCheck;
}

/** Short human-readable description of a value's runtime type, for error messages. */
function describe(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

/** Accepts any non-empty string. */
export const isNonEmptyString: Check = value =>
    typeof value === 'string' && value.length > 0 ? null : `expected non-empty string, got ${describe(value)}`;

/** Accepts a finite number (rejects NaN/Infinity). */
export const isFiniteNumber: EntryCheck = value =>
    typeof value === 'number' && Number.isFinite(value) ? null : `expected finite number, got ${describe(value)}`;

/** Factory: accepts a finite number within `[min, max]` inclusive. */
export function inRange(min: number, max: number): EntryCheck {
    return value => {
        const err = isFiniteNumber(value);
        if (err) return err;
        const n = value as number;
        return n < min || n > max ? `${n} out of range [${min}, ${max}]` : null;
    };
}

/**
 * Accepts an array with length matching `coordsLen`. Each entry is checked
 * by `ctx.entry`; null entries are accepted when `ctx.nullable` is true.
 */
export const isParallelArray: Check = (value, { coordsLen, nullable, entry }) => {
    if (!Array.isArray(value)) return `expected array, got ${describe(value)}`;
    if (value.length !== coordsLen) {
        return `length ${value.length} does not match coordinates length ${coordsLen}`;
    }
    if (!entry) return null;
    for (let i = 0; i < value.length; i++) {
        const x = value[i];
        if (x === null) {
            if (!nullable) return `[${i}]: null not permitted`;
            continue;
        }
        const err = entry(x);
        if (err) return `[${i}]: ${err}`;
    }
    return null;
};
