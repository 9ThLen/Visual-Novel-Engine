import React, { useState, useEffect } from 'react';
import { SafeAreaView, StyleSheet, Text, View, Button } from 'react-native';
import BlockTreeEditor from '@/components/BlockTreeEditor';
import BlockCanvas from '@/components/BlockCanvas';
import type { Block } from '@/lib/block-types';
import { loadTreeFromStorage } from '@/lib/storage';

// Default root structure; will be replaced by storage if available
let initialRoot: Block = {
  id: 'root', type: 'group', data: { title: 'Root' }, children: [], collapsed: false
};

export default function EditorBlocksScreen() {
  const [root, setRoot] = useState<Block>(initialRoot);
  const [mode, setMode] = React.useState<'tree' | 'canvas'>('tree');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const loaded = await loadTreeFromStorage();
        if (mounted && loaded) {
          setRoot(loaded);
        } else if (mounted) {
          // Fallback demo tree so UI is always visible
          const demoRoot: Block = {
            id: 'root',
            type: 'group',
            data: { title: 'Demo Root' },
            collapsed: false,
            x: 20,
            y: 20,
            children: [
              {
                id: 'b1',
                type: 'narration',
                data: { text: 'Hello World' },
                children: [],
                x: 60,
                y: 80,
              },
              {
                id: 'b2',
                type: 'group',
                data: { title: 'Nested' },
                collapsed: false,
                x: 120,
                y: 120,
                children: [
                  { id: 'b2_1', type: 'narration', data: { text: 'Nested block' }, children: [], x: 160, y: 180 },
                ],
              },
            ],
          };
          setRoot(demoRoot);
        }
      } catch {
        // ignore, keep initialRoot
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Block Editor (Notion-like MVP)</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <Button title="Tree" onPress={() => setMode('tree')} />
        <Button title="Canvas" onPress={() => setMode('canvas')} />
      </View>
      {mode === 'tree' ? (
        <BlockTreeEditor root={root} onChange={setRoot} />
      ) : (
        <BlockCanvas root={root} onRootChange={setRoot} />
      )}
      <View style={styles.footer}>
        <Text style={styles.note}>This page demonstrates rendering of blocks and basic mutations. Drag blocks to reposition in the canvas mode.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  footer: { paddingTop: 8, borderTopWidth: 1, borderTopColor: '#eee', marginTop: 8 },
  note: { fontSize: 12, color: '#666' },
});

