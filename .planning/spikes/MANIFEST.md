# Spike Manifest

## Idea
Дослідити, які можливості та покращення варто додати у Visual Novel Engine після завершення основних 5 фаз рефакторингу. Фокус — на продукті для автора: нові фічі, UX-покращення та інтеграційні ризики між існуючими компонентами.

## Requirements
- Усі спіки мають працювати в межах поточного стеку (Expo 54, React 19, React Native 0.81, Zustand)
- Спіки мають бути конкретними, з вимірюваним результатом
- Пріоритет — фічі, які дають найбільшу цінність автору при мінімальному обсязі змін

## Emerged Requirements
- Runtime має виконувати блоки через BlockExecutor, а не через lossy adapter (`sceneRecordToStoryScene`)
- Undo/redo інфраструктура вже готова (store + selectors), потрібне лише UI підключення
- Keyboard shortcuts мають працювати тільки на web (`Platform.OS === 'web'`)

## Spikes

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 001 | runtime-scene-player | standard | Given a canonical scene with blocks, when the reader executes it, then each block type produces visible output | ✓ VALIDATED | runtime, reader, blocks, execution |
| 002 | editor-undo-redo | standard | Given a timeline with edits, when user performs undo, then the previous state is restored without data loss | ✓ VALIDATED | editor, ux, undo |
| 003 | block-property-forms | standard | Given a block type with properties, when the user edits it in PropertiesPanel, then the form matches the block's specific fields | ✓ VALIDATED | editor, ux, properties |
| 004 | keyboard-shortcuts | standard | Given desktop web view, when user presses Ctrl+Z / Del / Ctrl+D, then editor responds | ✓ VALIDATED | editor, desktop, ux |
