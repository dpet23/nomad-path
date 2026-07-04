import { describe, expect, it } from 'vitest';

import type { RawLine, RawPoint, RawPolygon } from '../src/model.ts';
import { parseKml } from '../src/parse/kml.ts';

const SOURCE = 'flights/2030-01-15/flight.kml';

/** Wraps body elements in a minimal KML document. */
function kml(body: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
<Document>
${body}
</Document>
</kml>`;
}

const FLIGHT = kml(`
  <name>FJI934 flight</name>
  <Placemark>
    <name>Flight track</name>
    <description>Fictional flight</description>
    <gx:Track>
      <altitudeMode>absolute</altitudeMode>
      <when>2030-01-15T08:00:00Z</when>
      <when>2030-01-15T08:00:16Z</when>
      <when>2030-01-15T08:00:32Z</when>
      <gx:coord>4.101 -54.501 100</gx:coord>
      <gx:coord>4.102 -54.502 150</gx:coord>
      <gx:coord>4.104 -54.503 200</gx:coord>
    </gx:Track>
  </Placemark>
  <Placemark>
    <name>YMML Airport</name>
    <description><![CDATA[Fictional Field <br> Southport]]></description>
    <Point><coordinates>4.201,-54.601,0</coordinates></Point>
  </Placemark>`);

describe('parseKml: FlightAware gx:Track', () => {
    it('parses a gx:Track into one line feature with name, description, and parallel arrays', () => {
        const result = parseKml(FLIGHT, SOURCE);
        expect(result.errors).toEqual([]);
        const feature = result.features[0];
        expect(feature).toMatchObject({
            sourceFile: SOURCE,
            sourceIndex: 0,
            name: 'Flight track',
            description: 'Fictional flight',
        });
        const line = feature?.geometries[0] as RawLine;
        expect(line.type).toBe('line');
        expect(line.lon).toEqual([4.101, 4.102, 4.104]);
        expect(line.lat).toEqual([-54.501, -54.502, -54.503]);
        expect(line.ele).toEqual([100, 150, 200]);
        expect(line.time).toEqual([1894694400, 1894694416, 1894694432]);
    });

    it('reads gx:coord as space-separated "lon lat ele" (lon first)', () => {
        const line = parseKml(FLIGHT, SOURCE).features[0]?.geometries[0] as RawLine;
        expect([line.lon[0], line.lat[0], line.ele?.[0]]).toEqual([4.101, -54.501, 100]);
    });

    it('emits airport Point placemarks as their own point features (dropping them is a later rule, not a parser guess)', () => {
        const result = parseKml(FLIGHT, SOURCE);
        expect(result.features).toHaveLength(2);
        const airport = result.features[1];
        expect(airport?.name).toBe('YMML Airport');
        const point = airport?.geometries[0] as RawPoint;
        expect(point.type).toBe('point');
        expect([point.lon, point.lat]).toEqual([4.201, -54.601]);
    });
});

describe('parseKml: coordinates parsing', () => {
    it('parses a LineString/coordinates as comma-separated lon,lat,ele tuples', () => {
        const doc = kml(`
          <Placemark><name>Path</name>
            <LineString><coordinates>
              4.101,-54.501,30 4.102,-54.502,30 4.104,-54.503,30
            </coordinates></LineString>
          </Placemark>`);
        const line = parseKml(doc, SOURCE).features[0]?.geometries[0] as RawLine;
        expect(line.type).toBe('line');
        expect(line.lon).toEqual([4.101, 4.102, 4.104]);
        expect(line.lat).toEqual([-54.501, -54.502, -54.503]);
        expect(line.ele).toEqual([30, 30, 30]);
    });

    it('accepts a Point/coordinates tuple with no elevation (lon,lat only)', () => {
        const doc = kml(`
          <Placemark><name>Pin</name>
            <Point><coordinates>4.201,-54.601</coordinates></Point>
          </Placemark>`);
        const point = parseKml(doc, SOURCE).features[0]?.geometries[0] as RawPoint;
        expect([point.lon, point.lat]).toEqual([4.201, -54.601]);
    });

    it('tolerates leading/trailing whitespace and tabs around a coordinates block', () => {
        const doc = kml(`
          <Placemark><name>Path</name>
            <LineString><coordinates>
\t\t  4.101,-54.501,30   4.102,-54.502,30\t
            </coordinates></LineString>
          </Placemark>`);
        const line = parseKml(doc, SOURCE).features[0]?.geometries[0] as RawLine;
        expect(line.lon).toEqual([4.101, 4.102]);
    });

    it('parses a Polygon outer ring into a polygon geometry', () => {
        const doc = kml(`
          <Placemark><name>Area</name>
            <Polygon><outerBoundaryIs><LinearRing><coordinates>
              4.10,-54.50,0 4.20,-54.50,0 4.20,-54.60,0 4.10,-54.50,0
            </coordinates></LinearRing></outerBoundaryIs></Polygon>
          </Placemark>`);
        const poly = parseKml(doc, SOURCE).features[0]?.geometries[0] as RawPolygon;
        expect(poly.type).toBe('polygon');
        expect(poly.lon).toEqual([4.1, 4.2, 4.2, 4.1]);
        expect(poly.lat).toEqual([-54.5, -54.5, -54.6, -54.5]);
    });
});

describe('parseKml: folders', () => {
    it('recurses into nested Folders and finds placemarks at any depth', () => {
        const doc = kml(`
          <Folder><name>Outer</name>
            <Folder><name>Inner</name>
              <Placemark><name>Deep pin</name>
                <Point><coordinates>4.2,-54.6,0</coordinates></Point>
              </Placemark>
            </Folder>
          </Folder>`);
        const result = parseKml(doc, SOURCE);
        expect(result.features).toHaveLength(1);
        expect(result.features[0]?.name).toBe('Deep pin');
    });

    it('sets folder to the innermost enclosing Folder name', () => {
        const doc = kml(`
          <Folder><name>Cyclones</name>
            <Placemark><name>Eye</name>
              <Point><coordinates>4.2,-54.6,0</coordinates></Point>
            </Placemark>
          </Folder>`);
        expect(parseKml(doc, SOURCE).features[0]?.folder).toBe('Cyclones');
    });

    it('leaves folder undefined for a placemark not inside any Folder', () => {
        const doc = kml(`
          <Placemark><name>Loose pin</name>
            <Point><coordinates>4.2,-54.6,0</coordinates></Point>
          </Placemark>`);
        expect(parseKml(doc, SOURCE).features[0]?.folder).toBeUndefined();
    });
});

describe('parseKml: mixed and multi-geometry files (no special-casing)', () => {
    it('emits one feature per placemark, keeping every point and line as-is', () => {
        const doc = kml(`
          <Folder><name>Cyclone</name>
            <Placemark><name>Track segment</name>
              <LineString><coordinates>4.1,-54.5,0 4.2,-54.6,0</coordinates></LineString>
            </Placemark>
            <Placemark><name>Forecast point</name>
              <Point><coordinates>4.3,-54.7,0</coordinates></Point>
            </Placemark>
          </Folder>`);
        const result = parseKml(doc, SOURCE);
        expect(result.errors).toEqual([]);
        expect(result.features.map(f => f.geometries[0]?.type)).toEqual(['line', 'point']);
        expect(result.features.map(f => f.folder)).toEqual(['Cyclone', 'Cyclone']);
        expect(result.features.map(f => f.sourceIndex)).toEqual([0, 1]);
    });

    it('silently ignores non-geometry document furniture (ScreenOverlay, Style)', () => {
        const doc = kml(`
          <ScreenOverlay><name>Logo</name><Icon><href>logo.png</href></Icon></ScreenOverlay>
          <Style id="s"><IconStyle><scale>1.2</scale></IconStyle></Style>
          <Placemark><name>Pin</name>
            <Point><coordinates>4.2,-54.6,0</coordinates></Point>
          </Placemark>`);
        const result = parseKml(doc, SOURCE);
        expect(result.features).toHaveLength(1);
        expect(result.errors).toEqual([]);
    });
});

describe('parseKml: hard errors (collected, never thrown)', () => {
    it('reports malformed XML as an error with the source file', () => {
        const result = parseKml('<kml><Document></kml>', SOURCE);
        expect(result.features).toEqual([]);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]?.sourceFile).toBe(SOURCE);
    });

    it('reports a gx:Track whose when and gx:coord lists differ in length', () => {
        const doc = kml(`
          <Placemark><name>Track</name><gx:Track>
            <when>2030-01-15T08:00:00Z</when>
            <when>2030-01-15T08:00:16Z</when>
            <gx:coord>4.101 -54.501 100</gx:coord>
          </gx:Track></Placemark>`);
        expect(parseKml(doc, SOURCE).errors.length).toBeGreaterThan(0);
    });

    it('reports a non-numeric coordinate as an error', () => {
        const doc = kml(`
          <Placemark><name>Path</name>
            <LineString><coordinates>north-ish,-54.5,0 4.2,-54.6,0</coordinates></LineString>
          </Placemark>`);
        expect(parseKml(doc, SOURCE).errors.length).toBeGreaterThan(0);
    });

    it('reports a LineString with a single point as an error (a line needs >= 2 vertices)', () => {
        const doc = kml(`
          <Placemark><name>Path</name>
            <LineString><coordinates>4.1,-54.5,0</coordinates></LineString>
          </Placemark>`);
        expect(parseKml(doc, SOURCE).errors.length).toBeGreaterThan(0);
    });

    it('handles an empty document (no placemarks) as zero features, zero errors', () => {
        expect(parseKml(kml(''), SOURCE)).toEqual({ features: [], errors: [] });
    });
});
