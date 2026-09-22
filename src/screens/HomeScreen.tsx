import React, { useRef, useState } from 'react';
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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../contexts/AppContext';
import { CategoryDropdown } from '../components/CategoryDropdown';
import { ResultItem } from '../components/ResultItem';
import { SearchHistorySection } from '../components/SearchHistorySection';
import { FTPClient, SearchInputError } from '../services/FTPClient';
import { showAlert } from '../components/AlertModal';
import { showToast } from '../components/Toast';
import { ErrorModal, ApiError } from '../components/ErrorModal';
import { AISearchModal } from '../components/AISearchModal';
import { GeminiMatch } from '../services/GeminiService';
import { parseApiError } from '../utils/errorHandler';
import { COLORS, SEARCH_CONFIG } from '../constants';
import { Category, FTPItem } from '../types';

const Wrapper = Platform.OS === 'web' ? View : SafeAreaView;

export function HomeScreen({ navigation }: any) {
  const { selectedCategory, dispatch, categories, searchHistory, saveSearchHistory, clearSearchHistory } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [year, setYear] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchResults, setSearchResults] = useState<FTPItem[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [yearFocused, setYearFocused] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [resultsTruncated, setResultsTruncated] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);

  const supportsYear = selectedCategory ? FTPClient.categorySupportsYear(selectedCategory) : false;

  const handleAISelect = (match: GeminiMatch) => {
    setAiModalVisible(false);
    if (match.category) {
      dispatch({ type: 'SET_CATEGORY', payload: match.category });
    }
    if (match.year) {
      setYear(match.year);
    }
  };

  /**
   * Run a search, cancelling any search still in flight.
   * Returns null when the search was cancelled or failed (errors are already shown).
   */
  const runSearch = async (category: Category, query: string, searchYear: string): Promise<FTPItem[] | null> => {
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setIsLoading(true);
    setSearchResults([]);
    setResultsTruncated(false);

    try {
      console.log('=== SEARCH START ===', category.name, `(${category.type})`, query, searchYear || '(no year)');
      const outcome = await new FTPClient().search(category, query, searchYear, controller.signal);
      console.log('=== SEARCH END ===', outcome.items.length, 'results',
        outcome.failedSources.length ? `failed: ${outcome.failedSources.join(', ')}` : '',
        outcome.usedFallback ? '(folder listing fallback)' : '');

      if (outcome.failedSources.length > 0) {
        // Non-blocking: a server down for maintenance would otherwise interrupt every search
        showToast(`Partial results: couldn't reach ${outcome.failedSources.join(', ')}`);
      }
      setResultsTruncated(outcome.truncated);
      return outcome.items;
    } catch (err: any) {
      if (err.name === 'AbortError') return null;
      if (err instanceof SearchInputError) {
        showAlert('Refine Search', err.message);
        return null;
      }
      console.error('Search error:', err);
      setError(parseApiError(err, err.endpoint || category.server + category.path));
      return null;
    } finally {
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null;
        setIsLoading(false);
      }
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

    dispatch({ type: 'SET_SEARCH_QUERY', payload: searchQuery });
    const searchYear = supportsYear ? year.trim() : '';
    const items = await runSearch(selectedCategory, searchQuery, searchYear);
    if (!items) return;

    if (items.length === 0) {
      const yearInfo = searchYear ? ` in ${searchYear}` : '';
      showAlert('No Results', `No results found for "${searchQuery}"${yearInfo}`);
    } else {
      setSearchResults(items);
      await saveSearchHistory(searchQuery, selectedCategory.name);
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
    if (item.type === 'folder') {
      handleItemPress(item);
      return;
    }
    // A loose file matched by search: open its folder, where it can be downloaded
    const folderUrl = item.url.slice(0, item.url.lastIndexOf('/') + 1);
    navigation.navigate('SearchResults', {
      folderUrl,
      folderName: decodeURIComponent(folderUrl.split('/').filter(Boolean).pop() || item.name),
      category: selectedCategory,
      query: searchQuery,
    });
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

  const handleHistorySelect = async (item: any) => {
    const category = categories.find(c => c.name === item.category);
    if (!category) return;

    // Set the category and query
    dispatch({ type: 'SET_CATEGORY', payload: category });
    setSearchQuery(item.query);
    setYear('');

    // History doesn't store a year; the search doesn't need one
    const items = await runSearch(category, item.query, '');
    if (!items) return;

    if (items.length === 0) {
      showAlert('No Results', `No results found for "${item.query}"`);
    } else if (items.length === 1 && items[0].type === 'folder') {
      // Single result - navigate directly to folder contents
      navigation.navigate('SearchResults', {
        folderUrl: items[0].url,
        folderName: items[0].name,
        category: category,
        query: item.query,
      });
    } else {
      // Multiple results - show them on home screen for selection
      setSearchResults(items);
    }
  };

  const handleClearHistory = () => {
    showAlert(
      'Clear History',
      'Delete all search history?',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', onPress: clearSearchHistory },
      ]
    );
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
                name={selectedCategory.type === 'all' ? 'apps' : selectedCategory.type === 'tv_series' || selectedCategory.type === 'korean_tv_series' || selectedCategory.type === 'anime_series' ? 'tv' : 'movie'}
                size={12}
                color={COLORS.textDim}
              />
              <Text style={styles.categoryHintText}>
                {selectedCategory.type === 'all' && 'Searches every DhakaFlix server · year optional'}
                {(selectedCategory.type === 'tv_series' || selectedCategory.type === 'anime_series') && 'Searches every letter group — no year needed'}
                {(selectedCategory.type === 'korean_tv_series' || selectedCategory.type === 'movie_flat') && 'Searches all titles — no year needed'}
                {selectedCategory.type === 'movie_with_year' && 'Searches all years · year optional, narrows the search'}
                {selectedCategory.type === 'movie_merged' && (
                  selectedCategory.mergedSources
                    ? `Searches ${selectedCategory.mergedSources.map(s => s.label).join(' + ')} together · year optional`
                    : 'Searches multiple sources together · year optional'
                )}
                {selectedCategory.type === 'movie_foreign' && 'Searches all language folders — no year needed'}
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
              {searchHistory.length > 0 && (
                <TouchableOpacity
                  style={styles.historyBtnInline}
                  onPress={() => setHistoryModalVisible(true)}
                >
                  <MaterialIcons name="history" size={20} color="#fff" />
                </TouchableOpacity>
              )}
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

            {supportsYear && (
              <View style={styles.yearRow}>
                <View style={[styles.yearInputWrap, yearFocused && styles.inputFocused]}>
                  <MaterialIcons name="calendar-today" size={16} color={yearFocused ? COLORS.primary : COLORS.textDim} style={styles.inputIcon} />
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="Year (optional)"
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

            {!supportsYear && (
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
                {resultsTruncated
                  ? `Showing top ${searchResults.length} results — refine your search`
                  : `Found ${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`}
              </Text>
              {searchResults.map((item, index) => (
                <ResultItem
                  key={item.url}
                  item={item}
                  onPress={handleItemPress}
                  onDownload={handleDownload}
                  showPoster={index < SEARCH_CONFIG.MAX_POSTERS}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.downloadsCta}
          onPress={() => navigation.navigate('Downloads')}
        >
          <MaterialIcons name="download" size={20} color="#1a0e00" />
          <Text style={styles.downloadsCtaText}>My Downloads</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.srtCta}
          onPress={() => navigation.navigate('SRTConverter')}
        >
          <MaterialIcons name="translate" size={20} color="#fff" />
          <Text style={styles.srtCtaText}>SRT Converter</Text>
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

      {/* Search History Modal */}
      <Modal
        visible={historyModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setHistoryModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setHistoryModalVisible(false)}
        >
          <View style={styles.historyModal}>
            <TouchableOpacity activeOpacity={1}>
              <View style={styles.historyModalHeader}>
                <Text style={styles.historyModalTitle}>Recent Searches</Text>
                <TouchableOpacity onPress={() => setHistoryModalVisible(false)}>
                  <MaterialIcons name="close" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </View>
              <SearchHistorySection
                history={searchHistory}
                onSelect={(item) => {
                  setHistoryModalVisible(false);
                  handleHistorySelect(item);
                }}
                onClear={() => {
                  handleClearHistory();
                  setHistoryModalVisible(false);
                }}
                categories={categories}
              />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    ...Platform.select({
      web: { height: '100vh' as any, maxHeight: '100vh' as any },
    }),
  },
  scrollView: {
    flex: 1,
    ...Platform.select({ web: { overflowY: 'auto' as any } }),
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
    ...Platform.select({
      web: { boxShadow: '0 4px 30px rgba(99,102,241,0.14)' as any },
      android: { elevation: 4 },
    }),
  },
  appbarSubtitle: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: COLORS.primaryStrong,
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
    backgroundColor: 'rgba(129,140,248,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(129,140,248,0.26)',
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
    color: COLORS.primaryStrong,
    fontWeight: '500',
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // ── Body ──
  body: { paddingVertical: 16 },
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
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },

  // ── Search ──
  searchGroup: { marginHorizontal: 16, marginBottom: 12, gap: 10 },
  searchInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inputWrapFlex: { flex: 1 },
  historyBtnInline: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...Platform.select({
      web: { boxShadow: '0 4px 20px rgba(99,102,241,0.22)' as any },
      android: { elevation: 3 },
    }),
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
      web: { boxShadow: '0 4px 22px rgba(167,139,250,0.42)' as any },
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
      web: { boxShadow: '0 0 0 3px rgba(129,140,248,0.18)' as any },
    }),
  },
  inputIcon: { marginRight: 10 },
  fieldInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 14,
    color: COLORS.text,
    ...Platform.select({ web: { outlineStyle: 'none' } as any }),
  },
  yearRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
      web: { boxShadow: '0 4px 22px rgba(129,140,248,0.45)' as any },
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
      web: { boxShadow: '0 4px 22px rgba(129,140,248,0.45)' as any },
      android: { elevation: 4 },
    }),
  },
  searchFullButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.onPrimary,
    letterSpacing: 0.3,
  },

  // ── History ──
  historySection: { marginHorizontal: 16, marginTop: 4 },

  // ── Results ──
  resultsContainer: { marginVertical: 8 },
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
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
    ...Platform.select({
      web: { boxShadow: '0 -4px 24px rgba(99,102,241,0.12)' as any },
    }),
  },
  downloadsCta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 15,
    ...Platform.select({
      web: { boxShadow: '0 4px 26px rgba(232,160,32,0.46)' as any },
      android: { elevation: 6 },
    }),
  },
  downloadsCtaText: { fontSize: 14, fontWeight: '700', color: COLORS.onAccent, letterSpacing: 0.3 },
  srtCta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.secondary,
    borderRadius: 12,
    paddingVertical: 15,
    ...Platform.select({
      web: { boxShadow: '0 4px 26px rgba(167,139,250,0.42)' as any },
      android: { elevation: 6 },
    }),
  },
  srtCtaText: { fontSize: 14, fontWeight: '700', color: COLORS.onPrimary, letterSpacing: 0.3 },

  // ── History Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  historyModal: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    ...Platform.select({
      web: { boxShadow: '0 -12px 50px rgba(99,102,241,0.18)' as any },
    }),
  },
  historyModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  historyModalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },
});
