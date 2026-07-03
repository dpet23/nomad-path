import { CONTRACT_VERSION } from '@nomadpath/contract';
import { describe, expect, it } from 'vitest';

describe('contract package', () => {
    it('exposes contract version 1', () => {
        expect(CONTRACT_VERSION).toBe(1);
    });
});
