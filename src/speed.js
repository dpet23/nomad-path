// Colouring tracks by how fast they were travelled.
//
// The 3D tiles already show the terrain a track climbs, so height on the screen
// is Google's job and colour is free to carry something the scene cannot: pace.
//
// Speed is a magnitude, so the ramp is one hue stepped light→dark, anchored so
// that the slow end is the one allowed to recede into the dark UI. The steps are
// the documented blue ramp; the darkest is step 600 rather than 700 because an
// ordinal ramp's surface-nearest step has to stay above 2:1 against #1a1a19, and
// 700 does not. Verified with the palette validator: monotone lightness, every
// adjacent gap over 0.06, 2.15:1 at the dark end, 4° of hue spread.

// Slow → fast.
export const SPEED_RAMP = [
  [24, 79, 149], // #184f95
  [37, 106, 191], // #256abf
  [57, 135, 229], // #3987e5
  [134, 182, 239], // #86b6ef
  [205, 226, 251] // #cde2fb
];

// Two different absences, so two different answers. A track with no timing
// among tracks that have some is grey — it drops out of a scale the rest of the
// screen is using. A file with no timing anywhere has no scale to drop out of,
// and grey everywhere reads as a rendering fault, so it gets a colour that reads
// as deliberate. Both are steps this app already uses, not new values.
export const NO_TIMING = [137, 135, 129]; // #898781
export const NO_SPEED = [230, 103, 103]; // #e66767

const EARTH_RADIUS_KM = 6371;
const RAD = Math.PI / 180;

function haversineKm([lon1, lat1], [lon2, lat2]) {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Timestamps arrive as ISO strings from GPX and KML, and as numbers from files
// written by hand. Epoch seconds and epoch milliseconds are told apart by size:
// 1e11 milliseconds is 1973, and 1e11 seconds is the year 5138, so nothing real
// is ambiguous.
function toMillis(t) {
  if (typeof t === 'number') return Number.isFinite(t) ? (t < 1e11 ? t * 1000 : t) : null;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
}

// Speed per vertex in km/h, plus the track's overall pace for the tooltip. Null
// where a pair of points carries no usable interval: a missing or unparseable
// stamp, or two readings with the same time, which a device emits more often
// than you would think. A vertex takes the speed of the segment leaving it, and
// the last vertex repeats the one arriving at it, so the array lines up 1:1 with
// the path the way deck.gl wants its per-vertex colours to.
export function trackSpeeds(path, times) {
  if (!Array.isArray(times) || times.length !== path.length || path.length < 2) {
    return {speeds: null, average: null};
  }

  const stamps = times.map(toMillis);
  const speeds = [];
  let km = 0;
  let hours = 0;

  for (let i = 1; i < path.length; i++) {
    const dt = stamps[i] - stamps[i - 1];
    if (!Number.isFinite(dt) || dt <= 0) {
      speeds.push(null);
      continue;
    }
    const distance = haversineKm(path[i - 1], path[i]);
    const elapsed = dt / 3600000;
    km += distance;
    hours += elapsed;
    speeds.push(distance / elapsed);
  }

  if (!speeds.some(s => s !== null)) return {speeds: null, average: null};
  speeds.push(speeds[speeds.length - 1]);
  return {speeds, average: hours > 0 ? km / hours : null};
}

// Bands by quantile rather than by an even split of the range. One transpacific
// flight in a file of walks would otherwise push every walk into the slowest
// band and leave four bands for the flight alone; equal counts per band spend
// the ramp on whatever spread the file actually has. The legend prints the
// resulting speeds, so nothing about the file is hidden by the choice.
export function speedScale(tracks) {
  const all = [];
  for (const track of tracks) {
    if (track.isCopy || !track.speeds) continue;
    for (const s of track.speeds) if (s !== null) all.push(s);
  }
  if (!all.length) return {bands: [], hasSpeed: false};

  all.sort((a, b) => a - b);
  const at = q => all[Math.min(all.length - 1, Math.floor(q * all.length))];
  const edges = [0, at(0.2), at(0.4), at(0.6), at(0.8), all[all.length - 1]];

  // Bands collapse when a file has fewer distinct speeds than steps — a short
  // walk at one pace, say. Dropping the empty ones keeps the legend honest
  // rather than printing five rows that all say the same number.
  const bands = SPEED_RAMP.map((color, i) => ({color, from: edges[i], to: edges[i + 1]})).filter(
    band => band.to > band.from
  );
  return {bands: bands.length ? bands : [{color: SPEED_RAMP[2], from: edges[0], to: edges[5]}], hasSpeed: true};
}

// The band a speed falls in, by upper edge. Shared colour arrays, deliberately:
// a long track hands deck.gl one reference per vertex rather than one array.
export function speedColor(speed, scale) {
  if (!scale.hasSpeed) return NO_SPEED;
  if (speed === null) return NO_TIMING;
  for (const band of scale.bands) if (speed <= band.to) return band.color;
  return scale.bands[scale.bands.length - 1].color;
}

export const formatSpeed = kmh => (kmh >= 100 ? Math.round(kmh) : kmh.toFixed(1)).toString();
