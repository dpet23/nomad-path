import { CONTRACT_VERSION } from '@nomadpath/contract';
import { contractVersion } from '@nomadpath/preprocess';
import { describe, expect, it } from 'vitest';

describe('preprocess package', () => {
    it('produces the shared contract version', () => {
        expect(contractVersion()).toBe(CONTRACT_VERSION);
    });
});
