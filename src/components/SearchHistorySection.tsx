import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SearchHistoryItem, Category } from '../types';
import { COLORS } from '../constants';

interface SearchHistorySectionProps {
  history: SearchHistoryItem[];
  onSelect: (item: SearchHistoryItem) => void;
  onClear: () => void;
  categories: Category[];
}

export function SearchHistorySection({
  history,
  onSelect,
  onClear,
  categories,
}: SearchHistorySectionProps) {
  if (history.length === 0) {
    return null;
  }

  const formatTimestamp = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;

    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getCategoryColor = (categoryName: string): string => {
    const category = categories.find(c => c.name === categoryName);
    return category?.color || COLORS.textDim;
  };

  const getCategoryDisplayName = (categoryName: string): string => {
    const category = categories.find(c => c.name === categoryName);
    return category?.name || 'Unknown';
  };

  const renderHistoryItem = ({ item }: { item: SearchHistoryItem }) => {
    const categoryColor = getCategoryColor(item.category);
    const categoryDisplay = getCategoryDisplayName(item.category);

    return (
      <TouchableOpacity
        style={styles.historyItem}
        onPress={() => onSelect(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.colorBar, { backgroundColor: categoryColor }]} />
        <View style={styles.itemContent}>
          <View style={styles.itemHeader}>
            <View style={[styles.categoryBadge, { backgroundColor: categoryColor + '20' }]}>
              <Text style={[styles.categoryBadgeText, { color: categoryColor }]} numberOfLines={1}>
                {categoryDisplay}
              </Text>
            </View>
            <Text style={styles.timestamp}>{formatTimestamp(item.timestamp)}</Text>
          </View>
          <Text style={styles.queryText} numberOfLines={1}>
            {item.query}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Recent Searches</Text>
        <TouchableOpacity onPress={onClear} activeOpacity={0.7}>
          <MaterialIcons name="delete-outline" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>
      <FlatList
        data={history}
        renderItem={renderHistoryItem}
        keyExtractor={(item, index) => `${item.query}-${item.category}-${index}`}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  listContent: {
    gap: 8,
  },
  historyItem: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  colorBar: {
    width: 4,
  },
  itemContent: {
    flex: 1,
    padding: 12,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: '60%',
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  timestamp: {
    fontSize: 11,
    color: COLORS.textDim,
  },
  queryText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text,
  },
});
