import { Platform } from "react-native";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "./auth";
import { ErrorHandler, ErrorCategory } from "@/lib/error-handler";

// ── Rate limiting ──

const RATE_LIMIT = {
  maxRequests: 20,
  windowMs: 1_000,
  maxPerEndpoint: 10,
  endpointWindowMs: 1_000,
};

const requestLog: Array<{ time: number; endpoint: string }> = [];
const endpointLog: Map<string, Array<number>> = new Map();

function pruneLog(log: Array<number | { time: number; endpoint: string }>, windowMs: number, now: number) {
  while (log.length > 0 && now - (typeof log[0] === 'number' ? log[0] : (log[0] as { time: number }).time) > windowMs) {
    log.shift();
  }
}

function isRateLimited(endpoint: string): boolean {
  const now = Date.now();
  pruneLog(requestLog, RATE_LIMIT.windowMs, now);
  if (requestLog.length >= RATE_LIMIT.maxRequests) return true;
  requestLog.push({ time: now, endpoint });
  let epLog = endpointLog.get(endpoint);
  if (!epLog) {
    epLog = [];
    endpointLog.set(endpoint, epLog);
  }
  pruneLog(epLog, RATE_LIMIT.endpointWindowMs, now);
  if (epLog.length >= RATE_LIMIT.maxPerEndpoint) return true;
  epLog.push(now);
  return false;
}

interface ApiUser {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  lastSignedIn: string;
}

export async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  if (isRateLimited(endpoint)) {
    throw new Error('Rate limit exceeded — try again later');
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  // Determine the auth method:
  // - Native platform: use stored session token as Bearer auth
  // - Web (including iframe): use cookie-based auth (browser handles automatically)
  //   Cookie is set on backend domain via POST /api/auth/session after receiving token via postMessage
  if (Platform.OS !== "web") {
    const sessionToken = await Auth.getSessionToken();
    if (__DEV__) console.log("[API] apiCall:", { endpoint, hasToken: !!sessionToken, method: options.method || "GET" });
    if (sessionToken) {
      headers["Authorization"] = `Bearer ${sessionToken}`;
      if (__DEV__) console.log("[API] Authorization header added");
    }
  } else {
    if (__DEV__) console.log("[API] apiCall:", { endpoint, platform: "web", method: options.method || "GET" });
  }

  const baseUrl = getApiBaseUrl();
  // Ensure no double slashes between baseUrl and endpoint
  const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = baseUrl ? `${cleanBaseUrl}${cleanEndpoint}` : endpoint;
  if (__DEV__) console.log("[API] Full URL:", url);

  try {
    if (__DEV__) console.log("[API] Making request...");
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: Platform.OS === "web" ? "include" : "same-origin",
    });

    if (__DEV__) {
      console.log("[API] Response status:", response.status, response.statusText);
      const responseHeaders = Object.fromEntries(response.headers.entries());
      console.log("[API] Response headers:", responseHeaders);
    }

    // Check if Set-Cookie header is present (cookies are automatically handled in React Native)
    const setCookie = response.headers.get("Set-Cookie");
    if (setCookie && __DEV__) {
      const sanitized = setCookie.replace(/=[^;]+/g, '=***');
      console.log("[API] Set-Cookie header received:", sanitized);
    }

    if (!response.ok) {
      const errorText = await response.text();
      if (__DEV__) console.error("[API] Error response:", errorText);
      let errorMessage = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorText;
      } catch {
        // Not JSON, use text as is
      }
      throw new Error(errorMessage || `API call failed: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      if (__DEV__) console.log("[API] JSON response received");
      return data as T;
    }

    const text = await response.text();
    if (__DEV__) console.log("[API] Text response received");
    // Non-JSON response — return text as-is (caller should expect T = string or handle)
    return text as unknown as T;
  } catch (error) {
    ErrorHandler.handle('API request failed', error, ErrorCategory.NETWORK);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Unknown error occurred");
  }
}

// OAuth callback handler - exchange code for session token
// Calls /api/oauth/mobile endpoint which returns JSON with app_session_id and user
export async function exchangeOAuthCode(
  code: string,
  state: string,
): Promise<{ sessionToken: string; user: ApiUser }> {
  if (__DEV__) console.log("[API] exchangeOAuthCode called");
  const stateValid = await Auth.validateOAuthState(state);
  if (!stateValid) {
    throw new Error("OAuth state validation failed — possible CSRF attack, aborting exchange");
  }
  // Use GET with query params
  const params = new URLSearchParams({ code, state });
  const endpoint = `/api/oauth/mobile?${params.toString()}`;
  if (__DEV__) console.log("[API] Calling OAuth mobile endpoint:", endpoint);
  const result = await apiCall<{ app_session_id: string; user: ApiUser }>(endpoint);

  // Convert app_session_id to sessionToken for compatibility
  const sessionToken = result.app_session_id;
  if (__DEV__) console.log("[API] OAuth exchange result:", {
    hasSessionToken: !!sessionToken,
    hasUser: !!result.user,
  });

  return {
    sessionToken,
    user: result.user,
  };
}

// Logout
export async function logout(): Promise<void> {
  await apiCall<void>("/api/auth/logout", {
    method: "POST",
  });
}

// Get current authenticated user (web uses cookie-based auth)
export async function getMe(): Promise<{
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  lastSignedIn: string;
} | null> {
  try {
    const result = await apiCall<{ user: ApiUser }>("/api/auth/me");
    return result.user || null;
  } catch (error) {
    ErrorHandler.handle('API getMe failed', error, ErrorCategory.NETWORK);
    return null;
  }
}

// Establish session cookie on the backend (3000-xxx domain)
// Called after receiving token via postMessage to get a proper Set-Cookie from the backend
export async function establishSession(token: string): Promise<boolean> {
  try {
    if (__DEV__) console.log("[API] establishSession: setting cookie on backend...");
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/auth/session`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include", // Important: allows Set-Cookie to be stored
    });

    if (!response.ok) {
      if (__DEV__) console.error("[API] establishSession failed:", response.status);
      return false;
    }

    if (__DEV__) console.log("[API] establishSession: cookie set successfully");
    return true;
  } catch (error) {
    ErrorHandler.handle('API establishSession error', error, ErrorCategory.NETWORK);
    return false;
  }
}
