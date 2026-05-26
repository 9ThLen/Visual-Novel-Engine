import React, { useCallback, useState } from 'react';
import { View, StyleSheet, Text, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { AtomBlock } from '../../lib/atom-types';
import { canSnap, MoleculeBlock, MoleculeType } from '../../lib/molecule-types';
import AtomBlockComponent from './AtomBlockComponent';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { getPointerEventsStyle } from '@/lib/react-native-web-interop';

type LegoCanvasProps = {
  atoms: AtomBlock[];
  onAtomsChange: (atoms: AtomBlock[]) => void;
  selectedAtomId?: string | null;
  onAtomSelect?: (atomId: string | null) => void;
  sceneId?: string;
};

const DEFAULT_SNAP_THRESHOLD = 20; // px (fallback)

function getMoleculeTypeForAtom(atomType: string): MoleculeType {
  switch (atomType) {
    case 'text_atom': return 'dialogue_molecule';
    case 'character_atom': return 'character_molecule';
    case 'background_atom': return 'scene_molecule';
    case 'audio_atom': return 'audio_molecule';
    case 'fx_atom': return 'scene_molecule';
    default: return 'dialogue_molecule';
  }
}

// Convert atom to a temporary molecule for canSnap check
function atomToMolecule(atom: AtomBlock): MoleculeBlock {
  return {
    id: atom.id,
    type: getMoleculeTypeForAtom(atom.type),
    atoms: [atom],
    bounds: { x: atom.x, y: atom.y, width: atom.width, height: atom.height },
  };
}

// Check if two atoms can magnetically snap
function canAtomsSnap(atomA: AtomBlock, atomB: AtomBlock, threshold: number = DEFAULT_SNAP_THRESHOLD): boolean {
  const molA = atomToMolecule(atomA);
  const molB = atomToMolecule(atomB);
  if (!canSnap(molA, molB, threshold)) {
    return false;
  }

  for (const spA of atomA.snapPoints) {
    for (const spB of atomB.snapPoints) {
      const oppositeSides =
        (spA.side === 'left' && spB.side === 'right') ||
        (spA.side === 'right' && spB.side === 'left') ||
        (spA.side === 'top' && spB.side === 'bottom') ||
        (spA.side === 'bottom' && spB.side === 'top');
      if (oppositeSides) {
        if (
          spA.compatibleTypes.includes(atomB.type) ||
          spB.compatibleTypes.includes(atomA.type)
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

// Calculate snapped position for dragged atom relative to target atom
function calculateSnapPosition(
  draggedAtom: AtomBlock,
  targetAtom: AtomBlock,
  threshold: number = DEFAULT_SNAP_THRESHOLD
): { x: number; y: number } {
  const draggedRight = draggedAtom.x + draggedAtom.width;
  const draggedBottom = draggedAtom.y + draggedAtom.height;
  const targetRight = targetAtom.x + targetAtom.width;
  const targetBottom = targetAtom.y + targetAtom.height;

  let newX = draggedAtom.x;
  let newY = draggedAtom.y;

  const leftDist = Math.abs(draggedAtom.x - targetRight);
  const rightDist = Math.abs(draggedRight - targetAtom.x);
  if (leftDist < threshold) {
    newX = targetRight;
  } else if (rightDist < threshold) {
    newX = targetAtom.x - draggedAtom.width;
  }

  const topDist = Math.abs(draggedAtom.y - targetBottom);
  const bottomDist = Math.abs(draggedBottom - targetAtom.y);
  if (topDist < threshold) {
    newY = targetBottom;
  } else if (bottomDist < threshold) {
    newY = targetAtom.y - draggedAtom.height;
  }

  return { x: newX, y: newY };
}

// JS-scoped haptic callbacks (extracted for use with runOnJS from worklets)
function triggerHeavyHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
}

function triggerSnapHaptic(isTablet: boolean) {
  Haptics.impactAsync(
    isTablet ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium
  );
}

// Subcomponent for each draggable atom on the canvas
const DraggableAtom: React.FC<{
  atom: AtomBlock;
  index: number;
  allAtoms: AtomBlock[];
  canvasSize: { width: number; height: number };
  isSelected: boolean;
  onDragEnd: (index: number, x: number, y: number) => void;
  onPress: (atomId: string) => void;
  sceneId?: string;
}> = ({ atom, index, allAtoms, canvasSize, isSelected, onDragEnd, onPress, sceneId }) => {
  const layout = useResponsiveLayout();
  const posX = useSharedValue(atom.x);
  const posY = useSharedValue(atom.y);

  React.useEffect(() => {
    posX.value = atom.x;
    posY.value = atom.y;
  }, [atom.x, atom.y, posX, posY]);

  const [isDragging, setIsDragging] = useState(false);
  const scale = useSharedValue(1);
  const wasSnapped = useSharedValue(false);

  const snapThreshold = layout.isTablet ? 30 : 20;

  const animatedStyle = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: posX.value,
    top: posY.value,
    width: atom.width,
    height: atom.height,
    shadowColor: isDragging ? '#3B82F6' : '#000',
    boxShadow: isDragging
      ? '0px 4px 10px rgba(59,130,246,0.6)'
      : (isSelected ? '0px 2px 6px rgba(0,0,0,0.4)' : '0px 2px 4px rgba(0,0,0,0.25)'),
    elevation: isDragging ? 12 : (isSelected ? 8 : 5),
    transform: [{ scale: scale.value }],
    borderWidth: isDragging ? 2 : (isSelected ? 1 : 0),
    borderColor: isDragging ? '#3B82F6' : '#1D4ED8',
    borderRadius: layout.isTablet ? 10 : 8,
  }));

  const handleHeavyHaptic = useCallback(() => {
    triggerHeavyHaptic();
  }, []);

  const handleSnapHaptic = useCallback(() => {
    triggerSnapHaptic(layout.isTablet);
  }, [layout.isTablet]);

  const panGesture = Gesture.Pan()
    .hitSlop(layout.isTablet ? 15 : 8)
    .shouldCancelWhenOutside(false)
    .onBegin(() => {
      runOnJS(setIsDragging)(true);
      scale.value = withSpring(layout.isTablet ? 1.08 : 1.05);
      if (layout.isTablet) {
        runOnJS(handleHeavyHaptic)();
      }
    })
    .onUpdate((event) => {
      let newX = atom.x + event.translationX;
      let newY = atom.y + event.translationY;

      // Coordinate clamping removed to allow dragging atoms
      // beyond canvas boundaries to reach sidebar drop zones

      const draggedAtom = { ...atom, x: newX, y: newY };
      let snapped = false;
      for (let i = 0; i < allAtoms.length; i++) {
        if (i === index) continue;
        const otherAtom = allAtoms[i];

        // Fast spatial check before expensive molecule construction
        const dx = Math.abs(newX - otherAtom.x);
        const dy = Math.abs(newY - otherAtom.y);
        if (dx > draggedAtom.width + otherAtom.width + snapThreshold ||
            dy > draggedAtom.height + otherAtom.height + snapThreshold) {
          continue;
        }

        if (canAtomsSnap(draggedAtom, otherAtom, snapThreshold)) {
          const snapPos = calculateSnapPosition(draggedAtom, otherAtom, snapThreshold);
          const dist = Math.sqrt(
            Math.pow(newX - snapPos.x, 2) + Math.pow(newY - snapPos.y, 2)
          );
          if (dist < snapThreshold) {
            newX = snapPos.x;
            newY = snapPos.y;
            snapped = true;
            break;
          }
        }
      }

      if (snapped) {
        if (!wasSnapped.value) {
          runOnJS(handleSnapHaptic)();
          wasSnapped.value = true;
        }
      } else {
        wasSnapped.value = false;
      }

      posX.value = newX;
      posY.value = newY;
    })
    .onEnd(() => {
      runOnJS(setIsDragging)(false);
      scale.value = withSpring(1);

      // Do NOT clamp coordinates here — cross-scene dragging requires original
      // unclamped positions so sidebar drop zones can receive the atom.
      runOnJS(onDragEnd)(index, Math.round(posX.value), Math.round(posY.value));
    });

  return (
    <GestureDetector gesture={panGesture}>
      <View style={[animatedStyle, { position: 'absolute' }]} testID={`atom-${atom.id}`} accessibilityRole="button" accessibilityHint="Drag to reposition on canvas">
        <AtomBlockComponent
          atom={atom}
          isSelected={isSelected}
          onPress={() => onPress(atom.id)}
        />
        {/* Cross-scene drag indicator badge */}
        {isDragging && sceneId && (
          <View style={[styles.dragBadge, getPointerEventsStyle('none')]}>
            <Text style={styles.dragBadgeText}>
              ↗ drop on scene
            </Text>
          </View>
        )}
      </View>
    </GestureDetector>
  );
};

const LegoCanvas: React.FC<LegoCanvasProps> = ({
  atoms,
  onAtomsChange,
  selectedAtomId,
  onAtomSelect,
  sceneId,
}) => {
  const [canvasSize, setCanvasSize] = React.useState({ width: 0, height: 0 });
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const layout = useResponsiveLayout();

  const isTabletLandscape = layout.isTablet && layout.isLandscape;

  const activeSelectedId = selectedAtomId ?? internalSelectedId;

  const handleDragEnd = useCallback(
    (index: number, x: number, y: number) => {
      const updatedAtoms = [...atoms];
      updatedAtoms[index] = {
        ...updatedAtoms[index],
        x,
        y,
      };
      onAtomsChange(updatedAtoms);
    },
    [atoms, onAtomsChange]
  );

  const handlePress = useCallback((atomId: string) => {
    if (onAtomSelect) {
      onAtomSelect(atomId === activeSelectedId ? null : atomId);
    } else {
      setInternalSelectedId((prev) => (prev === atomId ? null : atomId));
    }
  }, [onAtomSelect, activeSelectedId]);

  const handleCanvasPress = useCallback(() => {
    if (onAtomSelect) {
      onAtomSelect(null);
    } else {
      setInternalSelectedId(null);
    }
  }, [onAtomSelect]);

  const onCanvasLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCanvasSize({ width, height });
  };

  const canvasStyle = [
    styles.container,
    layout.isTablet && styles.containerTablet,
    isTabletLandscape && styles.containerLandscape,
    !layout.isTablet && styles.containerPhone,
    {
      padding: layout.spacing,
    }
  ];

  return (
    <View style={canvasStyle} onLayout={onCanvasLayout} onStartShouldSetResponder={() => true} onResponderRelease={handleCanvasPress}>
      {/* Empty state */}
      {atoms.length === 0 && (
        <View style={[styles.emptyState, getPointerEventsStyle('none')]}>
          <Text style={[styles.emptyStateText, !layout.isTablet && styles.emptyStateTextPhone]}>
            🧩 Додайте атоми на canvas{'\n'}або перетягніть їх між сценами
          </Text>
        </View>
      )}
      {/* Render atoms directly without grid wrappers to preserve absolute positioning */}
      {atoms.map((atom, index) => (
        <DraggableAtom
          key={atom.id}
          atom={atom}
          index={index}
          allAtoms={atoms}
          canvasSize={canvasSize}
          isSelected={atom.id === activeSelectedId}
          onDragEnd={handleDragEnd}
          onPress={handlePress}
          sceneId={sceneId}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#F5F5F5',
  },
  containerPhone: {
    // On phone the canvas is placed in a fixed-height wrapper by the parent,
    // so flex:1 works correctly within that bounded container.
    // Ensure atoms don't overflow and touch targets are accessible.
    overflow: 'hidden',
  },
  containerTablet: {
    backgroundColor: '#E8E8E8',
    borderRadius: 12,
    margin: 8,
  },
  containerLandscape: {
    // Removed flex properties that conflict with absolute positioning of atoms
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  gridItem: {
    padding: 4,
  },
  emptyState: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 24,
  },
  emptyStateTextPhone: {
    fontSize: 13,
    lineHeight: 20,
  },
  dragBadge: {
    position: 'absolute',
    top: -24,
    left: 0,
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  dragBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
});

export default LegoCanvas;
