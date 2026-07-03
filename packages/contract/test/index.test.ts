import { describe, expect, it } from 'vitest';

import { CONTRACT_VERSION } from '@nomadpath/contract';

describe('contract package', () => {
    it('exposes contract version 1', () => {
        expect(CONTRACT_VERSION).toBe(1);
    });
});
