import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { StoryGraph as StoryGraphType } from '../../lib/story-graph-types';

interface StoryGraphProps {
  graph: StoryGraphType;
  onNodePress: (nodeId: string) => void;
}

const NODE_WIDTH = 80;
const NODE_HEIGHT = 40;

const StoryGraph: React.FC<StoryGraphProps> = ({ graph, onNodePress }) => {
  const renderEdges = () => {
    return graph.edges.map((edge) => {
      const fromNode = graph.nodes.find((n) => n.id === edge.fromNodeId);
      const toNode = graph.nodes.find((n) => n.id === edge.toNodeId);
      if (!fromNode || !toNode) return null;

      const fromCenterX = fromNode.x + NODE_WIDTH / 2;
      const fromCenterY = fromNode.y + NODE_HEIGHT / 2;
      const toCenterX = toNode.x + NODE_WIDTH / 2;
      const toCenterY = toNode.y + NODE_HEIGHT / 2;

      const dx = toCenterX - fromCenterX;
      const dy = toCenterY - fromCenterY;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);

      return (
        <View
          key={edge.id}
          style={[
            styles.edge,
            {
              left: fromCenterX,
              top: fromCenterY,
              width: length,
              transform: [{ rotate: `${angle}deg` }],
            },
          ]}
        />
      );
    });
  };

  const renderNodes = () => {
    return graph.nodes.map((node) => (
      <TouchableOpacity
        key={node.id}
        style={[
          styles.node,
          {
            left: node.x,
            top: node.y,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
          },
        ]}
        onPress={() => onNodePress(node.id)}
      >
        <View style={styles.nodeLabelContainer}>
          <Text style={styles.nodeLabel}>{node.label}</Text>
        </View>
      </TouchableOpacity>
    ));
  };

  return (
    <View style={styles.container}>
      {renderEdges()}
      {renderNodes()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  edge: {
    position: 'absolute',
    height: 2,
    backgroundColor: '#666',
    transformOrigin: 'left center',
  },
  node: {
    position: 'absolute',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  nodeLabelContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nodeLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
});

export default StoryGraph;
