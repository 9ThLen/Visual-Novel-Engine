import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { SESSION_TOKEN_KEY, USER_INFO_KEY, OAUTH_STATE_KEY, getLoginUrl } from "@/constants/oauth";
import { ErrorHandler, ErrorCategory } from "@/lib/error-handler";

export type User = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  lastSignedIn: Date;
};

export function isValidUser(value: unknown): value is User {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.id !== 'number') return false;
  if (typeof obj.openId !== 'string') return false;
  if (obj.name !== null && typeof obj.name !== 'string') return false;
  if (obj.email !== null && typeof obj.email !== 'string') return false;
  if (obj.loginMethod !== null && typeof obj.loginMethod !== 'string') return false;
  if (obj.lastSignedIn !== null && obj.lastSignedIn !== undefined) {
    const t = obj.lastSignedIn;
    if (typeof t === 'string' && !Number.isNaN(Date.parse(t))) return true;
    if (t instanceof Date && !Number.isNaN(t.getTime())) return true;
    return false;
  }
  return false;
}

export async function generateOAuthState(): Promise<string> {
  const array = new Uint32Array(8);
  crypto.getRandomValues(array);
  const state = Array.from(array).map((n) => n.toString(36)).join('');
  const storageKey = OAUTH_STATE_KEY;
  if (Platform.OS === "web") {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(storageKey, state);
    }
  } else {
    await SecureStore.setItemAsync(storageKey, state);
  }
  return state;
}

export async function validateOAuthState(stateParam: string): Promise<boolean> {
  if (!stateParam || typeof stateParam !== 'string') return false;
  const storageKey = OAUTH_STATE_KEY;
  let stored: string | null = null;
  if (Platform.OS === "web") {
    stored = typeof window !== 'undefined' ? window.sessionStorage.getItem(storageKey) : null;
  } else {
    stored = await SecureStore.getItemAsync(storageKey);
  }
  if (!stored) return false;
  if (Platform.OS === "web") {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(storageKey);
    }
  } else {
    await SecureStore.deleteItemAsync(storageKey);
  }
  const valid = stateParam === stored;
  if (!valid) {
    ErrorHandler.handle('OAuth state mismatch — possible CSRF', null, ErrorCategory.NETWORK);
  }
  return valid;
}

export async function getSessionToken(): Promise<string | null> {
  try {
    // Web platform uses cookie-based auth, no manual token management needed
    if (Platform.OS === "web") {
      return null;
    }

    // Use SecureStore for native
    const token = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
    return token;
  } catch (error: unknown) {
    ErrorHandler.handle('Failed to get session token', error, ErrorCategory.STORAGE);
    return null;
  }
}

export async function setSessionToken(token: string): Promise<void> {
  try {
    // Web platform uses cookie-based auth, no manual token management needed
    if (Platform.OS === "web") {
      return;
    }

    // Use SecureStore for native
    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
  } catch (error: unknown) {
    ErrorHandler.handle('Failed to set session token', error, ErrorCategory.STORAGE);
    throw error;
  }
}

export async function removeSessionToken(): Promise<void> {
  try {
    // Web platform uses cookie-based auth, no manual token management needed
    if (Platform.OS === "web") {
      return;
    }

    // Use SecureStore for native
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
  } catch (error: unknown) {
    ErrorHandler.handle('Failed to remove session token', error, ErrorCategory.STORAGE);
  }
}

export async function getUserInfo(): Promise<User | null> {
  try {
    let info: string | null = null;
    if (Platform.OS === "web") {
      // Use sessionStorage for web (reduces XSS persistence surface)
      info = typeof window !== 'undefined' ? window.sessionStorage.getItem(USER_INFO_KEY) : null;
    } else {
      // Use SecureStore for native
      info = await SecureStore.getItemAsync(USER_INFO_KEY);
    }

    if (!info) {
      return null;
    }
    const raw: unknown = JSON.parse(info);
    if (!isValidUser(raw)) {
      await clearUserInfo();
      return null;
    }
    const user: User = raw;
    if (typeof user.lastSignedIn === 'string') {
      user.lastSignedIn = new Date(user.lastSignedIn);
    }
    return user;
  } catch (error: unknown) {
    ErrorHandler.handle('Failed to get user info', error, ErrorCategory.STORAGE);
    return null;
  }
}

export async function setUserInfo(user: User): Promise<void> {
  try {
    if (Platform.OS === "web") {
      // Use sessionStorage for web
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(USER_INFO_KEY, JSON.stringify(user));
      }
      return;
    }

    await SecureStore.setItemAsync(USER_INFO_KEY, JSON.stringify(user));
  } catch (error: unknown) {
    ErrorHandler.handle('Failed to set user info', error, ErrorCategory.STORAGE);
  }
}

export async function clearUserInfo(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      // Use sessionStorage for web
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(USER_INFO_KEY);
      }
      return;
    }

    await SecureStore.deleteItemAsync(USER_INFO_KEY);
  } catch (error: unknown) {
    ErrorHandler.handle('Failed to clear user info', error, ErrorCategory.STORAGE);
  }
}

export async function startOAuthLogin(): Promise<string | null> {
  const state = await generateOAuthState();
  const loginUrl = getLoginUrl(state);

  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.location.href = loginUrl;
    }
    return null;
  }

  const supported = await Linking.canOpenURL(loginUrl);
  if (!supported) {
    if (__DEV__) console.warn("[OAuth] Cannot open login URL: URL scheme not supported");
    return null;
  }

  try {
    await Linking.openURL(loginUrl);
  } catch (error) {
    if (__DEV__) console.error("[OAuth] Failed to open login URL:", error);
  }

  return null;
}
