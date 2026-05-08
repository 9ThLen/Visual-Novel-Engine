import React from 'react';
import { Block } from '../lib/block-types';

type Props = {
  onInsert: (snippet: Block) => void;
  snippets: Block[];
};

export const SnippetLibrary: React.FC<Props> = ({ onInsert, snippets }) => {
  return (
    <div className="snippet-library" style={{ padding: 12, borderTop: '1px solid #ddd' }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Snippets</div>
      {snippets.map((s) => (
        <div key={s.id} style={{ padding: 6, border: '1px solid #ccc', borderRadius: 6, marginBottom: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{s.type}</div>
          <div style={{ fontSize: 12, color: '#555' }}>{String(s.data?.text ?? s.data?.title ?? '')}</div>
          <button
            style={{ marginTop: 6, padding: '6px 10px' }}
            onClick={() => onInsert(s)}
          >Insert</button>
        </div>
      ))}
    </div>
  );
};

export default SnippetLibrary;
