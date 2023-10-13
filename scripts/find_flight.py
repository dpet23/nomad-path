import argparse
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
import re

import requests
from bs4 import BeautifulSoup

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s :: %(levelname)s :: %(message)s'
)
logging.getLogger('requests').setLevel(logging.WARNING)


@dataclass(frozen=True)
class Args:
    """Command-line arguments."""

    url: str


def parse_args() -> Args:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser()
    parser.add_argument("url", type=str)
    return Args(**vars(parser.parse_args()))


def main():
    args = parse_args()
    find_flight(args.url)


def find_flight(url: str):
    # print(url)
    url_base, url_date, url_time, airport_from, airport_to = url.rsplit('/', 4)

    current_dt = datetime.strptime(url_date + url_time, '%Y%m%d%H%MZ')
    start_date = current_dt.date()

    title_re = re.compile(r'<title>(.*?)</title>', re.UNICODE )
    change = timedelta(minutes=5)

    while (current_dt.date() == start_date):
        url_time_new = current_dt.strftime('%H%MZ')
        logging.info(url_time_new)

        new_url = '/'.join((url_base, url_date, url_time_new, airport_from, airport_to))
        r = requests.get(new_url)
        try:
            r.raise_for_status()
        except Exception as e:
            logging.error(e)
            continue
        else:
            match = title_re.search(r.text)
            if match and match.group(1) != 'Unknown Flight - FlightAware':
                logging.warning(f'\n{"-"*80}\nVALID FLIGHT:\n{new_url}\n{match.group(1)}\n{"-"*80}')
                break

        if url_time_new.endswith('1100Z'):
            break

        current_dt += change


if __name__ == '__main__':
    main()
