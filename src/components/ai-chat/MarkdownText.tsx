import React from 'react';
import { Linking, Text, View } from 'react-native';

const SAFE_LINK = /^(https?:|mailto:)/i;

function inline(text: string, color: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\([^\s)]+\))/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(text.slice(cursor, index));
    const value = match[0];
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(value);
    if (link) {
      nodes.push(SAFE_LINK.test(link[2])
        ? <Text key={index} accessibilityRole="link" onPress={() => void Linking.openURL(link[2])} style={{ color, textDecorationLine: 'underline' }}>{link[1]}</Text>
        : value);
    } else if (value.startsWith('**')) {
      nodes.push(<Text key={index} style={{ fontWeight: '700' }}>{value.slice(2, -2)}</Text>);
    } else if (value.startsWith('*')) {
      nodes.push(<Text key={index} style={{ fontStyle: 'italic' }}>{value.slice(1, -1)}</Text>);
    } else {
      nodes.push(<Text key={index} style={{ fontFamily: 'monospace', backgroundColor: 'rgba(127,127,127,0.16)' }}>{value.slice(1, -1)}</Text>);
    }
    cursor = index + value.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function MarkdownText({ text, color }: { text: string; color: string }) {
  const blocks = text.split(/(```[\s\S]*?```)/g);
  return <View style={{ gap: 4 }}>
    {blocks.flatMap((block, blockIndex) => {
      if (block.startsWith('```') && block.endsWith('```')) {
        return <Text key={`code-${blockIndex}`} style={{ color, fontFamily: 'monospace', backgroundColor: 'rgba(127,127,127,0.16)', padding: 6 }}>{block.slice(3, -3).replace(/^\w+\n/, '')}</Text>;
      }
      return block.split('\n').map((line, lineIndex) => {
        const list = /^\s*([-*]|\d+\.)\s+(.+)$/.exec(line);
        const content = list ? `${list[1]} ${list[2]}` : line;
        return <Text key={`${blockIndex}-${lineIndex}`} style={{ color, fontSize: 13, lineHeight: 18, paddingLeft: list ? 8 : 0 }}>{inline(content, color)}</Text>;
      });
    })}
  </View>;
}

export function isSafeMarkdownLink(url: string): boolean { return SAFE_LINK.test(url); }
