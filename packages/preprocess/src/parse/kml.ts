/**
 * KML parser: one file's XML into RawFeatures, faithfully. Like the GPX parser
 * it translates and decides nothing - one feature per <Placemark>, whatever
 * geometry that placemark holds, kept as-is. It does NOT bundle related
 * placemarks (e.g. the points and lines of one cyclone) into a single object,
 * nor drop recognised-but-unwanted airport waypoints; that grouping and
 * filtering is a later rule stage's job. The only refusals are structural:
 * XML that will not parse, non-numeric coordinates, a gx:Track whose when and
 * coord lists disagree, and a line with fewer than two points.
 */

import { XMLParser } from 'fast-xml-parser';
import { SyntaxValidator } from 'fast-xml-validator';

import type { ParseError, ParseResult, RawFeature, RawGeometry, RawLine, RawPoint, RawPolygon } from '../model.ts';

/** fast-xml-parser output: child elements keyed by tag. */
type XmlNode = Record<string, unknown>;

/** Tags that may repeat; forcing them to arrays keeps traversal uniform. */
const ARRAY_TAGS = new Set(['Folder', 'Placemark', 'when', 'gx:coord']);

const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    isArray: tag => ARRAY_TAGS.has(tag),
});

function asArray(value: unknown): XmlNode[] {
    if (value === undefined || value === null) return [];
    return (Array.isArray(value) ? value : [value]) as XmlNode[];
}

/** Text of an element, whether a bare string or a node carrying attributes/#text. */
function text(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'object' && value !== null && '#text' in value) {
        return text((value as XmlNode)['#text']);
    }
    return undefined;
}

/** ISO 8601 to epoch seconds; a timestamp with no zone designator is read as UTC. */
function parseTime(value: string): number | null {
    const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
    const ms = Date.parse(zoned);
    return Number.isNaN(ms) ? null : ms / 1000;
}

interface Vertex {
    lon: number;
    lat: number;
    ele: number | null;
}

class ParseFailure extends Error {}

/** Strict finite number; throws ParseFailure so the caller can collect one error and move on. */
function coord(token: string, label: string): number {
    const n = Number(token);
    if (token.trim() === '' || !Number.isFinite(n)) {
        throw new ParseFailure(`${label}: non-numeric coordinate "${token}"`);
    }
    return n;
}

/** A <coordinates> block: whitespace-separated "lon,lat[,ele]" tuples. */
function parseCoordinates(raw: string, label: string): Vertex[] {
    return raw
        .trim()
        .split(/\s+/)
        .filter(t => t !== '')
        .map(tuple => {
            const [lon, lat, ele] = tuple.split(',');
            return {
                lon: coord(lon ?? '', label),
                lat: coord(lat ?? '', label),
                ele: ele === undefined || ele === '' ? null : coord(ele, label),
            };
        });
}

/** A gx:Track: parallel <when> and <gx:coord> ("lon lat ele" space-separated) lists. */
function parseTrack(track: XmlNode, label: string): RawLine {
    const whens = asArray(track.when).map(w => text(w));
    const coords = asArray(track['gx:coord']).map(c => text(c));
    if (whens.length !== coords.length) {
        throw new ParseFailure(
            `${label}: gx:Track has ${String(whens.length)} when values but ${String(coords.length)} coords`,
        );
    }
    const vertices = coords.map((c): Vertex => {
        const [lon, lat, ele] = (c ?? '').trim().split(/\s+/);
        return {
            lon: coord(lon ?? '', label),
            lat: coord(lat ?? '', label),
            ele: ele === undefined || ele === '' ? null : coord(ele, label),
        };
    });
    const line = lineFromVertices(vertices, label);
    const times = whens.map(w => (w === undefined ? null : parseTime(w)));
    if (times.some(t => t !== null)) line.time = times;
    return line;
}

/** Build a line, requiring at least two vertices, carrying ele only if some point has it. */
function lineFromVertices(vertices: Vertex[], label: string): RawLine {
    if (vertices.length < 2) {
        throw new ParseFailure(`${label}: a line needs at least 2 points, found ${String(vertices.length)}`);
    }
    const line: RawLine = { type: 'line', lon: vertices.map(v => v.lon), lat: vertices.map(v => v.lat) };
    if (vertices.some(v => v.ele !== null)) line.ele = vertices.map(v => v.ele);
    return line;
}

/** The one geometry a placemark holds, or undefined if it has none we recognise. */
function geometryOf(placemark: XmlNode, label: string): RawGeometry | undefined {
    if (placemark['gx:Track'] !== undefined) {
        return parseTrack(placemark['gx:Track'] as XmlNode, label);
    }
    const lineString = placemark.LineString as XmlNode | undefined;
    if (lineString !== undefined) {
        return lineFromVertices(parseCoordinates(text(lineString.coordinates) ?? '', label), label);
    }
    const polygon = placemark.Polygon as XmlNode | undefined;
    if (polygon !== undefined) {
        const ring = ((polygon.outerBoundaryIs as XmlNode | undefined)?.LinearRing as XmlNode | undefined)?.coordinates;
        const vertices = parseCoordinates(text(ring) ?? '', label);
        const poly: RawPolygon = { type: 'polygon', lon: vertices.map(v => v.lon), lat: vertices.map(v => v.lat) };
        return poly;
    }
    const point = placemark.Point as XmlNode | undefined;
    if (point !== undefined) {
        const [vertex] = parseCoordinates(text(point.coordinates) ?? '', label);
        if (vertex === undefined) throw new ParseFailure(`${label}: Point has no coordinates`);
        const p: RawPoint = { type: 'point', lon: vertex.lon, lat: vertex.lat };
        return p;
    }
    return undefined;
}

/** Set an optional string field only when present (exactOptionalPropertyTypes: omit, never set undefined). */
function assign(feature: RawFeature, key: 'name' | 'description' | 'folder', value: string | undefined): void {
    if (value !== undefined) feature[key] = value;
}

interface Context {
    sourceFile: string;
    features: RawFeature[];
    fail: (message: string) => void;
    next: () => number;
}

/** Depth-first walk over Folders and Placemarks, carrying the innermost folder name down. */
function walk(container: XmlNode, folder: string | undefined, ctx: Context): void {
    for (const [i, placemark] of asArray(container.Placemark).entries()) {
        const name = text(placemark.name);
        const label = `placemark ${name ?? String(i)}`;
        let geometry: RawGeometry | undefined;
        try {
            geometry = geometryOf(placemark, label);
        } catch (e) {
            ctx.fail(e instanceof Error ? e.message : String(e));
            continue;
        }
        if (geometry === undefined) continue;
        const feature: RawFeature = { sourceFile: ctx.sourceFile, sourceIndex: ctx.next(), geometries: [geometry] };
        assign(feature, 'name', name);
        assign(feature, 'description', text(placemark.description));
        assign(feature, 'folder', folder);
        ctx.features.push(feature);
    }
    for (const child of asArray(container.Folder)) {
        walk(child, text(child.name) ?? folder, ctx);
    }
}

export function parseKml(xml: string, sourceFile: string): ParseResult {
    const features: RawFeature[] = [];
    const errors: ParseError[] = [];
    const fail = (message: string) => errors.push({ sourceFile, message });

    let root: XmlNode | undefined;
    try {
        SyntaxValidator.validate(xml);
        root = (parser.parse(xml) as XmlNode).kml as XmlNode | undefined;
    } catch (e) {
        fail(`malformed XML: ${e instanceof Error ? e.message : String(e)}`);
        return { features, errors };
    }
    if (root === undefined || typeof root !== 'object') {
        fail('not a KML document: missing <kml> root element');
        return { features, errors };
    }

    let sourceIndex = 0;
    const ctx: Context = { sourceFile, features, fail, next: () => sourceIndex++ };
    // Placemarks and Folders can sit directly under <kml> or under a <Document>.
    walk((root.Document as XmlNode | undefined) ?? root, undefined, ctx);

    return { features, errors };
}
