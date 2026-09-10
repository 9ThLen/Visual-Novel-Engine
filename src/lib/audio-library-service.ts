/**
 * Audio Library Service
 * Manages the catalog of AudioLibraryItem entries.
 * Pure data management — no playback or trigger scheduling logic.
 */

import type { AudioLibraryItem } from './audio-types';
import type { IAudioLibraryService } from './audio-interfaces';

export class AudioLibraryService implements IAudioLibraryService {
    private library = new Map<string, AudioLibraryItem>();

    /** Load (replace) the entire library */
    load(items: AudioLibraryItem[]): void {
        this.library.clear();
        for (const item of items) {
            this.library.set(item.id, item);
        }
    }

    /** Get a single item by ID */
    get(audioId: string): AudioLibraryItem | undefined {
        return this.library.get(audioId);
    }

    /** Get all items of a given type */
    getByType(type: AudioLibraryItem['type']): AudioLibraryItem[] {
        const result: AudioLibraryItem[] = [];
        for (const item of this.library.values()) {
            if (item.type === type) result.push(item);
        }
        return result;
    }

    /** Add or update an item */
    set(item: AudioLibraryItem): void {
        this.library.set(item.id, item);
    }

    /** Remove an item */
    remove(audioId: string): void {
        this.library.delete(audioId);
    }

    /** Get all items */
    getAll(): AudioLibraryItem[] {
        return Array.from(this.library.values());
    }

    /** Clear the library */
    clear(): void {
        this.library.clear();
    }

    /** Number of items in the library */
    get size(): number {
        return this.library.size;
    }
}