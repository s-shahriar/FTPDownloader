import { Platform } from 'react-native';
import { VIDEO_EXTENSIONS, SUBTITLE_EXTENSIONS, TV_ALPHA_GROUPS, ANIME_ALPHA_GROUPS, SEARCH_CONFIG } from '../constants';
import { FTPItem, Category, YearFormat, SearchScope } from '../types';

const LOCAL_PROXY = 'http://localhost:3001/proxy?url=';

const IMAGE_EXTENSION_RE = /\.(jpe?g|png|webp)$/i;
const YEAR_RE = /^\d{4}$/;

export interface SearchOutcome {
  items: FTPItem[];
  failedSources: string[]; // human-readable, e.g. "172.16.50.9 (Anime & Cartoon)"
  truncated: boolean;      // more than SEARCH_CONFIG.MAX_RESULTS matches
  usedFallback: boolean;   // h5ai search was unavailable, folder listing was used
}

interface SearchHit {
  href: string;         // URL-encoded path as returned by h5ai
  time?: number;        // ms since epoch
  size?: number | null; // bytes, null for folders
}

/** Thrown for input the search can't run with; shown as an alert, not an error modal. */
export class SearchInputError extends Error {
  name = 'SearchInputError';
}

/** The server answered, but not with h5ai search JSON (search disabled or not h5ai). */
class SearchUnsupportedError extends Error {
  name = 'SearchUnsupportedError';
}

// Servers that failed recently → timestamp of the failure
const deadServers = new Map<string, number>();

// Folder URL → poster URL lookup, shared across screens
const posterCache = new Map<string, Promise<string | null>>();
const posterQueue: Array<() => void> = [];
let activePosterFetches = 0;

export class FTPClient {
  private getProxiedUrl(url: string): string {
    if (Platform.OS === 'web') {
      return `${LOCAL_PROXY}${encodeURIComponent(url)}`;
    }
    return url;
  }

  /**
   * Encode a single path segment, preserving parentheses which are valid in URLs
   * and expected by the h5ai servers.
   */
  static encodeSegment(segment: string): string {
    return encodeURIComponent(segment)
      .replace(/%28/g, '(')
      .replace(/%29/g, ')');
  }

  /**
   * Build a full URL from server, base path, and optional extra path segments.
   * Each segment is properly encoded.
   *
   * Example: buildUrl('http://172.16.50.7', '/DHAKA-FLIX-7/English Movies', '(2025)')
   *   → 'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/(2025)/'
   */
  static buildUrl(server: string, basePath: string, ...segments: string[]): string {
    const baseParts = basePath.split('/').filter(Boolean);
    const allParts = [...baseParts, ...segments];
    const encoded = allParts.map(p => FTPClient.encodeSegment(p)).join('/');
    let url = `${server}/${encoded}`;
    if (!url.endsWith('/')) url += '/';
    return url;
  }

  /**
   * Get the TV Series alpha group folder name based on the first character of the search query.
   *
   * Mappings:
   *   0-9 → TV Series ★  0  —  9
   *   A-L → TV Series ♥  A  —  L
   *   M-R → TV Series ♦  M  —  R
   *   S-Z → TV Series ♦  S  —  Z
   */
  static getTVSeriesAlphaGroup(searchQuery: string): string {
    const firstChar = searchQuery.trim()[0]?.toUpperCase() || 'A';
    if (firstChar >= '0' && firstChar <= '9') return TV_ALPHA_GROUPS['0-9'];
    if (firstChar >= 'A' && firstChar <= 'L') return TV_ALPHA_GROUPS['A-L'];
    if (firstChar >= 'M' && firstChar <= 'R') return TV_ALPHA_GROUPS['M-R'];
    return TV_ALPHA_GROUPS['S-Z'];
  }

  /**
   * Get the Anime & Cartoon alpha group folder name.
   *
   * Mappings:
   *   0-9 → Anime-TV Series ★  0  —  9
   *   A-F → Anime-TV Series ♥  A  —  F
   *   G-M → Anime-TV Series ♥  G  —  M
   *   N-S → Anime-TV Series ♦  N  —  S
   *   T-Z → Anime-TV Series ♦  T  —  Z
   */
  static getAnimeAlphaGroup(searchQuery: string): string {
    const firstChar = searchQuery.trim()[0]?.toUpperCase() || 'A';
    if (firstChar >= '0' && firstChar <= '9') return ANIME_ALPHA_GROUPS['0-9'];
    if (firstChar >= 'A' && firstChar <= 'F') return ANIME_ALPHA_GROUPS['A-F'];
    if (firstChar >= 'G' && firstChar <= 'M') return ANIME_ALPHA_GROUPS['G-M'];
    if (firstChar >= 'N' && firstChar <= 'S') return ANIME_ALPHA_GROUPS['N-S'];
    return ANIME_ALPHA_GROUPS['T-Z'];
  }

  /**
   * Build the year folder name based on year format.
   *
   * - paren: (2025)
   * - paren_1080p: (2025) 1080p
   * - bare: 2025
   */
  static getYearFolder(yearFormat: YearFormat | undefined, year: string): string {
    switch (yearFormat) {
      case 'paren_1080p':
        return `(${year}) 1080p`;
      case 'bare':
        return year;
      case 'paren':
      default:
        return `(${year})`;
    }
  }

  /**
   * Check if a category offers the (optional) year input.
   * A year narrows the search to year folders and ranks matching titles first.
   */
  static categorySupportsYear(category: Category): boolean {
    return category.type === 'movie_with_year' || category.type === 'movie_merged' || category.type === 'all';
  }

  /**
   * The folders a category searches. Explicit `searchScopes` win; otherwise the
   * scopes come from the same config the folder-listing search uses.
   */
  static getSearchScopes(category: Category): SearchScope[] {
    if (category.searchScopes?.length) return category.searchScopes;
    if (category.mergedSources?.length) {
      return category.mergedSources.map(source => ({
        server: source.server,
        path: source.path,
        yearFormat: source.yearFormat,
        label: source.label,
      }));
    }
    return [{
      server: category.server,
      path: category.path,
      yearFormat: category.type === 'movie_with_year' ? category.yearFormat : undefined,
      labelFromSubfolder: category.type === 'movie_foreign',
    }];
  }

  /**
   * Turn the user's query into an h5ai search pattern.
   *
   * h5ai treats the pattern as a regex, so the query is reduced to letters and
   * digits and an optional separator is allowed between every character:
   * "spiderman" matches "Spider-Man", "xmen" matches "X-Men",
   * "oceans eleven" matches "Ocean's Eleven".
   * Returns null when the query is too short to search.
   */
  static buildSearchPattern(query: string, hasYear: boolean): string | null {
    const words = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const charCount = words.join('').length;
    const minChars = hasYear ? SEARCH_CONFIG.MIN_QUERY_CHARS_WITH_YEAR : SEARCH_CONFIG.MIN_QUERY_CHARS;
    if (charCount < minChars) return null;
    return words
      .map(word => Array.from(word).join('[^a-z0-9]?'))
      .join('[^a-z0-9]*');
  }

  /**
   * Search a category with the h5ai search API: one request per scope, in parallel.
   * Each request searches every subfolder of its scope on the server.
   *
   * - A year narrows year-folder scopes; if that finds nothing, the whole scope is searched.
   * - Unreachable servers are reported in `failedSources` instead of failing the search,
   *   unless every scope fails.
   * - If the servers don't support search, falls back to the folder-listing search.
   */
  async search(category: Category, query: string, year?: string, signal?: AbortSignal): Promise<SearchOutcome> {
    const trimmedYear = year?.trim() || '';
    if (trimmedYear && !YEAR_RE.test(trimmedYear)) {
      throw new SearchInputError('Year must be 4 digits, e.g. 2024');
    }

    const pattern = FTPClient.buildSearchPattern(query, !!trimmedYear);
    if (!pattern) {
      throw new SearchInputError(
        `Type at least ${SEARCH_CONFIG.MIN_QUERY_CHARS} letters or digits` +
        (FTPClient.categorySupportsYear(category) ? ', or add a year for shorter titles' : ''),
      );
    }

    const scopes = FTPClient.getSearchScopes(category);
    let outcome = await this.searchScopes(category, scopes, pattern, query, trimmedYear, true, signal);

    const narrowedByYear = !!trimmedYear && scopes.some(scope => scope.yearFormat && scope.yearFormat !== 'none');
    if (narrowedByYear && outcome.items.length === 0 && !outcome.usedFallback) {
      console.log('[Search] Nothing in year folders, searching whole category');
      outcome = await this.searchScopes(category, scopes, pattern, query, trimmedYear, false, signal);
    }

    return outcome;
  }

  private async searchScopes(
    category: Category,
    scopes: SearchScope[],
    pattern: string,
    query: string,
    year: string,
    useYearFolders: boolean,
    signal?: AbortSignal,
  ): Promise<SearchOutcome> {
    const settled = await Promise.allSettled(scopes.map(async scope => {
      const searchPath = useYearFolders && year && scope.yearFormat && scope.yearFormat !== 'none'
        ? `${scope.path.replace(/\/+$/, '')}/${FTPClient.getYearFolder(scope.yearFormat, year)}/`
        : scope.path;
      const hits = await this.searchScope(scope.server, searchPath, pattern, signal);
      return FTPClient.collapseHits(hits, scope, category);
    }));

    if (signal?.aborted) {
      throw FTPClient.abortError();
    }

    const items: FTPItem[] = [];
    const failedSources: string[] = [];
    const failures: any[] = [];
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        items.push(...result.value);
      } else {
        const scope = scopes[index];
        const host = scope.server.replace(/^https?:\/\//, '');
        const what = scope.label ? `${category.name} ${scope.label}` : category.name;
        failedSources.push(category.type === 'all' ? host : `${host} (${what})`);
        failures.push(result.reason);
      }
    });

    if (failures.length === scopes.length) {
      if (failures.every(error => error instanceof SearchUnsupportedError)) {
        console.warn('[Search] h5ai search unavailable, falling back to folder listing');
        const legacy = await this.legacySearch(category, query, year);
        return { ...legacy, truncated: false, usedFallback: true };
      }
      throw failures.find(error => !(error instanceof SearchUnsupportedError)) ?? failures[0];
    }

    const ranked = FTPClient.rankResults(items, query, year);
    return {
      items: ranked.slice(0, SEARCH_CONFIG.MAX_RESULTS),
      failedSources,
      truncated: ranked.length > SEARCH_CONFIG.MAX_RESULTS,
      usedFallback: false,
    };
  }

  /** POST one h5ai search request. */
  private async searchScope(server: string, path: string, pattern: string, signal?: AbortSignal): Promise<SearchHit[]> {
    const failedAt = deadServers.get(server);
    if (failedAt && Date.now() - failedAt < SEARCH_CONFIG.DEAD_SERVER_TTL_MS) {
      const error: any = new Error(`Network request failed (skipping ${server}, it failed moments ago)`);
      error.endpoint = server;
      throw error;
    }

    const segments = path.split('/').filter(Boolean);
    const endpoint = `${server}/${FTPClient.encodeSegment(segments[0])}/`;
    const href = `/${segments.map(segment => FTPClient.encodeSegment(segment)).join('/')}/`;

    console.log('[Search] POST', endpoint, 'href:', decodeURIComponent(href));
    let response: Response;
    try {
      response = await this.fetchWithTimeout(this.getProxiedUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get', search: { href, pattern, ignorecase: true } }),
      }, SEARCH_CONFIG.REQUEST_TIMEOUT_MS, signal);
    } catch (error: any) {
      if (!signal?.aborted) {
        deadServers.set(server, Date.now());
      }
      error.endpoint = endpoint;
      throw error;
    }
    deadServers.delete(server);

    if (!response.ok) {
      // 404/405/403: the endpoint doesn't take h5ai API calls
      if ([403, 404, 405].includes(response.status)) {
        throw new SearchUnsupportedError(`Search not available on ${server} (HTTP ${response.status})`);
      }
      const error: any = new Error(`Search failed: HTTP ${response.status}`);
      error.status = response.status;
      error.endpoint = endpoint;
      throw error;
    }

    let json: any;
    try {
      json = await response.json();
    } catch {
      throw new SearchUnsupportedError(`Search response from ${server} is not JSON`);
    }
    if (!Array.isArray(json?.search)) {
      throw new SearchUnsupportedError(`Search disabled on ${server}`);
    }
    return json.search;
  }

  /**
   * Reduce raw hits to one result per title.
   *
   * h5ai matches files as well as folders, so "breaking bad" returns the show folder
   * plus every episode file. Each hit is replaced by its topmost matched ancestor
   * folder; a file whose folders don't match is kept as a downloadable file.
   */
  static collapseHits(hits: SearchHit[], scope: SearchScope, category: Category): FTPItem[] {
    const scopeHref = `/${scope.path.split('/').filter(Boolean).map(s => FTPClient.encodeSegment(s)).join('/')}/`;
    const scopeDepth = scopeHref.split('/').filter(Boolean).length;
    const exclude = new Set((category.excludeSubfolders || []).map(name => name.toLowerCase()));
    const byHref = new Map<string, SearchHit>();
    for (const hit of hits) {
      if (typeof hit?.href === 'string') byHref.set(FTPClient.canonicalHref(hit.href), hit);
    }

    const results = new Map<string, FTPItem>();
    for (const [href, hit] of byHref) {
      const parts = href.split('/').filter(Boolean);
      const isFolder = href.endsWith('/');

      // Excluded subfolders (e.g. languages that have their own category)
      const firstBelowScope = parts[scopeDepth] ? FTPClient.safeDecode(parts[scopeDepth]) : '';
      if (exclude.has(firstBelowScope.toLowerCase())) continue;

      let chosen: string | null = null;
      const maxDepth = isFolder ? parts.length : parts.length - 1;
      for (let depth = scopeDepth + 1; depth <= maxDepth; depth++) {
        const ancestor = `/${parts.slice(0, depth).join('/')}/`;
        if (byHref.has(ancestor)) {
          chosen = ancestor;
          break;
        }
      }
      const key = chosen ?? href;
      if (results.has(key)) continue;

      const chosenHit = byHref.get(key)!;
      const chosenIsFolder = key.endsWith('/');
      const name = FTPClient.safeDecode(key.split('/').filter(Boolean).pop() || '');
      const sizeBytes = typeof chosenHit.size === 'number' ? chosenHit.size : undefined;

      results.set(key, {
        name,
        type: chosenIsFolder ? 'folder' : 'file',
        path: key,
        url: `${scope.server}${key}`,
        sourceLabel: scope.label ?? (scope.labelFromSubfolder ? firstBelowScope || undefined : undefined),
        sizeBytes: chosenIsFolder ? undefined : sizeBytes,
        size: !chosenIsFolder && sizeBytes !== undefined ? FTPClient.formatBytes(sizeBytes) : undefined,
        modified: chosenHit.time ? new Date(chosenHit.time) : undefined,
      });
    }

    // Hidden or non-media files that happen to match aren't useful results
    return [...results.values()].filter(item => item.type === 'folder' || FTPClient.isMediaFile(item.name));
  }

  /**
   * Order results: year matches, then exact titles, then titles starting with the query
   * (ignoring a leading "The"), then folders before loose files, then by name.
   */
  static rankResults(items: FTPItem[], query: string, year: string): FTPItem[] {
    const compact = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const q = compact(query);
    const score = (item: FTPItem) => {
      const name = compact(item.name);
      // Folder names look like "Title (2014) 720p [Dual Audio]"
      const title = compact(item.name.split(' (')[0]);
      let value = 0;
      if (year && item.name.includes(year)) value += 8;
      if (title === q || title === `the${q}`) value += 4;
      if (name.startsWith(q) || name.startsWith(`the${q}`)) value += 2;
      if (item.type === 'folder') value += 1;
      return value;
    };
    return items
      .map(item => ({ item, score: score(item) }))
      .sort((a, b) =>
        b.score - a.score ||
        a.item.name.localeCompare(b.item.name) ||
        (a.item.sourceLabel || '').localeCompare(b.item.sourceLabel || ''))
      .map(entry => entry.item);
  }

  /**
   * Search by listing the category's folders and filtering by name.
   * Used only when the h5ai search API is unavailable; needs a year for year-folder categories.
   */
  private async legacySearch(category: Category, query: string, year: string): Promise<{ items: FTPItem[]; failedSources: string[] }> {
    const filterByName = (items: FTPItem[]) => items.filter(item =>
      item.type === 'folder' && item.name.toLowerCase().includes(query.toLowerCase().trim()));

    switch (category.type) {
      case 'all':
        throw new SearchInputError('Search across all categories is not available on this server. Pick a category.');
      case 'movie_merged':
      case 'movie_with_year':
        if (!year) {
          throw new SearchInputError('Search is not available on this server right now. Add a year to browse that year folder.');
        }
        if (category.type === 'movie_merged') {
          return this.searchMerged(category, query, year);
        }
        break;
      case 'movie_foreign':
        return { items: await this.searchForeign(category, query), failedSources: [] };
    }

    const url = FTPClient.buildSearchUrl(category, query, year || undefined);
    return { items: filterByName(await this.fetchDirectory(url)), failedSources: [] };
  }

  /**
   * Find the poster image in a title folder.
   *
   * DhakaFlix folders carry the poster as "a_AL_.jpg" (sometimes an extra "a_VL_.jpg",
   * or an arbitrary .jpg on older uploads). The folder's HTML listing is a few KB,
   * so it's the cheapest lookup. Results are cached; lookups run a few at a time.
   */
  static findPoster(folderUrl: string): Promise<string | null> {
    const cached = posterCache.get(folderUrl);
    if (cached) return cached;

    const lookup = new Promise<string | null>((resolve) => {
      posterQueue.push(async () => {
        try {
          const items = await new FTPClient().fetchDirectory(folderUrl, SEARCH_CONFIG.POSTER_TIMEOUT_MS);
          resolve(FTPClient.pickPoster(items));
        } catch {
          posterCache.delete(folderUrl); // allow a retry later
          resolve(null);
        } finally {
          activePosterFetches--;
          FTPClient.drainPosterQueue();
        }
      });
      FTPClient.drainPosterQueue();
    });
    posterCache.set(folderUrl, lookup);
    return lookup;
  }

  private static drainPosterQueue() {
    while (activePosterFetches < SEARCH_CONFIG.POSTER_CONCURRENCY && posterQueue.length > 0) {
      activePosterFetches++;
      posterQueue.shift()!();
    }
  }

  /** Pick the poster from a folder listing: "a_AL_" first, then any image. */
  static pickPoster(items: FTPItem[]): string | null {
    const images = items.filter(item => item.type === 'file' && IMAGE_EXTENSION_RE.test(item.name));
    const poster = images.find(item => /^a_AL_/i.test(item.name)) ?? images[0];
    return poster?.url ?? null;
  }

  static formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit++;
    }
    return `${value.toFixed(unit >= 3 ? 2 : unit === 0 ? 0 : 1)} ${units[unit]}`;
  }

  /** Normalise an h5ai href so the same path always has the same spelling. */
  private static canonicalHref(href: string): string {
    const isFolder = href.endsWith('/');
    const parts = href.split('/').filter(Boolean).map(part => FTPClient.encodeSegment(FTPClient.safeDecode(part)));
    return `/${parts.join('/')}${isFolder ? '/' : ''}`;
  }

  private static safeDecode(text: string): string {
    try {
      return decodeURIComponent(text);
    } catch {
      return text;
    }
  }

  private static abortError(): Error {
    const error = new Error('Search cancelled');
    error.name = 'AbortError';
    return error;
  }

  /**
   * fetch with a timeout that also follows an outer abort signal.
   * A timeout surfaces as "Request timeout" so the error modal classifies it.
   */
  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onOuterAbort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', onOuterAbort);

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error: any) {
      if (timedOut) {
        const timeoutError: any = new Error(`Request timeout after ${timeoutMs / 1000}s`);
        timeoutError.code = 'ETIMEDOUT';
        throw timeoutError;
      }
      if (signal?.aborted) throw FTPClient.abortError();
      throw error;
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onOuterAbort);
    }
  }

  /**
   * Build the search URL for a given category, search query, and optional year.
   * For movie_merged categories, use buildSearchUrlsForMerged instead.
   */
  static buildSearchUrl(category: Category, searchQuery: string, year?: string): string {
    switch (category.type) {
      case 'movie_with_year': {
        if (!year) throw new Error('Year is required for this category');
        const yearFolder = FTPClient.getYearFolder(category.yearFormat, year);
        return FTPClient.buildUrl(category.server, category.path, yearFolder);
      }
      case 'tv_series': {
        const alphaGroup = FTPClient.getTVSeriesAlphaGroup(searchQuery);
        return FTPClient.buildUrl(category.server, category.path, alphaGroup);
      }
      case 'anime_series': {
        const animeGroup = FTPClient.getAnimeAlphaGroup(searchQuery);
        return FTPClient.buildUrl(category.server, category.path, animeGroup);
      }
      case 'movie_flat':
      case 'korean_tv_series':
      case 'movie_foreign':
        return FTPClient.buildUrl(category.server, category.path);
      case 'movie_merged':
        // Fallback: use the primary source
        return FTPClient.buildUrl(category.server, category.path, FTPClient.getYearFolder(category.yearFormat, year || ''));
      default:
        return FTPClient.buildUrl(category.server, category.path);
    }
  }

  /**
   * For merged categories (e.g. English Movies, South Indian Movies), search all sources
   * in parallel and return combined results tagged with their source label.
   * Partial failures are reported via failedSources so the caller can warn the user.
   */
  async searchMerged(
    category: Category,
    searchQuery: string,
    year: string,
  ): Promise<{ items: FTPItem[]; failedSources: string[] }> {
    if (!category.mergedSources || category.mergedSources.length === 0) {
      throw new Error('No merged sources defined for this category');
    }

    const query = searchQuery.toLowerCase().trim();

    const searches = category.mergedSources.map(async (source) => {
      let url: string;
      if (source.yearFormat === 'none') {
        url = FTPClient.buildUrl(source.server, source.path);
      } else {
        const yearFolder = FTPClient.getYearFolder(source.yearFormat, year);
        url = FTPClient.buildUrl(source.server, source.path, yearFolder);
      }

      try {
        console.log(`[${source.label}] Searching: ${url}`);
        const items = await this.fetchDirectory(url);
        const matched = items
          .filter(item => item.type === 'folder' && item.name.toLowerCase().includes(query))
          .map(item => ({ ...item, sourceLabel: source.label }));
        return { items: matched, failed: false, label: source.label };
      } catch (error) {
        console.warn(`[${source.label}] Search failed:`, error);
        return { items: [], failed: true, label: source.label };
      }
    });

    const results = await Promise.all(searches);
    return {
      items: results.flatMap(r => r.items),
      failedSources: results.filter(r => r.failed).map(r => r.label),
    };
  }

  /**
   * For foreign language categories: discover all language subfolders,
   * exclude the ones already covered by dedicated categories, then search
   * each remaining subfolder for the query in parallel.
   * Results are tagged with the language name as sourceLabel.
   */
  async searchForeign(category: Category, searchQuery: string): Promise<FTPItem[]> {
    const exclude = new Set((category.excludeSubfolders || []).map(s => s.toLowerCase()));
    const query = searchQuery.toLowerCase().trim();

    // 1. Fetch top-level language folders
    const parentUrl = FTPClient.buildUrl(category.server, category.path);
    console.log('[Foreign] Fetching language folders:', parentUrl);
    const languageFolders = await this.fetchDirectory(parentUrl);

    const folders = languageFolders.filter(
      item => item.type === 'folder' && !exclude.has(item.name.toLowerCase()),
    );
    console.log(`[Foreign] Searching ${folders.length} language folders (excluded ${exclude.size})`);

    // 2. Search each language folder in parallel
    const searches = folders.map(async (folder) => {
      try {
        const items = await this.fetchDirectory(folder.url);
        return items
          .filter(item => item.type === 'folder' && item.name.toLowerCase().includes(query))
          .map(item => ({
            ...item,
            sourceLabel: folder.name,
          }));
      } catch (error) {
        console.warn(`[Foreign/${folder.name}] Search failed:`, error);
        return [];
      }
    });

    const resultArrays = await Promise.all(searches);
    return resultArrays.flat();
  }

  /**
   * Fetch a directory listing from a fully-formed URL.
   * Returns parsed FTPItem[] with full URLs for each item.
   */
  async fetchDirectory(fullUrl: string, timeoutMs = 30000): Promise<FTPItem[]> {
    try {
      const proxiedUrl = this.getProxiedUrl(fullUrl);
      console.log('Fetching:', fullUrl);

      const response = await this.fetchWithTimeout(proxiedUrl, { method: 'GET' }, timeoutMs);

      if (!response.ok) {
        const error: any = new Error(`Failed to fetch directory: ${response.statusText}`);
        error.status = response.status;
        error.statusCode = response.status;
        error.endpoint = fullUrl;
        throw error;
      }

      const html = await response.text();
      const items = this.parseH5aiListing(html, fullUrl);
      console.log(`Parsed ${items.length} items from ${fullUrl}`);
      return items;
    } catch (error: any) {
      console.error('Error fetching directory:', error);

      // Attach endpoint information to the error
      if (!error.endpoint) {
        error.endpoint = fullUrl;
      }

      throw error;
    }
  }

  /**
   * Parse h5ai HTML listing and compute full URLs for each item.
   *
   * h5ai uses relative hrefs (already URL-encoded) for links.
   * We resolve them against the parent URL to get full URLs.
   */
  private parseH5aiListing(html: string, parentUrl: string): FTPItem[] {
    if (!parentUrl.endsWith('/')) parentUrl += '/';

    const items: FTPItem[] = [];
    const linkRegex = /<a\s+href="([^"]+)"[^>]*>([^<]*)<\/a>/gi;
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      const name = match[2].trim();

      // Skip unwanted links
      if (!name ||
          href === '../' ||
          href === '..' ||
          href.startsWith('/_h5ai') ||
          href.startsWith('https://') ||
          href.startsWith('http://')) {
        continue;
      }

      // Build full URL for this item
      let itemUrl: string;
      if (href.startsWith('/')) {
        // Absolute path from server root
        const serverOrigin = parentUrl.match(/^https?:\/\/[^\/]+/)?.[0] || '';
        itemUrl = serverOrigin + href;
      } else {
        // Relative path — append to parent URL
        itemUrl = parentUrl + href;
      }

      const isFolder = href.endsWith('/');

      items.push({
        name,
        type: isFolder ? 'folder' : 'file',
        path: href,
        url: itemUrl,
      });
    }

    return items;
  }

  /**
   * Check if a filename is a video file.
   */
  static isVideoFile(filename: string): boolean {
    const ext = FTPClient.getFileExtension(filename);
    return VIDEO_EXTENSIONS.includes(ext);
  }

  /**
   * Check if a filename is a subtitle file (.srt).
   */
  static isSubtitleFile(filename: string): boolean {
    const ext = FTPClient.getFileExtension(filename);
    return SUBTITLE_EXTENSIONS.includes(ext);
  }

  /**
   * Check if a filename is a media file (video or subtitle).
   */
  static isMediaFile(filename: string): boolean {
    return FTPClient.isVideoFile(filename) || FTPClient.isSubtitleFile(filename);
  }

  /**
   * Filter a list of FTPItems to only include folders and media files (video + .srt).
   * Ignores .jpg, .png, .nfo, and any other non-media files.
   */
  static filterMediaItems(items: FTPItem[]): FTPItem[] {
    return items.filter(item => {
      if (item.type === 'folder') return true;
      return FTPClient.isMediaFile(item.name);
    });
  }

  private static getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1 || lastDot === 0) return '';
    return filename.substring(lastDot).toLowerCase();
  }
}
