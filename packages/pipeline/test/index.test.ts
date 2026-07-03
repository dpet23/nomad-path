import { CONTRACT_VERSION } from '@nomadpath/contract';
import { contractVersion } from '@nomadpath/pipeline';
import { describe, expect, it } from 'vitest';

describe('pipeline package', () => {
    it('produces the shared contract version', () => {
        expect(contractVersion()).toBe(CONTRACT_VERSION);
    });
});
