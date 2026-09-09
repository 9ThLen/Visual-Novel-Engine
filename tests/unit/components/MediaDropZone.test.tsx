/**
 * Dropping files onto the library.
 *
 * The zone only has to do two things honestly: say so while a drag is over it,
 * and hand over exactly what was dropped. Which of those files is a background
 * and which is a sound belongs to `media-drop`, and adding them to the story
 * belongs to the screen.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Text } from 'react-native';

import { MediaDropZone } from '@/components/media-library/MediaDropZone';
import { Colors } from '@/lib/_core/theme';

const colors = Colors.light;

function dragEvent(type: string, init: { types?: string[]; files?: File[] } = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      types: init.types ?? ['Files'],
      files: init.files ?? [],
      dropEffect: 'none',
    },
  });
  return event;
}

function renderZone() {
  const onDropFiles = vi.fn();
  const { container } = render(
    <MediaDropZone colors={colors} onDropFiles={onDropFiles}>
      <Text>the library</Text>
    </MediaDropZone>,
  );
  return { onDropFiles, host: container.firstChild as HTMLElement };
}

describe('the drop zone', () => {
  it('shows what a drop would do, and stops once the drag leaves', () => {
    const { host } = renderZone();

    fireEvent(host, dragEvent('dragenter'));
    expect(screen.getByText('Drop to add to this story')).toBeTruthy();

    fireEvent(host, dragEvent('dragleave'));
    expect(screen.queryByText('Drop to add to this story')).toBeNull();
  });

  // `dragleave` fires for every child the pointer crosses, so a hint that
  // disappears on the first one flickers its way across the grid.
  it('stays up while the pointer crosses the children', () => {
    const { host } = renderZone();

    fireEvent(host, dragEvent('dragenter'));
    fireEvent(host, dragEvent('dragenter'));
    fireEvent(host, dragEvent('dragleave'));

    expect(screen.getByText('Drop to add to this story')).toBeTruthy();
  });

  // Without a prevented dragover the browser navigates away to the file, which
  // loses the author's work rather than adding to it.
  it('claims the drag so the browser does not open the file', () => {
    const { host } = renderZone();

    const over = dragEvent('dragover');
    fireEvent(host, over);

    expect(over.defaultPrevented).toBe(true);
  });

  it('hands over everything dropped at once', () => {
    const { host, onDropFiles } = renderZone();
    const files = [
      new File(['x'], 'room.png', { type: 'image/png' }),
      new File(['y'], 'theme.mp3', { type: 'audio/mpeg' }),
    ];

    fireEvent(host, dragEvent('dragenter'));
    fireEvent(host, dragEvent('drop', { files }));

    expect(onDropFiles).toHaveBeenCalledTimes(1);
    expect(onDropFiles.mock.calls[0][0].map((file: File) => file.name)).toEqual(['room.png', 'theme.mp3']);
    // The hint belongs to the drag, which is over.
    expect(screen.queryByText('Drop to add to this story')).toBeNull();
  });

  // A drag of selected text is not an offer of files, and treating it as one
  // would put a hint over the library that nothing can act on.
  it('ignores a drag that carries no files', () => {
    const { host, onDropFiles } = renderZone();

    fireEvent(host, dragEvent('dragenter', { types: ['text/plain'] }));
    expect(screen.queryByText('Drop to add to this story')).toBeNull();

    fireEvent(host, dragEvent('drop', { files: [] }));
    expect(onDropFiles).not.toHaveBeenCalled();
  });
});
