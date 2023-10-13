/**
 * Create a Control for displaying the current style for GeoJSON LineStrings.
 *
 * @param {Array<Styles>} supportedLineStringStyles - The available styles for GeoJSON LineStrings.
 * @param {processGeoJsonFilePartialFunc} onChangePartialCallbackFn - Partial function for calling `processGeoJsonFile`.
 * @return {L.Control} A new Leaflet Control.
 */
export default function createLegendControl(supportedLineStringStyles, onChangePartialCallbackFn) {
    const control = new L.Control({ position: 'bottomleft' });

    /**
     * Function to handle adding the Control to a Leaflet Map.
     */
    control.onAdd = _map => {
        // Create wrapper div to display the legend.
        const legend = L.DomUtil.create('div', 'leaflet-control-legend');
        control.legend = legend;

        // Set styles for the legend element.
        legend.style.border = 'solid #666666 1px';
        legend.style.backgroundColor = '#ffffff';
        legend.style.opacity = '0.9';
        legend.style.padding = '4px';

        // Set header in the legend element.
        legend.innerHTML = '<div id="leaflet-control-legend-header" style="font-weight: bold;">Legend</div>';

        // Create a select box for the various styles.
        const styleSelector = L.DomUtil.create('select', 'leaflet-control-legend-select', legend);
        control.styleSelector = styleSelector;

        // Set styles for the select box.
        styleSelector.style.margin = '0.5em 0';

        // Populate the select box with the name of each option.
        let opt;
        supportedLineStringStyles.forEach((style, index) => {
            opt = L.DomUtil.create('option', 'leaflet-control-legend-option', styleSelector);
            opt.value = index;
            opt.innerHTML = style.name;
        });

        // Create a wrapper div to display the legend content.
        const legendText = L.DomUtil.create('div', 'leaflet-control-legend-content', legend);
        control.legendText = legendText;

        // Redraw GeoJSON data when the legend style changes.
        L.DomEvent.on(styleSelector, 'change', event => {
            const lineStyleIndex = parseInt(event.target.value, 10);
            const newLineStyle = supportedLineStringStyles[lineStyleIndex];

            styleSelector.disabled = true;
            onChangePartialCallbackFn(newLineStyle.func, newLineStyle.thresholds);
        });

        return legend;
    };

    const legendTextIElementCss =
        'display: inline-block; width:0.75em; height: 0.75em; border: solid 1px black; margin: 0 0.75em 0 0;';

    /**
     * Add an item to the legend content.
     * The Control must have been added to the Leaflet Map!
     */
    control.addLegendItem = (colour, label) => {
        control.legendText.innerHTML +=
            '<div style="line-height: 1.2em;">' +
            `<i style="background: ${colour}; ${legendTextIElementCss}"></i>` +
            `<span>${label}</span>` +
            '</div>';
    };

    /**
     * Clear the legend content.
     * The Control must have been added to the Leaflet Map!
     */
    control.resetLegendContent = () => {
        control.legendText.innerHTML = '';
    };

    return control;
}
