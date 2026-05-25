/**
 * Single source of truth for preprocessing output format.
 *
 * Every line build-trip-data.js and watch.js emit goes through here. The
 * format is designed for a long-running watch session piped to a log file
 * (`nohup npm run watch ... > watch.log 2>&1 &`) and read remotely via
 * standard unix tools:
 *
 *   grep '\[FAIL\]' watch.log            -- every preprocessing failure
 *   grep -E '\[OK\]|\[FAIL\]' watch.log  -- every build outcome
 *
 * One line per outcome. Failures carry the affected file (or other source
 * label) on the same line as the marker, so a grep returns full records
 * without -A/-B context flags.
 */

/** Line marker for a successful build outcome. */
const MARKER_OK = '[OK]';

/** Line marker for any preprocessing failure. */
const MARKER_FAIL = '[FAIL]';

/**
 * Emit a successful-outcome line to stdout.
 *
 * @param {string} summary  everything that should appear after the marker
 */
export function logOK(summary) {
    console.log(`${MARKER_OK} ${summary}`);
}

/**
 * Emit a failure line to stderr. The line is self-contained — a phone-side
 * `grep '[FAIL]'` returns full records without context flags.
 *
 * @param {string} kind    categorical label, e.g. 'Parse', 'Validation', 'Config'
 * @param {string} detail  everything that should appear after `${kind}: `
 */
export function logFail(kind, detail) {
    console.error(`${MARKER_FAIL} ${kind}: ${detail}`);
}

/**
 * Emit a build-start marker. `cause` is an optional snapshot of file events
 * that triggered this build (from the watcher). The line is omitted from the
 * `grep -E '\[OK\]|\[FAIL\]'` outcome scan recipe — `[BUILD]` is a different
 * marker. Format-truth lives here so watch.js and build-trip-data.js both
 * produce identical lines.
 *
 * @param {{ added?: number, changed?: number, removed?: number } | undefined} cause
 */
export function logBuildStart(cause) {
    let clause = '';
    if (cause) {
        const parts = [];
        if (cause.added)   parts.push(`${cause.added} added`);
        if (cause.changed) parts.push(`${cause.changed} changed`);
        if (cause.removed) parts.push(`${cause.removed} removed`);
        if (parts.length) clause = ` | ${parts.join(', ')}`;
    }
    console.log(`[BUILD] Starting${clause}`);
}
