import { CONTRACT_VERSION } from '@nomadpath/contract';
import { contractVersion } from '@nomadpath/ui';
import { describe, expect, it } from 'vitest';

describe('ui package', () => {
    it('consumes the shared contract version', () => {
        expect(contractVersion()).toBe(CONTRACT_VERSION);
    });
});
