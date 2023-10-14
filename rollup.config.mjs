export default {
    input: 'build/map-leaflet.js',
    output: {
        file: 'dist/leaflet-map.js',
        format: 'esm'
    },
    external: [
        'leaflet',
    ],
};
