import fs from 'fs';
import { Waypoint } from './types';

export function generateWaypoints(list: Waypoint[], outFile = 'waypoints.json') {
  const numbered = list.map((wp, i) => ({ ...wp, order: i + 1 }));
  fs.writeFileSync(outFile, JSON.stringify({ waypoints: numbered }, null, 2));
  console.log(`Generated ${numbered.length} waypoints in ${outFile}`);
}

// Example usage
if (require.main === module) {
  const wps: Waypoint[] = [
    { lat: -36.8485, lng: 174.7633, label: 'Auckland Hotel' },
    { lat: -45.0312, lng: 168.6626, label: 'Queenstown Lodge' }
  ];
  generateWaypoints(wps);
}
