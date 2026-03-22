import { afterEach, describe, expect, it } from 'vitest';

import { BasePanel } from './BasePanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_CLASS = 'np-test';
const COLLAPSED_CLASS = 'np-panel--collapsed';

let container: HTMLElement;

/** Create a fresh container element attached to the DOM. */
function setup(): HTMLElement {
    container = document.createElement('div');
    document.body.appendChild(container);
    return container;
}

afterEach(() => {
    container?.remove();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BasePanel', () => {
    it('appends a .np-panel element to the map container', () => {
        const c = setup();
        const panel = new BasePanel(c, TEST_CLASS, 'Test');
        expect(c.querySelector('.np-panel')).toBe(panel.root);
    });

    it('applies the position class from config', () => {
        const c = setup();
        const panel = new BasePanel(c, TEST_CLASS, 'Test', { position: 'bottomleft' });
        expect(panel.root.classList.contains('np-panel--bottomleft')).toBe(true);
    });

    it('defaults to topright position', () => {
        const c = setup();
        const panel = new BasePanel(c, TEST_CLASS, 'Test');
        expect(panel.root.classList.contains('np-panel--topright')).toBe(true);
    });

    it('applies the custom CSS class', () => {
        const c = setup();
        const panel = new BasePanel(c, 'np-track-legend', 'Tracks');
        expect(panel.root.classList.contains('np-track-legend')).toBe(true);
    });

    it('renders the title in the header', () => {
        const c = setup();
        new BasePanel(c, TEST_CLASS, 'My Title');
        const header = c.querySelector('.np-panel__header');
        expect(header?.textContent).toContain('My Title');
    });

    it('starts expanded by default', () => {
        const c = setup();
        const panel = new BasePanel(c, TEST_CLASS, 'Test');
        expect(panel.collapsed).toBe(false);
        expect(panel.root.classList.contains(COLLAPSED_CLASS)).toBe(false);
    });

    it('starts collapsed when config.collapsed is true', () => {
        const c = setup();
        const panel = new BasePanel(c, TEST_CLASS, 'Test', { collapsed: true });
        expect(panel.collapsed).toBe(true);
        expect(panel.root.classList.contains(COLLAPSED_CLASS)).toBe(true);
    });

    it('toggle() toggles the collapsed class', () => {
        const c = setup();
        const panel = new BasePanel(c, TEST_CLASS, 'Test');
        panel.toggle();
        expect(panel.collapsed).toBe(true);
        expect(panel.root.classList.contains(COLLAPSED_CLASS)).toBe(true);
        panel.toggle();
        expect(panel.collapsed).toBe(false);
        expect(panel.root.classList.contains(COLLAPSED_CLASS)).toBe(false);
    });

    it('header contains an .np-toggle arrow element', () => {
        const c = setup();
        new BasePanel(c, TEST_CLASS, 'Test');
        expect(c.querySelector('.np-panel__header .np-toggle')).not.toBeNull();
    });

    it('clicking the header toggles collapse', () => {
        const c = setup();
        const panel = new BasePanel(c, TEST_CLASS, 'Test');
        const header = panel.root.querySelector('.np-panel__header') as HTMLElement;
        header.click();
        expect(panel.collapsed).toBe(true);
        header.click();
        expect(panel.collapsed).toBe(false);
    });

    it('exposes a bodyEl for subclass content', () => {
        const c = setup();
        const panel = new BasePanel(c, TEST_CLASS, 'Test');
        expect(panel.bodyEl).toBeInstanceOf(HTMLElement);
        expect(panel.bodyEl.classList.contains('np-panel__body')).toBe(true);
    });

    it('destroy() removes the panel from the DOM', () => {
        const c = setup();
        const panel = new BasePanel(c, TEST_CLASS, 'Test');
        expect(c.querySelector('.np-panel')).not.toBeNull();
        panel.destroy();
        expect(c.querySelector('.np-panel')).toBeNull();
    });
});
