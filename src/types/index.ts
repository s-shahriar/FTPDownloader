export type DownloadStatus = 'pending' | 'queued' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled';

export type CategoryType = 'movie_with_year' | 'movie_flat' | 'tv_series' | 'korean_tv_series' | 'movie_merged' | 'movie_foreign' | 'anime_series';
export type YearFormat = 'paren' | 'paren_1080p' | 'bare' | 'none';

export interface MergedSource {
  server: string;
  path: string;
  yearFormat: YearFormat;
  label: string; // e.g. "720p", "1080p"
}

export interface FTPItem {
  name: string;
  path: string;
  url: string;
  type: 'file' | 'folder';
  sourceLabel?: string; // quality tag for merged results, e.g. "720p"
  size?: string;
  modified?: string | Date;
}

export interface DownloadProgress {
  bytesDownloaded: number;
  bytesTotal: number;
  percentage: number;
  speed: number;
  timeRemaining: number;
}

export interface MediaItem {
  id: string;
  name: string;
  year?: string;
  quality?: string;
  source?: string;
  audioType?: string;
  path: string;
  url: string;
  category: string;
  posterUrl?: string;
  videoUrl?: string;
  size?: string;
}

export interface DownloadItem {
  id: string;
  name: string;
  url: string;
  localPath: string;
  status: DownloadStatus;
  progress: number;
  totalBytes: number;
  downloadedBytes: number;
  startTime: number;
  endTime?: number;
  error?: string;
  resumeData?: string;
  speed: number;          // bytes per second
  timeRemaining: number;  // seconds
  queueOrder: number;     // position ordering for queue persistence
  category: string;       // preserved for retry
}

export interface Category {
  id: string;
  name: string;
  path: string;
  server: string;
  icon: string;
  color: string;
  type: CategoryType;
  yearFormat?: YearFormat;
  mergedSources?: MergedSource[];
  excludeSubfolders?: string[]; // subfolder names to skip (e.g. already-covered languages)
}

export interface SearchResult {
  items: MediaItem[];
  category: Category;
  query: string;
  timestamp: number;
}

export interface SearchHistoryItem {
  query: string;
  category: string;
  timestamp: number;
}
