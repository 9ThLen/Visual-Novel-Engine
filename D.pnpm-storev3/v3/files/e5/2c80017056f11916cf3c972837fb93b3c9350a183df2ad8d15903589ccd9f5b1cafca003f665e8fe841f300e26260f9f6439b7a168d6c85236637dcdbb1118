import { StyleProp, ViewStyle } from "react-native";
import { GestureType } from "react-native-gesture-handler";
import { SharedValue } from "react-native-reanimated";
import { DropProviderRef } from "../types/context";
import { ReactNode } from "react";
export interface SortableData {
    id: string;
}
export declare enum ScrollDirection {
    None = "none",
    Up = "up",
    Down = "down"
}
export declare enum HorizontalScrollDirection {
    None = "none",
    Left = "left",
    Right = "right"
}
export declare enum SortableDirection {
    Vertical = "vertical",
    Horizontal = "horizontal"
}
export interface UseSortableOptions<T> {
    id: string;
    positions: SharedValue<{
        [id: string]: number;
    }>;
    lowerBound: SharedValue<number>;
    autoScrollDirection: SharedValue<ScrollDirection>;
    itemsCount: number;
    itemHeight?: number;
    containerHeight?: number;
    estimatedItemHeight?: number;
    isDynamicHeight?: boolean;
    itemHeights?: SharedValue<{
        [id: string]: number;
    }>;
    onMove?: (id: string, from: number, to: number) => void;
    onDragStart?: (id: string, position: number) => void;
    onDrop?: (id: string, position: number, allPositions?: {
        [id: string]: number;
    }) => void;
    onDragging?: (id: string, overItemId: string | null, yPosition: number) => void;
}
export interface UseSortableReturn {
    animatedStyle: StyleProp<ViewStyle>;
    panGestureHandler: GestureType;
    handlePanGestureHandler: GestureType;
    isMoving: boolean;
    hasHandle: boolean;
    registerHandle: (registered: boolean) => void;
}
export interface UseSortableListOptions<TData extends SortableData> {
    data: TData[];
    itemHeight?: number | number[] | ((item: TData, index: number) => number);
    enableDynamicHeights?: boolean;
    estimatedItemHeight?: number;
    onHeightsMeasured?: (heights: {
        [id: string]: number;
    }) => void;
    itemKeyExtractor?: (item: TData, index: number) => string;
}
export interface UseSortableListReturn<TData extends SortableData> {
    positions: any;
    scrollY: any;
    autoScroll: any;
    scrollViewRef: any;
    dropProviderRef: React.RefObject<DropProviderRef | null>;
    handleScroll: any;
    handleScrollEnd: () => void;
    contentHeight: number;
    isDynamicHeight: boolean;
    itemHeights: SharedValue<{
        [id: string]: number;
    }>;
    scheduleHeightUpdate?: (id: string, height: number) => void;
    getItemProps: (item: TData, index: number) => {
        id: string;
        positions: any;
        lowerBound: any;
        autoScrollDirection: any;
        itemsCount: number;
        itemHeight?: number;
        isDynamicHeight: boolean;
        estimatedItemHeight: number;
        itemHeights?: SharedValue<{
            [id: string]: number;
        }>;
        scheduleHeightUpdate?: (id: string, height: number) => void;
    };
}
export interface SortableItemProps<T> {
    id: string;
    data: T;
    positions: SharedValue<{
        [id: string]: number;
    }>;
    lowerBound?: SharedValue<number>;
    leftBound?: SharedValue<number>;
    autoScrollDirection?: SharedValue<ScrollDirection>;
    autoScrollHorizontalDirection?: SharedValue<HorizontalScrollDirection>;
    itemsCount: number;
    direction?: SortableDirection;
    itemHeight?: number;
    itemWidth?: number;
    gap?: number;
    paddingHorizontal?: number;
    containerHeight?: number;
    containerWidth?: number;
    isDynamicHeight?: boolean;
    estimatedItemHeight?: number;
    itemHeights?: SharedValue<{
        [id: string]: number;
    }>;
    scheduleHeightUpdate?: (id: string, height: number) => void;
    children: ReactNode;
    style?: StyleProp<ViewStyle>;
    animatedStyle?: StyleProp<ViewStyle>;
    onMove?: (id: string, from: number, to: number) => void;
    onDragStart?: (id: string, position: number) => void;
    onDrop?: (id: string, position: number, allPositions?: {
        [id: string]: number;
    }) => void;
    onDragging?: (id: string, overItemId: string | null, yPosition: number) => void;
    onDraggingHorizontal?: (id: string, overItemId: string | null, xPosition: number) => void;
}
export interface SortableProps<TData extends SortableData> {
    data: TData[];
    renderItem: (props: SortableRenderItemProps<TData>) => ReactNode;
    direction?: SortableDirection;
    itemHeight?: number | number[] | ((item: TData, index: number) => number);
    itemWidth?: number;
    gap?: number;
    paddingHorizontal?: number;
    enableDynamicHeights?: boolean;
    estimatedItemHeight?: number;
    onHeightsMeasured?: (heights: {
        [id: string]: number;
    }) => void;
    style?: StyleProp<ViewStyle>;
    contentContainerStyle?: StyleProp<ViewStyle>;
    itemKeyExtractor?: (item: TData, index: number) => string;
    useFlatList?: boolean;
}
export interface SortableRenderItemProps<TData extends SortableData> {
    item: TData;
    index: number;
    id: string;
    positions: SharedValue<{
        [id: string]: number;
    }>;
    direction?: SortableDirection;
    lowerBound?: SharedValue<number>;
    leftBound?: SharedValue<number>;
    autoScrollDirection?: SharedValue<ScrollDirection>;
    autoScrollHorizontalDirection?: SharedValue<HorizontalScrollDirection>;
    itemsCount: number;
    itemHeight?: number;
    itemWidth?: number;
    gap?: number;
    paddingHorizontal?: number;
    isDynamicHeight?: boolean;
    estimatedItemHeight?: number;
    itemHeights?: SharedValue<{
        [id: string]: number;
    }>;
    scheduleHeightUpdate?: (id: string, height: number) => void;
}
export interface SortableContextValue {
    panGestureHandler: GestureType;
    registerHandle: (registered: boolean) => void;
}
export interface SortableHandleProps {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}
export interface UseHorizontalSortableOptions<T> {
    id: string;
    positions: SharedValue<{
        [id: string]: number;
    }>;
    leftBound: SharedValue<number>;
    autoScrollDirection: SharedValue<HorizontalScrollDirection>;
    itemsCount: number;
    itemWidth: number;
    gap?: number;
    paddingHorizontal?: number;
    containerWidth?: number;
    onMove?: (id: string, from: number, to: number) => void;
    onDragStart?: (id: string, position: number) => void;
    onDrop?: (id: string, position: number, allPositions?: {
        [id: string]: number;
    }) => void;
    onDragging?: (id: string, overItemId: string | null, xPosition: number) => void;
}
export interface UseHorizontalSortableReturn {
    animatedStyle: StyleProp<ViewStyle>;
    panGestureHandler: GestureType;
    handlePanGestureHandler: GestureType;
    isMoving: boolean;
    hasHandle: boolean;
    registerHandle: (registered: boolean) => void;
}
export interface UseHorizontalSortableListOptions<TData extends SortableData> {
    data: TData[];
    itemWidth: number;
    gap?: number;
    paddingHorizontal?: number;
    itemKeyExtractor?: (item: TData, index: number) => string;
}
export interface UseHorizontalSortableListReturn<TData extends SortableData> {
    positions: any;
    scrollX: any;
    autoScroll: any;
    scrollViewRef: any;
    dropProviderRef: React.RefObject<DropProviderRef | null>;
    handleScroll: any;
    handleScrollEnd: () => void;
    contentWidth: number;
    getItemProps: (item: TData, index: number) => {
        id: string;
        positions: any;
        leftBound: any;
        autoScrollDirection: any;
        itemsCount: number;
        itemWidth: number;
        gap: number;
        paddingHorizontal: number;
    };
}
export interface HorizontalSortableItemProps<T> {
    id: string;
    data: T;
    positions: SharedValue<{
        [id: string]: number;
    }>;
    leftBound: SharedValue<number>;
    autoScrollDirection: SharedValue<HorizontalScrollDirection>;
    itemsCount: number;
    itemWidth: number;
    gap?: number;
    paddingHorizontal?: number;
    containerWidth?: number;
    children: ReactNode;
    style?: StyleProp<ViewStyle>;
    animatedStyle?: StyleProp<ViewStyle>;
    onMove?: (id: string, from: number, to: number) => void;
    onDragStart?: (id: string, position: number) => void;
    onDrop?: (id: string, position: number, allPositions?: {
        [id: string]: number;
    }) => void;
    onDragging?: (id: string, overItemId: string | null, xPosition: number) => void;
}
export interface HorizontalSortableProps<TData extends SortableData> {
    data: TData[];
    renderItem: (props: HorizontalSortableRenderItemProps<TData>) => ReactNode;
    itemWidth: number;
    gap?: number;
    paddingHorizontal?: number;
    style?: StyleProp<ViewStyle>;
    contentContainerStyle?: StyleProp<ViewStyle>;
    itemKeyExtractor?: (item: TData, index: number) => string;
}
export interface HorizontalSortableRenderItemProps<TData extends SortableData> {
    item: TData;
    index: number;
    id: string;
    positions: SharedValue<{
        [id: string]: number;
    }>;
    leftBound: SharedValue<number>;
    autoScrollDirection: SharedValue<HorizontalScrollDirection>;
    itemsCount: number;
    itemWidth: number;
    gap: number;
    paddingHorizontal: number;
}
