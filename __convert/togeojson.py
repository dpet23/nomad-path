import argparse
import json
import logging
import os
import xml.etree.ElementTree as ET
from datetime import datetime as dt
from pathlib import Path
from typing import Dict, List


def discover_files(search_paths: List[Path]) -> List[Path]:
    """
    Find all GPX files from the given list of paths.

    :param search_paths: A List of file or folder paths to search.
    :return: A list of file paths.
    """
    files = []

    for given_path in search_paths:

        if os.path.isfile(given_path):
            # Add GPX files to the list.
            if given_path.suffix != ".gpx":
                logging.error('Unsupported file type, skipping: "%s"', given_path)
                continue
            files.append(given_path)

        elif os.path.isdir(given_path):
            # Find GPX files recursively in the given directory.
            for p in given_path.rglob("*.gpx"):
                files.append(p)

        else:
            logging.error('Unsupported file type, skipping: "%s"', given_path)

    logging.info("Found %d GPX files", len(files))
    logging.debug(files)
    return files


def iso_to_date(elem: ET.Element) -> str:
    return dt.fromisoformat(getattr(elem, "text", "").replace("Z", "+00:00")).strftime("%Y-%m-%d")


def get_gpx_metadata(tree: ET.ElementTree, xmlns: str) -> Dict[str, str]:
    geojson_properties = {}

    gpx_metadata = tree.find(".//{n}metadata".format(n=xmlns))
    if gpx_metadata:
        logging.debug("\tFound metadata")

        # Property: name
        elem = gpx_metadata.find(".//{n}name".format(n=xmlns))
        if elem is not None:
            geojson_properties["name"] = getattr(elem, "text", "")

        # Property: date
        elem = tree.find(".//{n}time".format(n=xmlns))
        if elem is not None:
            geojson_properties["date"] = iso_to_date(elem)

        # Property: country
        country = [getattr(e, "text", "") for e in tree.findall(".//{n}keywords/{n}country".format(n=xmlns))]
        if country:
            geojson_properties["country"] = country

        # Property: transport
        transport = [getattr(e, "text", "") for e in tree.findall(".//{n}keywords/{n}transport".format(n=xmlns))]
        if transport:
            geojson_properties["transport"] = transport

    return geojson_properties


def build_feature_point(waypoint: ET.Element, xmlns: str, geojson_properties: Dict[str, str]) -> dict:
    feature_properties = geojson_properties.copy()

    # Property: name
    elem = waypoint.find(".//{n}name".format(n=xmlns))
    if elem is not None:
        feature_properties["name"] = getattr(elem, "text", "")

    # Property: date
    elem = waypoint.find(".//{n}time".format(n=xmlns))
    if elem is not None:
        feature_properties["date"] = iso_to_date(elem)

    # Property: symbol
    elem = waypoint.find(".//{n}sym".format(n=xmlns))
    if elem is not None:
        feature_properties["sym"] = getattr(elem, "text", "")

    # Coords: longitude, latitude
    feature_coordinates = [
        float(waypoint.attrib.get("lon", 0)),
        float(waypoint.attrib.get("lat", 0)),
    ]

    # Coords: elevation
    elem = waypoint.find(".//{n}ele".format(n=xmlns))
    if elem is not None:
        feature_coordinates.append(float(getattr(elem, "text", 0)))

    return {
        "type": "Feature",
        "properties": feature_properties,
        "geometry": {"type": "Point", "coordinates": feature_coordinates},
    }


def build_feature_linestring(track: ET.Element, xmlns: str, geojson_properties: Dict[str, str]) -> dict:
    feature_properties = geojson_properties.copy()

    track_segments = track.findall(".//{n}trkseg".format(n=xmlns))
    logging.debug("\t\tFound %d track segments", len(track_segments))

    # Property: name
    elem = track.find(".//{n}name".format(n=xmlns))
    if elem is not None:
        feature_properties["name"] = getattr(elem, "text", "")

    # Property: stroke
    style_namespace = "{http://www.topografix.com/GPX/gpx_style/0/2}"
    elem = track.find(".//{n}extensions/{s}line/{s}color".format(n=xmlns, s=style_namespace))
    if elem is not None:
        feature_properties["stroke"] = "#" + getattr(elem, "text", "")

    # Coords: longitude, latitude, elevation
    geometry_coordinates = []
    for segment in track_segments:
        pts = segment.findall(".//{n}trkpt".format(n=xmlns))
        lat = [float(pt.attrib.get("lat", 0)) for pt in pts]
        lon = [float(pt.attrib.get("lon", 0)) for pt in pts]
        ele = [float(getattr(pt.find(".//{n}ele".format(n=xmlns)), "text", 0)) for pt in pts]
        geometry_coordinates.append(list(zip(lon, lat, ele)))

    # Geometry type
    match len(track_segments):
        case 1:
            geometry_type = "LineString"
            geometry_coordinates = geometry_coordinates[0]
        case _:
            geometry_type = "MultiLineString"

    return {
        "type": "Feature",
        "properties": feature_properties,
        "geometry": {"type": geometry_type, "coordinates": geometry_coordinates},
    }


def gpx_to_features(path: Path, xmlns: str) -> List[dict]:
    """
    Parse a GPX file and extract the data to copy into a GeoJSON Feature.

    :param path: The path to a GPX file.
    :param xmlns: The main XML namespace.
    :return: A GeoJSON Feature containing the extracted data.
    """
    logging.info("Processing: %s", path)
    tree = ET.parse(path)

    geojson_features = []

    # Find metadata about the GPX file.
    geojson_properties = get_gpx_metadata(tree, xmlns)

    gpx_trk = tree.findall(".//{n}trk".format(n=xmlns))
    logging.debug("\tFound %d tracks", len(gpx_trk))
    for track in gpx_trk:
        geojson_features.append(build_feature_linestring(track, xmlns, geojson_properties))

    gpx_wpt = tree.findall(".//{n}wpt".format(n=xmlns))
    logging.debug("\tFound %d waypoints", len(gpx_wpt))
    for waypoint in gpx_wpt:
        geojson_features.append(build_feature_point(waypoint, xmlns, geojson_properties))

    return geojson_features


# Parse the given arguments.
parser = argparse.ArgumentParser(description="Convert multiple GPX files to a single GeoJSON file.")
parser.add_argument(
    "gpx",
    type=Path,
    nargs="+",
    help="one or more GPX files, or folders containing GPX files",
)
parser.add_argument(
    "-d",
    "--debug",
    action="store_true",
    help="enable debug logging",
)
parser.add_argument(
    "-n",
    "--xmlns",
    type=str,
    default="{http://www.topografix.com/GPX/1/1}",
    help="the main XML namespace (xmlns)",
)
parser.add_argument(
    "-o",
    '--output',
    type=Path,
    default=Path(__file__).parent / 'data.geojson',
    help="path to the output file",
)
args = parser.parse_args()
logging.basicConfig(
    level=logging.DEBUG if args.debug else logging.INFO,
    format="%(levelname)8s :: %(message)s",
)

# Build a GeoJSON-formatted dict from the GPX files.
geojson_features = []
for f in discover_files(args.gpx):
    geojson_features += gpx_to_features(f, args.xmlns)
geojson_dict = {"type": "FeatureCollection", "features": geojson_features}

# Save the file.
with open(args.output, "w", encoding="utf-8") as f:
    json.dump(geojson_dict, f, ensure_ascii=False, indent=4)
logging.info('Written "%s"', args.output)
