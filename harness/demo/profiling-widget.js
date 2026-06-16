// Demo-only profiling widget.
//
// Reads the library's standard `performance.measure` entries (emitted by the
// nomad-path.profiling.js bundle) and shows them as a toggleable table. Lives in
// the harness, NOT the library: it consumes the web-standard performance API, so
// it needs no library API surface and ships with nothing.
//
// MEASURE NAME GRAMMAR (after stripping the `nomadpath.` prefix), two separators
// with two meanings, parsed generically — no hardcoded phase list, no string
// reformatting (names are shown exactly as emitted):
//   '/'  = "is a child ROW of"      → nesting, e.g. 'Initial load/Build segments'
//   '.'  = "is a COLUMN/sub-measure of" → same row, extra column, e.g.
//          'Colour change.firstFrame'
// So a name splits as <rowPath>[.<column>], and <rowPath> splits on '/' into a
// row hierarchy. Actions also carry a visible-segment count as
// `entry.detail.segments` (the proxy for GPU paint cost), shown as a column.
// Rows appear in first-seen (chronological) order; values are the latest.

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
    // Latest { ms, segments } keyed by the phase name (measure name minus prefix).
    // `segments` is the visible-segment count carried as entry.detail on the
    // One entry per ROW, keyed by full rowPath (e.g. 'Initial load/Build
    // segments'). Insertion order = chronological (first-seen). Each value:
    //   { sync, columns: { firstFrame, ... }, segments }
    // Group headers (a rowPath that is a prefix of others, e.g. 'Initial load')
    // are created implicitly the first time a child is seen, so they keep their
    // chronological slot even without their own measure.
    const rows = new Map();

    const ensureRow = rowPath => {
        if (!rows.has(rowPath)) rows.set(rowPath, { sync: undefined, columns: {} });
        return rows.get(rowPath);
    };

    // The visible-segment count is GLOBAL state (a property of the current
    // visible set, not of any one action), so it is shown ONCE and updated by
    // whichever action measure last carried it — never duplicated per row, which
    // would leave stale copies on untouched rows.
    let visibleSegments;

    const panel = document.createElement('div');
    panel.className = 'np-prof';
    panel.hidden = true;
    panel.innerHTML =
        '<h2 class="np-prof__title">Profiling</h2>' +
        '<p class="np-prof__segments" hidden></p>' +
        '<ul class="np-prof__list"></ul>';
    const list = panel.querySelector('.np-prof__list');
    const segmentsLine = panel.querySelector('.np-prof__segments');

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

    const fmtMs = v => (typeof v === 'number' ? `${v.toFixed(1)} ms` : '');

    const headerRow =
        '<li class="np-prof__row np-prof__row--head">' +
        '<span class="np-prof__phase"></span>' +
        '<span class="np-prof__ms">sync</span>' +
        // NOT "done": the first composited paint. The GPU keeps painting for up
        // to ~2s after on heavy actions; the segment count is that cost's proxy.
        '<span class="np-prof__ff">to 1st paint</span>' +
        '</li>';

    const render = () => {
        // Global visible-segment count (current state, shown once).
        if (typeof visibleSegments === 'number') {
            segmentsLine.textContent = `Visible: ${visibleSegments.toLocaleString()} segments`;
            segmentsLine.hidden = false;
        }

        if (rows.size === 0) {
            list.innerHTML = '<li class="np-prof__empty">No measurements yet.</li>';
            return;
        }
        list.innerHTML =
            headerRow +
            [...rows.entries()]
                .map(([rowPath, data]) => {
                    const parts = rowPath.split('/');
                    const depth = parts.length - 1; // 0 = top-level, 1 = nested phase
                    const label = parts[parts.length - 1]; // leaf name, shown verbatim
                    // A row's own measured sync, or — for a group header with no
                    // measure of its own — the SUM of its children. The sum
                    // overstates wall-clock (load phases overlap), so mark it.
                    const ownSync = typeof data.sync === 'number';
                    const sync = ownSync ? data.sync : sumChildSync(rowPath);
                    const syncText = ownSync ? fmtMs(sync) : sync === undefined ? '' : `~${fmtMs(sync)} (sum)`;
                    return (
                        `<li class="np-prof__row" data-depth="${depth}">` +
                        `<span class="np-prof__phase">${label}</span>` +
                        `<span class="np-prof__ms">${syncText}</span>` +
                        `<span class="np-prof__ff">${fmtMs(data.columns.firstFrame)}</span>` +
                        `</li>`
                    );
                })
                .join('');
    };

    // Sum the sync times of a group's direct-or-deep children (used for a header
    // row that has no measure of its own). Phase times only — NOT wall-clock, as
    // load phases may overlap; it's an at-a-glance breakdown total.
    const sumChildSync = groupPath => {
        let total = 0;
        let any = false;
        for (const [path, data] of rows) {
            if (path !== groupPath && path.startsWith(`${groupPath}/`) && typeof data.sync === 'number') {
                total += data.sync;
                any = true;
            }
        }
        return any ? total : undefined;
    };

    const record = entry => {
        if (!entry.name.startsWith(MEASURE_PREFIX)) return;
        const name = entry.name.slice(MEASURE_PREFIX.length);

        // '.' separates a column sub-measure from its row; '/' nests rows. Split
        // off a single trailing column segment (if any), the rest is the rowPath.
        const dot = name.lastIndexOf('.');
        const column = dot === -1 ? null : name.slice(dot + 1);
        const rowPath = dot === -1 ? name : name.slice(0, dot);

        // Create ancestor group rows so a header keeps its chronological slot.
        const parts = rowPath.split('/');
        for (let i = 1; i < parts.length; i++) ensureRow(parts.slice(0, i).join('/'));

        const row = ensureRow(rowPath);
        if (column) {
            row.columns[column] = entry.duration;
        } else {
            row.sync = entry.duration;
        }
        // Segment count is global, not per-row: the latest measure to carry it
        // wins, shown once in the header line.
        if (typeof entry.detail?.segments === 'number') visibleSegments = entry.detail.segments;
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
