# Nomad Path

Nomad Path turns a folder of raw holiday GPS recordings (OsmAnd, AllTrails, GoPro GPX; FlightAware and GDACS KML; waypoint files) into an interactive browser map. A deploy-time pipeline combines the raw files, does all heavy computation offline (timezones, local days, sun angles, distances), and emits one compact data file; a fully client-side UI library renders it on switchable basemaps with tracks colour-coded by attribute (day of trip, speed, elevation, time of day, transport mode) and interactive track/waypoint/legend widgets.

- Documentation: [docs/](docs/)
- Design decision log: [plans/looking-to-plan-the-piped-nova.md](plans/looking-to-plan-the-piped-nova.md)
- Phase plans: [plans/](plans/)
