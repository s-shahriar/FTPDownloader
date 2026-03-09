import { Platform } from 'react-native';
import { VIDEO_EXTENSIONS, SUBTITLE_EXTENSIONS, TV_ALPHA_GROUPS, ANIME_ALPHA_GROUPS } from '../constants';
import { FTPItem, Category, YearFormat } from '../types';

const LOCAL_PROXY = 'http://localhost:3001/proxy?url=';

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
   * Check if a category requires a year input for searching.
   */
  static categoryNeedsYear(category: Category): boolean {
    return category.type === 'movie_with_year' || category.type === 'movie_merged';
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
   * For merged categories (e.g. English Movies), search all sources in parallel
   * and return combined results tagged with their source label (720p, 1080p).
   */
  async searchMerged(category: Category, searchQuery: string, year: string): Promise<FTPItem[]> {
    if (!category.mergedSources || category.mergedSources.length === 0) {
      throw new Error('No merged sources defined for this category');
    }

    const query = searchQuery.toLowerCase().trim();

    // Build URLs for all sources
    const searches = category.mergedSources.map(async (source) => {
      let url: string;
      if (source.yearFormat === 'none') {
        // Flat listing — no year folder
        url = FTPClient.buildUrl(source.server, source.path);
      } else {
        const yearFolder = FTPClient.getYearFolder(source.yearFormat, year);
        url = FTPClient.buildUrl(source.server, source.path, yearFolder);
      }

      try {
        console.log(`[${source.label}] Searching: ${url}`);
        const items = await this.fetchDirectory(url);

        // Filter matching folders and tag with source label
        return items
          .filter(item => item.type === 'folder' && item.name.toLowerCase().includes(query))
          .map(item => ({
            ...item,
            sourceLabel: source.label,
          }));
      } catch (error) {
        console.warn(`[${source.label}] Search failed:`, error);
        return []; // Don't fail the whole search if one source is down
      }
    });

    // Run all searches in parallel
    const resultArrays = await Promise.all(searches);
    return resultArrays.flat();
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
  async fetchDirectory(fullUrl: string): Promise<FTPItem[]> {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 30000); // 30 second timeout

    try {
      const proxiedUrl = this.getProxiedUrl(fullUrl);
      console.log('Fetching:', fullUrl);

      const response = await fetch(proxiedUrl, {
        method: 'GET',
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);

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
      clearTimeout(timeoutId);
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
