import React, { useCallback, useState } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { AtomBlock } from '../../lib/atom-types';
import { canSnap, MoleculeBlock, calculateBounds } from '../../lib/molecule-types';
import AtomBlockComponent from './AtomBlockComponent';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';

type LegoCanvasProps = {
  atoms: AtomBlock[];
  onAtomsChange: (atoms: AtomBlock[]) => void;
  selectedAtomId?: string | null;
  onAtomSelect?: (atomId: string | null) => void;
};

const SNAP_THRESHOLD = 20; // px

// Convert atom to a temporary molecule for canSnap check
function atomToMolecule(atom: AtomBlock): MoleculeBlock {
  return {
    id: atom.id,
    type: 'dialogue_molecule', // dummy type, canSnap only uses bounds
    atoms: [atom],
    bounds: calculateBounds([atom]),
  };
}

// Check if two atoms can magnetically snap (distance < threshold and snapPoints compatible)
function canAtomsSnap(atomA: AtomBlock, atomB: AtomBlock): boolean {
  // Use canSnap from molecule-types for geometric proximity check
  const molA = atomToMolecule(atomA);
  const molB = atomToMolecule(atomB);
  if (!canSnap(molA, molB, SNAP_THRESHOLD)) {
    return false;
  }

  // Check snapPoints compatibility
  for (const spA of atomA.snapPoints) {
    for (const spB of atomB.snapPoints) {
      // Check if sides are opposite (left-right, top-bottom)
      const oppositeSides =
        (spA.side === 'left' && spB.side === 'right') ||
        (spA.side === 'right' && spB.side === 'left') ||
        (spA.side === 'top' && spB.side === 'bottom') ||
        (spA.side === 'bottom' && spB.side === 'top');
      if (oppositeSides) {
        // Check type compatibility
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
  targetAtom: AtomBlock
): { x: number; y: number } {
  const draggedRight = draggedAtom.x + draggedAtom.width;
  const draggedBottom = draggedAtom.y + draggedAtom.height;
  const targetRight = targetAtom.x + targetAtom.width;
  const targetBottom = targetAtom.y + targetAtom.height;

  let newX = draggedAtom.x;
  let newY = draggedAtom.y;

  // Horizontal snapping (left-right edges)
  const leftDist = Math.abs(draggedAtom.x - targetRight);
  const rightDist = Math.abs(draggedRight - targetAtom.x);
  if (leftDist < SNAP_THRESHOLD) {
    newX = targetRight; // snap dragged left to target right
  } else if (rightDist < SNAP_THRESHOLD) {
    newX = targetAtom.x - draggedAtom.width; // snap dragged right to target left
  }

  // Vertical snapping (top-bottom edges)
  const topDist = Math.abs(draggedAtom.y - targetBottom);
  const bottomDist = Math.abs(draggedBottom - targetAtom.y);
  if (topDist < SNAP_THRESHOLD) {
    newY = targetBottom; // snap dragged top to target bottom
  } else if (bottomDist < SNAP_THRESHOLD) {
    newY = targetAtom.y - draggedAtom.height; // snap dragged bottom to target top
  }

  return { x: newX, y: newY };
}

// Subcomponent for each draggable atom
const DraggableAtom: React.FC<{
  atom: AtomBlock;
  index: number;
  allAtoms: AtomBlock[];
  canvasSize: { width: number; height: number };
  isSelected: boolean;
  onDragEnd: (index: number, x: number, y: number) => void;
  onPress: (atomId: string) => void;
}> = ({ atom, index, allAtoms, canvasSize, isSelected, onDragEnd, onPress }) => {
  const layout = useResponsiveLayout();
  const posX = useSharedValue(atom.x);
  const posY = useSharedValue(atom.y);

  // Update shared values when atom position changes externally
  React.useEffect(() => {
    posX.value = atom.x;
    posY.value = atom.y;
  }, [atom.x, atom.y, posX, posY]);

  const [isDragging, setIsDragging] = useState(false);
  const scale = useSharedValue(1);
  
  // Adaptive snap threshold based on device
  const snapThreshold = layout.isTablet ? 30 : 20;
  
  const animatedStyle = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: posX.value,
    top: posY.value,
    width: atom.width,
    height: atom.height,
    shadowColor: isDragging ? '#3B82F6' : '#000',
    shadowOffset: { width: 0, height: isDragging ? 4 : 2 },
    shadowOpacity: isDragging ? 0.6 : (isSelected ? 0.4 : 0.25),
    shadowRadius: isDragging ? 10 : (isSelected ? 6 : 3.84),
    elevation: isDragging ? 12 : (isSelected ? 8 : 5),
    transform: [{ scale: scale.value }],
    borderWidth: isDragging ? 2 : (isSelected ? 1 : 0),
    borderColor: isDragging ? '#3B82F6' : '#1D4ED8',
    borderRadius: layout.isTablet ? 10 : 8,
  }));

  const panGesture = Gesture.Pan()
    .hitSlop(layout.isTablet ? 15 : 8)
    .onBegin(() => {
      runOnJS(setIsDragging)(true);
      // Bigger scale on tablets
      scale.value = withSpring(layout.isTablet ? 1.08 : 1.05);
      // Stronger haptic feedback on tablets
      if (layout.isTablet) {
        runOnJS(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        })();
      }
    })
    .onUpdate((event) => {
      // Calculate new position based on gesture translation
      let newX = atom.x + event.translationX;
      let newY = atom.y + event.translationY;

      // Clamp to canvas bounds
      if (canvasSize.width > 0) {
        newX = Math.max(0, Math.min(newX, canvasSize.width - atom.width));
      }
      if (canvasSize.height > 0) {
        newY = Math.max(0, Math.min(newY, canvasSize.height - atom.height));
      }

      // Check for magnetic snapping with other atoms using adaptive threshold
      const draggedAtom = { ...atom, x: newX, y: newY };
      let snapped = false;
      for (let i = 0; i < allAtoms.length; i++) {
        if (i === index) continue;
        const otherAtom = allAtoms[i];
        if (canAtomsSnap(draggedAtom, otherAtom)) {
          const snapPos = calculateSnapPosition(draggedAtom, otherAtom);
          // Use adaptive threshold
          const dist = Math.sqrt(
            Math.pow(newX - snapPos.x, 2) + Math.pow(newY - snapPos.y, 2)
          );
          if (dist < snapThreshold) {
            newX = snapPos.x;
            newY = snapPos.y;
            snapped = true;
            break; // Snap to first compatible atom
          }
        }
      }
      
      // Trigger haptic feedback on snap
      if (snapped) {
        runOnJS(() => {
          Haptics.impactAsync(
            layout.isTablet ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium
          );
        })();
      }

      posX.value = newX;
      posY.value = newY;
    })
    .onEnd(() => {
      runOnJS(setIsDragging)(false);
      scale.value = withSpring(1);
      
      const finalX = Math.round(posX.value);
      const finalY = Math.round(posY.value);
      // Clamp to canvas bounds
      let clampedX = finalX;
      let clampedY = finalY;
      if (canvasSize.width > 0) {
        clampedX = Math.max(0, Math.min(finalX, canvasSize.width - atom.width));
      }
      if (canvasSize.height > 0) {
        clampedY = Math.max(0, Math.min(finalY, canvasSize.height - atom.height));
      }
      posX.value = clampedX;
      posY.value = clampedY;
      runOnJS(onDragEnd)(index, clampedX, clampedY);
    });

  return (
    <GestureDetector gesture={panGesture}>
      <View style={[animatedStyle, { position: 'absolute' }]}>
        <AtomBlockComponent
          atom={atom}
          isSelected={isSelected}
          onPress={() => onPress(atom.id)}
        />
      </View>
    </GestureDetector>
  );
};

const LegoCanvas: React.FC<LegoCanvasProps> = ({
  atoms,
  onAtomsChange,
  selectedAtomId,
  onAtomSelect,
}) => {
  const [canvasSize, setCanvasSize] = React.useState({ width: 0, height: 0 });
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const layout = useResponsiveLayout();
  const { width } = useWindowDimensions();

  // Calculate grid columns based on screen width
  const gridColumns = layout.gridColumns;
  const isTabletLandscape = layout.isTablet && layout.isLandscape;

  // Use external selection if provided, otherwise internal
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
    // Deselect when tapping empty canvas area
    if (onAtomSelect) {
      onAtomSelect(null);
    } else {
      setInternalSelectedId(null);
    }
  }, [onAtomSelect]);

  const onCanvasLayout = (event: any) => {
    const { width, height } = event.nativeEvent.layout;
    setCanvasSize({ width, height });
  };

  // Adaptive canvas style
  const canvasStyle = [
    styles.container,
    layout.isTablet && styles.containerTablet,
    isTabletLandscape && styles.containerLandscape,
    {
      padding: layout.spacing,
    }
  ];

  return (
    <View style={canvasStyle} onLayout={onCanvasLayout} onStartShouldSetResponder={() => true} onResponderRelease={handleCanvasPress}>
      {/* Render atoms in adaptive grid layout for tablets */}
      {isTabletLandscape ? (
        <View style={styles.gridContainer}>
          {atoms.map((atom, index) => (
            <View key={atom.id} style={[styles.gridItem, { width: `${100 / gridColumns}%` }]}>
              <DraggableAtom
                atom={atom}
                index={index}
                allAtoms={atoms}
                canvasSize={canvasSize}
                isSelected={atom.id === activeSelectedId}
                onDragEnd={handleDragEnd}
                onPress={handlePress}
              />
            </View>
          ))}
        </View>
      ) : (
        atoms.map((atom, index) => (
          <DraggableAtom
            key={atom.id}
            atom={atom}
            index={index}
            allAtoms={atoms}
            canvasSize={canvasSize}
            isSelected={atom.id === activeSelectedId}
            onDragEnd={handleDragEnd}
            onPress={handlePress}
          />
        ))
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#F5F5F5',
  },
  containerTablet: {
    backgroundColor: '#E8E8E8',
    borderRadius: 12,
    margin: 8,
  },
  containerLandscape: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  gridItem: {
    padding: 4,
  },
});

export default LegoCanvas;
