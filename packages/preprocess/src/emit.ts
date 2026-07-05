/**
 * Emit: the final pipeline stage. Project each scanned RawFeature to the
 * contract's raw trip item (dropping build-internal provenance, adding no
 * fabricated fields), validate the whole trip with the contract (collect-all),
 * fail loud with the full issue list if anything is wrong (writing nothing),
 * else write compact JSON atomically so a crash never leaves a half-written or
 * invalid file (honours "preserve last-good on failure").
 *
 * The projection is a thin field rename, not a second model - RawFeature and the
 * emitted item are the same shape minus provenance, with activity -> transportMode.
 */

import { renameSync, unlinkSync, writeFileSync } from 'node:fs';

import type { TripData, TripItem } from '@nomadpath/contract';
import { CONTRACT_VERSION, validateTripData } from '@nomadpath/contract';

import type { RawFeature } from './model.ts';

function toItem(feature: RawFeature): TripItem {
    const item: TripItem = { geometries: feature.geometries as TripItem['geometries'] };
    if (feature.name !== undefined) item.name = feature.name;
    if (feature.description !== undefined) item.description = feature.description;
    if (feature.folder !== undefined) item.folder = feature.folder;
    if (feature.activity !== undefined) item.transportMode = feature.activity;
    return item;
}

export function emit(features: RawFeature[], name: string | undefined, outPath: string): void {
    const data: TripData = { version: CONTRACT_VERSION, items: features.map(toItem) };
    if (name !== undefined) data.name = name;

    const issues = validateTripData(data);
    if (issues.length > 0) {
        const report = issues.map(i => `  ${i.path || '(root)'}: ${i.message}`).join('\n');
        throw new Error(`invalid trip data (${String(issues.length)} issue(s)):\n${report}`);
    }

    const temp = `${outPath}.tmp`;
    writeFileSync(temp, JSON.stringify(data), 'utf8');
    try {
        renameSync(temp, outPath);
    } catch (err) {
        try {
            unlinkSync(temp);
        } catch {
            // temp already gone; nothing to clean up.
        }
        throw err;
    }
}
