import React from 'react';
import { render, screen } from '@testing-library/react';

import { DocumentRightRail } from '@/components/document-editor/DocumentRightRail';

describe('DocumentRightRail AI platform gate', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not expose the AI tab in unsupported environments', () => {
    vi.stubGlobal('WebSocket', undefined);
    render(<DocumentRightRail scene={null} storyId="story" activeSceneId={null} />);
    expect(screen.queryByText('AI')).toBeNull();
    expect(screen.getByText(/available only when.*localhost/i)).toBeTruthy();
  });

  it('keeps the AI tab on supported local web', () => {
    vi.stubGlobal('WebSocket', class {});
    render(<DocumentRightRail scene={null} storyId="story" activeSceneId={null} />);
    expect(screen.getByText('AI')).toBeTruthy();
  });
});
