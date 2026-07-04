# Nomad Path

Nomad Path visualises GPS recordings from trips on an interactive browser map.

You record your travels however you like — OsmAnd tracks on your phone, AllTrails hikes, GoPro footage with GPS, FlightAware flight tracks — and dump the files into a folder. Nomad Path's **preprocessing pipeline** reads that folder, does all the heavy computation offline (timezones, local calendar days, sun angles, distances), and emits one compact data file. The **UI library** then renders that file fully client-side: tracks layered over switchable basemaps, colour-coded by day of trip, speed, elevation, time of day, or transport mode, with interactive track/waypoint legends.

## The two components

- **Preprocessing pipeline** (`@nomadpath/preprocess`) — run by the trip author at a terminal, before publishing. Strict: it validates everything and fails loudly with a full error report.
- **UI library** (`@nomadpath/ui`) — runs in viewers' browsers, desktop and mobile. Forgiving: it never crashes, surfaces problems as friendly in-UI notices, and renders as much valid data as it can.

They are joined by a shared **data contract** (`@nomadpath/contract`): the preprocessing pipeline validates its output against it; the UI trusts it.

## Documentation map

- [Getting started](usage/getting-started.md) — set up the repo and run the dev tooling.
- [Architecture overview](architecture/overview.md) — how the pieces fit together.
- [Data contract](architecture/data-contract.md) — the format that joins the preprocessing pipeline and UI.
