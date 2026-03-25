import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { DownloadItem, Category, SearchHistoryItem } from '../types';
import { CATEGORIES, STORAGE_KEYS } from '../constants';
import { downloadManager } from '../services/DownloadManager';
import { notificationService } from '../services/NotificationService';
import { safPermissionService } from '../services/SAFPermissionService';
import { permissionHandler } from '../utils/permissions';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AppState {
  downloads: DownloadItem[];
  searchHistory: SearchHistoryItem[];
  selectedCategory: Category | null;
  searchQuery: string;
  isLoading: boolean;
  error: string | null;
  storagePermissionGranted: boolean;
  safFolderConfigured: boolean;
}

type AppAction =
  | { type: 'SET_DOWNLOADS'; payload: DownloadItem[] }
  | { type: 'ADD_DOWNLOAD'; payload: DownloadItem }
  | { type: 'UPDATE_DOWNLOAD'; payload: DownloadItem }
  | { type: 'REMOVE_DOWNLOAD'; payload: string }
  | { type: 'SET_SEARCH_HISTORY'; payload: SearchHistoryItem[] }
  | { type: 'ADD_SEARCH_HISTORY'; payload: SearchHistoryItem }
  | { type: 'CLEAR_SEARCH_HISTORY' }
  | { type: 'SET_CATEGORY'; payload: Category | null }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_STORAGE_PERMISSION'; payload: boolean }
  | { type: 'SET_SAF_FOLDER_CONFIGURED'; payload: boolean };

const initialState: AppState = {
  downloads: [],
  searchHistory: [],
  selectedCategory: null,
  searchQuery: '',
  isLoading: false,
  error: null,
  storagePermissionGranted: false,
  safFolderConfigured: false,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_DOWNLOADS':
      return { ...state, downloads: action.payload };
    case 'ADD_DOWNLOAD':
      return { ...state, downloads: [...state.downloads, action.payload] };
    case 'UPDATE_DOWNLOAD':
      return {
        ...state,
        downloads: state.downloads.map(d =>
          d.id === action.payload.id ? action.payload : d
        ),
      };
    case 'REMOVE_DOWNLOAD':
      return {
        ...state,
        downloads: state.downloads.filter(d => d.id !== action.payload),
      };
    case 'SET_SEARCH_HISTORY':
      return { ...state, searchHistory: action.payload };
    case 'ADD_SEARCH_HISTORY':
      const newHistory = [action.payload, ...state.searchHistory].slice(0, 10);
      return { ...state, searchHistory: newHistory };
    case 'CLEAR_SEARCH_HISTORY':
      return { ...state, searchHistory: [] };
    case 'SET_CATEGORY':
      return { ...state, selectedCategory: action.payload };
    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_STORAGE_PERMISSION':
      return { ...state, storagePermissionGranted: action.payload };
    case 'SET_SAF_FOLDER_CONFIGURED':
      return { ...state, safFolderConfigured: action.payload };
    default:
      return state;
  }
}

interface AppContextType extends AppState {
  dispatch: React.Dispatch<AppAction>;
  categories: Category[];
  requestStoragePermission: () => Promise<boolean>;
  requestSAFSetup: () => Promise<boolean>;
  loadSearchHistory: () => Promise<void>;
  saveSearchHistory: (query: string, category: string) => Promise<void>;
  clearSearchHistory: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const categories = Object.values(CATEGORIES);

  useEffect(() => {
    initializeApp();
  }, []);

  async function initializeApp() {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });

      const hasPermission = await permissionHandler.requestStoragePermission();
      dispatch({ type: 'SET_STORAGE_PERMISSION', payload: hasPermission });

      // Initialize SAF permission service
      await safPermissionService.initialize();

      // Validate persisted SAF permissions
      const safValid = await safPermissionService.validatePersistedPermission();
      dispatch({ type: 'SET_SAF_FOLDER_CONFIGURED', payload: safValid });

      if (safValid) {
        console.log('✓ SAF folder configured:', safPermissionService.getFolderDisplayName());
      } else {
        console.log('⚠️ SAF not configured - user will be prompted on first download');
      }

      // Initialize notifications
      await notificationService.initialize();

      await downloadManager.initialize();
      const downloads = downloadManager.getAllDownloads();
      dispatch({ type: 'SET_DOWNLOADS', payload: downloads });

      await loadSearchHistory();

      dispatch({ type: 'SET_LOADING', payload: false });
    } catch (error) {
      console.error('App initialization error:', error);
      dispatch({ type: 'SET_ERROR', payload: 'Failed to initialize app' });
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }

  async function requestStoragePermission(): Promise<boolean> {
    const granted = await permissionHandler.requestStoragePermission();
    dispatch({ type: 'SET_STORAGE_PERMISSION', payload: granted });
    return granted;
  }

  async function requestSAFSetup(): Promise<boolean> {
    const result = await safPermissionService.requestFolderAccess();
    dispatch({ type: 'SET_SAF_FOLDER_CONFIGURED', payload: result.granted });
    return result.granted;
  }

  async function loadSearchHistory(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.SEARCH_HISTORY);
      if (stored) {
        dispatch({ type: 'SET_SEARCH_HISTORY', payload: JSON.parse(stored) });
      }
    } catch (error) {
      console.error('Failed to load search history:', error);
    }
  }

  async function saveSearchHistory(query: string, category: string): Promise<void> {
    try {
      // Read current history from AsyncStorage to avoid race conditions
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.SEARCH_HISTORY);
      const currentHistory: SearchHistoryItem[] = stored ? JSON.parse(stored) : [];

      // Remove duplicate if exists (same query + category, case-insensitive)
      const filteredHistory = currentHistory.filter(
        item => !(item.query.toLowerCase() === query.toLowerCase() && item.category === category)
      );

      const newItem: SearchHistoryItem = {
        query,
        category,
        timestamp: Date.now(),
      };

      // Add new item at the beginning and limit to 10
      const updatedHistory = [newItem, ...filteredHistory].slice(0, 10);

      // Save to AsyncStorage first
      await AsyncStorage.setItem(STORAGE_KEYS.SEARCH_HISTORY, JSON.stringify(updatedHistory));

      // Then update state
      dispatch({ type: 'SET_SEARCH_HISTORY', payload: updatedHistory });
    } catch (error) {
      console.error('Failed to save search history:', error);
    }
  }

  async function clearSearchHistory(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.SEARCH_HISTORY);
      dispatch({ type: 'CLEAR_SEARCH_HISTORY' });
    } catch (error) {
      console.error('Failed to clear search history:', error);
    }
  }

  const value: AppContextType = {
    ...state,
    dispatch,
    categories,
    requestStoragePermission,
    requestSAFSetup,
    loadSearchHistory,
    saveSearchHistory,
    clearSearchHistory,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
