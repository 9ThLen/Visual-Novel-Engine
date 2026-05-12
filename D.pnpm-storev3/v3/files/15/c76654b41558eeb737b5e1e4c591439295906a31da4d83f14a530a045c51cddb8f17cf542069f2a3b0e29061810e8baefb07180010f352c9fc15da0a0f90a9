import { SharedValue } from "react-native-reanimated";
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
export declare function clamp(value: number, lowerBound: number, upperBound: number): number;
export declare function objectMove(object: {
    [id: string]: number;
}, from: number, to: number): {
    [id: string]: number;
};
export declare function listToObject<T extends {
    id: string;
}>(list: T[]): {
    [id: string]: number;
};
export declare function setPosition(positionY: number, itemsCount: number, positions: SharedValue<{
    [id: string]: number;
}>, id: string, itemHeight: number): void;
export declare function setAutoScroll(positionY: number, lowerBound: number, upperBound: number, scrollThreshold: number, autoScroll: SharedValue<ScrollDirection>): void;
export declare function getItemXPosition(position: number, itemWidth: number, gap?: number, paddingHorizontal?: number): number;
export declare function getContentWidth(itemsCount: number, itemWidth: number, gap?: number, paddingHorizontal?: number): number;
export declare function setHorizontalPosition(positionX: number, itemsCount: number, positions: SharedValue<{
    [id: string]: number;
}>, id: string, itemWidth: number, gap?: number, paddingHorizontal?: number): void;
export declare function setHorizontalAutoScroll(positionX: number, leftBound: number, rightBound: number, scrollThreshold: number, autoScrollDirection: SharedValue<HorizontalScrollDirection>): void;
export declare function resolveItemHeight<TData>(itemHeightProp: number | number[] | ((item: TData, index: number) => number) | undefined, item: TData, index: number, fallback: number): number;
export declare function recalculateCumulativeHeights(positions: {
    [id: string]: number;
}, itemHeights: {
    [id: string]: number;
}, estimatedHeight: number): {
    cumulative: {
        [id: string]: number;
    };
    total: number;
};
export declare function findPositionForY(positionY: number, positions: {
    [id: string]: number;
}, itemHeights: {
    [id: string]: number;
}, estimatedHeight: number, itemsCount: number): number;
export declare function getItemCumulativeY(id: string, positions: {
    [id: string]: number;
}, itemHeights: {
    [id: string]: number;
}, estimatedHeight: number): number;
export declare const dataHash: (data: any[]) => string;
