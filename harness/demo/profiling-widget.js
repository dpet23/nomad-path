// Demo-only profiling widget.
//
// Reads the library's standard `performance.measure` entries (emitted by the
// nomad-path.profiling.js bundle) and shows them as a toggleable phase -> ms
// panel. Lives in the harness, NOT the library: it consumes the web-standard
// performance API, so it needs no library API surface and ships with nothing.
//
// Each instrumented phase emits a measure named `nomadpath.<phase>`; we list
// the LATEST duration per phase so re-renders (e.g. a colour-attribute change)
// update the row live.

const MEASURE_PREFIX = 'nomadpath.';

/**
 * Mount the profiling widget: a toggle button in the toolbar plus a panel that
 * lists each `nomadpath.*` performance measure and its latest duration in ms.
 *
 * Call this BEFORE `NomadPath.create(...)` so the observer (registered with
 * `buffered: true`) captures the initial load/ingest measures.
 *
 * Styling lives in the sibling `profiling-widget.css` (linked by index.html).
 *
 * @param {HTMLElement} toolbarEl - the demo toolbar to mount the toggle into.
 * @returns {void}
 */
export function mountProfilingWidget(toolbarEl) {
    // Latest duration (ms) keyed by the phase name (measure name minus prefix).
    const latest = new Map();

    const panel = document.createElement('div');
    panel.className = 'np-prof';
    panel.hidden = true;
    panel.innerHTML = '<h2 class="np-prof__title">Profiling</h2><ul class="np-prof__list"></ul>';
    const list = panel.querySelector('.np-prof__list');

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'np-prof__toggle';
    toggle.textContent = 'Profiling';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
        panel.hidden = !panel.hidden;
        toggle.setAttribute('aria-expanded', String(!panel.hidden));
    });

    toolbarEl.appendChild(toggle);
    // Mount the panel in the positioned #stage (the map area below the
    // toolbar) so its top-centre anchor sits under the toolbar, not over it.
    // Fall back to body if the demo markup ever changes.
    (document.getElementById('stage') ?? document.body).appendChild(panel);

    const render = () => {
        const phases = [...latest.keys()].sort();
        if (phases.length === 0) {
            list.innerHTML = '<li class="np-prof__empty">No measurements yet.</li>';
            return;
        }
        list.innerHTML = phases
            .map(phase => {
                const ms = latest.get(phase).toFixed(1);
                return `<li class="np-prof__row"><span class="np-prof__phase">${phase}</span><span class="np-prof__ms">${ms} ms</span></li>`;
            })
            .join('');
    };

    const record = entry => {
        if (!entry.name.startsWith(MEASURE_PREFIX)) return;
        latest.set(entry.name.slice(MEASURE_PREFIX.length), entry.duration);
    };

    const observer = new PerformanceObserver(records => {
        for (const entry of records.getEntries()) record(entry);
        render();
    });
    // `buffered: true` replays measures emitted before this observer existed —
    // covers the load/ingest phases that fire during NomadPath.create().
    observer.observe({ type: 'measure', buffered: true });

    render();
}
