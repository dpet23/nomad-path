<!-- Claude: README is a quick-start only — two workflows (watch mode and preprocess+embed). Do not add API reference, dev commands, or GPX details here; those live in docs/. Update only if the core workflow or commands change. -->

# Nomad Path

A TypeScript library for visualising GPS travel data (GPX/KML tracks) on interactive web maps.
No backend required — everything runs in the browser from a single pre-built GeoJSON file.

---

## Quick Start

### Prerequisites

- Node.js 18+
- `npm install`

---

### Watch mode — live map, on the go

The fastest way to get a map up during or after a trip. Drop GPS files into a folder, run one
command, and the map rebuilds automatically whenever you add more files.

```bash
npm run watch -- -i ./my-trip/tracks
```

Open the URL printed in the terminal. Every time you copy a new `.gpx` or `.kml` file into the
folder, the map updates automatically — just refresh the page.

**Running on a remote machine?** Keep the process alive after you disconnect:

```bash
# Option 1: nohup (note the PID to kill it later)
nohup npm run watch -- -i ./my-trip/tracks > watch.log 2>&1 &
echo $!

# Option 2: tmux
tmux new -s watch
npm run watch -- -i ./my-trip/tracks
# Ctrl+B then D to detach; reconnect with: tmux attach -t watch
```

---

### Preprocess and embed

Build a static map page you can host anywhere — GitHub Pages, Netlify, a USB drive.

**Step 1 — Organise your GPS files**

Put your `.gpx` and `.kml` files in a folder. Any structure works; subfolders become groups in the
legend.

```
japan-2024/
└── tracks/
    ├── 2024-03-15-morning-drive.gpx
    ├── 2024-03-15-beach-walk.gpx
    ├── flight-SYD-NRT.kml
    ├── accommodations.gpx
    └── flights/
        └── FlightAware_QFA468.kml   ← grouped, hidden by default
```

**Step 2 — Preprocess**

This converts all your GPS files into a single `trip-data.geojson` that the browser loads at
runtime.

```bash
# Minimal — output goes to ./japan-2024/tracks/trip-data.geojson
npm run build:data -- -i ./japan-2024/tracks

# Custom name and output path
npm run build:data -- -i ./japan-2024/tracks -n "Japan 2024" -o ./public/japan.geojson
```

Need to configure which groups are hidden by default? Generate a config template first:

```bash
npm run build:data -- -i ./japan-2024/tracks --init
# Edit the generated nomadpath.yaml, then run build:data again
```

See [docs/preprocessing.md](docs/preprocessing.md) for file naming conventions, transport mode
detection, group visibility options, and all preprocessor flags.

**Step 3 — Build the library**

```bash
npm run build:lib   # → dist/nomad-path.js
```

**Step 4 — Add the map to your HTML page**

```html
<!doctype html>
<html>
<head>
  <link rel="stylesheet" href="nomad-path.css" />
  <style>#map { width: 100%; height: 100vh; }</style>
</head>
<body>
  <div id="map"></div>
  <script src="nomad-path.js"></script>
  <script type="module">
    import { NomadPath } from './nomad-path.js';

    const map = await NomadPath.create({
      container: 'map',
      dataUrls: ['tracks/trip-data.geojson'],
    });
  </script>
</body>
</html>
```

Load multiple trips in one map:

```javascript
const map = await NomadPath.create({
  container: 'map',
  dataUrls: [
    'nz-2022/trip-data.geojson',
    'nz-2023/trip-data.geojson',
    'nz-2024/trip-data.geojson',
  ],
});
```

---

## Further Reading

- [docs/api.md](docs/api.md) — full API reference: config options, basemaps, colour attributes, track visibility
- [docs/preprocessing.md](docs/preprocessing.md) — GPS file conventions, transport mode detection, group visibility
- [docs/architecture.md](docs/architecture.md) — internal rendering pipeline
- [docs/developer.md](docs/developer.md) — npm scripts, testing, release process
