import { SharedValue } from "react-native-reanimated";
import { GridPosition, GridPositions, GridDimensions, GridOrientation, GridStrategy, GridScrollDirection } from "../types/grid";
import { SortableData } from "../types/sortable";
export declare function calculateGridPosition(index: number, dimensions: GridDimensions, orientation: GridOrientation): GridPosition;
export declare function calculateIndexFromRowColumn(row: number, column: number, dimensions: GridDimensions, orientation: GridOrientation): number;
export declare function listToGridObject<T extends SortableData>(list: T[], dimensions: GridDimensions, orientation: GridOrientation): GridPositions;
export declare function clamp(value: number, min: number, max: number): number;
export declare function getGridCellFromCoordinates(x: number, y: number, dimensions: GridDimensions, orientation: GridOrientation, totalItems: number): {
    row: number;
    column: number;
    index: number;
};
export declare function reorderGridInsert(positions: GridPositions, activeId: string, targetIndex: number, dimensions: GridDimensions, orientation: GridOrientation): GridPositions;
export declare function reorderGridSwap(positions: GridPositions, activeId: string, targetId: string, dimensions: GridDimensions, orientation: GridOrientation): GridPositions;
export declare function setGridPosition(x: number, y: number, scrollX: number, scrollY: number, itemsCount: number, positions: SharedValue<GridPositions>, id: string, dimensions: GridDimensions, orientation: GridOrientation, strategy: GridStrategy): void;
export declare function calculateGridContentDimensions(itemsCount: number, dimensions: GridDimensions, orientation: GridOrientation): {
    width: number;
    height: number;
};
export declare function setGridAutoScroll(x: number, y: number, scrollX: number, scrollY: number, containerWidth: number, containerHeight: number, scrollThreshold: number, autoScrollDirection: SharedValue<GridScrollDirection>): void;
export declare function findItemIdAtIndex(positions: GridPositions, index: number): string | null;
