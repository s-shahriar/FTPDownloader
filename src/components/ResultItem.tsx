import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { MaterialIcons } from '@expo/vector-icons';
import { FTPItem } from '../types';
import { COLORS } from '../constants';

interface ResultItemProps {
  item: FTPItem;
  onPress: (item: FTPItem) => void;
  onDownload: (item: FTPItem) => void;
}

export function ResultItem({ item, onPress, onDownload }: ResultItemProps) {
  const isFolder = item.type === 'folder';

  return (
    <TouchableOpacity style={styles.container} onPress={() => onPress(item)}>
      <View style={[styles.iconContainer, isFolder ? styles.iconFolder : styles.iconFile]}>
        <MaterialIcons
          name={isFolder ? 'folder' : 'movie'}
          size={24}
          color={isFolder ? COLORS.accent : COLORS.primary}
        />
      </View>
      <View style={styles.infoContainer}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={2}>
            {item.name}
          </Text>
          {item.sourceLabel && (
            <View style={styles.qualityBadge}>
              <Text style={styles.qualityText}>{item.sourceLabel}</Text>
            </View>
          )}
        </View>
        {item.size && (
          <Text style={styles.meta}>{item.size}</Text>
        )}
        {item.modified && (
          <Text style={styles.meta}>
            Modified: {new Date(item.modified).toLocaleDateString()}
          </Text>
        )}
      </View>
      {!isFolder && (
        <View style={styles.fileActions}>
          <TouchableOpacity
            style={styles.copyButton}
            onPress={async () => {
              await Clipboard.setStringAsync(item.url);
            }}
          >
            <MaterialIcons name="content-copy" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.downloadButton}
            onPress={() => onDownload(item)}
          >
            <MaterialIcons name="download" size={22} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      )}
      {isFolder && (
        <MaterialIcons name="chevron-right" size={20} color={COLORS.textDim} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
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
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconFolder: {
    backgroundColor: 'rgba(232,160,32,0.12)',
  },
  iconFile: {
    backgroundColor: 'rgba(61,127,255,0.1)',
  },
  infoContainer: {
    flex: 1,
    marginLeft: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 3,
    lineHeight: 19,
    flex: 1,
  },
  qualityBadge: {
    backgroundColor: 'rgba(61,127,255,0.1)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  qualityText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  meta: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  fileActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  copyButton: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadButton: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: 'rgba(61,127,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
