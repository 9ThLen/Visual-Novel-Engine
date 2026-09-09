import { AudioLibraryService } from '@/lib/audio-library-service';
import type { AudioLibraryItem } from '@/lib/audio-types';

const music: AudioLibraryItem = {
  id: 'music-1',
  name: 'Theme',
  uri: 'theme.mp3',
  type: 'music',
  loop: true,
  volume: 0.8,
  tags: ['theme'],
  createdAt: 1,
};

const sfx: AudioLibraryItem = {
  id: 'sfx-1',
  name: 'Door',
  uri: 'door.mp3',
  type: 'sfx',
  loop: false,
  volume: 0.5,
  tags: ['door'],
  createdAt: 2,
};

describe('AudioLibraryService', () => {
  it('loads, filters, updates, removes, and clears library items', () => {
    const service = new AudioLibraryService();

    service.load([music, sfx]);

    expect(service.size).toBe(2);
    expect(service.get('music-1')).toEqual(music);
    expect(service.getByType('sfx')).toEqual([sfx]);

    service.set({ ...sfx, name: 'Door Close' });
    expect(service.get('sfx-1')?.name).toBe('Door Close');

    service.remove('music-1');
    expect(service.getAll()).toEqual([{ ...sfx, name: 'Door Close' }]);

    service.clear();
    expect(service.size).toBe(0);
  });
});

