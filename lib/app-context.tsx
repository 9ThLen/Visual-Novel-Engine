/**
 * Global App Context for non-story state
 * Handles UI state, notifications, modals, and other app-wide state
 */

import React, { createContext, useContext, useReducer, ReactNode, useCallback } from 'react';
import { AppError } from './error-handler';

export interface AppState {
  // UI State
  isLoading: boolean;
  loadingMessage?: string;

  // Notifications
  notifications: Notification[];

  // Modals
  activeModal: string | null;
  modalData?: any;

  // Errors
  errors: AppError[];

  // Network status
  isOnline: boolean;

  // App metadata
  appVersion: string;
  lastSync?: number;
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  duration?: number; // Auto-dismiss after N milliseconds
  timestamp: number;
}

type AppAction =
  | { type: 'SET_LOADING'; payload: { isLoading: boolean; message?: string } }
  | { type: 'ADD_NOTIFICATION'; payload: Notification }
  | { type: 'REMOVE_NOTIFICATION'; payload: string }
  | { type: 'CLEAR_NOTIFICATIONS' }
  | { type: 'OPEN_MODAL'; payload: { modalId: string; data?: any } }
  | { type: 'CLOSE_MODAL' }
  | { type: 'ADD_ERROR'; payload: AppError }
  | { type: 'REMOVE_ERROR'; payload: number }
  | { type: 'CLEAR_ERRORS' }
  | { type: 'SET_ONLINE'; payload: boolean }
  | { type: 'SET_LAST_SYNC'; payload: number };

const initialState: AppState = {
  isLoading: false,
  notifications: [],
  activeModal: null,
  errors: [],
  isOnline: true,
  appVersion: '1.0.0',
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload.isLoading,
        loadingMessage: action.payload.message,
      };

    case 'ADD_NOTIFICATION':
      return {
        ...state,
        notifications: [...state.notifications, action.payload],
      };

    case 'REMOVE_NOTIFICATION':
      return {
        ...state,
        notifications: state.notifications.filter(n => n.id !== action.payload),
      };

    case 'CLEAR_NOTIFICATIONS':
      return {
        ...state,
        notifications: [],
      };

    case 'OPEN_MODAL':
      return {
        ...state,
        activeModal: action.payload.modalId,
        modalData: action.payload.data,
      };

    case 'CLOSE_MODAL':
      return {
        ...state,
        activeModal: null,
        modalData: undefined,
      };

    case 'ADD_ERROR':
      return {
        ...state,
        errors: [...state.errors, action.payload],
      };

    case 'REMOVE_ERROR':
      return {
        ...state,
        errors: state.errors.filter((_, index) => index !== action.payload),
      };

    case 'CLEAR_ERRORS':
      return {
        ...state,
        errors: [],
      };

    case 'SET_ONLINE':
      return {
        ...state,
        isOnline: action.payload,
      };

    case 'SET_LAST_SYNC':
      return {
        ...state,
        lastSync: action.payload,
      };

    default:
      return state;
  }
}

interface AppContextType {
  state: AppState;
  setLoading: (isLoading: boolean, message?: string) => void;
  showNotification: (type: Notification['type'], message: string, duration?: number) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  openModal: (modalId: string, data?: any) => void;
  closeModal: () => void;
  addError: (error: AppError) => void;
  removeError: (index: number) => void;
  clearErrors: () => void;
  setOnline: (isOnline: boolean) => void;
  setLastSync: (timestamp: number) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const setLoading = useCallback((isLoading: boolean, message?: string) => {
    dispatch({ type: 'SET_LOADING', payload: { isLoading, message } });
  }, []);

  const showNotification = useCallback(
    (type: Notification['type'], message: string, duration: number = 5000) => {
      const notification: Notification = {
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        type,
        message,
        duration,
        timestamp: Date.now(),
      };

      dispatch({ type: 'ADD_NOTIFICATION', payload: notification });

      // Auto-dismiss after duration
      if (duration > 0) {
        setTimeout(() => {
          dispatch({ type: 'REMOVE_NOTIFICATION', payload: notification.id });
        }, duration);
      }
    },
    []
  );

  const removeNotification = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_NOTIFICATION', payload: id });
  }, []);

  const clearNotifications = useCallback(() => {
    dispatch({ type: 'CLEAR_NOTIFICATIONS' });
  }, []);

  const openModal = useCallback((modalId: string, data?: any) => {
    dispatch({ type: 'OPEN_MODAL', payload: { modalId, data } });
  }, []);

  const closeModal = useCallback(() => {
    dispatch({ type: 'CLOSE_MODAL' });
  }, []);

  const addError = useCallback((error: AppError) => {
    dispatch({ type: 'ADD_ERROR', payload: error });
  }, []);

  const removeError = useCallback((index: number) => {
    dispatch({ type: 'REMOVE_ERROR', payload: index });
  }, []);

  const clearErrors = useCallback(() => {
    dispatch({ type: 'CLEAR_ERRORS' });
  }, []);

  const setOnline = useCallback((isOnline: boolean) => {
    dispatch({ type: 'SET_ONLINE', payload: isOnline });
  }, []);

  const setLastSync = useCallback((timestamp: number) => {
    dispatch({ type: 'SET_LAST_SYNC', payload: timestamp });
  }, []);

  return (
    <AppContext.Provider
      value={{
        state,
        setLoading,
        showNotification,
        removeNotification,
        clearNotifications,
        openModal,
        closeModal,
        addError,
        removeError,
        clearErrors,
        setOnline,
        setLastSync,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextType {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
