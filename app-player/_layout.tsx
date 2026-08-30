import "@/global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { StoryAutoSave } from "@/components/StoryAutoSave";
import { ReaderAudioRouteGuard } from "@/components/ReaderAudioRouteGuard";
import { AppStateConflictBanner } from "@/components/AppStateConflictBanner";
import { ToastViewport } from "@/components/ui";
import { ensureStorageBootstrap } from "@/stores/storage-bootstrap";
import { useEffect } from "react";
import { Platform } from "react-native";
import { ErrorHandler, ErrorSeverity } from "@/lib/error-handler";
import { showToast } from "@/lib/toast-store";
import { useI18n } from "@/hooks/use-i18n";

// Web safety: set background before any React rendering
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.documentElement.style.backgroundColor = 'var(--color-bg)';
  document.body.style.backgroundColor = 'var(--color-bg)';
  document.body.style.margin = '0';
}

/**
 * The player's root layout — the studio's, minus everything that only an author
 * needs.
 *
 * Dropped, and why:
 *   - `PlayerModeRouteGuard`  bounced navigation away from the editor routes.
 *                             There are no editor routes in this root to bounce
 *                             away from.
 *   - `MigrationErrorBanner`  reports a failed migration of legacy studio data.
 *                             A player install has no studio history.
 *   - the cross-tab warning   told an author that a second tab was open, so they
 *                             would not edit the same story twice. Readers do
 *                             not edit.
 *
 * Kept, and why:
 *   - `StoryAutoSave`         autosaves *reader progress* into a save slot. It
 *                             is what makes "continue where you left off" work,
 *                             so it belongs to the player more than to the
 *                             studio.
 *   - `AppStateConflictBanner` fires when a write is refused because another tab
 *                             wrote first. For a reader that means their
 *                             progress has stopped being saved — silence there
 *                             would be worse, not lighter.
 */
export default function PlayerRootLayout() {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let SplashScreen: typeof import("expo-splash-screen") | null = null;
      try {
        // Both imports stay behind the platform/effect boundary: module-level
        // evaluation can hang web before React gets a chance to render.
        if (Platform.OS !== 'web') {
          SplashScreen = await import("expo-splash-screen");
          await SplashScreen.preventAutoHideAsync();
          await import("react-native-reanimated");
        }
        await ensureStorageBootstrap();
      } catch {
        // The app still renders its in-app recovery UI if an optional native
        // module cannot initialize.
      } finally {
        if (!cancelled && SplashScreen) {
          await SplashScreen.hideAsync().catch(() => {});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { language } = useI18n();
  useEffect(() => {
    ErrorHandler.setUserAlertCallback((error) => {
      if (error.severity === ErrorSeverity.HIGH || error.severity === ErrorSeverity.CRITICAL) {
        showToast(ErrorHandler.getUserMessage(error, language), 'error');
      }
    });
    return () => ErrorHandler.setUserAlertCallback();
  }, [language]);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <StoryAutoSave />
          <ReaderAudioRouteGuard />
          <AppStateConflictBanner />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
          </Stack>
          <ToastViewport />
          <StatusBar style="auto" />
        </ThemeProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
