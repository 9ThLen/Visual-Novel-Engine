# UI Sound Effects Guide

## Required Sound Files

Place the following sound files in `assets/sounds/` directory:

### 1. click.mp3
**Purpose:** Button press feedback  
**Duration:** 50-100ms  
**Type:** Short, subtle click sound  
**Volume:** Low (20-30%)  
**Recommended:** Soft "tap" or "pop" sound

### 2. success.mp3
**Purpose:** Successful action (save, load, etc.)  
**Duration:** 200-400ms  
**Type:** Pleasant, positive chime  
**Volume:** Medium (30-40%)  
**Recommended:** Rising tone or bell sound

### 3. error.mp3
**Purpose:** Error or failed action  
**Duration:** 200-400ms  
**Type:** Gentle warning sound  
**Volume:** Medium (30-40%)  
**Recommended:** Descending tone (not harsh)

### 4. whoosh.mp3
**Purpose:** Scene transitions, modal appearances  
**Duration:** 300-500ms  
**Type:** Smooth swoosh sound  
**Volume:** Low (20-30%)  
**Recommended:** Soft wind or swipe sound

## Where to Get Sound Files

### Free Resources

1. **Freesound.org**
   - https://freesound.org/
   - Search for: "ui click", "button", "success", "error", "whoosh"
   - Filter by: CC0 (Public Domain) license

2. **Zapsplat**
   - https://www.zapsplat.com/
   - Free for personal and commercial use
   - Category: UI/Interface sounds

3. **Mixkit**
   - https://mixkit.co/free-sound-effects/
   - Free license
   - Category: UI sounds

4. **Pixabay**
   - https://pixabay.com/sound-effects/
   - Free for commercial use
   - Search: "click", "button", "notification"

### Recommended Specific Sounds

**For click.mp3:**
- "Soft Click" by Freesound user
- Short duration (50ms)
- Frequency: 2-4kHz

**For success.mp3:**
- "Success Chime" or "Notification Bell"
- Pleasant, not annoying
- Frequency: 800-2000Hz

**For error.mp3:**
- "Error Beep" (gentle, not harsh)
- Descending tone
- Frequency: 400-800Hz

**For whoosh.mp3:**
- "Swipe" or "Transition Whoosh"
- Smooth, not abrupt
- White noise based

## Audio Specifications

All sound files should meet these specifications:

- **Format:** MP3 (for best compatibility)
- **Sample Rate:** 44.1kHz or 48kHz
- **Bit Rate:** 128kbps or higher
- **Channels:** Mono (stereo not needed for UI sounds)
- **Normalization:** -6dB to -3dB peak (not too loud)

## File Structure

```
assets/
└── sounds/
    ├── click.mp3      # Button press
    ├── success.mp3    # Success action
    ├── error.mp3      # Error/warning
    └── whoosh.mp3     # Transitions
```

## Testing Sounds

After adding sound files, test them in the app:

1. Enable sounds in settings
2. Test button presses (click.mp3)
3. Save a game (success.mp3)
4. Try an invalid action (error.mp3)
5. Open/close modals (whoosh.mp3)

## Volume Guidelines

The app uses these default volumes:
- Click: 20% (0.2)
- Success: 30% (0.3)
- Error: 30% (0.3)
- Whoosh: 25% (0.25)

Users can disable sounds in settings if desired.

## Creating Your Own Sounds

If you want to create custom sounds:

### Tools
- **Audacity** (Free) - https://www.audacityteam.org/
- **GarageBand** (Mac, Free)
- **FL Studio** (Paid)

### Tips
1. Keep sounds short (under 500ms)
2. Use simple waveforms (sine, triangle)
3. Add slight reverb for depth
4. Normalize to -6dB
5. Export as MP3, 44.1kHz, 128kbps

### Example: Creating a Click Sound in Audacity

1. Generate → Tone
2. Waveform: Sine
3. Frequency: 2000 Hz
4. Amplitude: 0.5
5. Duration: 0.05 seconds
6. Effect → Fade Out (last 20ms)
7. Effect → Normalize (-6dB)
8. Export as MP3

## License Considerations

When using sound files:
- Check the license (CC0, CC-BY, etc.)
- Attribute if required
- Keep license info in a LICENSES.txt file
- Don't use copyrighted sounds without permission

## Fallback Behavior

The app is designed to work without sound files:
- If sounds are missing, only haptic feedback plays
- No errors are thrown
- Users won't notice missing sounds (graceful degradation)

## Future Enhancements

Potential additional sounds:
- `swipe.mp3` - For gesture navigation
- `toggle.mp3` - For switch/checkbox
- `notification.mp3` - For alerts
- `page_turn.mp3` - For dialogue progression
- `menu_open.mp3` - For menu appearance
- `menu_close.mp3` - For menu dismissal
