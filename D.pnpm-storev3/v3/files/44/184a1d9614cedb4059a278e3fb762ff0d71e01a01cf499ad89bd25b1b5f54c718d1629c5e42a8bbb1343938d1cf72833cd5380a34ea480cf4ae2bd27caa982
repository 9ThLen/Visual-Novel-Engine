import { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native";
import Animated, { useAnimatedRef } from "react-native-reanimated";
import { DropAlignment, DropOffset } from "./context";
export interface UseDroppableOptions<TData = unknown> {
    onDrop: (data: TData) => void;
    dropDisabled?: boolean;
    onActiveChange?: (isActive: boolean) => void;
    dropAlignment?: DropAlignment;
    dropOffset?: DropOffset;
    activeStyle?: StyleProp<ViewStyle>;
    droppableId?: string;
    capacity?: number;
}
export interface UseDroppableReturn {
    viewProps: {
        onLayout: (event: LayoutChangeEvent) => void;
        style?: StyleProp<ViewStyle>;
    };
    isActive: boolean;
    activeStyle?: StyleProp<ViewStyle>;
    animatedViewRef: ReturnType<typeof useAnimatedRef<Animated.View>>;
}
export interface DroppableProps<TData = unknown> extends UseDroppableOptions<TData> {
    style?: StyleProp<ViewStyle>;
    children: React.ReactNode;
}
