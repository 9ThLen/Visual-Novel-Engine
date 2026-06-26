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
});
