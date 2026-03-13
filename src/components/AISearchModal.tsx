import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  identifyMedia,
  GeminiMatch,
  GeminiModel,
  GEMINI_MODELS,
  GEMINI_MODEL_LABELS,
} from '../services/GeminiService';
import { FTPClient } from '../services/FTPClient';
import { COLORS } from '../constants';
import { Category } from '../types';

interface Props {
  visible:  boolean;
  query:    string;
  onClose:  () => void;
  onSelect: (match: GeminiMatch) => void;
}

const INDUSTRY_ICONS: Record<string, string> = {
  Hollywood:      '🎬',
  Bollywood:      '🎭',
  'South Indian': '🌴',
  Korean:         '🇰🇷',
  Japanese:       '🇯🇵',
  Chinese:        '🇨🇳',
  Anime:          '✨',
  Animation:      '🎨',
  Other:          '🌍',
};

export function AISearchModal({ visible, query, onClose, onSelect }: Props) {
  const [model,   setModel]   = useState<GeminiModel>(GEMINI_MODELS.FLASH);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GeminiMatch[]>([]);
  const [error,   setError]   = useState<string | null>(null);

  const runSearch = useCallback(async (q: string, m: GeminiModel) => {
    console.log('[AISearchModal] runSearch called with query:', q, 'model:', m);
    if (!q.trim()) {
      console.log('[AISearchModal] Empty query, skipping');
      return;
    }
    console.log('[AISearchModal] Starting search...');
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      console.log('[AISearchModal] Calling identifyMedia...');
      const matches = await identifyMedia(q.trim(), m);
      console.log('[AISearchModal] Got results:', matches.length, 'matches');
      setResults(matches);
      if (matches.length === 0) setError('No matches found. Try a different title.');
    } catch (e: any) {
      console.error('[AISearchModal] Error:', e);
      setError(e?.message || 'Failed to reach Gemini. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-search only when modal first opens — model switching does NOT re-trigger
  useEffect(() => {
    console.log('[AISearchModal] useEffect triggered - visible:', visible, 'query:', query);
    if (visible && query.trim()) {
      console.log('[AISearchModal] Conditions met, calling runSearch');
      runSearch(query, model);
    } else {
      console.log('[AISearchModal] Conditions not met - visible:', visible, 'query:', query.trim());
    }
  }, [visible, query, runSearch]);

  // Reset when closed
  useEffect(() => {
    if (!visible) {
      setResults([]);
      setError(null);
      setLoading(false);
    }
  }, [visible]);

  const handleModelSwitch = (m: GeminiModel) => {
    if (m !== model) setModel(m);
  };

  const getCategoryLabel = (cat: Category | null): string =>
    cat ? cat.name : 'Category not available';

  const getCategoryColor = (cat: Category | null): string =>
    cat ? cat.color : COLORS.textDim;

  const needsYear = (cat: Category | null): boolean =>
    cat ? FTPClient.categoryNeedsYear(cat) : false;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.aiIconWrap}>
                <MaterialIcons name="auto-awesome" size={18} color={COLORS.primary} />
              </View>
              <View>
                <Text style={styles.headerTitle}>AI Movie Finder</Text>
                <Text style={styles.headerSub} numberOfLines={1}>
                  "{query}"
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <MaterialIcons name="close" size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Model selector */}
          <View style={styles.modelRow}>
            <MaterialIcons name="psychology" size={13} color={COLORS.textDim} />
            <Text style={styles.modelLabel}>Model:</Text>
            {(Object.entries(GEMINI_MODELS) as [string, GeminiModel][]).map(([, id]) => (
              <TouchableOpacity
                key={id}
                style={[styles.modelChip, model === id && styles.modelChipActive]}
                onPress={() => handleModelSwitch(id)}
              >
                <Text style={[styles.modelChipText, model === id && styles.modelChipTextActive]}>
                  {GEMINI_MODEL_LABELS[id]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.divider} />

          {/* Body */}
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Loading */}
            {loading && (
              <View style={styles.centerState}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.stateText}>Asking Gemini…</Text>
              </View>
            )}

            {/* Error */}
            {!loading && error && (
              <View style={styles.centerState}>
                <View style={styles.errorIconWrap}>
                  <MaterialIcons name="error-outline" size={28} color={COLORS.error} />
                </View>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => runSearch(query, model)}
                >
                  <MaterialIcons name="refresh" size={15} color={COLORS.primary} />
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Results */}
            {!loading && !error && results.length > 0 && (
              <>
                <View style={styles.resultsHintRow}>
                  <Text style={styles.resultsHint}>
                    {results.length} match{results.length !== 1 ? 'es' : ''} found — tap to auto-fill
                  </Text>
                  <TouchableOpacity
                    style={styles.retryIconBtn}
                    onPress={() => runSearch(query, model)}
                  >
                    <MaterialIcons name="refresh" size={16} color={COLORS.primary} />
                  </TouchableOpacity>
                </View>
                {results.map((match, i) => {
                  const cat      = match.category;
                  const catColor = getCategoryColor(cat);
                  const icon     = INDUSTRY_ICONS[match.industry] ?? '🎬';
                  const hasYear  = needsYear(cat);
                  const canSelect = cat !== null;

                  return (
                    <TouchableOpacity
                      key={i}
                      style={[styles.card, !canSelect && styles.cardDisabled]}
                      onPress={() => canSelect && onSelect(match)}
                      activeOpacity={canSelect ? 0.7 : 1}
                    >
                      {/* Left accent bar */}
                      <View style={[styles.cardAccent, { backgroundColor: catColor }]} />

                      <View style={styles.cardBody}>
                        {/* Title row */}
                        <View style={styles.cardTitleRow}>
                          <Text style={styles.cardIcon}>{icon}</Text>
                          <Text style={styles.cardTitle} numberOfLines={2}>
                            {match.title}
                          </Text>
                          {canSelect && (
                            <MaterialIcons name="chevron-right" size={18} color={COLORS.textDim} />
                          )}
                        </View>

                        {/* Meta row */}
                        <View style={styles.metaRow}>
                          {match.year && (
                            <View style={styles.metaChip}>
                              <MaterialIcons name="calendar-today" size={11} color={COLORS.textSecondary} />
                              <Text style={styles.metaChipText}>{match.year}</Text>
                            </View>
                          )}
                          <View style={styles.metaChip}>
                            <Text style={styles.metaChipText}>{match.industry}</Text>
                          </View>
                          <View style={styles.metaChip}>
                            <MaterialIcons
                              name={match.type === 'tv_series' ? 'tv' : 'movie'}
                              size={11}
                              color={COLORS.textSecondary}
                            />
                            <Text style={styles.metaChipText}>
                              {match.type === 'tv_series' ? 'TV Series' : 'Movie'}
                            </Text>
                          </View>
                        </View>

                        {/* Category badge + year hint */}
                        <View style={styles.catRow}>
                          <View style={[styles.catBadge, { borderColor: catColor }]}>
                            <Text style={[styles.catBadgeText, { color: catColor }]}>
                              {getCategoryLabel(cat)}
                            </Text>
                          </View>
                          {canSelect && (
                            <Text style={styles.fillHint}>
                              {hasYear && match.year
                                ? `Sets year to ${match.year}`
                                : hasYear
                                ? 'Year unknown'
                                : 'No year needed'}
                            </Text>
                          )}
                          {!canSelect && (
                            <Text style={styles.unavailableText}>Not in library</Text>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    ...Platform.select({
      android: { elevation: 24 },
    }),
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  aiIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: 'rgba(61,127,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(61,127,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 0.2,
  },
  headerSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 1,
    fontStyle: 'italic',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Model selector ──
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 14,
  },
  modelLabel: {
    fontSize: 11,
    color: COLORS.textDim,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  modelChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  modelChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  modelChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 0.3,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  modelChipTextActive: {
    color: '#fff',
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 20,
  },

  // ── Body ──
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
    paddingTop: 12,
    gap: 10,
  },
  resultsHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  resultsHint: {
    fontSize: 11,
    color: COLORS.textDim,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  retryIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(61,127,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(61,127,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── States ──
  centerState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  stateText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  errorIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,77,106,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  retryText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
  },

  // ── Result card ──
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...Platform.select({ android: { elevation: 1 } }),
  },
  cardDisabled: {
    opacity: 0.5,
  },
  cardAccent: {
    width: 4,
    alignSelf: 'stretch',
  },
  cardBody: {
    flex: 1,
    padding: 12,
    gap: 6,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardIcon: {
    fontSize: 16,
    marginTop: 1,
  },
  cardTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.surface,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metaChipText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  catBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  catBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  fillHint: {
    fontSize: 10,
    color: COLORS.textDim,
    fontStyle: 'italic',
  },
  unavailableText: {
    fontSize: 10,
    color: COLORS.error,
    fontStyle: 'italic',
  },
});
