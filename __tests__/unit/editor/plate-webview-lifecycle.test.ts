import fs from 'node:fs';
import path from 'node:path';

describe('PlateWebViewEditor lifecycle contract', () => {
  it('does not tie iframe srcDoc generation to live scene or character snapshots', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components/vn-plate-editor/PlateWebViewEditor.web.tsx'),
      'utf8',
    );

    expect(source).toContain('const html = useMemo');
    expect(source).toContain("useColors('light')");
    // srcDoc rebuilds only on identity/layout/theme inputs plus the shared-script
    // fallback flag — never on live scene/character snapshots.
    expect(source).toContain('[editorId, isPhone, forceInlineHtml, colors]');
    expect(source).toContain('useImperativeHandle');
    expect(source).toContain("type: 'flush'");
    expect(source).toContain('visibleFrameHeight');
    expect(source).toContain('message.overlayHeight');
  });

  it('measures intrinsic editor content so iframe height can shrink', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'lib/vn-plate-editor/embedded-script.ts'),
      'utf8',
    );
    const measureHeightBody = source.match(/function measureHeight\(\) \{[\s\S]*?\n    \}/)?.[0] ?? '';
    const measureOverlayHeightBody = source.match(/function measureOverlayHeight\(\) \{[\s\S]*?\n    \}/)?.[0] ?? '';

    expect(measureHeightBody).toContain("document.querySelector('.shell')");
    expect(measureHeightBody).toContain('elementBottom(shell)');
    expect(measureHeightBody).not.toContain('#slashMenu:not(.hidden)');
    expect(measureOverlayHeightBody).toContain('#slashMenu:not(.hidden)');
    expect(measureOverlayHeightBody).toContain('.audio-popover');
    expect(measureHeightBody).not.toContain('document.documentElement');
    expect(measureHeightBody).not.toContain('document.body');
  });

  it('keeps editor popovers anchored instead of docking them to the iframe bottom', () => {
    const script = fs.readFileSync(
      path.join(process.cwd(), 'lib/vn-plate-editor/embedded-script.ts'),
      'utf8',
    );
    const styles = fs.readFileSync(
      path.join(process.cwd(), 'lib/vn-plate-editor/embedded-styles.ts'),
      'utf8',
    );
    const positionTransitionBody = script.match(/function positionTransitionPopover\(anchor\) \{[\s\S]*?\n    \}/)?.[0] ?? '';

    expect(positionTransitionBody).toContain('anchor.getBoundingClientRect()');
    expect(positionTransitionBody).toContain("transitionPopover.style.top = (scrollY + top) + 'px'");
    expect(styles).not.toMatch(/\.transition-popover\s*\{[\s\S]*?position:\s*fixed/);
    expect(styles).not.toMatch(/(?:\.background-popover|\.character-popover|\.effect-popover|\.audio-popover)[^{]*\{[^}]*position:\s*fixed/);
  });
});

describe('document formatting bridge', () => {
  it('connects header commands through the active iframe and returns format state', () => {
    const header = fs.readFileSync(
      path.join(process.cwd(), 'components/document-editor/DocumentEditorHeader.tsx'),
      'utf8',
    );
    const host = fs.readFileSync(
      path.join(process.cwd(), 'components/vn-plate-editor/PlateWebViewEditor.web.tsx'),
      'utf8',
    );
    const embedded = fs.readFileSync(
      path.join(process.cwd(), 'lib/vn-plate-editor/embedded-script.ts'),
      'utf8',
    );

    expect(header).toContain("onFormatText('color', color)");
    expect(host).toContain("type: 'formatText', command, value");
    expect(host).toContain("message.type === 'formatState'");
    expect(embedded).toContain("message.type === 'formatText'");
    expect(embedded).toContain("command === 'color' ? 'foreColor'");
    expect(embedded).toContain("type: 'formatState'");
  });

  it('gives active formatting controls a distinct primary-tinted state', () => {
    const header = fs.readFileSync(
      path.join(process.cwd(), 'components/document-editor/DocumentEditorHeader.tsx'),
      'utf8',
    );

    expect(header).toContain("backgroundColor: active ? withAlpha(colors.primary, 0.18) : 'transparent'");
    expect(header).toContain("color={active ? colors['primary-active'] : colors.foreground}");
    expect(header).toContain("color: active ? colors['primary-active'] : colors.foreground");
  });

  it('uses the light editor scheme and semantic accents for header actions', () => {
    const header = fs.readFileSync(
      path.join(process.cwd(), 'components/document-editor/DocumentEditorHeader.tsx'),
      'utf8',
    );
    const button = fs.readFileSync(
      path.join(process.cwd(), 'components/ui/Button.tsx'),
      'utf8',
    );

    expect(button).toContain('const colors = useColors(colorScheme)');
    expect(header).toContain('style={{ borderWidth: 1, borderColor: colors.secondary }}');
    expect(header).toContain('style={{ backgroundColor: colors.secondary }}');
    expect(header).toContain('colorScheme={colorScheme}');
  });
});
