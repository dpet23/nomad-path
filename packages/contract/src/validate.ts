import type { Bounds, Geometry, TripData, TripItem } from './schema.ts';
import { PER_POINT_ATTRIBUTE_NAMES, tripDataSchema } from './schema.ts';

export interface ContractIssue {
    /** Dot-joined location of the problem, e.g. "items.3.geometries.0". */
    path: string;
    message: string;
}

/**
 * Full producer-side validation: structural (Zod) first, then semantic
 * cross-field checks. Collects every issue instead of stopping at the first,
 * and never throws — the pipeline turns the returned list into its single
 * fail-loud report. The UI does not run this; it trusts the contract.
 */
export function validateTripData(doc: unknown): ContractIssue[] {
    const parsed = tripDataSchema.safeParse(doc);
    if (!parsed.success) {
        return parsed.error.issues.map(issue => ({
            path: issue.path.join('.'),
            message: issue.message,
        }));
    }
    return semanticIssues(parsed.data);
}

function semanticIssues(data: TripData): ContractIssue[] {
    const issues: ContractIssue[] = [];

    checkBounds(data.bounds, 'bounds', issues);
    checkUniqueness(data.items, issues);

    data.items.forEach((item, itemIndex) => {
        const itemPath = `items.${String(itemIndex)}`;
        checkBounds(item.bounds, `${itemPath}.bounds`, issues);
        checkDay(item, itemPath, issues);
        checkDivider(item, itemPath, issues);
        item.geometries.forEach((geometry, geometryIndex) => {
            checkGeometry(geometry, `${itemPath}.geometries.${String(geometryIndex)}`, issues);
        });
    });

    return issues;
}

function checkBounds(bounds: Bounds, path: string, issues: ContractIssue[]): void {
    const [, south, , north] = bounds;
    // No west <= east check: west > east legitimately encodes an
    // antimeridian-crossing box. Latitude has no such wraparound.
    if (south > north) {
        issues.push({
            path,
            message: `bounds south (${String(south)}) exceeds north (${String(north)})`,
        });
    }
}

function checkUniqueness(items: readonly TripItem[], issues: ContractIssue[]): void {
    const seenIds = new Map<string, number>();
    const seenOrders = new Map<number, number>();
    items.forEach((item, index) => {
        const idFirstSeen = seenIds.get(item.id);
        if (idFirstSeen === undefined) {
            seenIds.set(item.id, index);
        } else {
            issues.push({
                path: `items.${String(index)}.id`,
                message: `duplicate item id "${item.id}" (first used by items.${String(idFirstSeen)})`,
            });
        }
        const orderFirstSeen = seenOrders.get(item.order);
        if (orderFirstSeen === undefined) {
            seenOrders.set(item.order, index);
        } else {
            issues.push({
                path: `items.${String(index)}.order`,
                message: `duplicate order ${String(item.order)} (first used by items.${String(orderFirstSeen)})`,
            });
        }
    });
}

function checkDay(item: TripItem, itemPath: string, issues: ContractIssue[]): void {
    if (item.day === undefined) return;
    const [year, month, dayOfMonth] = item.day.split('-').map(Number) as [number, number, number];
    const date = new Date(Date.UTC(year, month - 1, dayOfMonth));
    const roundTrips =
        date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === dayOfMonth;
    if (!roundTrips) {
        issues.push({
            path: `${itemPath}.day`,
            message: `"${item.day}" is not a real calendar date`,
        });
    }
}

function checkDivider(item: TripItem, itemPath: string, issues: ContractIssue[]): void {
    if (!item.divider) return;
    if (item.panel !== 'tracks') {
        issues.push({
            path: `${itemPath}.divider`,
            message: `divider items must be on the "tracks" panel, got "${item.panel}"`,
        });
    }
    if (item.day === undefined) {
        issues.push({
            path: `${itemPath}.divider`,
            message: 'divider items must carry a day',
        });
    }
}

function checkGeometry(geometry: Geometry, path: string, issues: ContractIssue[]): void {
    if (geometry.type === 'point') return;

    if (geometry.lon.length !== geometry.lat.length) {
        issues.push({
            path,
            message: `lon length (${String(geometry.lon.length)}) does not match lat length (${String(geometry.lat.length)})`,
        });
    }

    if (geometry.type === 'line') {
        const pointCount = geometry.lon.length;
        if (geometry.time !== undefined) {
            if (geometry.time.length !== pointCount) {
                issues.push({
                    path,
                    message: `time length (${String(geometry.time.length)}) does not match point count (${String(pointCount)})`,
                });
            }
            for (let i = 1; i < geometry.time.length; i += 1) {
                const previous = geometry.time[i - 1];
                const current = geometry.time[i];
                if (previous !== undefined && current !== undefined && current < previous) {
                    issues.push({
                        path: `${path}.time`,
                        message: `timestamps must be non-decreasing (index ${String(i)})`,
                    });
                    break;
                }
            }
        }
        for (const attribute of PER_POINT_ATTRIBUTE_NAMES) {
            const values = geometry[attribute];
            if (values !== undefined && values.length !== pointCount) {
                issues.push({
                    path,
                    message: `${attribute} length (${String(values.length)}) does not match point count (${String(pointCount)})`,
                });
            }
        }
    }

    if (geometry.type === 'polygon') {
        const first = { lon: geometry.lon[0], lat: geometry.lat[0] };
        const last = {
            lon: geometry.lon[geometry.lon.length - 1],
            lat: geometry.lat[geometry.lat.length - 1],
        };
        if (first.lon !== last.lon || first.lat !== last.lat) {
            issues.push({ path, message: 'polygon ring must be closed (first position == last)' });
        }
    }
}
