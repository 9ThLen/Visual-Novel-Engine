import fs from 'node:fs';
import path from 'node:path';

describe('PlateWebViewEditor lifecycle contract', () => {
  it('does not tie iframe srcDoc generation to live scene or character snapshots', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components/vn-plate-editor/PlateWebViewEditor.web.tsx'),
      'utf8',
    );

    expect(source).toContain('const html = useMemo');
    expect(source).toContain('[editorId, isPhone]');
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
});
