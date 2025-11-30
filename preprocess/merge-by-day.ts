import fs from 'fs';
import { Track, TrackPoint, PreprocessedDay } from './types';
import { zonedTimeToUtc, utcToZonedTime, format } from 'date-fns-tz';

function getLocalDate(point: TrackPoint, tz: string = 'UTC') {
  const local = utcToZonedTime(point.timestamp, tz);
  return format(local, 'yyyy-MM-dd');
}

export function mergeTracksByDay(tracks: Track[], tz: string = 'UTC'): PreprocessedDay[] {
  const dayMap: Map<string, Track[]> = new Map();

  tracks.forEach(track => {
    track.segments.forEach(seg => {
      if (seg.points.length === 0) return;
      const date = getLocalDate(seg.points[0], tz);
      const trackCopy: Track = { name: track.name, description: track.description, segments: [seg] };
      if (!dayMap.has(date)) dayMap.set(date, []);
      dayMap.get(date)?.push(trackCopy);
    });
  });

  return Array.from(dayMap.entries()).map(([date, tracks]) => ({ date, tracks }));
}

// CLI
if (require.main === module) {
  const raw = JSON.parse(fs.readFileSync('intermediate-tracks.json', 'utf8'));
  const merged = mergeTracksByDay(raw);
  merged.forEach(day => {
    fs.writeFileSync(`preprocessed-${day.date}.json`, JSON.stringify(day, null, 2));
  });
  console.log(`Generated ${merged.length} preprocessed day files`);
}
