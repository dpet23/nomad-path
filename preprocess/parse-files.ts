import fs from 'fs';
import path from 'path';
import { parseStringPromise } from 'xml2js';
import { Track, TrackSegment, TrackPoint } from './types';

const GPX_EXTENSIONS = ['.gpx', '.kml', '.geojson'];

export async function parseGPX(filePath: string): Promise<Track> {
  const xml = fs.readFileSync(filePath, 'utf8');
  const parsed = await parseStringPromise(xml);
  const name = parsed.gpx?.metadata?.[0]?.name?.[0] || path.basename(filePath);
  const segments: TrackSegment[] = [];

  const trks = parsed.gpx.trk || [];
  trks.forEach((trk: any) => {
    const segs: TrackSegment[] = [];
    (trk.trkseg || []).forEach((trkseg: any) => {
      const points: TrackPoint[] = (trkseg.trkpt || []).map((pt: any) => ({
        lat: parseFloat(pt.$.lat),
        lng: parseFloat(pt.$.lon),
        timestamp: pt.time?.[0] || new Date().toISOString(),
        speed: pt.extensions?.[0]?.speed?.[0] ? parseFloat(pt.extensions[0].speed[0]) : undefined,
        transportMode: pt.extensions?.[0]?.transportMode?.[0],
        heartRate: pt.extensions?.[0]?.hr?.[0] ? parseFloat(pt.extensions[0].hr[0]) : undefined
      }));
      segs.push({ points });
    });
    segments.push(...segs);
  });

  return { name, segments };
}

export async function parseFiles(folder: string): Promise<Track[]> {
  const files = fs.readdirSync(folder).filter(f => GPX_EXTENSIONS.includes(path.extname(f)));
  const tracks: Track[] = [];
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const fullPath = path.join(folder, file);
    let track: Track;
    if (ext === '.gpx') track = await parseGPX(fullPath);
    else if (ext === '.kml') track = await parseGPX(fullPath); // for simplicity, KML handled similarly
    else if (ext === '.geojson') track = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    tracks.push(track);
  }
  return tracks;
}

// CLI
if (require.main === module) {
  (async () => {
    const folder = process.argv[2];
    if (!folder) throw new Error('Please provide folder path as first arg');
    const tracks = await parseFiles(folder);
    fs.writeFileSync('intermediate-tracks.json', JSON.stringify(tracks, null, 2));
    console.log(`Parsed ${tracks.length} tracks to intermediate-tracks.json`);
  })();
}
