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
      box-shadow: 0 18px 48px rgba(31, 41, 55, 0.16), 0 2px 8px rgba(31, 41, 55, 0.08);
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
      border: 1px solid #f87171;
      border-radius: 7px;
      background: #fff1f2;
      color: #991b1b;
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      font-weight: 700;
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
    .slash-menu {
      position: fixed;
      z-index: 20;
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
    .hidden { display: none; }
    @media (max-width: 760px) {
      .shell { padding: 0; }
      .paper { min-height: 620px; border: 0; border-radius: 0; padding: 28px 24px 80px; box-shadow: none; }
      .title { font-size: 30px; }
      .slash-menu {
        left: 0 !important;
        right: 0;
        bottom: 0;
        top: auto !important;
        width: 100%;
        max-height: 46vh;
        border-radius: 16px 16px 0 0;
        padding: 14px;
      }
    }
  `;
}
