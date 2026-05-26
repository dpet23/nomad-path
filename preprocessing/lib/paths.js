/**
 * Path-argument helpers for the preprocessing CLIs.
 *
 * The shell strips a leading ~ only when the arg is unquoted. Quoted
 * args (and paths read from config files / saved scripts) reach Node
 * as a literal `~`, and path.resolve() does not expand tildes — so
 * `-i "~/code/trips"` would fail without help.
 *
 * Tilde expansion is delegated to the `untildify` package (cross-
 * platform, handles ~ alone, ~/ on POSIX, ~\ on Windows; leaves
 * ~otheruser/ alone). After expansion we call path.resolve to
 * preserve today's CWD-relative behaviour for plain `./foo` style
 * args.
 */

import { resolve } from 'path';
import untildify from 'untildify';

/**
 * Expand a user-supplied CLI path argument: ~ to home, then resolve to
 * absolute. Pass through nullish inputs unchanged so callers can chain
 * `expandPath(values.output)` for optional flags.
 *
 * @param {string | undefined | null} p
 * @returns {string | undefined | null}
 */
export function expandPath(p) {
    if (p == null) return p;
    return resolve(untildify(p));
}
