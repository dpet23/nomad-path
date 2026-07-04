import type { Geometry, LineGeometry, PolygonGeometry, TripData } from './schema.ts';
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

    data.items.forEach((item, itemIndex) => {
        const itemPath = `items.${String(itemIndex)}`;
        item.geometries.forEach((geometry, geometryIndex) => {
            checkGeometry(geometry, `${itemPath}.geometries.${String(geometryIndex)}`, issues);
        });
    });

    return issues;
}

/** Dispatches per-geometry semantic checks (points need none beyond Zod). */
function checkGeometry(geometry: Geometry, path: string, issues: ContractIssue[]): void {
    if (geometry.type === 'point') return;

    if (geometry.lon.length !== geometry.lat.length) {
        issues.push({
            path,
            message: `lon length (${String(geometry.lon.length)}) does not match lat length (${String(geometry.lat.length)})`,
        });
    }

    if (geometry.type === 'line') {
        checkLine(geometry, path, issues);
    } else {
        checkPolygonRing(geometry, path, issues);
    }
}

/** Checks per-point array parity on a line. */
function checkLine(line: LineGeometry, path: string, issues: ContractIssue[]): void {
    const pointCount = line.lon.length;
    if (line.time !== undefined && line.time.length !== pointCount) {
        issues.push({
            path,
            message: `time length (${String(line.time.length)}) does not match point count (${String(pointCount)})`,
        });
    }
    for (const attribute of PER_POINT_ATTRIBUTE_NAMES) {
        const values = line[attribute];
        if (values !== undefined && values.length !== pointCount) {
            issues.push({
                path,
                message: `${attribute} length (${String(values.length)}) does not match point count (${String(pointCount)})`,
            });
        }
    }
}

/** Checks that a polygon's single outer ring is closed. */
function checkPolygonRing(polygon: PolygonGeometry, path: string, issues: ContractIssue[]): void {
    const first = { lon: polygon.lon[0], lat: polygon.lat[0] };
    const last = {
        lon: polygon.lon[polygon.lon.length - 1],
        lat: polygon.lat[polygon.lat.length - 1],
    };
    if (first.lon !== last.lon || first.lat !== last.lat) {
        issues.push({ path, message: 'polygon ring must be closed (first position == last)' });
    }
}
