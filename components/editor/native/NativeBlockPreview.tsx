import React from 'react';
import { ScrollView, Text, View } from 'react-native';

import type { SceneValidationIssue } from '@/lib/scene-document/sceneValidation';
import type { SceneNode } from '@/lib/scene-document/sceneTypes';
import { AudioBlock } from './blocks/AudioBlock.native';
import { BackgroundBlock } from './blocks/BackgroundBlock.native';
import { ChoiceBlock } from './blocks/ChoiceBlock.native';
import { DialogueBlock } from './blocks/DialogueBlock.native';
import { NarrationBlock } from './blocks/NarrationBlock.native';

interface NativeBlockPreviewProps {
  nodes: SceneNode[];
  issues: SceneValidationIssue[];
}

function IssueList({ issues }: { issues: SceneValidationIssue[] }) {
  if (!issues.length) return null;
  return (
    <View style={{ marginTop: 8, gap: 4 }}>
      {issues.map((issue) => (
        <Text key={`${issue.nodeId}-${issue.message}`} style={{ color: issue.severity === 'error' ? '#B91C1C' : '#92400E', fontSize: 12 }}>
          {issue.message}
        </Text>
      ))}
    </View>
  );
}

export function NativeBlockPreview({ nodes, issues }: NativeBlockPreviewProps) {
  const issuesByNode = new Map<string, SceneValidationIssue[]>();
  issues.forEach((issue) => {
    if (!issue.nodeId) return;
    issuesByNode.set(issue.nodeId, [...(issuesByNode.get(issue.nodeId) ?? []), issue]);
  });

  return (
    <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
      {nodes.map((node) => (
        <View
          key={node.id}
          style={{
            borderColor: '#E5E7EB',
            borderWidth: 1,
            borderRadius: 8,
            backgroundColor: '#FFFFFF',
            padding: 12,
          }}
        >
          {node.type === 'dialogue' ? <DialogueBlock node={node} /> : null}
          {node.type === 'narration' ? <NarrationBlock node={node} /> : null}
          {node.type === 'background' ? <BackgroundBlock node={node} /> : null}
          {node.type === 'music' || node.type === 'sound' ? <AudioBlock node={node} /> : null}
          {node.type === 'choice' ? <ChoiceBlock node={node} /> : null}
          {node.type === 'command' ? <Text style={{ color: '#6B7280' }}>{node.raw}</Text> : null}
          <IssueList issues={issuesByNode.get(node.id) ?? []} />
        </View>
      ))}
    </ScrollView>
  );
}
