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
  ENGLISH_MOVIES: {
    id: 'english_movies',
    name: 'English Movies',
    path: '/DHAKA-FLIX-7/English Movies',
    server: 'http://172.16.50.7',
    icon: 'movie',
    color: '#FF6B6B',
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
    color: '#4ECDC4',
    type: 'movie_with_year',
    yearFormat: 'paren',
  },
  SOUTH_INDIAN_MOVIES: {
    id: 'south_indian_movies',
    name: 'South Indian Movies',
    path: '/DHAKA-FLIX-14/SOUTH INDIAN MOVIES/South Movies',
    server: 'http://172.16.50.14',
    icon: 'movie',
    color: '#F38181',
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
    color: '#AA96DA',
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
    color: '#FCBAD3',
    type: 'tv_series',
  },
  KOREAN_TV_SERIES: {
    id: 'korean_tv_series',
    name: 'Korean TV & Web Series',
    path: '/DHAKA-FLIX-14/KOREAN TV & WEB Series',
    server: 'http://172.16.50.14',
    icon: 'tv',
    color: '#A8D8EA',
    type: 'korean_tv_series',
  },
  KOREAN_MOVIES: {
    id: 'korean_movies',
    name: 'Korean Movies',
    path: '/DHAKA-FLIX-7/Foreign Language Movies/Korean Language',
    server: 'http://172.16.50.7',
    icon: 'movie',
    color: '#FFB6B9',
    type: 'movie_flat',
  },
  JAPANESE_MOVIES: {
    id: 'japanese_movies',
    name: 'Japanese Movies',
    path: '/DHAKA-FLIX-7/Foreign Language Movies/Japanese Language',
    server: 'http://172.16.50.7',
    icon: 'movie',
    color: '#FAE3D9',
    type: 'movie_flat',
  },
  CHINESE_MOVIES: {
    id: 'chinese_movies',
    name: 'Chinese Movies',
    path: '/DHAKA-FLIX-7/Foreign Language Movies/Chinese Language',
    server: 'http://172.16.50.7',
    icon: 'movie',
    color: '#BBDED6',
    type: 'movie_flat',
  },
  ANIME_CARTOON: {
    id: 'anime_cartoon',
    name: 'Anime & Cartoon',
    path: '/DHAKA-FLIX-9/Anime & Cartoon TV Series',
    server: 'http://172.16.50.9',
    icon: 'tv',
    color: '#FF9AA2',
    type: 'anime_series',
  },
  FOREIGN_MOVIES: {
    id: 'foreign_movies',
    name: 'Foreign Language Movies',
    path: '/DHAKA-FLIX-7/Foreign Language Movies',
    server: 'http://172.16.50.7',
    icon: 'public',
    color: '#61C0BF',
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
  COMPLETED: 'completed' as const,
  FAILED: 'failed' as const,
  CANCELLED: 'cancelled' as const,
};

export const DOWNLOAD_CONFIG = {
  MAX_CONCURRENT: 4,
  SPEED_SAMPLE_WINDOW_MS: 3000,
};

export const COLORS = {
  // Brand
  primary: '#3d7fff',       // blue
  secondary: '#6c5ce7',     // indigo
  accent: '#e8a020',        // amber/gold
  accentDark: '#d4881a',    // amber darker

  // Backgrounds
  background: '#f2f4f8',    // soft blue-gray
  surface: '#ffffff',       // white cards
  card: '#f0f2f8',          // very light blue-gray
  card2: '#e8ecf4',         // slightly deeper
  inputBg: '#f0f2f8',       // input field background
  border: 'rgba(0,0,0,0.07)',

  // Text
  text: '#1a1a2e',          // near black
  textSecondary: '#6b7394', // muted blue-gray
  textDim: '#a0a8c0',       // very muted

  // Status
  error: '#ff4d6a',
  success: '#00c8a0',       // teal
  warning: '#e8a020',       // amber
  info: '#3d7fff',          // blue

  // Glow / shadow helpers
  blueGlow: 'rgba(61,127,255,0.25)',
  amberGlow: 'rgba(232,160,32,0.35)',
};

export const STORAGE_KEYS = {
  DOWNLOAD_HISTORY: '@download_history',
  DOWNLOAD_QUEUE_ORDER: '@download_queue_order',
  DEFAULT_DOWNLOAD_PATH: '@default_download_path',
  SEARCH_HISTORY: '@search_history',
  USER_PREFERENCES: '@user_preferences',
};
