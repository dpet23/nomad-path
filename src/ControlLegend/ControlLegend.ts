import './_ControlLegend.scss';

import L from 'leaflet';

import { LineStringStyle, ThresholdKey, ThresholdStyles } from '../Layers/MultiOptionsPolyline';

/**
 * Callback function to apply a new LineString style.
 *
 * @param lineStringStyle - The chosen colour scheme for GeoJSON LineStrings.
 */
export type OnStyleChangeFunc = (lineStringStyle: LineStringStyle) => void;

/**
 * Leaflet Control for displaying a legend of GeoJSON LineString colours.
 */
export default class ControlLegend extends L.Control {
    private readonly supportedStyles: LineStringStyle[];
    private readonly onStyleChange: OnStyleChangeFunc;
    public legend?: HTMLDivElement;
    public styleSelector?: HTMLSelectElement;
    public legendText?: HTMLDivElement;

    private classLegend = 'leaflet-control-legend';
    private classLegendHeader = `${this.classLegend}-header`;
    private classLegendSelect = `${this.classLegend}-select`;
    private classLegendSelectOption = `${this.classLegend}-option`;
    private classLegendContent = `${this.classLegend}-content`;
    private classLegendContentItem = `${this.classLegendContent}-item`;
    private classLegendContentItemSample = `${this.classLegendContentItem}-sample`;
    private classLegendContentItemText = `${this.classLegendContentItem}-text`;

    /**
     * Create a Control for displaying the current style of GeoJSON LineStrings.
     *
     * @param options - Control options.
     * @param options.position - The position of the Control (one of the map corners).
     * @param options.supportedStyles - The available styles for GeoJSON LineStrings.
     * @param options.onStyleChange - Partial function for calling `processGeoJsonFile`.
     * @return A new Leaflet Control.
     */
    constructor(
        options: L.ControlOptions & {
            supportedStyles: LineStringStyle[];
            onStyleChange: OnStyleChangeFunc;
        },
    ) {
        const { supportedStyles, onStyleChange, ...controlOptions } = options;
        super(controlOptions);
        this.supportedStyles = supportedStyles;
        this.onStyleChange = onStyleChange;
    }

    /**
     * Callback function to define the Control's container.
     *
     * Called by Leaflet when adding the Control to a Map.
     *
     * @param _map - (Unused) The Leaflet Map.
     * @return A div element containing the legend content.
     */
    onAdd = (_map: L.Map): HTMLDivElement => {
        // Create wrapper div to display the legend.
        this.legend = L.DomUtil.create('div', this.classLegend);
        if (!this.legend) {
            console.error('[LeafletMap.ControlLegend.onAdd] Failed to create the "legend" div element');
            return this.legend; // Type narrowing only, this should never fail.
        }

        // Set header in the legend element.
        const legendHeading = L.DomUtil.create('div', this.classLegendHeader, this.legend);
        legendHeading.innerHTML = 'Legend';

        // Create a select box for the various styles.
        this.styleSelector = L.DomUtil.create('select', this.classLegendSelect, this.legend);
        if (!this.styleSelector) {
            console.error('[LeafletMap.ControlLegend.onAdd] Failed to create the "styleSelector" select element');
            return this.legend; // Type narrowing only, this should never fail.
        }

        // Populate the select box with the name of each option.
        let opt: HTMLOptionElement;
        this.supportedStyles.forEach((style, index) => {
            opt = L.DomUtil.create('option', this.classLegendSelectOption, this.styleSelector);
            opt.value = index.toString();
            opt.innerHTML = style.name;
        });
        if (this.supportedStyles.length <= 1) {
            this.styleSelector.disabled = true;
        }

        // Create a wrapper div to display the legend content.
        this.legendText = L.DomUtil.create('div', this.classLegendContent, this.legend);

        // Redraw the GeoJSON data when the legend style changes.
        L.DomEvent.addListener(this.styleSelector, 'change', event => {
            const styleSelector = event.currentTarget as HTMLSelectElement;

            const lineStyleIndex = parseInt(styleSelector.value, 10);
            const newLineStyle = this.supportedStyles[lineStyleIndex];

            styleSelector.disabled = true;
            this.onStyleChange(newLineStyle);
        });

        return this.legend;
    };

    /**
     * Add an item to the legend content.
     */
    private addLegendItem = (colour: string, label: string) => {
        if (!this.legendText) {
            return;
        }

        const legendTextItem = L.DomUtil.create('div', this.classLegendContentItem, this.legendText);
        L.DomUtil.create('i', this.classLegendContentItemSample, legendTextItem).style.background = colour;
        L.DomUtil.create('span', this.classLegendContentItemText, legendTextItem).innerHTML = label;
    };

    /**
     * Add all line thresholds to the legend.
     */
    addLegendItems = (lineStyleThresholds: ThresholdStyles) => {
        let lineStyleThresholdsArray: [ThresholdKey, string][];
        if ([...lineStyleThresholds.keys()].includes(undefined)) {
            // Show the "undefined" entries at the end of the list.
            lineStyleThresholdsArray = [
                ...[...lineStyleThresholds.entries()].filter(([k, _v]) => typeof k !== 'undefined'),
                ...[...lineStyleThresholds.entries()].filter(([k, _v]) => typeof k === 'undefined'),
            ];
        } else {
            // Show the original entry order.
            lineStyleThresholdsArray = [...lineStyleThresholds.entries()];
        }

        lineStyleThresholdsArray.forEach(([thresholdLabel, cssColor]) => {
            this.addLegendItem(cssColor, (thresholdLabel ?? '(undefined)').toString());
        });

        if (this.supportedStyles.length > 1 && this.styleSelector) {
            this.styleSelector.disabled = false;
        }
    };

    /**
     * Clear the legend content.
     */
    resetLegendContent = () => {
        if (!this.legendText) {
            return;
        }

        this.legendText.innerHTML = '';
    };
}
