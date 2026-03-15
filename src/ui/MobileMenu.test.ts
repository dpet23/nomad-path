import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BasePanel } from './BasePanel';
import { MobileMenu } from './MobileMenu';

// ---------------------------------------------------------------------------
// matchMedia stub
// ---------------------------------------------------------------------------

/** Minimal MediaQueryList stub returned by the matchMedia mock. */
interface MqStub {
    matches: boolean;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    /** Simulate the media query changing. */
    trigger(matches: boolean): void;
}

/** Create a matchMedia stub and install it as window.matchMedia. */
function stubMatchMedia(initialMatches: boolean): MqStub {
    let listener: ((e: { matches: boolean }) => void) | null = null;
    const stub: MqStub = {
        matches: initialMatches,
        addEventListener: vi.fn((_evt, cb) => {
            listener = cb as (e: { matches: boolean }) => void;
        }),
        removeEventListener: vi.fn(),
        trigger(matches: boolean) {
            stub.matches = matches;
            listener?.({ matches });
        },
    };
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(stub));
    return stub;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DRAWER_SEL = '.np-mobile-drawer';
const DRAWER_OPEN_SEL = '.np-mobile-drawer--open';
const BACKDROP_OPEN_SEL = '.np-mobile-backdrop--open';
const BTN_SEL = '.np-mobile-btn';
const BACKDROP_SEL = '.np-mobile-backdrop';

/** Create a minimal BasePanel without attaching to a real container. */
function makePanel(el: HTMLElement): BasePanel {
    return new BasePanel(el, 'np-test', 'Test');
}

let container: HTMLElement;

/** Create a fresh container attached to the DOM. */
function setup(): HTMLElement {
    container = document.createElement('div');
    document.body.appendChild(container);
    return container;
}

afterEach(() => {
    container?.remove();
    vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// MobileMenu tests
// ---------------------------------------------------------------------------

describe('MobileMenu', () => {
    beforeEach(() => {
        // Default to desktop viewport
        stubMatchMedia(false);
    });

    it('renders a hamburger button', () => {
        const c = setup();
        new MobileMenu(c, []);
        expect(c.querySelector(BTN_SEL)).not.toBeNull();
    });

    it('renders a backdrop element', () => {
        const c = setup();
        new MobileMenu(c, []);
        expect(c.querySelector(BACKDROP_SEL)).not.toBeNull();
    });

    it('renders a drawer element', () => {
        const c = setup();
        new MobileMenu(c, []);
        expect(c.querySelector(DRAWER_SEL)).not.toBeNull();
    });

    it('drawer is closed by default', () => {
        const c = setup();
        const menu = new MobileMenu(c, []);
        expect(menu.isOpen).toBe(false);
        expect(c.querySelector(DRAWER_OPEN_SEL)).toBeNull();
    });

    it('opens drawer on hamburger click', () => {
        const c = setup();
        const menu = new MobileMenu(c, []);
        (c.querySelector(BTN_SEL) as HTMLElement).click();
        expect(menu.isOpen).toBe(true);
        expect(c.querySelector(DRAWER_OPEN_SEL)).not.toBeNull();
        expect(c.querySelector(BACKDROP_OPEN_SEL)).not.toBeNull();
    });

    it('closes drawer on backdrop click', () => {
        const c = setup();
        const menu = new MobileMenu(c, []);
        (c.querySelector(BTN_SEL) as HTMLElement).click();
        (c.querySelector(BACKDROP_SEL) as HTMLElement).click();
        expect(menu.isOpen).toBe(false);
    });

    it('closes drawer on second hamburger click', () => {
        const c = setup();
        const menu = new MobileMenu(c, []);
        const btn = c.querySelector(BTN_SEL) as HTMLElement;
        btn.click();
        btn.click();
        expect(menu.isOpen).toBe(false);
    });

    it('moves panels into drawer on mobile viewport', () => {
        const mq = stubMatchMedia(false);
        const c = setup();
        const panel = makePanel(c);
        new MobileMenu(c, [panel]);
        mq.trigger(true);
        expect(c.querySelector(DRAWER_SEL)?.contains(panel.root)).toBe(true);
    });

    it('restores panels to container on desktop viewport', () => {
        const mq = stubMatchMedia(true);
        const c = setup();
        const panel = makePanel(c);
        new MobileMenu(c, [panel]);
        // Initially mobile: panel is in drawer
        expect(c.querySelector(DRAWER_SEL)?.contains(panel.root)).toBe(true);
        // Switch to desktop
        mq.trigger(false);
        expect(c.contains(panel.root)).toBe(true);
        expect(c.querySelector(DRAWER_SEL)?.contains(panel.root)).toBe(false);
    });

    it('closes drawer when switching to desktop', () => {
        const mq = stubMatchMedia(true);
        const c = setup();
        const menu = new MobileMenu(c, []);
        (c.querySelector(BTN_SEL) as HTMLElement).click();
        expect(menu.isOpen).toBe(true);
        mq.trigger(false);
        expect(menu.isOpen).toBe(false);
    });
});
