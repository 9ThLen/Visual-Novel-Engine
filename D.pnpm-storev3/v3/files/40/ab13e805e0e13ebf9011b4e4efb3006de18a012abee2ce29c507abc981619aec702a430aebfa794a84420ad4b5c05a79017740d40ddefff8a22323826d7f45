import { StyleProp, ViewStyle } from "react-native";
import { ReactNode } from "react";
import { SharedValue } from "react-native-reanimated";
import { GestureType } from "react-native-gesture-handler";
import { SortableData } from "./sortable";
import { DropProviderRef } from "./context";
export declare enum GridScrollDirection {
    None = "none",
    Up = "up",
    Down = "down",
    Left = "left",
    Right = "right",
    UpLeft = "up-left",
    UpRight = "up-right",
    DownLeft = "down-left",
    DownRight = "down-right"
}
export declare enum GridOrientation {
    Vertical = "vertical",
    Horizontal = "horizontal"
}
export declare enum GridStrategy {
    Insert = "insert",
    Swap = "swap"
}
export interface GridPosition {
    index: number;
    row: number;
    column: number;
    x: number;
    y: number;
}
export interface GridPositions {
    [id: string]: GridPosition;
}
export interface GridDimensions {
    columns?: number;
    rows?: number;
    itemWidth: number;
    itemHeight: number;
    rowGap?: number;
    columnGap?: number;
}
export interface UseGridSortableOptions<T> {
    id: string;
    positions: SharedValue<GridPositions>;
    scrollY: SharedValue<number>;
    scrollX: SharedValue<number>;
    autoScrollDirection: SharedValue<GridScrollDirection>;
    itemsCount: number;
    dimensions: GridDimensions;
    orientation: GridOrientation;
    strategy?: GridStrategy;
    containerWidth?: number;
    containerHeight?: number;
    activationDelay?: number;
    onMove?: (id: string, from: number, to: number) => void;
    onDragStart?: (id: string, position: number) => void;
    onDrop?: (id: string, position: number, allPositions?: GridPositions) => void;
    onDragging?: (id: string, overItemId: string | null, x: number, y: number) => void;
    isBeingRemoved?: boolean;
}
export interface UseGridSortableReturn {
    animatedStyle: StyleProp<ViewStyle>;
    panGestureHandler: GestureType;
    handlePanGestureHandler: GestureType;
    isMoving: boolean;
    hasHandle: boolean;
    registerHandle: (registered: boolean) => void;
}
export interface UseGridSortableListOptions<TData extends SortableData> {
    data: TData[];
    dimensions: GridDimensions;
    orientation?: GridOrientation;
    strategy?: GridStrategy;
    itemKeyExtractor?: (item: TData, index: number) => string;
}
export interface UseGridSortableListReturn<TData extends SortableData> {
    positions: SharedValue<GridPositions>;
    scrollY: SharedValue<number>;
    scrollX: SharedValue<number>;
    autoScrollDirection: SharedValue<GridScrollDirection>;
    scrollViewRef: any;
    dropProviderRef: React.RefObject<DropProviderRef>;
    handleScroll: any;
    handleScrollEnd: () => void;
    contentWidth: number;
    contentHeight: number;
    getItemProps: (item: TData, index: number) => {
        id: string;
        positions: SharedValue<GridPositions>;
        scrollY: SharedValue<number>;
        scrollX: SharedValue<number>;
        autoScrollDirection: SharedValue<GridScrollDirection>;
        itemsCount: number;
        dimensions: GridDimensions;
        orientation: GridOrientation;
        strategy: GridStrategy;
    };
}
export interface SortableGridItemProps<T> {
    id: string;
    data: T;
    positions: SharedValue<GridPositions>;
    scrollY: SharedValue<number>;
    scrollX: SharedValue<number>;
    autoScrollDirection: SharedValue<GridScrollDirection>;
    itemsCount: number;
    dimensions: GridDimensions;
    orientation: GridOrientation;
    strategy?: GridStrategy;
    containerWidth?: number;
    containerHeight?: number;
    activationDelay?: number;
    children: ReactNode;
    style?: StyleProp<ViewStyle>;
    animatedStyle?: StyleProp<ViewStyle>;
    onMove?: (id: string, from: number, to: number) => void;
    onDragStart?: (id: string, position: number) => void;
    onDrop?: (id: string, position: number, allPositions?: GridPositions) => void;
    onDragging?: (id: string, overItemId: string | null, x: number, y: number) => void;
    isBeingRemoved?: boolean;
}
export interface SortableGridProps<TData extends SortableData> {
    data: TData[];
    renderItem: (props: SortableGridRenderItemProps<TData>) => ReactNode;
    dimensions: GridDimensions;
    orientation?: GridOrientation;
    strategy?: GridStrategy;
    style?: StyleProp<ViewStyle>;
    contentContainerStyle?: StyleProp<ViewStyle>;
    itemContainerStyle?: StyleProp<ViewStyle>;
    itemKeyExtractor?: (item: TData, index: number) => string;
    scrollEnabled?: boolean;
}
export interface SortableGridRenderItemProps<TData extends SortableData> {
    item: TData;
    index: number;
    id: string;
    positions: SharedValue<GridPositions>;
    scrollY: SharedValue<number>;
    scrollX: SharedValue<number>;
    autoScrollDirection: SharedValue<GridScrollDirection>;
    itemsCount: number;
    dimensions: GridDimensions;
    orientation: GridOrientation;
    strategy: GridStrategy;
}
