import { Platform, View, type ViewProps } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";

import { cn } from "@/lib/utils";
import {
  getScreenContainerWrapperClassNames,
  getScreenContainerWrapperStyles,
} from "@/lib/screen-container-platform";

export interface ScreenContainerProps extends ViewProps {
  /**
   * SafeArea edges to apply. Defaults to ["top", "left", "right"].
   * Bottom is typically handled by Tab Bar.
   */
  edges?: Edge[];
  /**
   * Tailwind className for the content area.
   */
  className?: string;
  /**
   * Additional className for the outer container (background layer).
   */
  containerClassName?: string;
  /**
   * Additional className for the SafeAreaView (content layer).
   */
  safeAreaClassName?: string;
}

/**
 * A container component that properly handles SafeArea and background colors.
 *
 * The outer View extends to full screen (including status bar area) with the background color,
 * while the inner SafeAreaView ensures content is within safe bounds.
 *
 * Usage:
 * ```tsx
 * <ScreenContainer className="p-4">
 *   <Text className="text-2xl font-bold text-foreground">
 *     Welcome
 *   </Text>
 * </ScreenContainer>
 * ```
 */
export function ScreenContainer({
  children,
  edges = ["top", "left", "right"],
  className,
  containerClassName,
  safeAreaClassName,
  style,
  ...props
}: ScreenContainerProps) {
  const colors = useColors();
  const wrapperClassNames = getScreenContainerWrapperClassNames({
    platformOS: Platform.OS,
    containerClassName,
    safeAreaClassName,
  });
  const wrapperStyles = getScreenContainerWrapperStyles();
  return (
    <View
      className={wrapperClassNames.containerClassName}
      style={[wrapperStyles.containerStyle, { backgroundColor: colors.background }]}
      {...props}
    >
      <SafeAreaView
        edges={edges}
        className={wrapperClassNames.safeAreaClassName}
        style={[wrapperStyles.safeAreaStyle, style]}
      >
        <View className={cn("flex-1", className)}>{children}</View>
      </SafeAreaView>
    </View>
  );
}
