import { Category } from '../types';

export const FTP_SERVERS = {
  PRIMARY: '172.16.50.7',
  SECONDARY: [
    '172.16.50.8',
    '172.16.50.9',
    '172.16.50.12',
    '172.16.50.14',
  ],
};

export const BASE_URL = `http://${FTP_SERVERS.PRIMARY}`;

export const CATEGORIES: Record<string, Category> = {
  ALL: {
    id: 'all',
    name: 'All Categories',
    path: '/',
    server: 'http://172.16.50.7',
    icon: 'apps',
    color: '#357F6D',
    type: 'all',
    // Server 8 only hosts games and software, so it is left out
    searchScopes: [
      { server: 'http://172.16.50.7', path: '/DHAKA-FLIX-7/', labelFromSubfolder: true },
      { server: 'http://172.16.50.14', path: '/DHAKA-FLIX-14/', labelFromSubfolder: true },
      { server: 'http://172.16.50.12', path: '/DHAKA-FLIX-12/', labelFromSubfolder: true },
      { server: 'http://172.16.50.9', path: '/DHAKA-FLIX-9/', labelFromSubfolder: true },
    ],
  },
  ENGLISH_MOVIES: {
    id: 'english_movies',
    name: 'English Movies',
    path: '/DHAKA-FLIX-7/English Movies',
    server: 'http://172.16.50.7',
    icon: 'movie',
    color: '#B4543C',
    type: 'movie_merged',
    yearFormat: 'paren',
    mergedSources: [
      {
        server: 'http://172.16.50.7',
        path: '/DHAKA-FLIX-7/English Movies',
        yearFormat: 'paren',
        label: '720p',
      },
      {
        server: 'http://172.16.50.14',
        path: '/DHAKA-FLIX-14/English Movies (1080p)',
        yearFormat: 'paren_1080p',
        label: '1080p',
      },
    ],
  },
  HINDI_MOVIES: {
    id: 'hindi_movies',
    name: 'Hindi Movies',
    path: '/DHAKA-FLIX-14/Hindi Movies',
    server: 'http://172.16.50.14',
    icon: 'movie-creation',
    color: '#2F8078',
    type: 'movie_with_year',
    yearFormat: 'paren',
  },
  SOUTH_INDIAN_MOVIES: {
    id: 'south_indian_movies',
    name: 'South Indian Movies',
    path: '/DHAKA-FLIX-14/SOUTH INDIAN MOVIES/South Movies',
    server: 'http://172.16.50.14',
    icon: 'movie',
    color: '#A9702F',
    type: 'movie_merged',
    yearFormat: 'bare',
    mergedSources: [
      {
        server: 'http://172.16.50.14',
        path: '/DHAKA-FLIX-14/SOUTH INDIAN MOVIES/South Movies',
        yearFormat: 'bare',
        label: 'Original',
      },
      {
        server: 'http://172.16.50.14',
        path: '/DHAKA-FLIX-14/SOUTH INDIAN MOVIES/Hindi Dubbed',
        yearFormat: 'paren',
        label: 'Hindi Dubbed',
      },
    ],
  },
  ANIMATION_MOVIES: {
    id: 'animation_movies',
    name: 'Animation Movies',
    path: '/DHAKA-FLIX-14/Animation Movies',
    server: 'http://172.16.50.14',
    icon: 'animation',
    color: '#7B6098',
    type: 'movie_merged',
    yearFormat: 'paren',
    mergedSources: [
      {
        server: 'http://172.16.50.14',
        path: '/DHAKA-FLIX-14/Animation Movies',
        yearFormat: 'paren',
        label: '720p',
      },
      {
        server: 'http://172.16.50.14',
        path: '/DHAKA-FLIX-14/Animation Movies (1080p)',
        yearFormat: 'none',
        label: '1080p',
      },
    ],
  },
  TV_WEB_SERIES: {
    id: 'tv_web_series',
    name: 'TV & Web Series',
    path: '/DHAKA-FLIX-12/TV-WEB-Series',
    server: 'http://172.16.50.12',
    icon: 'tv',
    color: '#A8546B',
    type: 'tv_series',
  },
  KOREAN_TV_SERIES: {
    id: 'korean_tv_series',
    name: 'Korean TV & Web Series',
    path: '/DHAKA-FLIX-14/KOREAN TV & WEB Series',
    server: 'http://172.16.50.14',
    icon: 'tv',
    color: '#3A7B92',
    type: 'korean_tv_series',
  },
  KOREAN_MOVIES: {
    id: 'korean_movies',
    name: 'Korean Movies',
    path: '/DHAKA-FLIX-7/Foreign Language Movies/Korean Language',
    server: 'http://172.16.50.7',
    icon: 'movie',
    color: '#AB4F52',
    type: 'movie_flat',
  },
  JAPANESE_MOVIES: {
    id: 'japanese_movies',
    name: 'Japanese Movies',
    path: '/DHAKA-FLIX-7/Foreign Language Movies/Japanese Language',
    server: 'http://172.16.50.7',
    icon: 'movie',
    color: '#B07430',
    type: 'movie_flat',
  },
  CHINESE_MOVIES: {
    id: 'chinese_movies',
    name: 'Chinese Movies',
    path: '/DHAKA-FLIX-7/Foreign Language Movies/Chinese Language',
    server: 'http://172.16.50.7',
    icon: 'movie',
    color: '#45836F',
    type: 'movie_flat',
  },
  ANIME_CARTOON: {
    id: 'anime_cartoon',
    name: 'Anime & Cartoon',
    path: '/DHAKA-FLIX-9/Anime & Cartoon TV Series',
    server: 'http://172.16.50.9',
    icon: 'tv',
    color: '#96566E',
    type: 'anime_series',
  },
  FOREIGN_MOVIES: {
    id: 'foreign_movies',
    name: 'Foreign Language Movies',
    path: '/DHAKA-FLIX-7/Foreign Language Movies',
    server: 'http://172.16.50.7',
    icon: 'public',
    color: '#4A7F86',
    type: 'movie_foreign',
    excludeSubfolders: ['Chinese Language', 'Japanese Language', 'Korean Language'],
  },
};

export const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'];
export const SUBTITLE_EXTENSIONS = ['.srt'];
export const MEDIA_EXTENSIONS = [...VIDEO_EXTENSIONS, ...SUBTITLE_EXTENSIONS];

// TV Series alpha group folder names
export const TV_ALPHA_GROUPS: Record<string, string> = {
  '0-9': 'TV Series \u2605  0  \u2014  9',
  'A-L': 'TV Series \u2665  A  \u2014  L',
  'M-R': 'TV Series \u2666  M  \u2014  R',
  'S-Z': 'TV Series \u2666  S  \u2014  Z',
};

// Anime & Cartoon alpha group folder names
export const ANIME_ALPHA_GROUPS: Record<string, string> = {
  '0-9': 'Anime-TV Series \u2605  0  \u2014  9',
  'A-F': 'Anime-TV Series \u2665  A  \u2014  F',
  'G-M': 'Anime-TV Series \u2665  G  \u2014  M',
  'N-S': 'Anime-TV Series \u2666  N  \u2014  S',
  'T-Z': 'Anime-TV Series \u2666  T  \u2014  Z',
};

export const DOWNLOAD_STATUS = {
  PENDING: 'pending' as const,
  QUEUED: 'queued' as const,
  DOWNLOADING: 'downloading' as const,
  PAUSED: 'paused' as const,
  SAVING: 'saving' as const,
  COMPLETED: 'completed' as const,
  FAILED: 'failed' as const,
  CANCELLED: 'cancelled' as const,
};

export const SEARCH_CONFIG = {
  MIN_QUERY_CHARS: 3,           // letters/digits; short queries return tens of thousands of hits
  MIN_QUERY_CHARS_WITH_YEAR: 2, // a year folder is small enough for titles like "Up"
  REQUEST_TIMEOUT_MS: 10000,    // the slowest healthy server takes ~3s for a whole-category search
  DEAD_SERVER_TTL_MS: 120000,   // skip a server that just failed (e.g. down for maintenance)
  MAX_RESULTS: 200,
  POSTER_CONCURRENCY: 4,
  POSTER_TIMEOUT_MS: 8000,
  MAX_POSTERS: 40,              // posters are full-size JPEGs (~200KB each)
};

export const DOWNLOAD_CONFIG = {
  MAX_CONCURRENT: 4,
  SPEED_SAMPLE_WINDOW_MS: 3000,
};

export const COLORS = {
  // Warm, light palette — the same system as Magpie (cream ground, ink text,
  // a single accent doing the work), shifted from coral to teal so the two
  // apps read as siblings rather than copies.

  // Brand
  primary: '#6FC3AE',        // teal: accent chips, active states, progress
  primaryStrong: '#357F6D',  // deep teal: filled surfaces that carry light text
  secondary: '#4E9E89',      // mid teal
  accent: '#E0A45C',         // warm sand, for the Downloads CTA
  accentAlt: '#5FA8C4',      // muted blue, secondary accent
  accentDark: '#C4883F',     // sand, darker

  // Text that sits *on* a filled brand surface. These are light, warm fills,
  // so white fails contrast on all three (2.1:1 on primary); ink passes.
  onPrimary: '#13221E',
  onAccent: '#2B1D0D',

  // Backgrounds
  background: '#F1EFE9',     // warm cream
  surface: '#F1EFE9',
  card: '#FCFAF7',           // raised card
  card2: '#F6F3ED',          // elevated / action background
  inputBg: '#FCFAF7',
  border: 'rgba(38,37,35,0.12)',

  // Text — ink on cream, not white on navy
  text: '#262523',
  textSecondary: '#6B655D',
  textDim: '#A09990',

  // Status
  error: '#C5533F',
  success: '#4E8B62',
  warning: '#D99A3A',
  info: '#357F6D',

  // Light fills. Every tint in the app comes from here — previously these were
  // hand-written indigo rgba() left over from the dark scheme, which is why
  // chips and badges read lavender on the cream ground.
  tint: 'rgba(111,195,174,0.16)',        // subtle teal fill
  tintStrong: 'rgba(111,195,174,0.26)',  // chip / badge fill
  tintBorder: 'rgba(53,127,109,0.22)',   // hairline on a tint
  sandTint: 'rgba(224,164,92,0.16)',
  sandTintStrong: 'rgba(224,164,92,0.24)',
  errorTint: 'rgba(197,83,63,0.10)',

  // Soft tints, replacing the old neon glows: on a light ground a glow reads
  // as grime, so these are used as gentle fills and shadows instead.
  blueGlow: 'rgba(111,195,174,0.22)',
  amberGlow: 'rgba(224,164,92,0.24)',
  cyanGlow: 'rgba(95,168,196,0.18)',
};

export const STORAGE_KEYS = {
  DOWNLOAD_HISTORY: '@download_history',
  DOWNLOAD_QUEUE_ORDER: '@download_queue_order',
  DEFAULT_DOWNLOAD_PATH: '@default_download_path',
  SAF_DIRECTORY_URI: '@saf_directory_uri',
  SEARCH_HISTORY: '@search_history',
  USER_PREFERENCES: '@user_preferences',
  GEMINI_API_KEY: '@gemini_api_key',
};
