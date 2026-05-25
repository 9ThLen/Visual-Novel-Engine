import { describe, expect, it } from 'vitest';

import { getPhoneComposerPanel } from '@/lib/mobile-composer-layout';

describe('getPhoneComposerPanel', () => {
  it('returns blocks when block library is open', () => {
    expect(
      getPhoneComposerPanel({
        showBlockLibrary: true,
        showProperties: false,
        hasSelectedBlock: false,
      }),
    ).toBe('blocks');
  });

  it('returns properties when properties are open for a selected block', () => {
    expect(
      getPhoneComposerPanel({
        showBlockLibrary: false,
        showProperties: true,
        hasSelectedBlock: true,
      }),
    ).toBe('properties');
  });

  it('returns timeline by default', () => {
    expect(
      getPhoneComposerPanel({
        showBlockLibrary: false,
        showProperties: false,
        hasSelectedBlock: false,
      }),
    ).toBe('timeline');
  });
});
