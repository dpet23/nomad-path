/**
 * GPX parser: one file's XML into RawFeatures, faithfully. It translates and
 * decides nothing - every source point and segment passes through as-is, and
 * missing per-point time/ele/speed become null (never dropped, never derived).
 * The only refusals are structural: XML that will not parse, coordinates that
 * are not numeric, and a segment too short to be a line. Discarding junk
 * (fix=none points, unwanted waypoints) is a later rule stage's job.
 */

import { XMLParser } from 'fast-xml-parser';
import { SyntaxValidator } from 'fast-xml-validator';

import type { ParseError, ParseResult, RawFeature, RawLine, RawPoint } from '../model.ts';

/** fast-xml-parser output: child elements keyed by tag, attributes prefixed with @_. */
type XmlNode = Record<string, unknown>;

/** Tags that may repeat; forcing them to arrays keeps the mapping uniform. */
const ARRAY_TAGS = new Set(['trk', 'trkseg', 'trkpt', 'wpt']);

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    parseAttributeValue: false,
    isArray: tag => ARRAY_TAGS.has(tag),
});

function asArray(value: unknown): XmlNode[] {
    if (value === undefined || value === null) return [];
    return (Array.isArray(value) ? value : [value]) as XmlNode[];
}

/** Text of an element, whether it is a bare string or carries attributes (then #text). */
function text(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'object' && value !== null && '#text' in value) {
        return text((value as XmlNode)['#text']);
    }
    return undefined;
}

/** Finite number or undefined; the whole string must be numeric. */
function num(value: unknown): number | undefined {
    const s = text(value);
    if (s === undefined || s.trim() === '') return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
}

/** ISO 8601 to epoch seconds; a timestamp with no zone designator is read as UTC. */
function parseTime(value: unknown): number | null {
    const s = text(value);
    if (s === undefined) return null;
    const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s}Z`;
    const ms = Date.parse(zoned);
    return Number.isNaN(ms) ? null : ms / 1000;
}

/** osmand:activity from a node's <extensions>, at either the metadata or trk level. */
function activityOf(node: XmlNode | undefined): string | undefined {
    return text((node?.extensions as XmlNode | undefined)?.['osmand:activity']);
}

/** Per-point speed: OsmAnd's osmand:speed or GoPro's nested speed_2d/value; null if neither. */
function speedOf(point: XmlNode): number | null {
    const ext = point.extensions as XmlNode | undefined;
    if (ext === undefined) return null;
    const osmand = num(ext['osmand:speed']);
    if (osmand !== undefined) return osmand;
    return num((ext.speed_2d as XmlNode | undefined)?.value) ?? null;
}

/** A per-point column becomes an array only if some point carries a value. */
function column(values: (number | null)[]): (number | null)[] | undefined {
    return values.some(v => v !== null) ? values : undefined;
}

/** Set an optional string field only when present (exactOptionalPropertyTypes: omit, never set undefined). */
function assign(
    feature: RawFeature,
    key: 'name' | 'description' | 'folder' | 'activity',
    value: string | undefined,
): void {
    if (value !== undefined) feature[key] = value;
}

interface Sink {
    fail: (message: string) => void;
}

/** One <wpt> to a point feature, or an error if its coordinates are unusable. */
function parseWaypoint(wpt: XmlNode, sourceFile: string, sourceIndex: number, sink: Sink): RawFeature | undefined {
    const lon = num(wpt['@_lon']);
    const lat = num(wpt['@_lat']);
    if (lon === undefined || lat === undefined) {
        sink.fail(`wpt ${String(sourceIndex)}: missing or non-numeric lat/lon`);
        return undefined;
    }
    const point: RawPoint = { type: 'point', lon, lat };
    const sym = text(wpt.sym);
    if (sym !== undefined) point.sym = sym;
    const feature: RawFeature = { sourceFile, sourceIndex, geometries: [point] };
    assign(feature, 'name', text(wpt.name));
    assign(feature, 'description', text(wpt.desc));
    assign(feature, 'folder', text(wpt.folder));
    return feature;
}

interface Point {
    lon: number;
    lat: number;
    time: number | null;
    ele: number | null;
    speed: number | null;
}

/** One <trkseg> to a line, or an error (bad coords / too few points) recorded on the sink. */
function parseSegment(trkseg: XmlNode, label: string, sink: Sink): RawLine | undefined {
    const points: Point[] = [];
    const trkpts = asArray(trkseg.trkpt);
    for (const [i, trkpt] of trkpts.entries()) {
        const lon = num(trkpt['@_lon']);
        const lat = num(trkpt['@_lat']);
        if (lon === undefined || lat === undefined) {
            sink.fail(`${label} trkpt ${String(i)}: missing or non-numeric lat/lon`);
            return undefined;
        }
        points.push({ lon, lat, time: parseTime(trkpt.time), ele: num(trkpt.ele) ?? null, speed: speedOf(trkpt) });
    }

    if (points.length < 2) {
        sink.fail(`${label}: a line needs at least 2 points, found ${String(points.length)}`);
        return undefined;
    }

    const line: RawLine = {
        type: 'line',
        lon: points.map(p => p.lon),
        lat: points.map(p => p.lat),
    };
    const time = column(points.map(p => p.time));
    if (time !== undefined) line.time = time;
    const ele = column(points.map(p => p.ele));
    if (ele !== undefined) line.ele = ele;
    const speed = column(points.map(p => p.speed));
    if (speed !== undefined) line.speed = speed;
    return line;
}

/** One <trk> to a feature (one line per segment), or an error if no segment yielded a line. */
function parseTrack(
    trk: XmlNode,
    sourceFile: string,
    sourceIndex: number,
    fallbackName: string | undefined,
    fallbackActivity: string | undefined,
    sink: Sink,
): RawFeature | undefined {
    const label = `trk ${String(sourceIndex)}`;
    const geometries: RawLine[] = [];
    let hadError = false;
    for (const [segIndex, trkseg] of asArray(trk.trkseg).entries()) {
        const line = parseSegment(trkseg, `${label} trkseg ${String(segIndex)}`, sink);
        if (line === undefined) hadError = true;
        else geometries.push(line);
    }
    if (geometries.length === 0) {
        if (!hadError) sink.fail(`${label}: no usable geometry`);
        return undefined;
    }
    const feature: RawFeature = { sourceFile, sourceIndex, geometries };
    assign(feature, 'name', text(trk.name) ?? fallbackName);
    assign(feature, 'activity', activityOf(trk) ?? fallbackActivity);
    return feature;
}

export function parseGpx(xml: string, sourceFile: string): ParseResult {
    const features: RawFeature[] = [];
    const errors: ParseError[] = [];
    const sink: Sink = { fail: message => errors.push({ sourceFile, message }) };

    let root: XmlNode | undefined;
    try {
        SyntaxValidator.validate(xml);
        root = (parser.parse(xml) as XmlNode).gpx as XmlNode | undefined;
    } catch (e) {
        sink.fail(`malformed XML: ${e instanceof Error ? e.message : String(e)}`);
        return { features, errors };
    }
    if (root === undefined || typeof root !== 'object') {
        sink.fail('not a GPX document: missing <gpx> root element');
        return { features, errors };
    }

    const metadata = root.metadata as XmlNode | undefined;
    const metadataName = text(metadata?.name);
    const metadataActivity = activityOf(metadata);
    let sourceIndex = 0;

    for (const wpt of asArray(root.wpt)) {
        const feature = parseWaypoint(wpt, sourceFile, sourceIndex, sink);
        if (feature !== undefined) features.push(feature);
        sourceIndex += 1;
    }
    for (const trk of asArray(root.trk)) {
        const feature = parseTrack(trk, sourceFile, sourceIndex, metadataName, metadataActivity, sink);
        if (feature !== undefined) features.push(feature);
        sourceIndex += 1;
    }

    return { features, errors };
}
