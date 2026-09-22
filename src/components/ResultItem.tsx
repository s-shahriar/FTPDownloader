import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Image,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { MaterialIcons } from '@expo/vector-icons';
import { FTPItem } from '../types';
import { COLORS } from '../constants';
import { FTPClient } from '../services/FTPClient';

interface ResultItemProps {
  item: FTPItem;
  onPress: (item: FTPItem) => void;
  onDownload: (item: FTPItem) => void;
  showPoster?: boolean; // look up the folder's poster image (costs one small request)
}

export function ResultItem({ item, onPress, onDownload, showPoster = false }: ResultItemProps) {
  const isFolder = item.type === 'folder';
  const [posterUrl, setPosterUrl] = useState<string | null>(null);

  useEffect(() => {
    setPosterUrl(null);
    if (!showPoster || !isFolder) return;
    let active = true;
    FTPClient.findPoster(item.url).then(url => {
      if (active) setPosterUrl(url);
    });
    return () => {
      active = false;
    };
  }, [item.url, showPoster, isFolder]);

  return (
    <TouchableOpacity style={styles.container} onPress={() => onPress(item)}>
      {posterUrl ? (
        <Image
          source={{ uri: posterUrl }}
          style={styles.poster}
          resizeMode="cover"
          resizeMethod="resize"
          onError={() => setPosterUrl(null)}
        />
      ) : (
        <View style={[styles.iconContainer, isFolder ? styles.iconFolder : styles.iconFile]}>
          <MaterialIcons
            name={isFolder ? 'folder' : 'movie'}
            size={24}
            color={isFolder ? COLORS.accent : COLORS.primary}
          />
        </View>
      )}
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
            {isFolder ? 'Added' : 'Modified'}: {new Date(item.modified).toLocaleDateString()}
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
            <MaterialIcons name="download" size={22} color={COLORS.primaryStrong} />
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
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...Platform.select({
      web: { boxShadow: '0 2px 14px rgba(38,37,35,0.10)' as any },
      android: { elevation: 2 },
    }),
  },
  iconContainer: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  poster: { width: 44, height: 66, borderRadius: 8, backgroundColor: COLORS.card2 },
  iconFolder: { backgroundColor: COLORS.sandTintStrong },
  iconFile: { backgroundColor: COLORS.tintStrong },
  infoContainer: { flex: 1, marginLeft: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  name: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 3, lineHeight: 19, flex: 1 },
  qualityBadge: {
    backgroundColor: COLORS.tintStrong,
    borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginTop: 2,
  },
  qualityText: {
    fontSize: 9, fontWeight: '700', color: COLORS.primaryStrong, letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  meta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  fileActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  copyButton: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: COLORS.card2, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  downloadButton: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: COLORS.tintStrong,
    alignItems: 'center', justifyContent: 'center',
  },
});
