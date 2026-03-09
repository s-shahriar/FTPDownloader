import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../contexts/AppContext';
import { ResultItem } from '../components/ResultItem';
import { FTPClient } from '../services/FTPClient';
import { downloadManager } from '../services/DownloadManager';
import { showToast } from '../components/Toast';
import { showAlert } from '../components/AlertModal';
import { ErrorModal, ApiError } from '../components/ErrorModal';
import { parseApiError } from '../utils/errorHandler';
import { COLORS } from '../constants';
import { FTPItem, Category } from '../types';

const Wrapper = Platform.OS === 'web' ? View : SafeAreaView;

export function SearchResultsScreen({ route, navigation }: any) {
  const { folderUrl, folderName, category, query } = route.params;
  const [results, setResults] = useState<FTPItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const { dispatch } = useApp();

  useEffect(() => {
    loadFolder(folderUrl);
  }, [folderUrl]);

  const loadFolder = async (url: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const ftpClient = new FTPClient();
      const items = await ftpClient.fetchDirectory(url);
      const filtered = FTPClient.filterMediaItems(items);
      console.log(`Loaded ${items.length} items, showing ${filtered.length} (filtered)`);
      setResults(filtered);
    } catch (err: any) {
      console.error('Error loading folder:', err);
      const apiError = parseApiError(err, url);
      setError(apiError);
    } finally {
      setIsLoading(false);
    }
  };

  const handleItemPress = async (item: FTPItem) => {
    if (item.type === 'folder') {
      navigation.push('SearchResults', {
        folderUrl: item.url,
        folderName: item.name,
        category,
        query,
      });
    }
  };

  const handleDownload = async (item: FTPItem) => {
    try {
      const fileUrl = item.url;
      const filename = item.name;

      const downloadId = await downloadManager.startDownload(
        fileUrl,
        filename,
        category.name
      );

      dispatch({
        type: 'ADD_DOWNLOAD',
        payload: downloadManager.getDownload(downloadId)!,
      });

      // Truncate long filenames for the toast
      const shortName = filename.length > 40
        ? filename.slice(0, 37) + '...'
        : filename;

      showToast(`Downloading "${shortName}"`, {
        label: 'View',
        onPress: () => navigation.navigate('Downloads'),
      });
    } catch (error) {
      console.error('Download error:', error);
      showAlert('Download Failed', 'Failed to start download. Check your connection and storage permissions.');
    }
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        <MaterialIcons name="search-off" size={28} color={COLORS.textDim} />
      </View>
      <Text style={styles.emptyTitle}>No Media Found</Text>
      <Text style={styles.emptySubtitle}>
        No video or subtitle files found in this folder
      </Text>
    </View>
  );

  const renderItem = ({ item }: { item: FTPItem }) => (
    <ResultItem
      item={item}
      onPress={handleItemPress}
      onDownload={handleDownload}
    />
  );

  const folderCount = results.filter(r => r.type === 'folder').length;
  const fileCount = results.filter(r => r.type === 'file').length;
  const subtitle = [
    folderCount > 0 ? `${folderCount} folder${folderCount !== 1 ? 's' : ''}` : '',
    fileCount > 0 ? `${fileCount} file${fileCount !== 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' · ') || 'Empty';

  return (
    <Wrapper style={styles.container}>
      {/* App bar */}
      <View style={styles.appbar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <View style={styles.appbarInfo}>
          <Text style={styles.appbarTitle} numberOfLines={1}>{folderName}</Text>
          <Text style={styles.appbarSubtitle}>{subtitle}</Text>
        </View>
      </View>

      {/* Path breadcrumb */}
      <View style={styles.pathContainer}>
        <Text style={styles.pathLabel}>{category.name}</Text>
        <Text style={styles.pathText} numberOfLines={2}>
          {decodeURIComponent(folderUrl.replace(category.server, ''))}
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading folder contents...</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          renderItem={renderItem}
          keyExtractor={(item, index) => `${item.name}-${index}`}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={renderEmptyState}
          style={styles.list}
        />
      )}

      {/* Error Modal */}
      <ErrorModal
        visible={error !== null}
        error={error}
        onClose={() => setError(null)}
      />
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    ...Platform.select({
      web: {
        height: '100vh' as any,
        maxHeight: '100vh' as any,
      },
    }),
  },

  // ── App bar ──
  appbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 14,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appbarInfo: {
    flex: 1,
  },
  appbarTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: 0.2,
  },
  appbarSubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // ── Path breadcrumb ──
  pathContainer: {
    backgroundColor: COLORS.card,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  pathLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: COLORS.textDim,
    marginBottom: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  pathText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 16,
  },

  // ── List ──
  list: {
    flex: 1,
    ...Platform.select({
      web: {
        overflowY: 'auto' as any,
      },
    }),
  },
  listContainer: {
    paddingVertical: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },

  // ── Empty state ──
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
