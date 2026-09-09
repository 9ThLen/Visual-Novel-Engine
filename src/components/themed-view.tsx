import { type PropsWithChildren } from "react";
import { View, type ViewProps } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { cn } from "@/lib/utils";

export interface ThemedViewProps extends ViewProps, PropsWithChildren {
  className?: string;
}

export function ThemedView({ className, style, ...otherProps }: ThemedViewProps) {
  const colors = useColors();
  return <View style={[{ backgroundColor: colors.background }, style]} className={cn(className)} {...otherProps} />;
}
