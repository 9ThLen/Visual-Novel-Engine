export function createEmbeddedStyles(): string {
  return `
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 0; height: auto; overflow: visible; background: transparent; color: #111827; }
    body {
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      overflow: visible;
    }
    .shell {
      width: 100%;
      height: auto;
      min-height: 0;
      overflow: visible;
      padding: 28px;
    }
    .paper {
      max-width: 860px;
      min-height: 700px;
      height: auto;
      overflow: visible;
      margin: 0 auto;
      padding: 44px 54px 72px;
      background: #fffefa;
      border: 1px solid #ddd8cf;
      border-radius: 8px;
      box-shadow: 0 18px 48px var(--page-branch-shadow, rgba(31, 41, 55, 0.16)), 0 2px 8px rgba(31, 41, 55, 0.08);
      transition: box-shadow 0.35s ease;
    }
    .eyebrow {
      margin: 0 0 8px;
      color: #6b7280;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .title {
      width: 100%;
      margin: 0 0 22px;
      padding: 0 0 16px;
      border: 0;
      border-bottom: 1px solid #ddd8cf;
      outline: none;
      background: transparent;
      color: #111827;
      font-size: 34px;
      line-height: 1.16;
      font-weight: 800;
    }
    #editor {
      min-height: 300px;
      outline: none;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 17px;
      line-height: 1.68;
      white-space: pre-wrap;
      word-break: break-word;
    }
    #editor p {
      min-height: 28px;
      margin: 0 0 14px;
    }
    .dialogue-badge {
      display: inline-block;
      margin-right: 8px;
      padding: 2px 9px;
      border: 1px solid var(--speaker-color, #f87171);
      border-radius: 6px;
      background: color-mix(in srgb, var(--speaker-color, #ff4d6d) 16%, white);
      color: color-mix(in srgb, var(--speaker-color, #ff4d6d) 82%, black);
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      font-weight: 700;
      line-height: 1.35;
      cursor: pointer;
      vertical-align: baseline;
    }
    .speaker-token:focus {
      outline: 2px solid color-mix(in srgb, var(--speaker-color, #ff4d6d) 60%, white);
      outline-offset: 2px;
    }
    .effect-chip,
    .audio-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin: 0 4px;
      padding: 2px 9px;
      border: 1px solid #c4b5fd;
      border-radius: 7px;
      background: #f5f3ff;
      color: #6d28d9;
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      font-size: 14px;
      font-weight: 750;
      line-height: 1.35;
      cursor: pointer;
      user-select: none;
      vertical-align: baseline;
      white-space: nowrap;
    }
    .audio-chip {
      border-color: #99f6e4;
      background: #ecfeff;
      color: #0f766e;
    }
    .audio-chip--sound {
      border-color: #fecaca;
      background: #fff7ed;
      color: #b91c1c;
    }
    .effect-chip:focus,
    .effect-chip.is-selected,
    .audio-chip:focus,
    .audio-chip.is-selected {
      outline: 2px solid rgba(124, 58, 237, 0.24);
      outline-offset: 2px;
    }
    .effect-chip.is-dragging,
    .audio-chip.is-dragging {
      opacity: 0.56;
      cursor: grabbing;
    }
    .effect-chip-icon,
    .effect-chip-menu,
    .audio-chip-icon,
    .audio-chip-menu {
      color: #7c3aed;
      font-weight: 850;
    }
    .audio-chip-icon,
    .audio-chip-menu {
      color: currentColor;
    }
    .effect-chip-details,
    .audio-chip-details {
      color: #8b7bd8;
      font-size: 12px;
      font-weight: 600;
    }
    .audio-chip-details {
      color: #64748b;
    }
    .character-popover {
      position: absolute;
      z-index: 32;
      width: min(360px, calc(100vw - 32px));
      padding: 14px;
      border: 1px solid #ddd8cf;
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 16px 34px rgba(17, 24, 39, 0.16), 0 2px 8px rgba(17, 24, 39, 0.08);
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      color: #111827;
    }
    .character-popover .sprite-list {
      display: grid;
      gap: 6px;
      max-height: 140px;
      overflow: auto;
      margin: 8px 0;
    }
    .character-popover .sprite-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      align-items: center;
      padding: 7px 8px;
      border: 1px solid #e2e8f0;
      border-radius: 7px;
      background: #f8fafc;
      font-size: 13px;
    }
    .void-block {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      min-height: 58px;
      margin: 12px 0 18px;
      padding: 12px 14px;
      border: 1px solid #d7d0c5;
      border-radius: 7px;
      background: #fffdf8;
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      cursor: default;
      user-select: none;
    }
    .void-block.is-selected,
    .background-block.is-editing,
    .transition-block.is-editing,
    .choice-block.is-editing {
      border-color: #60a5fa;
      box-shadow: 0 0 0 1px #60a5fa;
    }
    .void-title {
      color: #111827;
      font-weight: 800;
    }
    .void-summary {
      color: #6b7280;
      font-size: 13px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .background-block {
      min-height: 68px;
      padding: 12px 16px;
      background: #fffefa;
    }
    .stop-effect-block {
      display: inline-flex;
      min-height: 0;
      margin: 4px 2px;
      padding: 3px 8px;
      gap: 6px;
      border-color: #fecaca;
      border-radius: 6px;
      background: #fef2f2;
      cursor: pointer;
      vertical-align: baseline;
    }
    .stop-effect-block:hover { background: #fee2e2; }
    .stop-effect-block .void-title,
    .stop-effect-block .background-asset { font-size: 13px; }
    .interactive-object-block {
      display: inline-flex;
      width: auto;
      max-width: min(100%, 520px);
      min-height: 0;
      margin: 5px 2px 9px;
      padding: 5px 6px 5px 8px;
      gap: 8px;
      border-color: #bae6fd;
      border-radius: 8px;
      background: #f0f9ff;
      cursor: pointer;
      vertical-align: middle;
    }
    .interactive-object-block:hover { background: #e0f2fe; }
    .interactive-object-icon { color: #0284c7; font-size: 16px; line-height: 1; }
    .interactive-object-copy { display: flex; min-width: 0; align-items: baseline; gap: 7px; }
    .interactive-object-name { color: #0f172a; font-size: 13px; font-weight: 700; white-space: nowrap; }
    .interactive-object-meta { color: #475569; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .transition-block {
      min-height: 40px;
      margin: 8px 0 12px;
      padding: 8px 12px;
      background: #fbfaff;
      border-left: 3px solid #6366f1;
    }
    .transition-block .background-command-line {
      gap: 12px;
    }
    .transition-block .void-title {
      font-size: 13px;
    }
    .transition-block .void-summary {
      font-size: 12px;
    }
    .transition-block .block-button {
      height: 30px;
      padding: 0 12px;
      font-size: 12px;
    }
    .transition-scene-picker {
      margin-top: 10px;
    }
    .transition-scene-picker .asset-choice {
      grid-template-columns: 1fr;
    }
    .transition-scene-picker.hidden {
      display: none;
    }
    .choice-block {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 12px;
      min-height: 0;
      margin: 10px 0 14px;
      padding: 12px 14px;
      background: #ffffff;
      border: 1px solid #e5e0d5;
      border-radius: 7px;
    }
    .choice-block .void-title {
      font-size: 13px;
    }
    .choice-block-header {
      display: flex;
      align-items: center;
      flex: 0 0 auto;
    }
    .choice-question-summary {
      flex: 0 1 180px;
      margin: 0;
      font-size: 12px;
      line-height: 1.35;
      white-space: normal;
    }
    .choice-options-grid {
      display: grid;
      flex: 1 1 auto;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
      min-width: 0;
    }
    .choice-option-card-wrap {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
      min-width: 0;
    }
    .choice-option-card {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 10px;
      width: 100%;
      min-height: 42px;
      padding: 8px 12px;
      border: 1px solid #e2e8f0;
      border-radius: 7px;
      background: #fbfbfa;
      color: #111827;
      text-align: left;
      cursor: pointer;
      box-shadow: none;
      transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, transform 0.15s ease;
    }
    .choice-option-card:hover {
      border-color: var(--branch-color, #cbd5e1);
      background: #f8fafc;
      box-shadow: 0 3px 10px var(--branch-shadow-strong, rgba(15, 23, 42, 0.12));
      transform: translateY(-1px);
    }
    .choice-option-card.is-active {
      background: #eff6ff;
      border-color: var(--branch-color, #60a5fa);
      box-shadow: 0 0 0 1px var(--branch-color, #60a5fa);
    }
    .choice-option-card.is-broken {
      border-color: #fca5a5;
    }
    .choice-option-dot {
      display: inline-block;
      flex: none;
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .choice-option-card-text {
      font-weight: 700;
      font-size: 13px;
      line-height: 1.3;
      color: #111827;
    }
    .choice-option-card-badges {
      display: flex;
      flex-wrap: wrap;
      margin-left: auto;
      gap: 6px;
    }
    .choice-block-actions {
      flex: 0 0 auto;
    }
    .choice-block .block-button {
      height: 34px;
      padding: 0 14px;
      font-size: 13px;
    }
    .choice-options-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin: 10px 0;
    }
    .choice-option-row {
      position: relative;
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 8px;
      align-items: center;
    }
    .choice-option-text {
      grid-column: 1;
    }
    .choice-option-target {
      grid-column: 2;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .choice-option-remove {
      grid-column: 3;
      width: 32px;
      height: 32px;
      border: 1px solid #d7d0c5;
      border-radius: 7px;
      background: #fffefa;
      color: #9f1239;
      cursor: pointer;
    }
    .choice-option-remove:hover {
      background: #fef2f2;
      border-color: #fca5a5;
    }
    .choice-scene-picker {
      grid-column: 1 / -1;
      margin-top: 4px;
    }
    .choice-scene-picker.hidden {
      display: none;
    }
    .choice-scene-picker .asset-choice {
      grid-template-columns: 1fr;
    }
    .choice-branch-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 1px 7px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      text-transform: none;
    }
    .choice-branch-badge-active {
      position: relative;
      width: 18px;
      height: 18px;
      padding: 0;
      background: transparent;
      color: #64748b;
      font-size: 14px;
      line-height: 1;
    }
    .choice-branch-check {
      line-height: 1;
    }
    .choice-branch-badge-label {
      position: absolute;
      right: 0;
      top: calc(100% + 6px);
      z-index: 4;
      width: max-content;
      padding: 3px 7px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: #ffffff;
      color: #374151;
      font-size: 10px;
      font-weight: 700;
      line-height: 1.2;
      box-shadow: 0 6px 16px rgba(15, 23, 42, 0.12);
      opacity: 0;
      pointer-events: none;
      transform: translateY(-2px);
      transition: opacity 0.12s ease, transform 0.12s ease;
      white-space: nowrap;
    }
    .choice-option-card.is-active:hover .choice-branch-badge-label,
    .choice-option-card.is-active:focus-visible .choice-branch-badge-label {
      opacity: 1;
      transform: translateY(0);
    }
    .choice-branch-badge-broken {
      background: #fee2e2;
      color: #991b1b;
    }
    .choice-branch-badge-empty {
      background: #e5e7eb;
      color: #4b5563;
    }
    .choice-branch-start {
      align-self: flex-start;
      padding: 2px 8px;
      border: 1px dashed #d1b876;
      border-radius: 999px;
      background: transparent;
      color: #92702a;
      font-size: 11px;
      font-weight: 650;
      cursor: pointer;
    }
    .choice-branch-start:hover {
      border-color: #f59e0b;
      color: #b45309;
      background: #fff3d6;
    }
    .choice-branch-warning {
      margin-top: 6px;
      padding: 6px 10px;
      border: 1px solid #fca5a5;
      border-radius: 7px;
      background: #fef2f2;
      color: #991b1b;
      font-size: 12px;
    }
    .background-copy {
      min-width: 0;
    }
    .background-command-line {
      display: flex;
      align-items: baseline;
      gap: 26px;
      min-width: 0;
    }
    .background-asset {
      overflow: hidden;
      color: #111827;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .block-actions {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      gap: 10px;
    }
    .block-button,
    .popover-button {
      height: 38px;
      padding: 0 16px;
      border: 1px solid #d7d0c5;
      border-radius: 7px;
      background: #fffefa;
      color: #111827;
      font: 700 14px/1 Inter, ui-sans-serif, system-ui, sans-serif;
      cursor: pointer;
    }
    .block-button:hover,
    .popover-button:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }
    .popover-button.primary {
      border-color: #ef4444;
      background: #ef4444;
      color: #ffffff;
    }
    .popover-button.primary:hover {
      background: #dc2626;
    }
    .background-popover {
      position: absolute;
      z-index: 30;
      width: min(420px, calc(100vw - 32px));
      padding: 16px;
      border: 1px solid #ddd8cf;
      border-radius: 10px;
      background: #ffffff;
      box-shadow: 0 16px 34px rgba(17, 24, 39, 0.16), 0 2px 8px rgba(17, 24, 39, 0.08);
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      color: #111827;
    }
    .background-popover::before {
      content: "";
      position: absolute;
      top: -8px;
      right: 36px;
      width: 14px;
      height: 14px;
      border-left: 1px solid #ddd8cf;
      border-top: 1px solid #ddd8cf;
      background: #ffffff;
      transform: rotate(45deg);
    }
    .transition-popover::before,
    .choice-popover::before {
      display: none;
    }
    .effect-popover,
    .audio-popover {
      position: absolute;
      z-index: 34;
      width: min(420px, calc(100vw - 32px));
      max-height: min(720px, calc(100vh - 32px));
      overflow: auto;
      padding: 16px;
      border: 1px solid #ddd8cf;
      border-radius: 10px;
      background: #ffffff;
      box-shadow: 0 16px 34px rgba(17, 24, 39, 0.16), 0 2px 8px rgba(17, 24, 39, 0.08);
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      color: #111827;
    }
    .effect-popover::before,
    .audio-popover::before {
      content: "";
      position: absolute;
      left: -8px;
      top: 32px;
      width: 14px;
      height: 14px;
      border-left: 1px solid #ddd8cf;
      border-bottom: 1px solid #ddd8cf;
      background: #ffffff;
      transform: rotate(45deg);
    }
    .audio-kind-grid {
      grid-template-columns: repeat(2, 1fr);
    }
    .effect-popover-grid {
      display: grid;
      grid-template-columns: 1fr 1.45fr;
      gap: 8px 14px;
      align-items: center;
    }
    .effect-type-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 14px;
    }
    .effect-type-chip {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      padding: 8px 4px;
      border: 1px solid #e2ddd4;
      border-radius: 8px;
      background: #faf9f7;
      color: #4b5563;
      font: 650 12px/1.2 Inter, ui-sans-serif, system-ui, sans-serif;
      cursor: pointer;
    }
    .effect-type-chip:hover {
      border-color: #c4b5fd;
      background: #f5f3ff;
    }
    .effect-type-chip.is-active {
      border-color: #7c3aed;
      background: #f5f3ff;
      color: #6d28d9;
      box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.16);
    }
    .effect-type-chip-icon {
      font-size: 17px;
      line-height: 1;
    }
    .effect-range-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .effect-range-row input[type="range"] {
      flex: 1;
      accent-color: #7c3aed;
    }
    .effect-range-value {
      min-width: 34px;
      text-align: right;
      color: #6d28d9;
      font-size: 13px;
      font-weight: 750;
      font-variant-numeric: tabular-nums;
    }
    .effect-advanced {
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px dashed #e5e7eb;
    }
    .effect-advanced summary {
      color: #6b7280;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      user-select: none;
    }
    .effect-advanced[open] summary {
      margin-bottom: 10px;
      color: #6d28d9;
    }
    .effect-options {
      margin: 14px 0;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
    }
    .effect-section-title {
      margin: 0 0 10px;
      color: #6d28d9;
      font-size: 13px;
      font-weight: 800;
    }
    .effect-pair {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .effect-checkbox {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-top: 8px;
      color: #374151;
      font-size: 13px;
      font-weight: 650;
    }
    .popover-label {
      display: block;
      margin: 0 0 6px;
      font-size: 13px;
      font-weight: 750;
    }
    .popover-control {
      width: 100%;
      height: 42px;
      padding: 0 12px;
      border: 1px solid #d6dee8;
      border-radius: 7px;
      background: #ffffff;
      color: #111827;
      font: 500 14px/1 Inter, ui-sans-serif, system-ui, sans-serif;
      outline: none;
    }
    .popover-control:focus {
      border-color: #60a5fa;
      box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.24);
    }
    textarea.popover-control {
      height: auto;
      min-height: 60px;
      padding: 10px 12px;
      resize: vertical;
    }
    .background-preview {
      margin-top: 12px;
      height: 132px;
      border: 1px solid #d7d0c5;
      border-radius: 7px;
      background:
        linear-gradient(180deg, rgba(6, 16, 32, 0.16), rgba(6, 16, 32, 0.58)),
        radial-gradient(circle at 52% 18%, rgba(220, 236, 255, 0.95) 0 5%, transparent 6%),
        linear-gradient(135deg, #0f2535, #152f46 42%, #07111f);
      overflow: hidden;
    }
    .background-preview.placeholder {
      display: grid;
      place-items: center;
      background: #f8fafc;
      color: #64748b;
      font-size: 13px;
      font-weight: 650;
    }
    .preview-actions {
      display: flex;
      justify-content: flex-end;
      margin: 8px 0 10px;
    }
    .audio-mode-hint {
      margin: -6px 0 12px;
      color: #6b7280;
      font-size: 12px;
      line-height: 1.4;
    }
    .asset-picker {
      margin: 0 0 12px;
      padding: 10px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #f8fafc;
    }
    .asset-picker.is-uploading::after {
      display: block;
      margin-top: 8px;
      color: #475569;
      font-size: 12px;
      content: "Завантаження...";
    }
    .asset-picker-actions {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 10px;
    }
    .asset-choice-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      max-height: 156px;
      overflow: auto;
    }
    .asset-choice {
      display: grid;
      grid-template-columns: 46px 1fr;
      align-items: center;
      gap: 8px;
      min-width: 0;
      padding: 6px;
      border: 1px solid #dbe3ec;
      border-radius: 7px;
      background: #ffffff;
      color: #111827;
      text-align: left;
      cursor: pointer;
    }
    .asset-choice:hover,
    .asset-choice.active {
      border-color: #60a5fa;
      box-shadow: 0 0 0 1px #60a5fa;
    }
    .asset-thumb {
      width: 46px;
      height: 34px;
      border-radius: 5px;
      background-color: #e2e8f0;
      background-position: center;
      background-size: cover;
    }
    .audio-asset-icon {
      display: grid;
      place-items: center;
      width: 46px;
      height: 34px;
      border-radius: 5px;
      background: #e0f2fe;
      color: #0369a1;
      font-size: 10px;
      font-weight: 850;
      text-transform: uppercase;
    }
    .audio-preview {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 10px;
      align-items: center;
      margin: 12px 0 8px;
      padding: 10px;
      border: 1px solid #d7d0c5;
      border-radius: 7px;
      background: #f8fafc;
    }
    .audio-preview.placeholder {
      opacity: 0.72;
    }
    .audio-preview-copy {
      min-width: 0;
    }
    .audio-preview-name {
      overflow: hidden;
      color: #111827;
      font-size: 13px;
      font-weight: 750;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .audio-progress {
      width: 100%;
      height: 8px;
      accent-color: #0f766e;
    }
    .asset-name {
      overflow: hidden;
      font-size: 12px;
      font-weight: 700;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .asset-empty {
      grid-column: 1 / -1;
      padding: 10px;
      color: #64748b;
      font-size: 13px;
      text-align: center;
    }
    .asset-error {
      margin: -2px 0 10px;
      padding: 8px 10px;
      border: 1px solid #fecaca;
      border-radius: 7px;
      background: #fef2f2;
      color: #b91c1c;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.4;
    }
    .popover-grid {
      display: grid;
      grid-template-columns: 1fr 1.45fr;
      gap: 8px 14px;
      align-items: center;
      margin-top: 8px;
    }
    .popover-help {
      margin: 12px 0 16px;
      color: #64748b;
      font-size: 13px;
      line-height: 1.45;
    }
    .popover-footer {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .slash-menu {
      position: absolute;
      z-index: 60;
      width: 340px;
      max-height: 296px;
      overflow: auto;
      padding: 6px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 18px 44px rgba(17, 24, 39, 0.18), 0 2px 8px rgba(17, 24, 39, 0.1);
    }
    .slash-item {
      display: grid;
      grid-template-columns: 28px 1fr auto;
      gap: 10px;
      align-items: center;
      width: 100%;
      padding: 9px 10px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: #111827;
      text-align: left;
      cursor: pointer;
    }
    .slash-item.active, .slash-item:hover { background: #eff6ff; }
    .slash-icon {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      color: #374151;
      font-size: 12px;
      font-weight: 800;
    }
    .slash-title { display: block; font-weight: 750; }
    .slash-desc { display: block; margin-top: 1px; color: #6b7280; font-size: 12px; }
    .slash-alias { color: #6b7280; font-size: 12px; }
    .slash-group-label {
      padding: 10px 10px 4px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #9ca3af;
    }
    .hidden { display: none; }
    @media (max-width: 760px) {
      .shell { padding: 0; }
      /* The paper fills the frame edge-to-edge here, so an outer shadow would be
         clipped by the iframe — use an inset glow for the branch tint instead. */
      .paper { min-height: 620px; border: 0; border-radius: 0; padding: 28px 24px 80px; box-shadow: inset 0 0 46px var(--page-branch-shadow, transparent); }
      .title { font-size: 30px; }
      .slash-menu {
        position: fixed;
        left: 0 !important;
        right: 0;
        bottom: 0;
        top: auto !important;
        width: 100%;
        max-height: 46vh;
        border-radius: 16px 16px 0 0;
        padding: 14px;
      }
      .background-block,
      .transition-block {
        align-items: stretch;
        flex-direction: column;
      }
      .background-command-line {
        gap: 12px;
      }
      .block-actions {
        justify-content: flex-end;
      }
      .choice-block {
        align-items: stretch;
        flex-direction: column;
      }
      .choice-options-grid {
        grid-template-columns: 1fr;
      }
      .background-popover::before {
        display: none;
      }
      .popover-grid {
        grid-template-columns: 1fr;
      }
      .effect-popover::before,
      .audio-popover::before {
        display: none;
      }
      .effect-popover-grid {
        grid-template-columns: 1fr;
      }
      .asset-choice-list {
        grid-template-columns: 1fr;
      }
    }
    /* Transition popovers are anchored in script. Keeping them out of fixed
       bottom-sheet layout avoids iframe resize feedback loops. */
    .transition-popover {
      position: absolute;
      right: auto !important;
      bottom: auto !important;
      transform: none;
      width: min(440px, calc(100vw - 24px));
      max-height: min(70vh, 520px);
      overflow: auto;
      border-radius: 10px;
    }
  `;
}
