# Internationalization (i18n) System Architecture

## Overview

Complete multilingual system supporting English, Ukrainian, and Russian with dynamic language switching without app restart.

## Supported Languages

| Code | Language   | Native Name | Flag |
|------|------------|-------------|------|
| en   | English    | English     | 🇬🇧   |
| uk   | Ukrainian  | Українська  | 🇺🇦   |
| ru   | Russian    | Русский     | 🇷🇺   |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Translation Files                      │
│  lib/translations.json (Structured key-value pairs)     │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   I18n Context                          │
│  - Language state management                            │
│  - Translation function (t)                             │
│  - AsyncStorage persistence                             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                  UI Components                          │
│  - LanguageSelector (Settings UI)                       │
│  - useI18n() hook in all components                     │
└─────────────────────────────────────────────────────────┘
```

## Translation File Structure

**Format:** `lib/translations.json`

```json
{
  "key.name": {
    "en": "English text",
    "uk": "Український текст",
    "ru": "Русский текст"
  }
}
```

**Example:**

```json
{
  "menu.save": {
    "en": "Save",
    "uk": "Зберегти",
    "ru": "Сохранить"
  },
  "settings.language": {
    "en": "Language",
    "uk": "Мова",
    "ru": "Язык"
  }
}
```

## Key Naming Convention

Use dot notation for hierarchical organization:

- `menu.*` - Menu items
- `settings.*` - Settings screen
- `save.*` - Save/Load system
- `inventory.*` - Inventory system
- `editor.*` - Story editor
- `reader.*` - Story reader
- `common.*` - Common UI elements
- `time.*` - Time-related strings

## I18n Context API

### Provider Setup

```tsx
import { I18nProvider } from '@/lib/i18n-context';

<I18nProvider>
  <App />
</I18nProvider>
```

### Hook Usage

```tsx
import { useI18n } from '@/lib/i18n-context';

function MyComponent() {
  const { language, setLanguage, t, languages } = useI18n();
  
  // Get translation
  const title = t('menu.save');
  
  // With fallback
  const text = t('missing.key', 'Default text');
  
  // Change language
  await setLanguage('uk');
  
  // Get current language
  console.log(language); // 'en' | 'uk' | 'ru'
  
  // Get all languages
  console.log(languages); // Array of LanguageInfo
}
```

### API Reference

**`language: Language`**
- Current active language code
- Type: `'en' | 'uk' | 'ru'`

**`setLanguage(lang: Language): Promise<void>`**
- Change app language
- Persists to AsyncStorage
- Updates UI immediately

**`t(key: string, fallback?: string): string`**
- Get translated text
- Falls back to English if translation missing
- Falls back to provided fallback or key if not found

**`languages: LanguageInfo[]`**
- Array of all supported languages
- Contains: code, name, nativeName, flag

## Language Selector Component

**Location:** `components/LanguageSelector.tsx`

**Usage:**

```tsx
import { LanguageSelector } from '@/components/LanguageSelector';

<LanguageSelector />
```

**Features:**
- Visual flag indicators
- Native language names
- Active language highlight
- Touch-friendly buttons

**UI:**

```
┌─────────────────────────────────────┐
│ Language                            │
├─────────────────────────────────────┤
│ [🇬🇧 English] [🇺🇦 Українська] [🇷🇺 Русский] │
└─────────────────────────────────────┘
```

## Integration Examples

### Basic Component

```tsx
import { useI18n } from '@/lib/i18n-context';

function SaveButton() {
  const { t } = useI18n();
  
  return (
    <Button title={t('menu.save')} />
  );
}
```

### With Interpolation

For dynamic values, use template strings:

```tsx
const { t } = useI18n();
const slotNumber = 5;

// In translations.json:
// "save.slot": { "en": "Slot", "uk": "Слот", "ru": "Слот" }

const text = `${t('save.slot')} ${slotNumber}`;
// Result: "Slot 5" / "Слот 5"
```

### Alert Dialogs

```tsx
import { Alert } from 'react-native';
import { useI18n } from '@/lib/i18n-context';

function deleteConfirm() {
  const { t } = useI18n();
  
  Alert.alert(
    t('save.delete'),
    t('save.deleteConfirm'),
    [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('save.delete'), style: 'destructive', onPress: handleDelete }
    ]
  );
}
```

## Persistence

**Storage Key:** `app_language`

**Behavior:**
- Language preference saved to AsyncStorage
- Loaded automatically on app start
- Survives app restarts
- Default: English (`en`)

## Fallback Strategy

1. Try requested language
2. Fall back to English
3. Fall back to provided fallback string
4. Fall back to translation key

**Example:**

```tsx
t('missing.key', 'Default')
// 1. Check current language (uk) → not found
// 2. Check English (en) → not found
// 3. Return 'Default'
```

## Adding New Languages

### Step 1: Update Language Type

```typescript
// lib/i18n-context.tsx
export type Language = 'en' | 'uk' | 'ru' | 'es'; // Add 'es'
```

### Step 2: Add Language Info

```typescript
export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', flag: '🇺🇦' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' }, // New
];
```

### Step 3: Add Translations

```json
{
  "menu.save": {
    "en": "Save",
    "uk": "Зберегти",
    "ru": "Сохранить",
    "es": "Guardar"
  }
}
```

## Translation Coverage

### Current Coverage

- ✅ Menu items (Save, Load, Settings, Home, Inventory)
- ✅ Save/Load system (Slots, Auto-save, Buttons)
- ✅ Settings screen (Audio, Text, Language)
- ✅ Common UI (OK, Cancel, Error, Success)
- ✅ Time formatting (Just now, ago)
- ✅ Inventory (Title, Empty state, Notifications)
- ✅ Editor (Save, Preview, Scenes)

### To Be Translated

- [ ] Story dialogue content
- [ ] Character names
- [ ] Scene descriptions
- [ ] Choice text
- [ ] Tutorial text

## Story Content Localization

For story content (dialogue, choices), extend the scene structure:

```typescript
interface LocalizedStoryScene {
  id: string;
  text: {
    en: string;
    uk: string;
    ru: string;
  };
  choices: Array<{
    id: string;
    text: {
      en: string;
      uk: string;
      ru: string;
    };
    nextSceneId: string;
  }>;
}
```

**Usage:**

```tsx
const { language } = useI18n();
const dialogueText = scene.text[language];
```

## Performance Considerations

### Optimization Tips

1. **Translation file size:** Keep under 100KB
2. **Lazy loading:** Load only active language (future enhancement)
3. **Caching:** Translations cached in memory
4. **Re-renders:** Context updates trigger re-render only when language changes

### Memory Usage

- Translation file: ~20-30KB
- Context overhead: ~1-2KB
- Per component: Negligible

## Testing Checklist

- [x] Language switching (all 3 languages)
- [x] Persistence after app restart
- [x] Fallback to English
- [x] Missing key handling
- [x] UI updates without restart
- [x] Settings integration
- [x] Save/Load integration
- [x] Alert dialogs
- [x] Time formatting

## Best Practices

### DO ✅

- Use semantic keys (`menu.save` not `save_button`)
- Provide fallback text for new keys
- Keep translations concise
- Test all languages
- Use native language names in selector

### DON'T ❌

- Hardcode text in components
- Use translation keys as display text
- Forget to add all languages for new keys
- Use complex interpolation (keep it simple)
- Store translations in component state

## Troubleshooting

### Translation not showing

1. Check key exists in `translations.json`
2. Verify all languages have the key
3. Check for typos in key name
4. Ensure I18nProvider wraps component

### Language not persisting

1. Check AsyncStorage permissions
2. Verify `setLanguage()` is awaited
3. Check for errors in console

### Fallback not working

1. Ensure English translation exists
2. Check fallback parameter is provided
3. Verify context is properly initialized

## Future Enhancements

### Planned Features

- [ ] Pluralization support
- [ ] Date/time localization
- [ ] Number formatting
- [ ] RTL language support
- [ ] Translation management UI
- [ ] Export/import translations
- [ ] Crowdsourced translations
- [ ] Translation validation tool

### Advanced Features

- [ ] Context-aware translations
- [ ] Gender-specific translations
- [ ] Regional variants (en-US, en-GB)
- [ ] Translation memory
- [ ] Machine translation integration

## Conclusion

The i18n system provides:

- ✅ 3 languages (English, Ukrainian, Russian)
- ✅ Dynamic switching without restart
- ✅ Persistent language preference
- ✅ Fallback strategy
- ✅ Easy to extend
- ✅ Type-safe API
- ✅ Minimal performance impact
- ✅ Complete UI coverage

Ready for production use in multilingual visual novel applications!
