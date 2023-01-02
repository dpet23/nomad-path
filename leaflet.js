function createLeafletMap() {
    // Define base map layers.
    layerOsm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
            '<a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    });
    layerGoogleHybridStatic = L.tileLayer(
        "http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}",
        {
            // https://gis.stackexchange.com/a/341490
            maxZoom: 20,
            subdomains: ["mt0", "mt1", "mt2", "mt3"],
            attribution:
                '<a href="https://www.google.com.au/maps">NASA, TerraMetrics, Google</a>',
        }
    );
    layerBlueMarble = L.tileLayer(
        "https://gibs-{s}.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{time}/{tileMatrixSet}/{z}/{y}/{x}.jpg",
        {
            layer: "BlueMarble_ShadedRelief_Bathymetry",
            tileMatrixSet: "EPSG3857_500m",
            time: "",
            maxZoom: 8,
            noWrap: true,
            continuousWorld: true,
            bounds: [
                // Prevent Leaflet from retrieving non-existent tiles on the borders.
                [-85.0511287776, -179.999999975],
                [85.0511287776, 179.999999975],
            ],
            attribution:
                '<a href="https://wiki.earthdata.nasa.gov/display/GIBS">NASA EOSDIS GIBS</a>',
        }
    );

    // Initialize the map.
    var map = L.map("map", {
        center: [0, 0],
        zoom: 3,
        layers: [layerBlueMarble],
        worldCopyJump: true,
    });

    // Layer control.
    var baseMaps = {
        "NASA Blue Marble": layerBlueMarble,
        "Google Hybrid (static)": layerGoogleHybridStatic,
        OpenStreetMap: layerOsm,
    };
    var layerControl = L.control.layers(baseMaps).addTo(map);

    // Scale control.
    L.control.scale({ metric: true, imperial: true }).addTo(map);

    // Reset map control.
    (function () {
        var control = new L.Control({ position: "topleft" });
        control.onAdd = function (map) {
            var resetView = L.DomUtil.create("a", "resetview");
            resetView.innerHTML = "[Reset Map]";
            L.DomEvent.disableClickPropagation(resetView).addListener(
                resetView,
                "click",
                function () {
                    map.setView(map.options.center, map.options.zoom);
                },
                resetView
            );
            return resetView;
        };
        return control;
    })().addTo(map);
}
