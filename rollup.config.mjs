export default {
    input: 'build/main.js',
    output: {
        file: 'dist/leaflet-map.esm.js',
        format: 'esm',
    },
    external: ['leaflet'],
};
