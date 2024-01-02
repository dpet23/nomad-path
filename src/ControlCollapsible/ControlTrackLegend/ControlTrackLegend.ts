import './_ControlTrackLegend.scss';

import L from 'leaflet';

import { LineStringStyle, ThresholdKey, ThresholdStyles } from '../../Layers/MultiOptionsPolyline';
import ControlAbstractCollapsible, {
    ControlCollapsibleOptions,
    CreateContentElementsFunc,
} from '../ControlAbstractCollapsible';

/**
 * Callback function to apply a new LineString style.
 *
 * @param lineStringStyle - The chosen colour scheme for GeoJSON LineStrings.
 */
export type OnStyleChangeFunc = (lineStringStyle: LineStringStyle) => void;

/**
 * Parameters for the ControlLegend.
 */
type ControlLegendOptions = ControlCollapsibleOptions & {
    supportedStyles: LineStringStyle[];
    onStyleChange: OnStyleChangeFunc;
};

/**
 * Leaflet Control for displaying a legend of GeoJSON LineString colours.
 */
export default class ControlTrackLegend extends ControlAbstractCollapsible {
    public readonly options: ControlLegendOptions;

    public styleSelector?: HTMLSelectElement;
    public legendText?: HTMLDivElement;

    private classLegend = 'leaflet-control-legend-tracks';
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
     * @param options.collapsed - Whether the Control will be initially collapsed into an icon.
     * @param options.title - Title to show when hovering over the collapsed icon.
     * @param options.supportedStyles - The available styles for GeoJSON LineStrings.
     * @param options.onStyleChange - Partial function for calling `processGeoJsonFile`.
     */
    constructor(options: ControlLegendOptions) {
        super(options);
        this.options = options;
    }

    /**
     * Populate the Control's collapsible content.
     *
     * @implements {createContentElements} in ControlAbstractCollapsible
     */
    protected createContentElements: CreateContentElementsFunc = () => {
        if (!this.container || !this.content) {
            return;
        }

        L.DomUtil.addClass(this.container, this.classLegend);

        // Create a select box for the various styles.
        this.styleSelector = L.DomUtil.create('select', this.classLegendSelect, this.content);

        // Populate the select box with the name of each option.
        let opt: HTMLOptionElement;
        this.options.supportedStyles.forEach((style, index) => {
            opt = L.DomUtil.create('option', this.classLegendSelectOption, this.styleSelector);
            opt.value = index.toString();
            opt.innerHTML = style.name;
        });
        if (this.options.supportedStyles.length <= 1) {
            this.styleSelector.disabled = true;
        }

        // Create a wrapper div to display the legend content.
        this.legendText = L.DomUtil.create('div', this.classLegendContent, this.content);

        // Redraw the GeoJSON data when the legend style changes.
        L.DomEvent.addListener(this.styleSelector, 'change', event => {
            const styleSelector = event.currentTarget as HTMLSelectElement;

            const lineStyleIndex = parseInt(styleSelector.value, 10);
            const newLineStyle = this.options.supportedStyles[lineStyleIndex];

            styleSelector.disabled = true;
            this.options.onStyleChange(newLineStyle);
        });
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

        if (this.options.supportedStyles.length > 1 && this.styleSelector) {
            this.styleSelector.disabled = false;
        }

        // Check if the updated content is too tall for the current display, and make it scrollable.
        this.makeContentScrollableIfNeeded();
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
