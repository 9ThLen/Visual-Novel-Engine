import "@/global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import "@/lib/_core/nativewind-pressable";
import { StoryProvider } from "@/lib/story-context";
import { ThemeProvider } from "@/lib/theme-provider";
import { InventoryProvider } from "@/lib/inventory-context";
import { HelpSystemProvider } from "@/lib/help-system-context";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <InventoryProvider>
          <StoryProvider>
            <HelpSystemProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
              </Stack>
              <StatusBar style="auto" />
            </HelpSystemProvider>
          </StoryProvider>
        </InventoryProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
