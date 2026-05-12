import { ReactNode } from "react";
export type DropAlignment = "center" | "top-left" | "top-center" | "top-right" | "center-left" | "center-right" | "bottom-left" | "bottom-center" | "bottom-right";
export interface DropOffset {
    x: number;
    y: number;
}
export interface DroppedItemsMap<TData = unknown> {
    [draggableId: string]: {
        droppableId: string;
        data: TData;
    };
}
export interface DropSlot<TData = unknown> {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    onDrop: (data: TData) => void;
    dropAlignment?: DropAlignment;
    dropOffset?: DropOffset;
    capacity?: number;
}
export type PositionUpdateListener = () => void;
export interface SlotsContextValue<TData = unknown> {
    register: (id: number, slot: DropSlot<TData>) => void;
    unregister: (id: number) => void;
    getSlots: () => Record<number, DropSlot<TData>>;
    isRegistered: (id: number) => boolean;
    setActiveHoverSlot: (id: number | null) => void;
    activeHoverSlotId: number | null;
    registerPositionUpdateListener: (id: string, listener: PositionUpdateListener) => void;
    unregisterPositionUpdateListener: (id: string) => void;
    requestPositionUpdate: () => void;
    registerDroppedItem: (draggableId: string, droppableId: string, itemData: any) => void;
    unregisterDroppedItem: (draggableId: string) => void;
    getDroppedItems: () => DroppedItemsMap<any>;
    hasAvailableCapacity: (droppableId: string) => boolean;
    onDragging?: (payload: {
        x: number;
        y: number;
        tx: number;
        ty: number;
        itemData: any;
    }) => void;
    onDragStart?: (data: any) => void;
    onDragEnd?: (data: any) => void;
}
export declare const SlotsContext: import("react").Context<SlotsContextValue<any>>;
export interface DropProviderProps {
    children: ReactNode;
    onLayoutUpdateComplete?: () => void;
    onDroppedItemsUpdate?: (droppedItems: DroppedItemsMap) => void;
    onDragging?: (payload: {
        x: number;
        y: number;
        tx: number;
        ty: number;
        itemData: any;
    }) => void;
    onDragStart?: (data: any) => void;
    onDragEnd?: (data: any) => void;
}
export interface DropProviderRef {
    requestPositionUpdate: () => void;
    getDroppedItems: () => DroppedItemsMap;
}
