import "@/global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { StoryAutoSave } from "@/components/StoryAutoSave";
import { ReaderAudioRouteGuard } from "@/components/ReaderAudioRouteGuard";
import { PlayerModeRouteGuard } from "@/components/PlayerModeRouteGuard";
import { MigrationErrorBanner } from "@/components/MigrationErrorBanner";
import { ToastViewport } from "@/components/ui";
import { ensureStorageBootstrap } from "@/stores/storage-bootstrap";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { startAppStoreCrossTabWarning } from "@/lib/app-store-cross-tab";
import { useI18n } from "@/hooks/use-i18n";
import { ErrorHandler, ErrorSeverity } from "@/lib/error-handler";
import { showToast } from "@/lib/toast-store";

// Web safety: set background before any React rendering
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.documentElement.style.backgroundColor = 'var(--color-bg)';
  document.body.style.backgroundColor = 'var(--color-bg)';
  document.body.style.margin = '0';
}

export default function RootLayout() {
  // Storage bootstrap must not depend on the entry route: a web refresh lands
  // directly on /document-editor or /reader, which would otherwise skip the
  // media migration and leave the lossy size caps active for that session.
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

  // One subscription for the life of the tab, but the warning is written when
  // it fires: a ref keeps the current translator without resubscribing (and
  // re-announcing this tab) every time the author switches language.
  const { t, language } = useI18n();
  const translate = useRef(t);
  const languageRef = useRef(language);
  useEffect(() => {
    translate.current = t;
    languageRef.current = language;
  }, [language, t]);
  useEffect(
    () => startAppStoreCrossTabWarning(() => translate.current('common.crossTabWarning')),
    [],
  );
  useEffect(() => {
    ErrorHandler.setUserAlertCallback((error) => {
      if (error.severity === ErrorSeverity.HIGH || error.severity === ErrorSeverity.CRITICAL) {
        showToast(ErrorHandler.getUserMessage(error, languageRef.current), 'error');
      }
    });
    return () => ErrorHandler.setUserAlertCallback();
  }, []);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <StoryAutoSave />
          <ReaderAudioRouteGuard />
          <PlayerModeRouteGuard />
          <MigrationErrorBanner />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="tabs" />
          </Stack>
          <ToastViewport />
          <StatusBar style="auto" />
        </ThemeProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
