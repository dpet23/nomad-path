import { describe, expect, it } from 'vitest';

import { CONTRACT_VERSION } from '@nomadpath/contract';
import { contractVersion } from '@nomadpath/pipeline';

describe('pipeline package', () => {
  it('produces the shared contract version', () => {
    expect(contractVersion()).toBe(CONTRACT_VERSION);
  });
});
