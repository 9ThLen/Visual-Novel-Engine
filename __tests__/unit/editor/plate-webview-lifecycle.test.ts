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
  });

  it('measures intrinsic editor content so iframe height can shrink', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'lib/vn-plate-editor/embedded-script.ts'),
      'utf8',
    );
    const measureHeightBody = source.match(/function measureHeight\(\) \{[\s\S]*?\n    \}/)?.[0] ?? '';

    expect(measureHeightBody).toContain("document.querySelector('.shell')");
    expect(measureHeightBody).toContain('elementBottom(shell)');
    expect(measureHeightBody).toContain('#slashMenu:not(.hidden)');
    expect(measureHeightBody).not.toContain('document.documentElement');
    expect(measureHeightBody).not.toContain('document.body');
  });
});
