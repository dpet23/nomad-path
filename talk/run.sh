# Current live map from GPS Visualizer

# Manual Leaflet map proof of concept
cd ~/code/leaflet-map/test/resources/system_website
python -m http.server 8001 --bind 127.0.0.1

# New MapLibre map proof of concept
cd ~/code/nomad-path-archive-opus
npm run build:lib
npm run demo

# Future: Google Photometric 3D tiles
cd ~/code/nomad-path-spike-3d-tiles
npm run dev
