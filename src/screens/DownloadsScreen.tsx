import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../contexts/AppContext';
import { DownloadItemCard } from '../components/DownloadItemCard';
import { SettingsModal } from '../components/SettingsModal';
import { downloadManager } from '../services/DownloadManager';
import { showAlert } from '../components/AlertModal';
import { COLORS, DOWNLOAD_STATUS } from '../constants';
import { DownloadItem } from '../types';

const Wrapper = Platform.OS === 'web' ? View : SafeAreaView;

export function DownloadsScreen({ navigation }: any) {
  const { downloads, dispatch } = useApp();
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      // Pause polling when modal is open to avoid choppy animations
      if (showSettings) return;

      // Spread each download to create new references so React.memo can diff
      // Reverse to show latest downloads at top
      const allDownloads = downloadManager.getAllDownloads().map(d => ({ ...d })).reverse();
      dispatch({ type: 'SET_DOWNLOADS', payload: allDownloads });
    }, 1000);

    return () => clearInterval(interval);
  }, [showSettings]);

  const filteredDownloads = downloads.filter(download => {
    if (filter === 'active') {
      return download.status === DOWNLOAD_STATUS.DOWNLOADING ||
             download.status === DOWNLOAD_STATUS.PENDING ||
             download.status === DOWNLOAD_STATUS.QUEUED ||
             download.status === DOWNLOAD_STATUS.PAUSED;
    }
    if (filter === 'completed') {
      return download.status === DOWNLOAD_STATUS.COMPLETED ||
             download.status === DOWNLOAD_STATUS.FAILED ||
             download.status === DOWNLOAD_STATUS.CANCELLED;
    }
    return true;
  });

  const handlePause = async (id: string) => {
    await downloadManager.pauseDownload(id);
    const download = downloadManager.getDownload(id);
    if (download) {
      dispatch({ type: 'UPDATE_DOWNLOAD', payload: download });
    }
  };

  const handleResume = async (id: string) => {
    await downloadManager.resumeDownload(id);
    const download = downloadManager.getDownload(id);
    if (download) {
      dispatch({ type: 'UPDATE_DOWNLOAD', payload: download });
    }
  };

  const handleCancel = async (id: string) => {
    showAlert(
      'Cancel Download',
      'Are you sure you want to cancel this download?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          onPress: async () => {
            await downloadManager.cancelDownload(id);
            const allDownloads = downloadManager.getAllDownloads();
            dispatch({ type: 'SET_DOWNLOADS', payload: allDownloads });
          },
        },
      ]
    );
  };

  const handleRetry = async (id: string) => {
    await downloadManager.retryDownload(id);
    const allDownloads = downloadManager.getAllDownloads();
    dispatch({ type: 'SET_DOWNLOADS', payload: allDownloads });
  };

  const handleDelete = async (id: string) => {
    showAlert(
      'Delete Download',
      'Are you sure you want to delete this download?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          onPress: async () => {
            await downloadManager.deleteDownload(id);
            dispatch({ type: 'REMOVE_DOWNLOAD', payload: id });
          },
        },
      ]
    );
  };

  const handleClearCompleted = () => {
    showAlert(
      'Clear Completed',
      'Delete all completed and cancelled downloads?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          onPress: async () => {
            await downloadManager.clearCompletedDownloads();
            const allDownloads = downloadManager.getAllDownloads();
            dispatch({ type: 'SET_DOWNLOADS', payload: allDownloads });
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: DownloadItem }) => (
    <DownloadItemCard
      download={item}
      onPause={handlePause}
      onResume={handleResume}
      onCancel={handleCancel}
      onRetry={handleRetry}
      onDelete={handleDelete}
    />
  );

  const activeCount = downloads.filter(d =>
    d.status === DOWNLOAD_STATUS.DOWNLOADING ||
    d.status === DOWNLOAD_STATUS.PENDING ||
    d.status === DOWNLOAD_STATUS.QUEUED ||
    d.status === DOWNLOAD_STATUS.PAUSED
  ).length;

  const downloadingCount = downloads.filter(d =>
    d.status === DOWNLOAD_STATUS.DOWNLOADING
  ).length;

  const queuedCount = downloads.filter(d =>
    d.status === DOWNLOAD_STATUS.QUEUED
  ).length;

  const doneCount = downloads.filter(d =>
    d.status === DOWNLOAD_STATUS.COMPLETED ||
    d.status === DOWNLOAD_STATUS.FAILED ||
    d.status === DOWNLOAD_STATUS.CANCELLED
  ).length;

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      {/* Visual circle effect */}
      <View style={styles.emptyVisual}>
        <View style={styles.emptyCircle} />
        <View style={styles.emptyCircle2} />
        <View style={styles.emptyIconBg}>
          <MaterialIcons name="cloud-download" size={28} color={COLORS.primary} />
        </View>
      </View>

      <Text style={styles.emptyHeading}>NO DOWNLOADS YET</Text>
      <Text style={styles.emptySub}>
        Your queued and completed{'\n'}downloads will appear here.
      </Text>

      <TouchableOpacity
        style={styles.browseBtn}
        onPress={() => navigation.navigate('Home')}
      >
        <MaterialIcons name="search" size={16} color={COLORS.primary} />
        <Text style={styles.browseBtnText}>Browse Media</Text>
      </TouchableOpacity>

      {/* Tips */}
      <View style={styles.tipsContainer}>
        <View style={styles.tipCard}>
          <View style={[styles.tipIcon, { backgroundColor: 'rgba(232,160,32,0.1)' }]}>
            <MaterialIcons name="flash-on" size={16} color={COLORS.accent} />
          </View>
          <Text style={styles.tipText}>
            <Text style={styles.tipBold}>Fast transfers</Text> — up to 4 simultaneous downloads with automatic queuing
          </Text>
        </View>
        <View style={styles.tipCard}>
          <View style={[styles.tipIcon, { backgroundColor: 'rgba(0,200,160,0.1)' }]}>
            <MaterialIcons name="security" size={16} color={COLORS.success} />
          </View>
          <Text style={styles.tipText}>
            <Text style={styles.tipBold}>Auto-resume</Text> — interrupted downloads resume automatically
          </Text>
        </View>
      </View>
    </View>
  );

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
        <Text style={styles.appbarTitle}>DOWNLOADS</Text>
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => setShowSettings(true)}
        >
          <MaterialIcons name="settings" size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>
        {downloads.some(d =>
          d.status === DOWNLOAD_STATUS.COMPLETED || d.status === DOWNLOAD_STATUS.CANCELLED
        ) && (
          <TouchableOpacity
            style={styles.filterBtn}
            onPress={handleClearCompleted}
          >
            <MaterialIcons name="delete-sweep" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabsBar}>
        <TouchableOpacity
          style={[styles.tab, filter === 'all' && styles.tabActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.tabText, filter === 'all' && styles.tabTextActive]}>All</Text>
          <View style={[styles.tabBadge, filter === 'all' && styles.tabBadgeActive]}>
            <Text style={[styles.tabBadgeText, filter === 'all' && styles.tabBadgeTextActive]}>
              {downloads.length}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, filter === 'active' && styles.tabActive]}
          onPress={() => setFilter('active')}
        >
          <MaterialIcons
            name="schedule"
            size={13}
            color={filter === 'active' ? COLORS.text : COLORS.textSecondary}
          />
          <Text style={[styles.tabText, filter === 'active' && styles.tabTextActive]}>Active</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, filter === 'completed' && styles.tabActive]}
          onPress={() => setFilter('completed')}
        >
          <MaterialIcons
            name="check"
            size={13}
            color={filter === 'completed' ? COLORS.text : COLORS.textSecondary}
          />
          <Text style={[styles.tabText, filter === 'completed' && styles.tabTextActive]}>Done</Text>
        </TouchableOpacity>
      </View>

      {/* Queue status bar */}
      {downloads.length > 0 && (downloadingCount > 0 || queuedCount > 0) && (
        <View style={styles.queueBar}>
          <MaterialIcons name="sync" size={12} color={COLORS.primary} />
          <Text style={styles.queueText}>
            {downloadingCount} active{queuedCount > 0 ? ` · ${queuedCount} queued` : ''}
          </Text>
        </View>
      )}

      <FlatList
        data={filteredDownloads}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
        style={styles.list}
      />

      {/* Settings Modal */}
      <SettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
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
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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
  appbarTitle: {
    flex: 1,
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 1.5,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Tabs ──
  tabsBar: {
    flexDirection: 'row',
    gap: 4,
    marginHorizontal: 16,
    marginVertical: 14,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 9,
  },
  tabActive: {
    backgroundColor: COLORS.surface,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)' as any,
      },
      android: { elevation: 2 },
    }),
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 0.2,
  },
  tabTextActive: {
    color: COLORS.text,
    fontWeight: '700',
  },
  tabBadge: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tabBadgeActive: {
    backgroundColor: 'rgba(61,127,255,0.12)',
  },
  tabBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textDim,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  tabBadgeTextActive: {
    color: COLORS.primary,
  },

  // ── Queue status ──
  queueBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(61,127,255,0.06)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(61,127,255,0.12)',
  },
  queueText: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
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
    paddingVertical: 8,
    flexGrow: 1,
  },

  // ── Empty state ──
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 40,
    paddingBottom: 20,
  },
  emptyVisual: {
    width: 120,
    height: 120,
    marginBottom: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCircle: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(61,127,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(61,127,255,0.1)',
  },
  emptyCircle2: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(61,127,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(61,127,255,0.08)',
  },
  emptyIconBg: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: 'rgba(61,127,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 8px 32px rgba(0,0,0,0.06)' as any,
      },
      android: { elevation: 3 },
    }),
  },
  emptyHeading: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '300',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 28,
  },
  browseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: 'rgba(61,127,255,0.25)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 20px rgba(61,127,255,0.08)' as any,
      },
    }),
  },
  browseBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // ── Tips ──
  tipsContainer: {
    width: '100%',
    marginTop: 32,
    gap: 8,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tipIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tipText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
    flex: 1,
  },
  tipBold: {
    color: COLORS.text,
    fontWeight: '600',
  },
});
