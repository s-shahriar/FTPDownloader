import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { DownloadItem } from '../types';
import { DOWNLOAD_STATUS, COLORS } from '../constants';

interface DownloadItemCardProps {
  download: DownloadItem;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '—';
  if (bytesPerSec >= 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
  }
  return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
}

function formatTime(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return '—';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.ceil(seconds % 60);
    return `${m}m ${s}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.ceil((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const DownloadItemCard = React.memo(function DownloadItemCard({
  download,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onDelete,
}: DownloadItemCardProps) {
  const progressPercent = download.progress || 0;

  const getStatusColor = () => {
    switch (download.status) {
      case DOWNLOAD_STATUS.DOWNLOADING:
        return COLORS.info;
      case DOWNLOAD_STATUS.COMPLETED:
        return COLORS.success;
      case DOWNLOAD_STATUS.PAUSED:
        return COLORS.warning;
      case DOWNLOAD_STATUS.FAILED:
        return COLORS.error;
      case DOWNLOAD_STATUS.QUEUED:
        return COLORS.textSecondary;
      case DOWNLOAD_STATUS.CANCELLED:
        return COLORS.textSecondary;
      default:
        return COLORS.textSecondary;
    }
  };

  const getStatusText = () => {
    switch (download.status) {
      case DOWNLOAD_STATUS.PENDING:
        return 'Pending';
      case DOWNLOAD_STATUS.QUEUED:
        return 'Queued — waiting for slot…';
      case DOWNLOAD_STATUS.DOWNLOADING: {
        const parts = [`Downloading ${progressPercent}%`];
        if (download.speed > 0) {
          parts.push(formatSpeed(download.speed));
        }
        if (download.timeRemaining > 0) {
          parts.push(`${formatTime(download.timeRemaining)} left`);
        }
        return parts.join(' · ');
      }
      case DOWNLOAD_STATUS.COMPLETED:
        return 'Completed';
      case DOWNLOAD_STATUS.PAUSED:
        return `Paused at ${progressPercent}%`;
      case DOWNLOAD_STATUS.FAILED:
        return 'Failed';
      case DOWNLOAD_STATUS.CANCELLED:
        return 'Cancelled';
      default:
        return 'Unknown';
    }
  };

  const getStatusIcon = (): React.ComponentProps<typeof MaterialIcons>['name'] => {
    switch (download.status) {
      case DOWNLOAD_STATUS.DOWNLOADING:
        return 'downloading';
      case DOWNLOAD_STATUS.COMPLETED:
        return 'check-circle';
      case DOWNLOAD_STATUS.PAUSED:
        return 'pause-circle-filled';
      case DOWNLOAD_STATUS.FAILED:
        return 'error';
      case DOWNLOAD_STATUS.QUEUED:
        return 'schedule';
      case DOWNLOAD_STATUS.CANCELLED:
        return 'cancel';
      default:
        return 'hourglass-empty';
    }
  };

  const renderActions = () => {
    switch (download.status) {
      case DOWNLOAD_STATUS.DOWNLOADING:
        return (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => onPause(download.id)}
            >
              <MaterialIcons name="pause" size={20} color={COLORS.warning} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => onCancel(download.id)}
            >
              <MaterialIcons name="cancel" size={20} color={COLORS.error} />
            </TouchableOpacity>
          </View>
        );
      case DOWNLOAD_STATUS.QUEUED:
        return (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onCancel(download.id)}
          >
            <MaterialIcons name="cancel" size={20} color={COLORS.error} />
          </TouchableOpacity>
        );
      case DOWNLOAD_STATUS.PAUSED:
        return (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => onResume(download.id)}
            >
              <MaterialIcons name="play-arrow" size={20} color={COLORS.success} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => onCancel(download.id)}
            >
              <MaterialIcons name="cancel" size={20} color={COLORS.error} />
            </TouchableOpacity>
          </View>
        );
      case DOWNLOAD_STATUS.COMPLETED:
        return (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onDelete(download.id)}
          >
            <MaterialIcons name="delete" size={20} color={COLORS.error} />
          </TouchableOpacity>
        );
      case DOWNLOAD_STATUS.FAILED:
      case DOWNLOAD_STATUS.CANCELLED:
        return (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => onRetry(download.id)}
            >
              <MaterialIcons name="refresh" size={20} color={COLORS.info} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => onDelete(download.id)}
            >
              <MaterialIcons name="delete" size={20} color={COLORS.error} />
            </TouchableOpacity>
          </View>
        );
      default:
        return null;
    }
  };

  const showProgress = download.status === DOWNLOAD_STATUS.DOWNLOADING ||
    download.status === DOWNLOAD_STATUS.PAUSED;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: `${getStatusColor()}15` }]}>
          <MaterialIcons name={getStatusIcon()} size={22} color={getStatusColor()} />
        </View>
        <View style={styles.infoContainer}>
          <Text style={styles.title} numberOfLines={2}>
            {download.name}
          </Text>
          <View style={styles.statusRow}>
            <Text style={[styles.status, { color: getStatusColor() }]}>
              {getStatusText()}
            </Text>
          </View>
          {download.category ? (
            <Text style={styles.categoryLabel}>{download.category}</Text>
          ) : null}
        </View>
      </View>

      {showProgress && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${progressPercent}%`,
                  backgroundColor: download.status === DOWNLOAD_STATUS.PAUSED
                    ? COLORS.warning
                    : COLORS.primary,
                },
              ]}
            />
          </View>
          <View style={styles.bytesContainer}>
            <Text style={styles.bytesText}>
              {formatBytes(download.downloadedBytes)} / {formatBytes(download.totalBytes)}
            </Text>
            {download.status === DOWNLOAD_STATUS.DOWNLOADING && download.speed > 0 && (
              <Text style={styles.speedText}>{formatSpeed(download.speed)}</Text>
            )}
          </View>
        </View>
      )}

      {download.status === DOWNLOAD_STATUS.FAILED && download.error && (
        <Text style={styles.errorText}>{download.error}</Text>
      )}

      <View style={styles.actionsContainer}>{renderActions()}</View>
    </View>
  );
}, (prev, next) => {
  const p = prev.download;
  const n = next.download;
  return p.status === n.status &&
    p.progress === n.progress &&
    Math.round(p.speed / 1024) === Math.round(n.speed / 1024) &&
    p.error === n.error &&
    p.name === n.name;
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)' as any,
      },
      android: { elevation: 1 },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContainer: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 3,
    lineHeight: 19,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  status: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  categoryLabel: {
    fontSize: 9,
    color: COLORS.textDim,
    fontWeight: '500',
    marginTop: 2,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  progressContainer: {
    marginTop: 12,
  },
  progressBarContainer: {
    height: 5,
    backgroundColor: COLORS.card,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 3,
  },
  bytesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  bytesText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  speedText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  errorText: {
    fontSize: 11,
    color: COLORS.error,
    marginTop: 8,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  actionButton: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
});
