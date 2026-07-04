import { describe, expect, it } from 'vitest';

import type { RawLine, RawPoint } from '../src/model.ts';
import { parseGpx } from '../src/parse/gpx.ts';

const SOURCE = 'tracks/2030-01-15/sample.gpx';

/** Wraps body elements in a minimal GPX 1.1 document (OsmAnd-style namespaces). */
function gpx(body: string, creator = 'OsmAnd+ 5.1.9'): string {
    return `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<gpx version="1.1" creator="${creator}" xmlns="http://www.topografix.com/GPX/1/1" xmlns:osmand="https://osmand.net">
${body}
</gpx>`;
}

const OSMAND_TRACK = gpx(`
  <metadata>
    <name>Harbour stroll</name>
    <extensions><osmand:activity>Walking</osmand:activity></extensions>
  </metadata>
  <trk>
    <trkseg>
      <trkpt lat="-54.501" lon="4.101"><ele>100</ele><time>2030-01-15T08:00:00Z</time><hdop>4.2</hdop>
        <extensions><osmand:speed>1</osmand:speed></extensions></trkpt>
      <trkpt lat="-54.502" lon="4.102"><ele>150</ele><time>2030-01-15T08:00:10Z</time>
        <extensions><osmand:speed>1.5</osmand:speed></extensions></trkpt>
      <trkpt lat="-54.503" lon="4.104"><ele>200</ele><time>2030-01-15T08:00:20Z</time>
        <extensions><osmand:speed>2</osmand:speed></extensions></trkpt>
    </trkseg>
  </trk>`);

describe('parseGpx: OsmAnd tracks', () => {
    it('parses one feature with name, activity, and a line geometry', () => {
        const result = parseGpx(OSMAND_TRACK, SOURCE);
        expect(result.errors).toEqual([]);
        expect(result.features).toHaveLength(1);
        const feature = result.features[0];
        expect(feature).toMatchObject({
            sourceFile: SOURCE,
            sourceIndex: 0,
            name: 'Harbour stroll',
            activity: 'Walking',
        });
        const line = feature?.geometries[0] as RawLine;
        expect(line.type).toBe('line');
        expect(line.lon).toEqual([4.101, 4.102, 4.104]);
        expect(line.lat).toEqual([-54.501, -54.502, -54.503]);
        expect(line.ele).toEqual([100, 150, 200]);
        expect(line.speed).toEqual([1, 1.5, 2]);
        expect(line.time).toEqual([1894694400, 1894694410, 1894694420]);
    });

    it('emits one line geometry per trkseg on the same feature', () => {
        const doc = gpx(`
          <trk><trkseg>
            <trkpt lat="-54.501" lon="4.101"><time>2030-01-15T08:00:00Z</time></trkpt>
            <trkpt lat="-54.502" lon="4.102"><time>2030-01-15T08:00:10Z</time></trkpt>
          </trkseg><trkseg>
            <trkpt lat="-54.51" lon="4.11"><time>2030-01-15T09:00:00Z</time></trkpt>
            <trkpt lat="-54.52" lon="4.12"><time>2030-01-15T09:00:10Z</time></trkpt>
          </trkseg></trk>`);
        const result = parseGpx(doc, SOURCE);
        expect(result.errors).toEqual([]);
        expect(result.features).toHaveLength(1);
        expect(result.features[0]?.geometries).toHaveLength(2);
    });

    it('emits one feature per trk with distinct sourceIndex', () => {
        const doc = gpx(`
          <trk><name>A</name><trkseg>
            <trkpt lat="-54.501" lon="4.101"/><trkpt lat="-54.502" lon="4.102"/>
          </trkseg></trk>
          <trk><name>B</name><trkseg>
            <trkpt lat="-54.51" lon="4.11"/><trkpt lat="-54.52" lon="4.12"/>
          </trkseg></trk>`);
        const result = parseGpx(doc, SOURCE);
        expect(result.features.map(f => [f.sourceIndex, f.name])).toEqual([
            [0, 'A'],
            [1, 'B'],
        ]);
    });

    it('prefers trk-level name over metadata name when both exist', () => {
        const doc = gpx(`
          <metadata><name>File name</name></metadata>
          <trk><name>Track name</name><trkseg>
            <trkpt lat="-54.501" lon="4.101"/><trkpt lat="-54.502" lon="4.102"/>
          </trkseg></trk>`);
        expect(parseGpx(doc, SOURCE).features[0]?.name).toBe('Track name');
    });
});

describe('parseGpx: AllTrails variant', () => {
    const ALLTRAILS = `<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:osmand="https://osmand.net/docs" version="1.1" creator="AllTrails.com">
  <trk>
    <name>Ridge Trail</name>
    <src>AllTrails</src>
    <extensions><osmand:activity>Walking</osmand:activity></extensions>
    <trkseg>
      <trkpt lat="-54.601" lon="4.201"><ele>120</ele><time>2030-01-16T21:00:00Z</time></trkpt>
      <trkpt lat="-54.602" lon="4.202"><ele>130</ele><time>2030-01-16T21:00:05Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

    it('reads activity from trk-level extensions and leaves speed absent', () => {
        const result = parseGpx(ALLTRAILS, SOURCE);
        expect(result.errors).toEqual([]);
        const feature = result.features[0];
        expect(feature?.activity).toBe('Walking');
        expect(feature?.name).toBe('Ridge Trail');
        const line = feature?.geometries[0] as RawLine;
        expect(line.speed).toBeUndefined();
        expect(line.ele).toEqual([120, 130]);
    });
});

describe('parseGpx: GoPro variant', () => {
    const GOPRO = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="gpx.py -- https://github.com/tkrajina/gpxpy">
  <trk><trkseg>
    <trkpt lat="-54.7682" lon="4.3093"><ele>-1.357</ele><time>2030-01-17T23:24:47.799000</time>
      <fix>3d</fix><pdop>1.2</pdop>
      <extensions><speed_2d><value>1.051</value><unit>m/s</unit></speed_2d></extensions></trkpt>
    <trkpt lat="-54.7683" lon="4.3094"><ele>-1.357</ele><time>2030-01-17T23:24:48.799000</time>
      <fix>3d</fix><pdop>1.3</pdop>
      <extensions><speed_2d><value>1.06</value><unit>m/s</unit></speed_2d></extensions></trkpt>
    <trkpt lat="0.0" lon="0.0"><ele>0</ele><time>2030-01-17T23:24:49.799000</time>
      <fix>none</fix><pdop>99.99</pdop>
      <extensions><speed_2d><value>0</value><unit>m/s</unit></speed_2d></extensions></trkpt>
  </trkseg></trk>
</gpx>`;

    it('treats naive fractional timestamps as UTC', () => {
        const line = parseGpx(GOPRO, SOURCE).features[0]?.geometries[0] as RawLine;
        // 2030-01-17T23:24:47.799Z
        expect(line.time?.[0]).toBeCloseTo(1894922687.799, 3);
    });

    it('reads speed from nested speed_2d/value', () => {
        const line = parseGpx(GOPRO, SOURCE).features[0]?.geometries[0] as RawLine;
        expect(line.speed).toEqual([1.051, 1.06, 0]);
    });

    it('accepts negative elevations', () => {
        const line = parseGpx(GOPRO, SOURCE).features[0]?.geometries[0] as RawLine;
        expect(line.ele).toEqual([-1.357, -1.357, 0]);
    });

    it('keeps points marked fix=none as-is (filtering is a later rule stage, not a parser guess)', () => {
        const result = parseGpx(GOPRO, SOURCE);
        const line = result.features[0]?.geometries[0] as RawLine;
        expect(line.lon).toEqual([4.3093, 4.3094, 0]);
        expect(line.lat).toEqual([-54.7682, -54.7683, 0]);
    });
});

describe('parseGpx: waypoints', () => {
    const WAYPOINTS = gpx(`
      <wpt lat="-54.6" lon="4.2">
        <name>Harbour View Hotel</name>
        <desc>Fictional Isle</desc>
        <sym>https://example.test/marker_a.png</sym>
        <folder>Accommodation</folder>
      </wpt>
      <wpt lat="-54.65" lon="4.25">
        <name>Lighthouse Hostel</name>
      </wpt>`);

    it('emits one feature per wpt with name, description, sym, and folder', () => {
        const result = parseGpx(WAYPOINTS, SOURCE);
        expect(result.errors).toEqual([]);
        expect(result.features).toHaveLength(2);
        const first = result.features[0];
        expect(first).toMatchObject({
            name: 'Harbour View Hotel',
            description: 'Fictional Isle',
            folder: 'Accommodation',
        });
        expect((first?.geometries[0] as RawPoint).sym).toBe('https://example.test/marker_a.png');
        const second = result.features[1];
        expect(second?.folder).toBeUndefined();
        expect(second?.sourceIndex).toBe(1);
    });

    it('parses a mixed file (trk + wpt) into features for both', () => {
        const doc = gpx(`
          <wpt lat="-54.6" lon="4.2"><name>Pin</name></wpt>
          <trk><trkseg>
            <trkpt lat="-54.501" lon="4.101"/><trkpt lat="-54.502" lon="4.102"/>
          </trkseg></trk>`);
        const result = parseGpx(doc, SOURCE);
        expect(result.features).toHaveLength(2);
        // Waypoints are emitted before tracks, so the order is deterministic.
        expect(result.features.map(f => f.geometries[0]?.type)).toEqual(['point', 'line']);
    });
});

describe('parseGpx: per-point time/ele/speed (faithful, never fabricated)', () => {
    it('omits the time array entirely when no point has time', () => {
        const doc = gpx(`
          <trk><trkseg>
            <trkpt lat="-54.501" lon="4.101"/><trkpt lat="-54.502" lon="4.102"/>
          </trkseg></trk>`);
        const line = parseGpx(doc, SOURCE).features[0]?.geometries[0] as RawLine;
        expect(line.time).toBeUndefined();
    });

    it('keeps a partial time array with null at points lacking time (never fabricates, never drops)', () => {
        const doc = gpx(`
          <trk><trkseg>
            <trkpt lat="-54.501" lon="4.101"><time>2030-01-15T08:00:00Z</time></trkpt>
            <trkpt lat="-54.502" lon="4.102"/>
          </trkseg></trk>`);
        const line = parseGpx(doc, SOURCE).features[0]?.geometries[0] as RawLine;
        expect(line.time).toEqual([1894694400, null]);
    });

    it('records null for missing ele/speed at individual points (as-is rule)', () => {
        const doc = gpx(`
          <trk><trkseg>
            <trkpt lat="-54.501" lon="4.101"><ele>100</ele>
              <extensions><osmand:speed>1</osmand:speed></extensions></trkpt>
            <trkpt lat="-54.502" lon="4.102"/>
          </trkseg></trk>`);
        const line = parseGpx(doc, SOURCE).features[0]?.geometries[0] as RawLine;
        expect(line.ele).toEqual([100, null]);
        expect(line.speed).toEqual([1, null]);
    });

    it('omits ele/speed arrays entirely when absent everywhere', () => {
        const doc = gpx(`
          <trk><trkseg>
            <trkpt lat="-54.501" lon="4.101"/><trkpt lat="-54.502" lon="4.102"/>
          </trkseg></trk>`);
        const line = parseGpx(doc, SOURCE).features[0]?.geometries[0] as RawLine;
        expect(line.ele).toBeUndefined();
        expect(line.speed).toBeUndefined();
    });
});

describe('parseGpx: transport mode is osmand:activity only', () => {
    it('does not read legacy transport markers (trkpt transport attr / metadata keywords)', () => {
        const doc = gpx(`
          <metadata><keywords><transport>Walking</transport></keywords></metadata>
          <trk><trkseg>
            <trkpt lat="-54.501" lon="4.101" transport="Walking"/>
            <trkpt lat="-54.502" lon="4.102" transport="Walking"/>
          </trkseg></trk>`);
        expect(parseGpx(doc, SOURCE).features[0]?.activity).toBeUndefined();
    });

    it('reads osmand:activity even when legacy markers are also present', () => {
        const doc = gpx(`
          <metadata><extensions><osmand:activity>Walking</osmand:activity></extensions></metadata>
          <trk><trkseg>
            <trkpt lat="-54.501" lon="4.101" transport="Walking"/>
            <trkpt lat="-54.502" lon="4.102" transport="Walking"/>
          </trkseg></trk>`);
        expect(parseGpx(doc, SOURCE).features[0]?.activity).toBe('Walking');
    });
});

describe('parseGpx: hard errors (collected, never thrown)', () => {
    it('reports malformed XML as an error with the source file', () => {
        const result = parseGpx('<gpx><trk></gpx>', SOURCE);
        expect(result.features).toEqual([]);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]?.sourceFile).toBe(SOURCE);
    });

    it('reports a trkpt missing lat/lon as an error', () => {
        const doc = gpx(`
          <trk><trkseg>
            <trkpt lat="-54.501" lon="4.101"/><trkpt lon="4.102"/>
          </trkseg></trk>`);
        expect(parseGpx(doc, SOURCE).errors.length).toBeGreaterThan(0);
    });

    it('reports non-numeric coordinates as an error', () => {
        const doc = gpx(`
          <trk><trkseg>
            <trkpt lat="north-ish" lon="4.101"/><trkpt lat="-54.502" lon="4.102"/>
          </trkseg></trk>`);
        expect(parseGpx(doc, SOURCE).errors.length).toBeGreaterThan(0);
    });

    it('reports a trk with no usable geometry as an error', () => {
        const doc = gpx('<trk><name>Empty</name><trkseg></trkseg></trk>');
        expect(parseGpx(doc, SOURCE).errors.length).toBeGreaterThan(0);
    });

    it('handles an empty gpx document (no trk, no wpt) as zero features, zero errors', () => {
        const result = parseGpx(gpx(''), SOURCE);
        expect(result.features).toEqual([]);
        expect(result.errors).toEqual([]);
        expect(result.stats.shortSegmentsSkipped).toBe(0);
    });
});

describe('parseGpx: short segments (skipped and counted, never an error)', () => {
    it('skips a stray single-point segment but keeps the other segments (OsmAnd pause/resume)', () => {
        const doc = gpx(`
          <trk><name>Paused walk</name><trkseg>
            <trkpt lat="-54.55" lon="4.15"/>
          </trkseg><trkseg>
            <trkpt lat="-54.501" lon="4.101"/><trkpt lat="-54.502" lon="4.102"/>
          </trkseg><trkseg>
            <trkpt lat="-54.503" lon="4.103"/><trkpt lat="-54.504" lon="4.104"/>
          </trkseg></trk>`);
        const result = parseGpx(doc, SOURCE);
        expect(result.errors).toEqual([]);
        expect(result.features).toHaveLength(1);
        expect(result.features[0]?.geometries).toHaveLength(2);
        expect(result.stats.shortSegmentsSkipped).toBe(1);
    });

    it('counts a short segment as skipped, not as an error', () => {
        const doc = gpx(`
          <trk><trkseg>
            <trkpt lat="-54.55" lon="4.15"/>
          </trkseg><trkseg>
            <trkpt lat="-54.501" lon="4.101"/><trkpt lat="-54.502" lon="4.102"/>
          </trkseg></trk>`);
        expect(parseGpx(doc, SOURCE).stats.shortSegmentsSkipped).toBe(1);
    });

    it('still errors when a track has ONLY a single-point segment (no usable geometry)', () => {
        const doc = gpx(`
          <trk><trkseg>
            <trkpt lat="-54.55" lon="4.15"/>
          </trkseg></trk>`);
        const result = parseGpx(doc, SOURCE);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.features).toEqual([]);
    });
});
