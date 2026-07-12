/**
 * Change defaults for the PhotoSwipe Dynamic Caption plugin.
 */

import PhotoSwipeDynamicCaption from './photoswipe-dynamic-caption-plugin-1.2.7/photoswipe-dynamic-caption-plugin.esm.min.js';

/**
 * Default settings for the plugin.
 *
 * @property {string} metadataContent   Used to retrieve the metadata content.
 * @property {Boolean} autoHide         Whether the caption element can be hidden along with the UI.
 */
const defaultOptionsCustom = {
    metadataContent: '.pswp-metadata-content',
    autoHide: true,
};

export default class PhotoSwipeCaption extends PhotoSwipeDynamicCaption {
    /**
     * Set up PhotoSwipe lightbox event binds.
     *
     * @param {PhotoSwipeLightbox} lightbox PhotoSwipe lightbox instance.
     * @param {Object} options              Options to change default behaviour.
     */
    constructor(lightbox, options) {
        super(lightbox, options);

        this.options = {
            ...defaultOptionsCustom,
            ...this.options,
        };

        // When closing the gallery, reset the caption's opacity and hide it.
        lightbox.on('closingAnimationStart', () => {
            this.hideCaption(this.pswp.currSlide);
        });
    }

    /**
     * Do not hide the caption element when the PhotoSwipe UI is auto-hidden.
     * Setting the opacity here allows fade transitions when opening the gallery.
     *
     * @param {Element} slide The slide currently being shown.
     */
    showCaption = slide => {
        super.showCaption(slide);

        const captionElement = slide.dynamicCaption.element;
        if (captionElement && !this.options.autoHide && !this.useMobileLayout()) {
            captionElement.style.opacity = 1;
        }
    };

    /**
     * Reset the caption opacity to re-enable fade transitions when closing the gallery.
     *
     * @param {Element} slide The slide currently being shown.
     */
    hideCaption = slide => {
        super.hideCaption(slide);

        const captionElement = slide.dynamicCaption.element;
        if (captionElement && !this.options.autoHide && !this.useMobileLayout()) {
            captionElement.style.opacity = null;
        }
    };

    /**
     * Build the HTML content of the caption.
     *
     * @param {Element} slide The slide currently being shown.
     * @return {String} Caption content to show.
     */
    getCaptionHTML = slide => {
        let captionHTML = '';

        const currSlideElement = slide.data.element;
        if (currSlideElement) {
            // Should always have caption content, at least a title.
            const captionContent = currSlideElement.querySelector(this.options.captionContent).innerHTML;
            captionHTML += captionContent;

            // If the slide specifies metadata, add the whole element (and children) to the caption.
            const metadataContent = currSlideElement.querySelector(this.options.metadataContent);
            if (metadataContent) {
                captionHTML += metadataContent.outerHTML;
            }
        }

        return captionHTML;
    };

    useMobileLayout = () => {
        return window.innerWidth < 768 || window.innerHeight < 576;
    };
}
