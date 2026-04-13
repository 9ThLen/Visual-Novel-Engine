/**
 * Inventory Management System
 * Context for managing player inventory across the app
 */

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { InventoryItem, InventoryState } from './interactive-types';

interface InventoryContextType {
  inventory: InventoryState;
  addItem: (item: InventoryItem) => Promise<boolean>;
  removeItem: (itemId: string) => Promise<boolean>;
  hasItem: (itemId: string) => boolean;
  hasItems: (itemIds: string[]) => boolean;
  clearInventory: () => Promise<void>;
  getItem: (itemId: string) => InventoryItem | undefined;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

type Action =
  | { type: 'SET_INVENTORY'; payload: InventoryState }
  | { type: 'ADD_ITEM'; payload: InventoryItem }
  | { type: 'REMOVE_ITEM'; payload: string }
  | { type: 'CLEAR_INVENTORY' };

const initialState: InventoryState = {
  items: [],
  maxSlots: 50, // Default max inventory size
};

function inventoryReducer(state: InventoryState, action: Action): InventoryState {
  switch (action.type) {
    case 'SET_INVENTORY':
      return action.payload;

    case 'ADD_ITEM': {
      // Check if item already exists
      const exists = state.items.some((item) => item.id === action.payload.id);
      if (exists) {
        console.warn(`Item ${action.payload.id} already in inventory`);
        return state;
      }

      // Check max slots
      if (state.maxSlots && state.items.length >= state.maxSlots) {
        console.warn('Inventory is full');
        return state;
      }

      return {
        ...state,
        items: [...state.items, action.payload],
      };
    }

    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter((item) => item.id !== action.payload),
      };

    case 'CLEAR_INVENTORY':
      return {
        ...state,
        items: [],
      };

    default:
      return state;
  }
}

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(inventoryReducer, initialState);

  // Load inventory on mount
  useEffect(() => {
    loadInventory();
  }, []);

  // Save inventory whenever it changes
  useEffect(() => {
    saveInventory();
  }, [state]);

  const loadInventory = async () => {
    try {
      const inventoryJson = await AsyncStorage.getItem('inventory');
      if (inventoryJson) {
        const inventory = JSON.parse(inventoryJson);
        dispatch({ type: 'SET_INVENTORY', payload: inventory });
      }
    } catch (error) {
      console.error('Failed to load inventory:', error);
    }
  };

  const saveInventory = async () => {
    try {
      await AsyncStorage.setItem('inventory', JSON.stringify(state));
    } catch (error) {
      console.error('Failed to save inventory:', error);
    }
  };

  const addItem = async (item: InventoryItem): Promise<boolean> => {
    // Check if already exists
    if (state.items.some((i) => i.id === item.id)) {
      return false;
    }

    // Check max slots
    if (state.maxSlots && state.items.length >= state.maxSlots) {
      return false;
    }

    dispatch({ type: 'ADD_ITEM', payload: item });
    return true;
  };

  const removeItem = async (itemId: string): Promise<boolean> => {
    const exists = state.items.some((item) => item.id === itemId);
    if (!exists) {
      return false;
    }

    dispatch({ type: 'REMOVE_ITEM', payload: itemId });
    return true;
  };

  const hasItem = (itemId: string): boolean => {
    return state.items.some((item) => item.id === itemId);
  };

  const hasItems = (itemIds: string[]): boolean => {
    return itemIds.every((id) => hasItem(id));
  };

  const clearInventory = async () => {
    dispatch({ type: 'CLEAR_INVENTORY' });
  };

  const getItem = (itemId: string): InventoryItem | undefined => {
    return state.items.find((item) => item.id === itemId);
  };

  const value: InventoryContextType = {
    inventory: state,
    addItem,
    removeItem,
    hasItem,
    hasItems,
    clearInventory,
    getItem,
  };

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const context = useContext(InventoryContext);
  if (context === undefined) {
    throw new Error('useInventory must be used within an InventoryProvider');
  }
  return context;
}
