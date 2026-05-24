import "@/global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { StoryAutoSave } from "@/lib/story-hooks";
import { ReaderAudioRouteGuard } from "@/components/ReaderAudioRouteGuard";
import { useEffect } from "react";
import { Platform } from "react-native";

// Web safety: set background before any React rendering
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.documentElement.style.backgroundColor = 'var(--color-bg)';
  document.body.style.backgroundColor = 'var(--color-bg)';
  document.body.style.margin = '0';
}

// Lazy-load reanimated on web (it can crash if not properly polyfilled)
try {
  require("react-native-reanimated");
} catch {}

export default function RootLayout() {
  // Hide the native splash screen once JS has mounted.
  useEffect(() => {
    const hideSplash = async () => {
      try {
        const SplashScreen = await import("expo-splash-screen");
        await SplashScreen.hideAsync();
      } catch {}
    };
    hideSplash();
  }, []);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <StoryAutoSave />
          <ReaderAudioRouteGuard />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="tabs" />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
