/**
 * The capability map: one runtime entry per visualisation the library can
 * render. Library dispatch (paint expressions, legend gradients) reads from
 * this constant; the validator iterates the same constant to check input.
 *
 * Populated in step (b). For now this is the placeholder shape that lets
 * the rest of the contract module compile.
 */

export interface CapabilityMap {
    [id: string]: never;
}

export const CAPABILITIES: CapabilityMap = {};
