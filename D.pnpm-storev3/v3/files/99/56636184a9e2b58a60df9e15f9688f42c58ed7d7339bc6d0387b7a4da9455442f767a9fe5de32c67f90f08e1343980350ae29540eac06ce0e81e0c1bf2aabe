import { ViewStyle, View, StyleProp } from "react-native";
import Animated, { AnimatedStyle, useAnimatedRef } from "react-native-reanimated";
import { GestureType } from "react-native-gesture-handler";
import { LayoutChangeEvent } from "react-native";
export declare enum DraggableState {
    IDLE = "IDLE",
    DRAGGING = "DRAGGING",
    DROPPED = "DROPPED"
}
export type AnimationFunction = (toValue: number) => number;
export type CollisionAlgorithm = "center" | "intersect" | "contain";
export interface UseDraggableOptions<TData = unknown> {
    data: TData;
    draggableId?: string;
    dragDisabled?: boolean;
    preDragDelay?: number;
    onDragStart?: (data: TData) => void;
    onDragEnd?: (data: TData) => void;
    onDragging?: (payload: {
        x: number;
        y: number;
        tx: number;
        ty: number;
        itemData: TData;
    }) => void;
    onStateChange?: (state: DraggableState) => void;
    animationFunction?: AnimationFunction;
    dragBoundsRef?: React.RefObject<Animated.View | View>;
    dragAxis?: "x" | "y" | "both";
    collisionAlgorithm?: CollisionAlgorithm;
}
export interface UseDraggableReturn {
    animatedViewProps: {
        style: AnimatedStyle<ViewStyle>;
        onLayout: (event: LayoutChangeEvent) => void;
    };
    gesture: GestureType;
    state: DraggableState;
    animatedViewRef: ReturnType<typeof useAnimatedRef<Animated.View>>;
    hasHandle: boolean;
    registerHandle: (registered: boolean) => void;
}
export interface DraggableContextValue {
    gesture: any;
    state: DraggableState;
    registerHandle: (registered: boolean) => void;
}
export interface DraggableProps<TData = unknown> extends UseDraggableOptions<TData> {
    style?: StyleProp<ViewStyle>;
    children: React.ReactNode;
    onStateChange?: (state: DraggableState) => void;
}
export interface DraggableHandleProps {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}
