import { describe, expect, it } from 'vitest';

import { CONTRACT_VERSION } from '@nomadpath/contract';
import { contractVersion } from '@nomadpath/ui';

describe('ui package', () => {
  it('consumes the shared contract version', () => {
    expect(contractVersion()).toBe(CONTRACT_VERSION);
  });
});
