---
spike: 003
name: block-property-forms
type: standard
validates: "Given a block type with properties, when the user edits it in PropertiesPanel, then the form matches the block's specific fields"
verdict: VALIDATED
related: []
tags: [editor, ux, properties, forms]
---

# Spike 003: Block Property Forms

## What This Validates

That all 12 block types have specific property forms matching their data interfaces in the PropertiesPanel.

## Research

### Discovery

The `renderForm` function in `components/editor/PropertiesPanel.tsx` is a **complete switch statement with cases for all 12 block types** (line 126-253). Each case renders type-specific fields matching the `BlockData` union interfaces.

### Coverage

| Block Type | Fields | Form Elements | 
|---|---|---|
| **background** | assetId, transition, duration | AssetPicker + TextInput + OptBtns |
| **character** | characterId, spriteId, position, transition, delay, duration | AssetPicker + OptBtns + TextInput |
| **text** | content, anchorTo, typewriterSpeed | TextInput (multiline) + OptBtns + TextInput |
| **dialogue** | entries[] (characterId, spriteId, text) | Dynamic entry list + add button |
| **choice** | options[] (text, targetSceneId) | Dynamic option list + add button |
| **effect** | effectType, target, intensity, duration | OptBtns + TextInput |
| **music** | assetId, action, volume, loop, fadeDuration | AssetPicker + OptBtns + TextInput + Toggle |
| **sound** | assetId, action, volume, loop, pitchVariation | AssetPicker + OptBtns + TextInput + Toggle |
| **interactive_object** | name, assetId, position (x/y/width/height), pulseAnimation, oneTimeOnly | TextInput + OptBtns + Toggle |
| **camera** | action, zoomLevel, panX, panY, duration, easing | OptBtns + TextInput |
| **variable** | variableName, operation, value | TextInput + OptBtns (toggle-aware) |
| **transition** | targetSceneId, transitionType, duration | TextInput + OptBtns |

### Additional Features Already Present

- **Asset picker integration** — Browse buttons for backgrounds, characters, sprites, music, SFX
- **Validation highlighting** — Missing required fields shown with red border + "REQUIRED" badge
- **Dynamic arrays** — Dialogue entries and choice options can be added/removed dynamically
- **Type-aware variable editing** — Toggle operation shows toggle UI; numeric values preserve number type
- **Action-dependent fields** — Volume/pitch shown as 0-100 percentage, stored as 0-1 float
- **Delete/Duplicate actions** — Bottom bar with action buttons

## Results

**Verdict: VALIDATED** ✓

All 12 block types have complete, type-specific property forms. No missing block types. Forms correctly handle all field types (asset references, enums, numbers, strings, booleans, dynamic arrays).

### What to Improve (Not Required for Spike)

- The `renderForm` switch is 128 lines — extracting per-type form components would improve maintainability
- Character sprite field could show a preview thumbnail
- Camera pan fields are conditionally shown but could be hidden when action=reset
