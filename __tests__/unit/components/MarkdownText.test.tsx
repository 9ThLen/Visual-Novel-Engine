import { fireEvent, render } from '@testing-library/react';
import { Linking } from 'react-native';
import { MarkdownText, isSafeMarkdownLink } from '@/components/ai-chat/MarkdownText';

describe('MarkdownText', () => {
  it('renders the supported inline, list, and fenced-code subset', () => {
    const view = render(<MarkdownText color="#fff" text={'**bold** *italic* `code`\n- item\n```ts\nconst x = 1\n```'} />);
    expect(view.getByText('bold')).toBeTruthy();
    expect(view.getByText('italic')).toBeTruthy();
    expect(view.getByText('code')).toBeTruthy();
    expect(view.getByText('- item')).toBeTruthy();
    expect(view.getByText(/const x = 1/)).toBeTruthy();
  });

  it('opens only allowlisted links and degrades unsafe or malformed markup to text', () => {
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const view = render(<MarkdownText color="#fff" text={'[safe](https://example.com) [bad](javascript:alert) **unfinished'} />);
    fireEvent.click(view.getByText('safe'));
    expect(open).toHaveBeenCalledWith('https://example.com');
    expect(view.getByText(/javascript:/)).toBeTruthy();
    expect(view.getByText(/unfinished/)).toBeTruthy();
    expect(isSafeMarkdownLink('mailto:a@example.com')).toBe(true);
    expect(isSafeMarkdownLink('file:///secret')).toBe(false);
  });
});
