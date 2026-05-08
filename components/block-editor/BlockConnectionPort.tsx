import React from 'react';
import { View, Pressable } from 'react-native';
import { PortSide } from './types';

interface BlockConnectionPortProps {
  side: PortSide;
  blockX: number;
  blockY: number;
  blockSize: number;
  isActive: boolean;
  isHovered: boolean;
  onDragStart: (side: PortSide) => void;
  onDragEnd: () => void;
  onDrop: (side: PortSide) => void;
  colors: {
    primary: string;
    border: string;
    background: string;
  };
}

const PORT_SIZE = 14;

function getPortPosition(side: PortSide, x: number, y: number, size: number): { x: number; y: number } {
  const half = size / 2;
  const portHalf = PORT_SIZE / 2;
  switch (side) {
    case 'top':
      return { x: x + half - portHalf, y: y - portHalf };
    case 'bottom':
      return { x: x + half - portHalf, y: y + size - portHalf };
    case 'left':
      return { x: x - portHalf, y: y + half - portHalf };
    case 'right':
      return { x: x + size - portHalf, y: y + half - portHalf };
  }
}

export const BlockConnectionPort: React.FC<BlockConnectionPortProps> = ({
  side,
  blockX,
  blockY,
  blockSize,
  isActive,
  isHovered,
  onDragStart,
  onDragEnd,
  onDrop,
  colors,
}) => {
  const pos = getPortPosition(side, blockX, blockY, blockSize);

  return (
    <Pressable
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: PORT_SIZE,
        height: PORT_SIZE,
        borderRadius: PORT_SIZE / 2,
        backgroundColor: isActive ? colors.primary : isHovered ? colors.primary + '80' : colors.background,
        borderWidth: 2,
        borderColor: isActive ? colors.primary : colors.border,
        zIndex: 10,
        justifyContent: 'center',
        alignItems: 'center',
      }}
      onPressIn={() => onDragStart(side)}
      onPressOut={onDragEnd}
      onPress={() => onDrop(side)}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      {isActive && (
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: '#fff',
          }}
        />
      )}
    </Pressable>
  );
};

export function getPortCenter(
  side: PortSide,
  blockX: number,
  blockY: number,
  blockSize: number
): { x: number; y: number } {
  const half = blockSize / 2;
  switch (side) {
    case 'top':
      return { x: blockX + half, y: blockY };
    case 'bottom':
      return { x: blockX + half, y: blockY + blockSize };
    case 'left':
      return { x: blockX, y: blockY + half };
    case 'right':
      return { x: blockX + blockSize, y: blockY + half };
  }
}
