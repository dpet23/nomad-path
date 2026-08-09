// Turning whatever the reader dropped on the page into GeoJSON.
//
// Three formats arrive here: GeoJSON, GPX and KML. The last two are converted
// rather than handled — everything downstream sees a FeatureCollection — and
// the conversion is @tmcw/togeojson's. Elevation needs no special treatment:
// both formats put it in the third element of each coordinate, which is where
// the GeoJSON path already looks when a track carries no `elevations` array.

import {gpx, kml} from '@tmcw/togeojson';

const ATOM_NS = 'http://www.w3.org/2005/Atom';

// Who or what produced the file, when it says. GPX 1.1 requires `creator` on
// the root element; KML has no equivalent, so the nearest thing is an Atom
// author, which only some producers write. Neither survives the conversion to
// GeoJSON, so both are read off the document instead. Null when the file does
// not say — there is then nothing to credit and nothing worth guessing at.
const XML_FORMATS = {
  gpx: {toGeoJSON: gpx, producer: doc => doc.documentElement.getAttribute('creator')},
  kml: {toGeoJSON: kml, producer: doc => doc.getElementsByTagNameNS(ATOM_NS, 'name')[0]?.textContent}
};

// A malformed document is not thrown by DOMParser: it comes back as a tree with
// a parsererror element somewhere in it, in a different namespace per browser,
// which is why this matches on the local name alone.
function parseXML(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('not valid XML');
  return doc;
}

// Dispatch on what the bytes are rather than what the file is called: a track
// exported from a phone can arrive as .xml, or as .json holding something else
// entirely. The FeatureCollection and the producer string are all the rest of
// the app needs.
export function parseTrackFile(text) {
  if (!text.trimStart().startsWith('<')) return {geojson: JSON.parse(text), producer: null};

  const doc = parseXML(text);
  const format = XML_FORMATS[doc.documentElement.localName.toLowerCase()];
  if (!format) throw new Error(`unsupported XML root <${doc.documentElement.localName}>`);
  return {geojson: format.toGeoJSON(doc), producer: format.producer(doc)?.trim() || null};
}
