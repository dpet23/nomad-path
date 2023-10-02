"""
https://www.flightaware.com/live/flight/QTR989/history/20221005/0625Z/YMML/OTHH/tracklog
https://www.flightaware.com/live/flight/QTR9/history/20221005/2305Z/OTHH/EGLL/tracklog

https://www.flightaware.com/live/flight/AUA572/history/20221103/0845Z/LSGG/LOWW/tracklog
https://www.flightaware.com/live/flight/AUA645/history/20221103/1200Z/LOWW/LRIA/tracklog

https://www.flightaware.com/live/flight/QTR222/history/20221107/1500Z/LROP/OTHH/tracklog
https://www.flightaware.com/live/flight/QTR988/history/20221107/2255Z/OTHH/YMML/tracklog
"""

import argparse
import logging
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta

import requests
from bs4 import BeautifulSoup

logging.basicConfig(level=logging.INFO, format="%(asctime)s :: %(levelname)s :: %(message)s")
logging.getLogger("requests").setLevel(logging.WARNING)


@dataclass(frozen=True)
class Args:
    """Command-line arguments."""

    url: str


def parse_args() -> Args:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="...")
    parser.add_argument("url", type=str, help="FlightAware URL from which to get a Flight Track Log")
    return Args(**vars(parser.parse_args()))


def main():
    args = parse_args()

    # Create GPX root element.
    gpx_root = ET.Element("gpx")
    gpx_root.set("version", "1.1")
    gpx_root.set("xmlns", "http://www.topografix.com/GPX/1/1")
    gpx_root.set("xmlns:osmand", "https://osmand.net")
    gpx_root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")
    gpx_root.set("xsi:schemaLocation", "http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd")

    # Create main GPX child elements.
    gpx_metadata = ET.SubElement(gpx_root, "metadata")
    gpx_trk = ET.SubElement(gpx_root, "trk")

    # Get the flight track log webpage.
    soup = fetch_flight_log(args.url)

    # Populate the GPX metadata.
    ET.SubElement(gpx_metadata, "name").text = soup.title.string
    ET.SubElement(gpx_metadata, "link").text = args.url

    _, url_date, url_time, *_ = args.url.rsplit("/", 5)
    url_dt = datetime.strptime(url_date + url_time, "%Y%m%d%H%M%z")
    ET.SubElement(gpx_metadata, "time").text = url_dt.isoformat(timespec="seconds").replace("+00:00", "Z")

    parse_flight_log_table(soup, url_dt, gpx_trk)

    # Save generated GPX to a file.
    logging.info("Writing XML to file")
    tree = ET.ElementTree(gpx_root)
    tree.write("flightaware.gpx")


def fetch_flight_log(url: str) -> BeautifulSoup:
    logging.info("Fetching HTML from given URL")
    response = requests.get(url)
    response.raise_for_status()

    logging.info("Parsing HTML page")
    return BeautifulSoup(response.text, "html.parser")


def parse_flight_log_table(soup: BeautifulSoup, url_dt: datetime, gpx_trk: ET.Element):
    tracklog_table = soup.find("table", {"id": "tracklogTable"})

    logging.info("Parsing HTML table header")

    columns = ["Time", "Lat", "Lon", "kts", "meters"]
    col = {}
    for i, header in enumerate(tracklog_table.find("thead").find_all("th")):
        if (j := next((j for j, v in enumerate(columns) if v in header.text), None)) is not None:
            col[columns[j]] = i

    logging.info("Parsing HTML table rows")

    entry_dt = url_dt.astimezone()
    table_rows = tracklog_table.select('tr[class*="smallrow"]')
    gpx_trkseg = None

    for i, row in enumerate(table_rows):
        logging.debug("Row #%d", i + 1)

        if "flight_event" in row["class"]:
            gpx_trkseg = ET.SubElement(gpx_trk, "trkseg")
            logging.debug("\t└─ Flight event, starting new segment")
            continue

        if len(row["class"]) != 1:
            logging.debug("\t└─ Other event, ignoring")
            continue

        # Need a track segment to record a point.
        logging.debug("\t└─ Data event, parsing")
        if gpx_trkseg is None:
            gpx_trkseg = ET.SubElement(gpx_trk, "trkseg")

        gpx_trkpt = ET.SubElement(gpx_trkseg, "trkpt")
        row_items = row.find_all("td")

        # Calculate point datetime.
        entry_time_text: str = row_items[col["Time"]].select_one("span").text
        if entry_time_text.split(" ")[0] != entry_dt.strftime("%a"):
            entry_dt += timedelta(days=1)
        entry_dt = datetime.combine(
            entry_dt.date(), datetime.strptime(entry_time_text, "%a %H:%M:%S").time(), entry_dt.tzinfo
        )

        # Get point GPS coordinates.
        entry_lat = row_items[col["Lat"]].select_one("span").text
        entry_lon = row_items[col["Lon"]].select_one("span").text

        # Get point speed.
        # fmt: off
        try:
            entry_speed_ms = (
                float(row_items[col['kts']].text)
                * 1.852  # kts -> km/h
                / 3.6  # km/h -> m/s
            )  # fmt: on
        except ValueError:
            entry_speed_ms = None

        # Get point elevation.
        entry_ele_m = row_items[col["meters"]].select_one("span").text.replace(",", "")

        # Populate point GPX element.
        gpx_trkpt.set("lat", entry_lat)
        gpx_trkpt.set("lon", entry_lon)
        if entry_ele_m:
            ET.SubElement(gpx_trkpt, "ele").text = entry_ele_m
        ET.SubElement(gpx_trkpt, "time").text = (
            entry_dt.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
        )
        if entry_speed_ms:
            gps_trkpt_extensions = ET.SubElement(gpx_trkpt, "extensions")
            ET.SubElement(gps_trkpt_extensions, "osmand:speed").text = str(round(entry_speed_ms, 1))


if __name__ == "__main__":
    main()
