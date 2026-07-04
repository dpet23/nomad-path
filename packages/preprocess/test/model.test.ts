import { describe, expect, it } from 'vitest';

import { BuildStats } from '../src/model.ts';

describe('BuildStats.format: status-line fragments', () => {
    it('reports a non-zero shortSegmentsSkipped count', () => {
        expect(BuildStats.format({ shortSegmentsSkipped: 2 })).toEqual(['2 short segment(s) skipped']);
    });

    it('reports nothing when shortSegmentsSkipped is zero', () => {
        expect(BuildStats.format({ shortSegmentsSkipped: 0 })).toEqual([]);
    });
});

describe('BuildStats.zero: fresh counters', () => {
    it('returns all counters at zero', () => {
        expect(BuildStats.zero()).toEqual({ shortSegmentsSkipped: 0 });
    });
});

describe('BuildStats.merge: field-by-field sum', () => {
    it('sums shortSegmentsSkipped across two stats objects', () => {
        expect(BuildStats.merge({ shortSegmentsSkipped: 2 }, { shortSegmentsSkipped: 3 })).toEqual({
            shortSegmentsSkipped: 5,
        });
    });
});
