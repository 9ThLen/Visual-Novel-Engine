import { ThemedView } from "@/components/themed-view";
import * as Api from "@/lib/_core/api";
import * as Auth from "@/lib/_core/auth";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { ErrorHandler, ErrorCategory } from "@/lib/error-handler";

export default function OAuthCallback() {
  const router = useRouter();
  const colors = useColors();
  const params = useLocalSearchParams<{
    code?: string;
    state?: string;
    error?: string;
    sessionToken?: string;
    user?: string;
  }>();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const timeoutIds: ReturnType<typeof setTimeout>[] = [];
    const handleCallback = async () => {
      if (__DEV__) console.log("[OAuth] Callback handler triggered");
      try {
        if (params.sessionToken) {
          if (__DEV__) console.log("[OAuth] Session token found in params");
          await Auth.setSessionToken(params.sessionToken);

          // Decode and store user info if available
          if (params.user) {
            try {
              // Use atob for base64 decoding (works in both web and React Native)
              const userJson =
                typeof atob !== "undefined"
                  ? atob(params.user)
                  : Buffer.from(params.user, "base64").toString("utf-8");
              const userData = JSON.parse(userJson);
              const userInfo: Auth.User = {
                id: userData.id,
                openId: userData.openId,
                name: userData.name,
                email: userData.email,
                loginMethod: userData.loginMethod,
                lastSignedIn: new Date(userData.lastSignedIn || Date.now()),
              };
              await Auth.setUserInfo(userInfo);
              if (__DEV__) console.log("[OAuth] User info stored:", userInfo);
            } catch (err) {
              if (__DEV__) console.error("[OAuth] Failed to parse user data:", err);
            }
          }

          setStatus("success");
          if (__DEV__) console.log("[OAuth] Web authentication successful");
          timeoutIds.push(setTimeout(() => {
            router.replace("/tabs");
          }, 1000));
          return;
        }

        // Get URL from params or Linking
        let url: string | null = null;

        if (params.code || params.state || params.error) {
          if (__DEV__) console.log("[OAuth] Found params in route params");
          const urlParams = new URLSearchParams();
          if (params.code) urlParams.set("code", params.code);
          if (params.state) urlParams.set("state", params.state);
          if (params.error) urlParams.set("error", params.error);
          url = `?${urlParams.toString()}`;
        } else {
          if (__DEV__) console.log("[OAuth] No params found, checking Linking.getInitialURL()...");
          const initialUrl = await Linking.getInitialURL();
          if (__DEV__) console.log("[OAuth] Linking.getInitialURL found:", !!initialUrl);
          if (initialUrl) {
            url = initialUrl;
          }
        }

        const error =
          params.error || (url ? new URL(url, "http://dummy").searchParams.get("error") : null);
        if (error) {
          if (__DEV__) console.error("[OAuth] Error parameter found:", error);
          setStatus("error");
          setErrorMessage(error || "OAuth error occurred");
          return;
        }

        let code: string | null = null;
        let state: string | null = null;
        let sessionToken: string | null = null;

        if (params.code && params.state) {
          code = params.code;
          state = params.state;
        } else if (url) {
          try {
            const urlObj = new URL(url);
            code = urlObj.searchParams.get("code");
            state = urlObj.searchParams.get("state");
            sessionToken = urlObj.searchParams.get("sessionToken");
          } catch (e) {
            if (__DEV__) console.log("[OAuth] Failed to parse as full URL, trying regex:", e);
            // Try parsing as relative URL with query params
            const match = url.match(/[?&](code|state|sessionToken)=([^&]+)/g);
            if (match) {
              match.forEach((param) => {
                const eqIdx = param.indexOf('=');
                const key = param.substring(1, eqIdx);
                const val = param.substring(eqIdx + 1);
                if (key === "code") code = decodeURIComponent(val);
                if (key === "state") state = decodeURIComponent(val);
                if (key === "sessionToken") sessionToken = decodeURIComponent(val);
              });
              if (__DEV__) console.log("[OAuth] Extracted from regex:", {
                code: code?.substring(0, 20) + "...",
                state: state?.substring(0, 20) + "...",
                sessionToken: sessionToken ? "present" : "missing",
              });
            }
          }
        }

        if (__DEV__) console.log("[OAuth] Final extracted values:", {
          hasCode: !!code,
          hasState: !!state,
          hasSessionToken: !!sessionToken,
        });

        // If we have sessionToken directly from URL, use it
        if (sessionToken) {
          if (__DEV__) console.log("[OAuth] Session token found in URL");
          await Auth.setSessionToken(sessionToken);
          setStatus("success");
          timeoutIds.push(setTimeout(() => {
            router.replace("/tabs");
          }, 1000));
          return;
        }

        if (!code || !state) {
          if (__DEV__) console.error("[OAuth] Missing code or state");
          setStatus("error");
          setErrorMessage("Missing code or state parameter");
          return;
        }

        const result = await Api.exchangeOAuthCode(code, state);

        if (result.sessionToken) {
          await Auth.setSessionToken(result.sessionToken);

          if (result.user) {
            const userInfo: Auth.User = {
              id: result.user.id,
              openId: result.user.openId,
              name: result.user.name,
              email: result.user.email,
              loginMethod: result.user.loginMethod,
              lastSignedIn: new Date(result.user.lastSignedIn || Date.now()),
            };
            await Auth.setUserInfo(userInfo);
          }

          setStatus("success");
          timeoutIds.push(setTimeout(() => {
            router.replace("/tabs");
          }, 1000));
        } else {
          if (__DEV__) console.error("[OAuth] No session token in result");
          setStatus("error");
          setErrorMessage("No session token received");
        }
      } catch (error) {
        ErrorHandler.handle('OAuth callback error', error, ErrorCategory.NETWORK);
        setStatus("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to complete authentication",
        );
      }
    };

    handleCallback();
    return () => timeoutIds.forEach(clearTimeout);
  }, [params.code, params.state, params.error, params.sessionToken, params.user, router]);

  return (
    <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
      <ThemedView className="flex-1 items-center justify-center gap-4 p-5">
        {status === "processing" && (
          <>
            <ActivityIndicator size="large" />
            <Text style={[{ color: colors.foreground }, { marginTop: 16, fontSize: 16, lineHeight: 24, textAlign: 'center' }]}>
              Completing authentication...
            </Text>
          </>
        )}
        {status === "success" && (
          <>
            <Text style={[{ color: colors.foreground }, { fontSize: 16, lineHeight: 24, textAlign: 'center' }]}>
              Authentication successful!
            </Text>
            <Text style={[{ color: colors.foreground }, { fontSize: 16, lineHeight: 24, textAlign: 'center' }]}>
              Redirecting...
            </Text>
          </>
        )}
        {status === "error" && (
          <>
            <Text style={[{ color: colors.error }, { marginBottom: 8, fontSize: 20, fontWeight: 'bold', lineHeight: 28 }]}>
              Authentication failed
            </Text>
            <Text style={[{ color: colors.foreground }, { fontSize: 16, lineHeight: 24, textAlign: 'center' }]}>
              {errorMessage}
            </Text>
          </>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}