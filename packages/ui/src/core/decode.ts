import type { LineGeometry, TripItem } from '@nomadpath/contract';
import { CONTRACT_VERSION, PER_POINT_ATTRIBUTE_NAMES, tripItemSchema } from '@nomadpath/contract';

/**
 * The set of optional per-point line-geometry arrays that field-tier decode
 * may drop when their length does not match `lon`. `time` is included even
 * though it lives outside the contract's per-point attribute registry.
 */
const FIELD_TIER_DROPPABLE = ['time', ...PER_POINT_ATTRIBUTE_NAMES] as const;

/**
 * A non-fatal decode observation surfaced alongside a successfully decoded
 * file: either a whole item was skipped, or one optional attribute array was
 * dropped from a kept item's geometry.
 */
export interface DecodeNotice {
    kind: 'item-skipped' | 'attribute-dropped';
    itemIndex: number;
    attribute?: string;
    reason: string;
}

/**
 * The outcome of decoding a raw, untrusted trip-data payload: either a usable
 * (possibly degraded) trip with notices describing what was dropped, or a
 * file-level failure when the payload is not shaped like trip data at all.
 */
export type DecodeResult =
    { ok: true; name?: string; items: TripItem[]; notices: DecodeNotice[] } | { ok: false; reason: string };

/**
 * Reports whether a value is a plain (non-null, non-array) object, the shape
 * the file tier expects `raw` and `raw.items` elements to be before any
 * deeper parsing is attempted.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Formats the first Zod issue from a failed `safeParse` into a technical,
 * debug-layer-facing reason string (path + message). The fallback branch
 * guards a `safeParse` failure with no issues, which does not occur in
 * practice but keeps this function total without a non-null assertion.
 */
function firstIssueReason(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
    const issue = error.issues[0];
    if (!issue) {
        return 'unknown validation error';
    }
    const path = issue.path.join('.') || '(root)';
    return `${path}: ${issue.message}`;
}

/**
 * Reports whether an item's line geometries all have matching `lon`/`lat`
 * lengths. A mismatch makes the geometry unusable, which is an item-tier
 * failure (the whole item is skipped), not a field-tier attribute drop.
 */
function hasUsableLineGeometries(item: TripItem): boolean {
    return item.geometries.every(geometry => geometry.type !== 'line' || geometry.lon.length === geometry.lat.length);
}

/**
 * Drops any optional per-point array on one line geometry whose length does
 * not match `lon`, recording a notice for each drop. Returns the original
 * geometry unchanged when nothing was dropped, or a new geometry object
 * otherwise, so the input is never mutated.
 */
function dropMismatchedAttributes(line: LineGeometry, itemIndex: number, notices: DecodeNotice[]): LineGeometry {
    let nextLine: LineGeometry = line;
    for (const attribute of FIELD_TIER_DROPPABLE) {
        const values = line[attribute];
        if (values !== undefined && values.length !== line.lon.length) {
            notices.push({
                kind: 'attribute-dropped',
                itemIndex,
                attribute,
                reason: `${attribute}: length ${String(values.length)} does not match lon length ${String(line.lon.length)}`,
            });
            nextLine = { ...nextLine, [attribute]: undefined };
        }
    }
    return nextLine;
}

/**
 * Applies field-tier defensive handling to one kept item: for each line
 * geometry, drops any optional per-point array whose length does not match
 * `lon`, recording a notice for each drop. Returns a new item (and new
 * geometry objects where a drop occurred) so the input is never mutated.
 */
function applyFieldTier(item: TripItem, itemIndex: number, notices: DecodeNotice[]): TripItem {
    const geometries = item.geometries.map(geometry =>
        geometry.type === 'line' ? dropMismatchedAttributes(geometry, itemIndex, notices) : geometry,
    );
    const geometriesChanged = geometries.some((geometry, index) => geometry !== item.geometries[index]);
    return geometriesChanged ? { ...item, geometries } : item;
}

/**
 * Decodes a raw, untrusted parsed-JSON value into trip data the UI can
 * render, applying tiered defensive handling. Never throws: this is the
 * boundary between the pipeline's strict, fail-loud output contract and the
 * UI's never-crash guarantee. File-shape problems fail the whole decode;
 * one bad item is skipped in isolation; one bad optional attribute array on
 * an otherwise-good item is dropped in isolation. Every skip or drop is
 * reported as a `DecodeNotice` so a caller can surface a friendly summary
 * while this reason string stays technical, for a debug layer.
 */
export function decodeTripData(raw: unknown): DecodeResult {
    if (!isPlainObject(raw)) {
        return { ok: false, reason: 'trip data must be a JSON object' };
    }
    if (raw.version !== CONTRACT_VERSION) {
        return {
            ok: false,
            reason: `unsupported contract version: expected ${String(CONTRACT_VERSION)}, found ${JSON.stringify(raw.version)}`,
        };
    }
    const rawItems: unknown = raw.items;
    if (!Array.isArray(rawItems)) {
        return { ok: false, reason: 'trip data "items" must be an array' };
    }

    const items: TripItem[] = [];
    const notices: DecodeNotice[] = [];

    rawItems.forEach((rawItem: unknown, itemIndex: number) => {
        const parsed = tripItemSchema.safeParse(rawItem);
        if (!parsed.success) {
            notices.push({ kind: 'item-skipped', itemIndex, reason: firstIssueReason(parsed.error) });
            return;
        }
        if (!hasUsableLineGeometries(parsed.data)) {
            notices.push({
                kind: 'item-skipped',
                itemIndex,
                reason: 'line geometry has mismatched lon/lat lengths',
            });
            return;
        }
        const item = applyFieldTier(parsed.data, itemIndex, notices);
        items.push(item);
    });

    const name = raw.name;
    return typeof name === 'string' ? { ok: true, name, items, notices } : { ok: true, items, notices };
}
