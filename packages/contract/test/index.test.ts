import { CONTRACT_VERSION, tripItemSchema } from '@nomadpath/contract';
import { describe, expect, it } from 'vitest';

describe('contract package', () => {
    it('exposes contract version 1', () => {
        expect(CONTRACT_VERSION).toBe(1);
    });

    describe('tripItemSchema', () => {
        it('accepts a valid trip item', () => {
            const validItem = {
                name: 'Test Track',
                geometries: [
                    {
                        type: 'line' as const,
                        lon: [-120.5, -120.4],
                        lat: [45.5, 45.6],
                    },
                ],
            };
            const result = tripItemSchema.safeParse(validItem);
            expect(result.success).toBe(true);
        });

        it('rejects a non-object', () => {
            const result = tripItemSchema.safeParse('not an object');
            expect(result.success).toBe(false);
        });
    });
});
