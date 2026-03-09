import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Category } from '../types';
import { COLORS } from '../constants';

interface CategoryDropdownProps {
  categories: Category[];
  selectedCategory: Category | null;
  onSelect: (category: Category) => void;
}

export function CategoryDropdown({
  categories,
  selectedCategory,
  onSelect,
}: CategoryDropdownProps) {
  const [isVisible, setIsVisible] = useState(false);

  const handleSelect = (category: Category) => {
    onSelect(category);
    setIsVisible(false);
  };

  const renderCategory = ({ item }: { item: Category }) => {
    const isSelected = selectedCategory?.id === item.id;
    return (
      <TouchableOpacity
        style={[styles.gridItem, isSelected && styles.gridItemSelected]}
        onPress={() => handleSelect(item)}
      >
        <View style={[styles.gridIcon, { backgroundColor: item.color + '18' }]}>
          <MaterialIcons
            name={item.icon as any}
            size={22}
            color={isSelected ? COLORS.primary : item.color}
          />
        </View>
        <Text
          style={[styles.gridText, isSelected && styles.gridTextSelected]}
          numberOfLines={2}
        >
          {item.name}
        </Text>
        {isSelected && (
          <View style={styles.checkMark}>
            <MaterialIcons name="check" size={12} color="#fff" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.categoryBtn}
        onPress={() => setIsVisible(true)}
      >
        <View style={styles.categoryLeft}>
          {selectedCategory ? (
            <View style={[styles.catIcon, { backgroundColor: selectedCategory.color + '18' }]}>
              <MaterialIcons
                name={selectedCategory.icon as any}
                size={18}
                color={selectedCategory.color}
              />
            </View>
          ) : (
            <View style={[styles.catIcon, { backgroundColor: 'rgba(232,160,32,0.12)' }]}>
              <MaterialIcons name="category" size={18} color={COLORS.accent} />
            </View>
          )}
          <View>
            <Text style={styles.catName}>
              {selectedCategory ? selectedCategory.name : 'Select Category'}
            </Text>
            <Text style={styles.catCount}>{categories.length} categories available</Text>
          </View>
        </View>
        <MaterialIcons name="expand-more" size={20} color={COLORS.textDim} />
      </TouchableOpacity>

      <Modal
        visible={isVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Category</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setIsVisible(false)}
              >
                <MaterialIcons name="close" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={categories}
              renderItem={renderCategory}
              keyExtractor={(item) => item.id}
              numColumns={2}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.listContainer}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 16,
  },

  // ── Trigger button (design-preview category-btn style) ──
  categoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)' as any,
      },
      android: { elevation: 1 },
    }),
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  catIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    lineHeight: 18,
    marginBottom: 1,
  },
  catCount: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // ── Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingBottom: 24,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    ...Platform.select({
      web: {
        boxShadow: '0 -10px 40px rgba(0,0,0,0.1)' as any,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: 0.2,
  },
  listContainer: {
    padding: 10,
  },
  gridRow: {
    gap: 8,
  },
  gridItem: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    minHeight: 100,
  },
  gridItemSelected: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(61,127,255,0.06)',
  },
  gridIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  gridText: {
    fontSize: 12,
    color: COLORS.text,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 17,
  },
  gridTextSelected: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  checkMark: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
