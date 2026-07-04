import { CONTRACT_VERSION } from '@nomadpath/contract';

/** The contract version this pipeline emits. */
export function contractVersion(): number {
    return CONTRACT_VERSION;
}
