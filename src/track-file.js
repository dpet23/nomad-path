// Turning whatever the reader dropped on the page into GeoJSON.
//
// Four things arrive here: GeoJSON, GPX, KML, and an archive of any number of
// those. The XML pair are converted rather than handled — everything downstream
// sees one FeatureCollection — and the conversion is @tmcw/togeojson's.
// Elevation needs no special treatment: both formats put it in the third
// element of each coordinate, which is where the GeoJSON path already looks
// when a track carries no `elevations` array.
//
// Nothing here reads a file name. A track exported from a phone can arrive as
// .xml, or .json holding GPX, or with no extension at all, and inside an
// archive the names are whatever the person who zipped it chose.

import {gpx, kml} from '@tmcw/togeojson';
import {strFromU8, unzipSync} from 'fflate';

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

export function parseTrackText(text) {
  if (!text.trimStart().startsWith('<')) return {geojson: JSON.parse(text), producer: null};

  const doc = parseXML(text);
  const format = XML_FORMATS[doc.documentElement.localName.toLowerCase()];
  if (!format) throw new Error(`unsupported XML root <${doc.documentElement.localName}>`);
  return {geojson: format.toGeoJSON(doc), producer: format.producer(doc)?.trim() || null};
}

// Every local file header in a zip starts with these four bytes, so a KMZ, a
// folder of GPX files someone compressed, and a zip of both are all recognised
// without trusting the extension.
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const looksLikeZip = bytes => ZIP_MAGIC.every((b, i) => bytes[i] === b);

// The same question parseTrackText asks, put to an archive entry before its
// whole body is decoded: does this open like markup or like JSON. It is the
// only filter applied inside an archive, and it is enough. A directory entry
// has no bytes; a photo does not open with < or {; the AppleDouble twins that
// Finder puts in a __MACOSX tree, whose names do end in .gpx, open with their
// own magic number and are skipped for the same reason as everything else.
// Decoding a prefix rather than testing a byte is what makes a leading BOM,
// which some exporters still emit, a non-event.
const opensLikeTrack = bytes => {
  const head = new TextDecoder().decode(bytes.subarray(0, 64)).trimStart();
  return head.startsWith('<') || head.startsWith('{');
};

// One FeatureCollection out of the whole archive: the tracks in it belong to
// one trip, and merging is what makes a zip worth accepting over opening each
// file in turn. An entry that opens like a track and then fails to parse is
// counted rather than fatal — one stray file should not cost the reader the
// other twenty. Sorted so that two loads of the same archive order, colour and
// count their tracks identically.
function parseArchive(bytes) {
  const unzipped = unzipSync(bytes);
  const paths = Object.keys(unzipped)
    .filter(path => opensLikeTrack(unzipped[path]))
    .sort();
  if (!paths.length) throw new Error('no track files inside');

  const features = [];
  const producers = [];
  let unreadable = 0;

  for (const path of paths) {
    try {
      const {geojson, producer} = parseTrackText(strFromU8(unzipped[path]));
      features.push(...(geojson.features ?? []));
      if (producer) producers.push(producer);
    } catch {
      unreadable++;
    }
  }
  if (!features.length) throw new Error(`none of the ${paths.length} files inside could be read`);

  return {geojson: {type: 'FeatureCollection', features}, producers, read: paths.length - unreadable, unreadable};
}

// The one entry point the app uses. Bytes rather than text, because an archive
// is not text, and asking the caller which it has only moves the question
// somewhere less able to answer it.
export async function readTrackFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (looksLikeZip(bytes)) return parseArchive(bytes);

  const {geojson, producer} = parseTrackText(new TextDecoder().decode(bytes));
  return {geojson, producers: producer ? [producer] : [], read: 1, unreadable: 0};
}
