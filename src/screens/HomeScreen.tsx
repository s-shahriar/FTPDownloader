import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../contexts/AppContext';
import { CategoryDropdown } from '../components/CategoryDropdown';
import { ResultItem } from '../components/ResultItem';
import { FTPClient } from '../services/FTPClient';
import { showAlert } from '../components/AlertModal';
import { ErrorModal, ApiError } from '../components/ErrorModal';
import { AISearchModal } from '../components/AISearchModal';
import { GeminiMatch } from '../services/GeminiService';
import { parseApiError } from '../utils/errorHandler';
import { COLORS } from '../constants';
import { FTPItem } from '../types';

const Wrapper = Platform.OS === 'web' ? View : SafeAreaView;

export function HomeScreen({ navigation }: any) {
  const { selectedCategory, dispatch, categories } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [year, setYear] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchResults, setSearchResults] = useState<FTPItem[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [yearFocused, setYearFocused] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [aiModalVisible, setAiModalVisible] = useState(false);

  const needsYear = selectedCategory ? FTPClient.categoryNeedsYear(selectedCategory) : false;

  const handleAISelect = (match: GeminiMatch) => {
    setAiModalVisible(false);
    if (match.category) {
      dispatch({ type: 'SET_CATEGORY', payload: match.category });
    }
    if (match.year) {
      setYear(match.year);
    }
  };

  const handleSearch = async () => {
    if (!selectedCategory) {
      showAlert('Select Category', 'Please select a category first');
      return;
    }

    if (!searchQuery.trim()) {
      showAlert('Enter Search Term', 'Please enter a movie or series name');
      return;
    }

    if (needsYear && !year.trim()) {
      showAlert('Enter Year', 'This category requires a year to search (e.g. 2024)');
      return;
    }

    setIsLoading(true);
    setSearchResults([]);
    dispatch({ type: 'SET_SEARCH_QUERY', payload: searchQuery });

    try {
      const ftpClient = new FTPClient();

      console.log('=== SEARCH START ===');
      console.log('Category:', selectedCategory.name, `(${selectedCategory.type})`);
      console.log('Search Query:', searchQuery);
      if (needsYear) console.log('Year:', year);

      let filtered: FTPItem[];

      if (selectedCategory.type === 'movie_merged') {
        const { items: mergedItems, failedSources } = await ftpClient.searchMerged(selectedCategory, searchQuery, year.trim());
        filtered = mergedItems;
        console.log('Merged results:', filtered.length, 'Failed sources:', failedSources);
        if (failedSources.length > 0) {
          showAlert(
            'Partial Results',
            `Could not reach: ${failedSources.join(', ')}. Results shown may be incomplete.`,
          );
        }
      } else if (selectedCategory.type === 'movie_foreign') {
        filtered = await ftpClient.searchForeign(selectedCategory, searchQuery);
        console.log('Foreign results:', filtered.length);
      } else {
        const searchUrl = FTPClient.buildSearchUrl(
          selectedCategory,
          searchQuery,
          year.trim() || undefined,
        );
        console.log('Search URL:', searchUrl);

        const items = await ftpClient.fetchDirectory(searchUrl);
        console.log('Total items fetched:', items.length);

        filtered = items.filter((item: FTPItem) => {
          return item.type === 'folder' &&
            item.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
        });
      }

      console.log('Filtered results:', filtered.length);
      console.log('=== SEARCH END ===');

      if (filtered.length === 0) {
        const yearInfo = needsYear && year.trim() ? ` in ${year}` : '';
        showAlert('No Results', `No results found for "${searchQuery}"${yearInfo}`);
      } else {
        setSearchResults(filtered);
      }
    } catch (err: any) {
      console.error('Search error:', err);

      // Parse the error and show in error modal
      const searchUrl = selectedCategory.type === 'movie_merged' || selectedCategory.type === 'movie_foreign'
        ? selectedCategory.server + selectedCategory.path
        : FTPClient.buildSearchUrl(selectedCategory, searchQuery, year.trim() || undefined);

      const apiError = parseApiError(err, searchUrl);
      setError(apiError);
    } finally {
      setIsLoading(false);
    }
  };

  const handleItemPress = (item: FTPItem) => {
    if (item.type === 'folder') {
      navigation.navigate('SearchResults', {
        folderUrl: item.url,
        folderName: item.name,
        category: selectedCategory,
        query: searchQuery,
      });
    }
  };

  const handleDownload = (item: FTPItem) => {
    handleItemPress(item);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await handleSearch();
    setRefreshing(false);
  };

  const handleCategorySelect = (category: any) => {
    dispatch({ type: 'SET_CATEGORY', payload: category });
    setSearchResults([]);
    // Keep film name and year when category changes - don't reset them
  };

  return (
    <Wrapper style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          Platform.OS !== 'web' ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          ) : undefined
        }
      >
        {/* App bar */}
        <View style={styles.appbar}>
          <Text style={styles.appbarSubtitle}>Media Server</Text>
          <Text style={styles.appbarTitle}>FTP DOWNLOADER</Text>
          <View style={styles.connPill}>
            <View style={styles.connDot} />
            <Text style={styles.connText}>172.16.50.7 · Connected</Text>
          </View>
        </View>

        {/* Body */}
        <View style={styles.body}>
          {/* Category */}
          <Text style={styles.sectionLabel}>Browse by Category</Text>
          <CategoryDropdown
            categories={categories}
            selectedCategory={selectedCategory}
            onSelect={handleCategorySelect}
          />

          {/* Category type hint */}
          {selectedCategory && (
            <View style={styles.categoryHint}>
              <MaterialIcons
                name={selectedCategory.type === 'tv_series' || selectedCategory.type === 'korean_tv_series' || selectedCategory.type === 'anime_series' ? 'tv' : 'movie'}
                size={12}
                color={COLORS.textDim}
              />
              <Text style={styles.categoryHintText}>
                {selectedCategory.type === 'tv_series' && 'Auto-routes by first letter (A-L, M-R, S-Z)'}
                {selectedCategory.type === 'korean_tv_series' && 'Flat listing — no year needed'}
                {selectedCategory.type === 'movie_flat' && 'Flat listing — no year needed'}
                {selectedCategory.type === 'movie_with_year' && `Year required · format: ${selectedCategory.yearFormat === 'bare' ? 'YYYY' : selectedCategory.yearFormat === 'paren_1080p' ? '(YYYY) 1080p' : '(YYYY)'}`}
                {selectedCategory.type === 'movie_merged' && (
                  selectedCategory.mergedSources
                    ? `Searches ${selectedCategory.mergedSources.map(s => s.label).join(' + ')} together`
                    : 'Searches multiple sources together'
                )}
                {selectedCategory.type === 'movie_foreign' && 'Searches all language folders — no year needed'}
                {selectedCategory.type === 'anime_series' && 'Auto-routes by first letter (A-F, G-M, N-S, T-Z)'}
              </Text>
            </View>
          )}

          {/* Search */}
          <Text style={styles.sectionLabel}>Search Content</Text>
          <View style={styles.searchGroup}>
            <View style={styles.searchInputRow}>
              <View style={[styles.inputWrap, styles.inputWrapFlex, searchFocused && styles.inputFocused]}>
                <MaterialIcons name="live-tv" size={16} color={searchFocused ? COLORS.primary : COLORS.textDim} style={styles.inputIcon} />
                <TextInput
                  style={styles.fieldInput}
                  placeholder="Movie / Series name…"
                  placeholderTextColor={COLORS.textDim}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  onSubmitEditing={handleSearch}
                />
              </View>
              <TouchableOpacity
                style={styles.aiBtnInline}
                onPress={() => {
                  if (!searchQuery.trim()) {
                    showAlert('Enter a title', 'Type a movie or series name first');
                    return;
                  }
                  setAiModalVisible(true);
                }}
              >
                <MaterialIcons name="auto-awesome" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            {needsYear && (
              <View style={styles.yearRow}>
                <View style={[styles.yearInputWrap, yearFocused && styles.inputFocused]}>
                  <MaterialIcons name="calendar-today" size={16} color={yearFocused ? COLORS.primary : COLORS.textDim} style={styles.inputIcon} />
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="Year  (e.g. 2024)"
                    placeholderTextColor={COLORS.textDim}
                    value={year}
                    onChangeText={setYear}
                    keyboardType="numeric"
                    maxLength={4}
                    onFocus={() => setYearFocused(true)}
                    onBlur={() => setYearFocused(false)}
                    onSubmitEditing={handleSearch}
                  />
                </View>
                <TouchableOpacity
                  style={styles.searchBtn}
                  onPress={handleSearch}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <MaterialIcons name="search" size={22} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            )}

            {!needsYear && (
              <TouchableOpacity
                style={styles.searchFullButton}
                onPress={handleSearch}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <MaterialIcons name="search" size={20} color="#fff" />
                    <Text style={styles.searchFullButtonText}>Search</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <View style={styles.resultsContainer}>
              <Text style={styles.resultsTitle}>
                Found {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
              </Text>
              {searchResults.map((item, index) => (
                <ResultItem
                  key={`${item.name}-${index}`}
                  item={item}
                  onPress={handleItemPress}
                  onDownload={handleDownload}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom bar — Downloads CTA */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.downloadsCta}
          onPress={() => navigation.navigate('Downloads')}
        >
          <MaterialIcons name="download" size={20} color="#1a0e00" />
          <Text style={styles.downloadsCtaText}>My Downloads</Text>
        </TouchableOpacity>
      </View>

      {/* Error Modal */}
      <ErrorModal
        visible={error !== null}
        error={error}
        onClose={() => setError(null)}
      />

      {/* AI Search Modal */}
      <AISearchModal
        visible={aiModalVisible}
        query={searchQuery}
        onClose={() => setAiModalVisible(false)}
        onSelect={handleAISelect}
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
  scrollView: {
    flex: 1,
    ...Platform.select({
      web: {
        overflowY: 'auto' as any,
      },
    }),
  },

  // ── App bar ──
  appbar: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 16 : 12,
    paddingBottom: 20,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  appbarSubtitle: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: COLORS.accent,
    marginBottom: 4,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  appbarTitle: {
    fontSize: 30,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  connPill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: 'rgba(0,200,160,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,200,160,0.2)',
    borderRadius: 40,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  connDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.success,
    marginRight: 6,
  },
  connText: {
    fontSize: 10,
    color: '#00a080',
    fontWeight: '500',
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // ── Body ──
  body: {
    paddingVertical: 16,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: COLORS.textDim,
    marginHorizontal: 16,
    marginBottom: 8,
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  categoryHint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 2,
    marginBottom: 8,
    gap: 6,
  },
  categoryHintText: {
    fontSize: 11,
    color: COLORS.textDim,
    fontStyle: 'italic',
  },

  // ── Search ──
  searchGroup: {
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 10,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inputWrapFlex: {
    flex: 1,
  },
  aiBtnInline: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...Platform.select({
      web: { boxShadow: '0 4px 20px rgba(108,92,231,0.4)' as any },
      android: { elevation: 4 },
    }),
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
  },
  inputFocused: {
    borderColor: COLORS.primary,
    ...Platform.select({
      web: {
        boxShadow: '0 0 0 3px rgba(61,127,255,0.15)' as any,
      },
    }),
  },
  inputIcon: {
    marginRight: 10,
  },
  fieldInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 14,
    color: COLORS.text,
    ...Platform.select({
      web: { outlineStyle: 'none' } as any,
    }),
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  yearInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
  },
  searchBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 20px rgba(61,127,255,0.35)' as any,
      },
      android: { elevation: 4 },
    }),
  },
  searchFullButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 20px rgba(61,127,255,0.35)' as any,
      },
      android: { elevation: 4 },
    }),
  },
  searchFullButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },

  // ── Results ──
  resultsContainer: {
    marginVertical: 8,
  },
  resultsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginHorizontal: 16,
    marginBottom: 8,
    letterSpacing: 0.2,
  },

  // ── Bottom bar ──
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  downloadsCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 15,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 24px rgba(232,160,32,0.35)' as any,
      },
      android: { elevation: 6 },
    }),
  },
  downloadsCtaText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a0e00',
    letterSpacing: 0.3,
  },
});
