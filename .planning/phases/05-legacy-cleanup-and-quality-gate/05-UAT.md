# 05 UAT

## Scope

Розмовний UAT для Phase 5: `Legacy Cleanup and Quality Gate`.

Мета:
- підтвердити з точки зору користувача, що stabilized canonical path працює на ключових сценаріях;
- зафіксувати manual QA status окремо від automated verification;
- якщо буде знайдено дефект, використати його як вхід для наступного fix plan.

## Inputs

- `05-MANUAL-QA.md`
- `05-VERIFICATION.md`
- `05-01-SUMMARY.md`
- `05-02-SUMMARY.md`

## Session Status

- Phase under test: 5
- Session state: in_progress
- Environment note: automated verification is green; browser/manual QA in this sandbox was previously blocked by Expo cache access restrictions

## Test Log

### UAT-01 Story creation

- Status: pending user run
- Based on: `QA-01 Story creation`
- Goal: підтвердити, що нова історія створюється через canonical path і одразу відкриває persisted стартову сцену
- Expected:
  - story creation не падає
  - відкривається `scene-editor`
  - нова story з'являється в editor list

### UAT-02 Scene save and reopen

- Status: queued
- Based on: `QA-02 Scene save and reopen`

### UAT-03 Preview and reader

- Status: queued
- Based on: `QA-03 Preview and reader`

### UAT-04 Save / load / autosave

- Status: queued
- Based on: `QA-04 Save / load / autosave`

### UAT-05 SceneManager CRUD

- Status: queued
- Based on: `QA-05 SceneManager CRUD`

### UAT-06 StoryFlow

- Status: queued
- Based on: `QA-06 StoryFlow`

## Outcome

- Final status: pending
- Open issues: none recorded yet
