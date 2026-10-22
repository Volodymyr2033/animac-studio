import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Play,
  Pause,
  Trash2,
  FolderDown,
  ShieldCheck,
  Sun,
  Moon,
  Search,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
  Terminal,
  Clock,
  WifiOff,
  Globe,
  Sparkles,
  X,
  Layers,
  Heart,
  FolderOpen,
  ListVideo,
  Upload,
  ChevronRight,
} from 'lucide-react';
import {
  AnimeSeason,
  AnimeSeries,
  DEFAULT_PLAYER_ANIME_LIST,
  DownloadTask,
  EpisodeInfo,
  FAVORITE_CATEGORIES,
  FavoriteAnimeItem,
  FavoriteCategory,
  POPULAR_SEARCH_CHIPS,
  SOURCE_SITES_DIRECTORY,
  SavedAnimePlaylist,
  VIDEO_QUALITIES,
  VOICEOVER_STUDIOS,
  WatchHistoryItem,
  buildEpisodeRangeGroups,
  calculateQueueMetrics,
  createDownloadTask,
  enforceSequentialAnimeQueue,
  estimateEpisodeSizeMB,
  formatTimecode,
  groupActiveQueueByAnime,
  groupSavedEpisodesIntoPlaylists,
  searchAnimeAcrossSites,
  stepDownloadQueueSequentially,
} from './utils/animeEngine';
import {
  PlatformTarget,
  SourceSite,
  VideoQuality,
  buildTargetFilePath,
  generatePlatformBatchScript,
} from './utils/security';
import { AnimeArtwork } from './components/AnimeArtwork';
import { PWAInstallButton } from './components/PWAInstallButton';
import {
  VideoPlayerView,
  getSavedEpisodeTimecode,
  saveEpisodeTimecode,
} from './components/VideoPlayerModal';
import {
  listOfflineEpisodes,
  removeOfflineEpisode,
  saveEpisodeOffline,
  triggerBrowserFileDownload,
} from './lib/offlineStorage';

type ActiveSection = 'catalog' | 'player' | 'favorites' | 'queue' | 'saved' | 'history';

interface CardSelectionState {
  seasonId: string;
  rangeIndex: number;
  episodeSearch: string;
  episodeNumber: number;
  voiceover: string;
  quality: VideoQuality;
}

const STORAGE_KEYS = {
  THEME: 'animac_theme_v2',
  PLATFORM: 'animac_platform_v2',
  VOICEOVER: 'animac_voiceover_v2',
  QUALITY: 'animac_quality_v2',
  QUEUE: 'animac_queue_v2',
  SAVED_EPISODES: 'animac_saved_episodes_v2',
  FAVORITES: 'animac_favorites_v2',
  HISTORY: 'animac_history_v2',
  TIMECODES: 'animac_timecodes_v2',
};

export default function App() {
  // Theme state (Dark mode default for comfortable viewing)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME);
    return saved === 'light' ? 'light' : 'dark';
  });

  // Target OS platform state (macOS default, Windows & Android supported)
  const [platform, setPlatform] = useState<PlatformTarget>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.PLATFORM);
    if (saved === 'windows' || saved === 'android' || saved === 'macos') return saved;
    return 'macos';
  });

  // Global default Voiceover & Quality settings
  const [defaultVoiceover, setDefaultVoiceover] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.VOICEOVER) || 'AniLibria';
  });

  const [defaultQuality, setDefaultQuality] = useState<VideoQuality>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.QUALITY);
    if (saved === '2160p' || saved === '1080p' || saved === '720p' || saved === '480p') {
      return saved;
    }
    return '1080p';
  });

  // Navigation section (6 tabs)
  const [activeSection, setActiveSection] = useState<ActiveSection>('catalog');

  // Universal Search & URL Input state
  const [universalInput, setUniversalInput] = useState('');
  const [activeQueryLabel, setActiveQueryLabel] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<AnimeSeries[]>([]);
  const [siteFilter, setSiteFilter] = useState<'ALL' | SourceSite>('ALL');
  const [searchFeedback, setSearchFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Per-card selected season, episode range, episode search, episode, voiceover, and quality overrides
  const [cardSelections, setCardSelections] = useState<Record<string, CardSelectionState>>({});

  // Favorites state persisted in localStorage
  const [favorites, setFavorites] = useState<FavoriteAnimeItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.FAVORITES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore
    }
    return [];
  });
  const [favoriteFilter, setFavoriteFilter] = useState<'ALL' | FavoriteCategory>('ALL');

  // Initial Queue & Saved migration: any previously completed tasks in QUEUE move to SAVED_EPISODES
  const [downloadQueue, setDownloadQueue] = useState<DownloadTask[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.QUEUE);
      if (saved) {
        const parsed = JSON.parse(saved) as DownloadTask[];
        if (Array.isArray(parsed)) {
          return enforceSequentialAnimeQueue(
            parsed.filter((t) => t.status !== 'completed' && t.progressPercent < 100)
          );
        }
      }
    } catch {
      // Ignore
    }
    return [];
  });

  const [savedEpisodes, setSavedEpisodes] = useState<DownloadTask[]>(() => {
    const initialSaved: DownloadTask[] = [];
    try {
      const savedRaw = localStorage.getItem(STORAGE_KEYS.SAVED_EPISODES);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw) as DownloadTask[];
        if (Array.isArray(parsed)) {
          initialSaved.push(...parsed);
        }
      }
      // Also migrate any completed items that were previously stored in STORAGE_KEYS.QUEUE
      const queueRaw = localStorage.getItem(STORAGE_KEYS.QUEUE);
      if (queueRaw) {
        const parsedQ = JSON.parse(queueRaw) as DownloadTask[];
        if (Array.isArray(parsedQ)) {
          for (const item of parsedQ) {
            if (item.status === 'completed' || item.progressPercent >= 100) {
              if (!initialSaved.some((s) => s.id === item.id)) {
                initialSaved.push({ ...item, status: 'completed', progressPercent: 100 });
              }
            }
          }
        }
      }
    } catch {
      // Ignore
    }
    return initialSaved;
  });

  // Currently selected playlist folder key in the "Сохраненное" tab
  const [selectedPlaylistKey, setSelectedPlaylistKey] = useState<string | null>(null);

  // Watch History state persisted in localStorage
  const [watchHistory, setWatchHistory] = useState<WatchHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.HISTORY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore
    }
    return [];
  });

  // Active Player state
  const [playerState, setPlayerState] = useState<{
    anime: AnimeSeries;
    seasonId: string;
    episodeNumber: number;
    voiceover: string;
    quality: VideoQuality;
    initialProgressSeconds: number;
    playlistEpisodes: EpisodeInfo[] | null;
  }>({
    anime: DEFAULT_PLAYER_ANIME_LIST[0],
    seasonId: DEFAULT_PLAYER_ANIME_LIST[0].defaultSeasonId,
    episodeNumber: 1,
    voiceover: 'AniLibria',
    quality: '1080p',
    initialProgressSeconds: 0,
    playlistEpisodes: null,
  });

  // Connectivity indicator
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [simulateOfflineMode, setSimulateOfflineMode] = useState(false);

  // Toast notification banner
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  const showBanner = useCallback((msg: string) => {
    setStatusBanner(msg);
  }, []);

  useEffect(() => {
    if (!statusBanner) return;
    const t = setTimeout(() => setStatusBanner(null), 4500);
    return () => clearTimeout(t);
  }, [statusBanner]);

  // Apply Dark / Light class to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PLATFORM, platform);
    setDownloadQueue((prev) =>
      prev.map((task) => ({
        ...task,
        targetPath: buildTargetFilePath({
          platform,
          animeTitle: task.seasonTitle
            ? `${task.animeTitle} (${task.seasonTitle})`
            : task.animeTitle,
          episodeNumber: task.episodeNumber,
          voiceover: task.voiceover,
          quality: task.quality,
        }),
      }))
    );
  }, [platform]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.VOICEOVER, defaultVoiceover);
  }, [defaultVoiceover]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.QUALITY, defaultQuality);
  }, [defaultQuality]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(downloadQueue));
  }, [downloadQueue]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SAVED_EPISODES, JSON.stringify(savedEpisodes));
  }, [savedEpisodes]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(watchHistory));
  }, [watchHistory]);

  // Sync any IndexedDB offline episodes into savedEpisodes on boot
  useEffect(() => {
    listOfflineEpisodes().then((offlineList) => {
      if (offlineList.length === 0) return;
      setSavedEpisodes((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const additions: DownloadTask[] = [];
        for (const o of offlineList) {
          if (!existingIds.has(o.taskId)) {
            const matched = searchAnimeAcrossSites(o.animeTitle);
            const firstMatch = matched.ok && matched.results[0] ? matched.results[0] : null;
            additions.push({
              id: o.taskId,
              animeId: o.animeId,
              animeTitle: o.animeTitle,
              originalTitle: firstMatch?.originalTitle || o.animeTitle,
              posterUrl: firstMatch?.posterUrl || '',
              seasonTitle: 'Сезон 1',
              artworkTheme: firstMatch?.artworkTheme || 'alchemist',
              episodeNumber: o.episodeNumber,
              episodeTitle: o.episodeTitle,
              durationSeconds: 1440,
              voiceover: o.voiceover,
              quality: o.quality as VideoQuality,
              sourceSite: o.sourceSite as SourceSite,
              sourceUrl: 'https://yummyanime.tv',
              status: 'completed',
              progressPercent: 100,
              speedMBps: 0,
              sizeMB: o.sizeMB,
              downloadedMB: o.sizeMB,
              targetPath: buildTargetFilePath({
                platform: 'macos',
                animeTitle: o.animeTitle,
                episodeNumber: o.episodeNumber,
                voiceover: o.voiceover,
                quality: o.quality as VideoQuality,
              }),
              sha256: o.sha256,
              isOfflineAvailable: true,
              updatedAtIso: o.savedAtIso,
            });
          }
        }
        return additions.length > 0 ? [...additions, ...prev] : prev;
      });
    });
  }, []);

  // Online/Offline listeners
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sequential Download Queue ticker: downloads one anime group at a time and moves 100% completed tasks to Saved
  useEffect(() => {
    const hasDownloading = downloadQueue.some((t) => t.status === 'downloading');
    if (!hasDownloading) return;

    const timer = setInterval(() => {
      setDownloadQueue((prev) => {
        const { remainingQueue, newlyCompleted } = stepDownloadQueueSequentially(prev, 20);
        if (newlyCompleted.length > 0) {
          setSavedEpisodes((prevSaved) => {
            const map = new Map<string, DownloadTask>();
            for (const item of [...newlyCompleted, ...prevSaved]) {
              map.set(item.id, item);
            }
            return Array.from(map.values());
          });
          for (const doneTask of newlyCompleted) {
            saveEpisodeOffline(doneTask).catch(() => {});
          }
        }
        return remainingQueue;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [downloadQueue]);

  // Filtered search results by site
  const filteredSearchResults = useMemo(() => {
    return searchResults.filter((anime) => {
      return siteFilter === 'ALL' || anime.sourceSite === siteFilter;
    });
  }, [searchResults, siteFilter]);

  // Grouped active queue by anime title
  const activeQueueGroups = useMemo(
    () => groupActiveQueueByAnime(downloadQueue),
    [downloadQueue]
  );

  // Grouped saved episodes into per-anime playlist folders
  const savedPlaylists: SavedAnimePlaylist[] = useMemo(
    () => groupSavedEpisodesIntoPlaylists(savedEpisodes),
    [savedEpisodes]
  );

  // Ensure selectedPlaylistKey defaults to the first playlist when available
  const activeSelectedPlaylist = useMemo(() => {
    if (savedPlaylists.length === 0) return null;
    if (selectedPlaylistKey) {
      const found = savedPlaylists.find((p) => p.playlistKey === selectedPlaylistKey);
      if (found) return found;
    }
    return savedPlaylists[0];
  }, [savedPlaylists, selectedPlaylistKey]);

  const queueMetrics = useMemo(() => calculateQueueMetrics(downloadQueue), [downloadQueue]);

  // Favorites helpers
  const getFavoriteCategoryForAnime = useCallback(
    (animeTitle: string): FavoriteCategory | null => {
      const norm = animeTitle.trim().toLowerCase();
      const found = favorites.find((f) => f.title.trim().toLowerCase() === norm);
      return found ? found.category : null;
    },
    [favorites]
  );

  const handleToggleOrSetFavorite = useCallback(
    (anime: AnimeSeries, category?: FavoriteCategory) => {
      const norm = anime.title.trim().toLowerCase();
      setFavorites((prev) => {
        const existing = prev.find((f) => f.title.trim().toLowerCase() === norm);
        // If clicking button with same category or without explicit category change when already in favorites, toggle or update
        if (existing && !category) {
          showBanner(`«${anime.title}» удалено из избранного.`);
          return prev.filter((f) => f.title.trim().toLowerCase() !== norm);
        }
        const targetCategory: FavoriteCategory = category || existing?.category || 'watching';
        const catLabel =
          FAVORITE_CATEGORIES.find((c) => c.id === targetCategory)?.label || 'Смотрю';

        const nextItem: FavoriteAnimeItem = {
          id: existing?.id || `fav-${anime.id}`,
          animeId: anime.id,
          title: anime.title,
          originalTitle: anime.originalTitle,
          posterUrl: anime.posterUrl,
          sourceSite: anime.sourceSite,
          category: targetCategory,
          rating: anime.rating,
          year: anime.year,
          totalEpisodes: anime.totalEpisodes,
          addedAtIso: new Date().toISOString(),
        };

        showBanner(`«${anime.title}» сохранено в Избранное — список «${catLabel}».`);
        return [nextItem, ...prev.filter((f) => f.title.trim().toLowerCase() !== norm)];
      });
    },
    [showBanner]
  );

  const handleRemoveFavorite = useCallback(
    (title: string) => {
      const norm = title.trim().toLowerCase();
      setFavorites((prev) => prev.filter((f) => f.title.trim().toLowerCase() !== norm));
      showBanner(`«${title}» удалено из избранного.`);
    },
    [showBanner]
  );

  const filteredFavorites = useMemo(() => {
    if (favoriteFilter === 'ALL') return favorites;
    return favorites.filter((f) => f.category === favoriteFilter);
  }, [favorites, favoriteFilter]);

  // Get selection state for an anime card
  const getCardSelection = (anime: AnimeSeries): CardSelectionState => {
    const existing = cardSelections[anime.id];
    const validVoiceover = anime.availableVoiceovers.includes(defaultVoiceover)
      ? defaultVoiceover
      : anime.availableVoiceovers[0];
    const validQuality = anime.availableQualities.includes(defaultQuality)
      ? defaultQuality
      : anime.availableQualities[0];

    const defaultSeason =
      anime.seasons.find((s) => s.id === anime.defaultSeasonId) || anime.seasons[0];

    return {
      seasonId: existing?.seasonId ?? defaultSeason.id,
      rangeIndex: existing?.rangeIndex ?? 0,
      episodeSearch: existing?.episodeSearch ?? '',
      episodeNumber: existing?.episodeNumber ?? 1,
      voiceover: existing?.voiceover ?? validVoiceover,
      quality: existing?.quality ?? validQuality,
    };
  };

  const updateCardSelection = (anime: AnimeSeries, patch: Partial<CardSelectionState>) => {
    const current = getCardSelection(anime);
    setCardSelections((prev) => ({
      ...prev,
      [anime.id]: { ...current, ...patch },
    }));
  };

  // Add single episode to sequential download queue
  const handleQueueEpisode = useCallback(
    (
      anime: AnimeSeries,
      episode: EpisodeInfo,
      voiceover: string,
      quality: VideoQuality,
      seasonTitle?: string
    ) => {
      const resolvedSeasonTitle =
        seasonTitle ||
        anime.seasons.find((s) => s.id === anime.defaultSeasonId)?.title ||
        anime.seasons[0]?.title ||
        'Сезон 1';

      const newTask = createDownloadTask({
        anime,
        seasonTitle: resolvedSeasonTitle,
        episode,
        voiceover,
        quality,
        platform,
      });

      setDownloadQueue((prev) => {
        const filtered = prev.filter((t) => t.id !== newTask.id);
        return enforceSequentialAnimeQueue([...filtered, newTask]);
      });

      showBanner(
        `Добавлено в очередь загрузок: «${anime.title}» (${resolvedSeasonTitle}) — Серия ${episode.number} [${voiceover}, ${quality}]`
      );
    },
    [platform, showBanner]
  );

  // Batch queue all episodes of the selected season (grouped by anime title & downloaded sequentially)
  const handleQueueSeasonEpisodes = (anime: AnimeSeries, season: AnimeSeason) => {
    const sel = getCardSelection(anime);
    const newTasks = season.episodes.map((ep) =>
      createDownloadTask({
        anime,
        seasonTitle: season.title,
        episode: ep,
        voiceover: sel.voiceover,
        quality: sel.quality,
        platform,
      })
    );

    setDownloadQueue((prev) => {
      const existingIds = new Set(prev.map((t) => t.id));
      const uniqueNew = newTasks.filter((t) => !existingIds.has(t.id));
      return enforceSequentialAnimeQueue([...prev, ...uniqueNew]);
    });

    showBanner(
      `${season.title} (${season.episodes.length} сер.) «${anime.title}» поставлен в последовательную очередь загрузок`
    );
    setActiveSection('queue');
  };

  // Open episode in built-in player and log to Watch History
  const handleOpenInPlayer = useCallback(
    (
      anime: AnimeSeries,
      episode: EpisodeInfo,
      voiceover: string,
      quality: VideoQuality,
      resumeSeconds?: number,
      seasonId?: string,
      playlistEpisodes: EpisodeInfo[] | null = null
    ) => {
      const activeSeason =
        (seasonId ? anime.seasons.find((s) => s.id === seasonId) : undefined) ||
        anime.seasons.find((s) => s.id === anime.defaultSeasonId) ||
        anime.seasons[0];

      const effectiveResume =
        resumeSeconds && resumeSeconds > 0
          ? resumeSeconds
          : getSavedEpisodeTimecode(anime.title, activeSeason.id, episode.number);

      setPlayerState({
        anime,
        seasonId: activeSeason.id,
        episodeNumber: episode.number,
        voiceover,
        quality,
        initialProgressSeconds: effectiveResume,
        playlistEpisodes,
      });

      const historyItem: WatchHistoryItem = {
        id: `${anime.id}-${activeSeason.id}-ep-${episode.number}`,
        animeId: anime.id,
        animeTitle: anime.title,
        originalTitle: anime.originalTitle,
        posterUrl: anime.posterUrl,
        seasonTitle: activeSeason.title,
        artworkTheme: anime.artworkTheme,
        episodeNumber: episode.number,
        episodeTitle: episode.title,
        voiceover,
        quality,
        sourceSite: anime.sourceSite,
        progressSeconds: effectiveResume,
        durationSeconds: episode.durationSeconds,
        updatedAtIso: new Date().toISOString(),
      };

      setWatchHistory((prev) => {
        const filtered = prev.filter((item) => item.id !== historyItem.id);
        return [historyItem, ...filtered];
      });

      setActiveSection('player');
    },
    []
  );

  // Handle progress update from built-in player
  const handlePlayerProgressUpdate = useCallback(
    (progressSeconds: number, durationSeconds: number) => {
      const anime = playerState.anime;
      const activeSeason =
        anime.seasons.find((s) => s.id === playerState.seasonId) || anime.seasons[0];
      const ep =
        activeSeason.episodes.find((e) => e.number === playerState.episodeNumber) ||
        activeSeason.episodes[0];
      const historyId = `${anime.id}-${activeSeason.id}-ep-${ep.number}`;

      saveEpisodeTimecode(anime.title, activeSeason.id, ep.number, progressSeconds);

      const updatedItem: WatchHistoryItem = {
        id: historyId,
        animeId: anime.id,
        animeTitle: anime.title,
        originalTitle: anime.originalTitle,
        posterUrl: anime.posterUrl,
        seasonTitle: activeSeason.title,
        artworkTheme: anime.artworkTheme,
        episodeNumber: ep.number,
        episodeTitle: ep.title,
        voiceover: playerState.voiceover,
        quality: playerState.quality,
        sourceSite: anime.sourceSite,
        progressSeconds,
        durationSeconds,
        updatedAtIso: new Date().toISOString(),
      };

      setWatchHistory((prev) => {
        const idx = prev.findIndex((i) => i.id === historyId);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = updatedItem;
          return copy;
        }
        return [updatedItem, ...prev];
      });
    },
    [playerState]
  );

  // Execute Universal Search (by title OR URL)
  const executeUniversalSearch = useCallback((rawQuery: string) => {
    const res = searchAnimeAcrossSites(rawQuery);
    if (!res.ok) {
      setSearchFeedback({
        type: 'error',
        message: res.error || 'Не удалось выполнить поиск.',
      });
      return;
    }

    setSearchResults(res.results);
    setActiveQueryLabel(res.queryLabel);
    setSiteFilter('ALL');
    setSearchFeedback({
      type: 'success',
      message:
        res.mode === 'url'
          ? `Ссылка проверена (TLS 1.3): найден релиз «${res.queryLabel}» и зеркала на YummyAnime.TV, AnimeGO и AnimeVost.org.`
          : `Найдено ${res.results.length} релиза по запросу «${res.queryLabel}» одновременно на YummyAnime.TV, AnimeGO и AnimeVost.org.`,
    });
  }, []);

  const handleUniversalSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeUniversalSearch(universalInput);
  };

  const handleQuickChipSearch = (chipText: string) => {
    setUniversalInput(chipText);
    executeUniversalSearch(chipText);
  };

  // Toggle task pause/resume in active queue
  const handleToggleTaskPause = (taskId: string) => {
    setDownloadQueue((prev) => {
      const toggled = prev.map((task) => {
        if (task.id !== taskId) return task;
        const nextStatus: DownloadTask['status'] =
          task.status === 'paused' ? 'queued' : 'paused';
        return {
          ...task,
          status: nextStatus,
          speedMBps: 0,
          updatedAtIso: new Date().toISOString(),
        };
      });
      return enforceSequentialAnimeQueue(toggled);
    });
  };

  // Complete a download immediately -> removes it from Queue and moves it into Saved Playlists
  const handleInstantFinishDownload = async (task: DownloadTask) => {
    const completed: DownloadTask = {
      ...task,
      status: 'completed',
      progressPercent: 100,
      downloadedMB: task.sizeMB,
      speedMBps: 0,
      isOfflineAvailable: true,
      updatedAtIso: new Date().toISOString(),
    };
    setDownloadQueue((prev) =>
      enforceSequentialAnimeQueue(prev.filter((t) => t.id !== task.id))
    );
    setSavedEpisodes((prev) => {
      const filtered = prev.filter((item) => item.id !== completed.id);
      return [completed, ...filtered];
    });
    setSelectedPlaylistKey(completed.animeTitle.trim().toLowerCase());
    await saveEpisodeOffline(completed);
    showBanner(
      `Серия ${task.episodeNumber} («${task.animeTitle}») скачана на 100% и перемещена во вкладку «Сохраненное».`
    );
  };

  // Remove download task from active queue
  const handleRemoveTask = (taskId: string) => {
    setDownloadQueue((prev) =>
      enforceSequentialAnimeQueue(prev.filter((t) => t.id !== taskId))
    );
  };

  // Remove a saved episode from Saved Playlists
  const handleRemoveSavedEpisode = async (taskId: string) => {
    setSavedEpisodes((prev) => prev.filter((e) => e.id !== taskId));
    await removeOfflineEpisode(taskId).catch(() => {});
  };

  // Play an entire saved anime playlist in order (Серия 1, Серия 2...)
  const handlePlaySavedPlaylist = (playlist: SavedAnimePlaylist) => {
    if (playlist.episodes.length === 0) return;
    const matchedAnime = resolveAnimeForHistoryOrTask(
      playlist.animeId,
      playlist.animeTitle,
      playlist.sourceSite
    );
    const orderedEpisodeInfos: EpisodeInfo[] = playlist.episodes.map((ep) => ({
      number: ep.episodeNumber,
      title: ep.episodeTitle,
      durationSeconds: ep.durationSeconds || 1440,
      releaseDate: '2025',
    }));
    const firstEp = orderedEpisodeInfos[0];
    const firstTask = playlist.episodes[0];
    handleOpenInPlayer(
      matchedAnime,
      firstEp,
      firstTask.voiceover,
      firstTask.quality,
      0,
      matchedAnime.defaultSeasonId,
      orderedEpisodeInfos
    );
  };

  // Export platform batch script (.sh / .ps1)
  const handleExportBatchScript = () => {
    const allTasks = [...downloadQueue, ...savedEpisodes];
    const script = generatePlatformBatchScript(
      allTasks.map((t) => ({
        animeTitle: t.seasonTitle ? `${t.animeTitle} (${t.seasonTitle})` : t.animeTitle,
        episodeNumber: t.episodeNumber,
        voiceover: t.voiceover,
        quality: t.quality,
        sourceSite: t.sourceSite,
        sourceUrl: t.sourceUrl,
        sha256: t.sha256,
      })),
      platform
    );

    const blob = new Blob([script.content], { type: script.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = script.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showBanner(`Защищённый скрипт «${script.filename}» выгружен для ${platform.toUpperCase()}.`);
  };

  // Export local profile, favorites, queue, saved playlists, timecodes & history backup JSON
  const handleExportLocalBackup = () => {
    let timecodes = {};
    try {
      const rawTc = localStorage.getItem(STORAGE_KEYS.TIMECODES);
      if (rawTc) timecodes = JSON.parse(rawTc);
    } catch {
      // Ignore
    }
    const payload = {
      app: 'AniMac Studio',
      version: '2.5',
      exportedAt: new Date().toISOString(),
      preferences: {
        theme,
        platform,
        defaultVoiceover,
        defaultQuality,
      },
      favorites,
      downloadQueue,
      savedEpisodes,
      watchHistory,
      timecodes,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'animac-studio-backup.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showBanner(
      'Локальный бэкап (Избранное, Очередь, Сохраненные плейлисты, История, таймкоды) выгружен в animac-studio-backup.json.'
    );
  };

  // Import local JSON backup
  const handleImportLocalBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (Array.isArray(data?.favorites)) setFavorites(data.favorites);
        if (Array.isArray(data?.downloadQueue)) {
          setDownloadQueue(enforceSequentialAnimeQueue(data.downloadQueue));
        }
        if (Array.isArray(data?.savedEpisodes)) setSavedEpisodes(data.savedEpisodes);
        if (Array.isArray(data?.watchHistory)) setWatchHistory(data.watchHistory);
        if (data?.timecodes && typeof data.timecodes === 'object') {
          localStorage.setItem(STORAGE_KEYS.TIMECODES, JSON.stringify(data.timecodes));
        }
        showBanner('Локальный бэкап (.json) успешно импортирован и восстановлен.');
      } catch {
        showBanner('Ошибка чтения файла бэкапа (.json). Проверьте формат файла.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const activePlayerAnime = playerState.anime;
  const activePlayerSeason =
    activePlayerAnime.seasons.find((s) => s.id === playerState.seasonId) ||
    activePlayerAnime.seasons[0];
  const activePlayerEpisode =
    activePlayerSeason.episodes.find((e) => e.number === playerState.episodeNumber) ||
    activePlayerSeason.episodes[0];

  const availablePlayerAnimeChoices =
    searchResults.length > 0 ? searchResults : DEFAULT_PLAYER_ANIME_LIST;

  const effectiveOffline = !isOnline || simulateOfflineMode;

  const resolveAnimeForHistoryOrTask = (
    animeId: string,
    title: string,
    site: SourceSite
  ): AnimeSeries => {
    const foundInResults = searchResults.find((a) => a.id === animeId);
    if (foundInResults) return foundInResults;
    const searched = searchAnimeAcrossSites(title);
    if (searched.ok && searched.results.length > 0) {
      return searched.results.find((r) => r.sourceSite === site) || searched.results[0];
    }
    return DEFAULT_PLAYER_ANIME_LIST[0];
  };

  const navTabs: { id: ActiveSection; label: string }[] = [
    { id: 'catalog', label: 'Поиск и Главная' },
    { id: 'player', label: 'Встроенный плеер' },
    { id: 'favorites', label: `Избранное (${favorites.length})` },
    { id: 'queue', label: `Очередь загрузок (${downloadQueue.length})` },
    { id: 'saved', label: `Сохраненное (${savedPlaylists.length})` },
    { id: 'history', label: `История (${watchHistory.length})` },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors">
      {/* Hidden input for importing .json backup */}
      <input
        ref={backupFileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleImportLocalBackup}
        className="hidden"
      />

      {/* TOP BAR WITH 6 NAVIGATION TABS */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-6 px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs">
        {/* Zone 1: Brand link with Nekomimi icon */}
        <a
          href="#catalog"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('catalog');
          }}
          className="inline-flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
        >
          <img
            src="/icon.svg"
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            className="w-7 h-7 rounded-lg shrink-0"
          />
          AniMac Studio
        </a>

        {/* Zone 2: 6 Navigation Tabs */}
        <nav
          aria-label="Основная навигация"
          className="hidden lg:flex items-center gap-5 overflow-x-auto text-sm font-medium"
        >
          {navTabs.map((tab) => (
            <a
              key={tab.id}
              href={`#${tab.id}`}
              onClick={(e) => {
                e.preventDefault();
                setActiveSection(tab.id);
              }}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeSection === tab.id
                  ? 'border-sky-500 text-sky-600 dark:text-sky-400 font-semibold'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </a>
          ))}
        </nav>

        {/* Zone 3: Primary PWA Install Action */}
        <div className="flex items-center shrink-0">
          <PWAInstallButton activePlatform={platform} />
        </div>
      </header>

      {/* MOBILE / TABLET NAVIGATION BAR */}
      <nav
        aria-label="Мобильная навигация"
        className="lg:hidden flex items-center gap-2 overflow-x-auto px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold"
      >
        {navTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveSection(tab.id)}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeSection === tab.id
                ? 'bg-sky-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* WORKSPACE CONTROL BAR */}
      <section
        aria-label="Панель параметров загрузки и синхронизации"
        className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900/60 px-6 py-3"
      >
        <div className="max-w-[1360px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label
                htmlFor="global-platform-select"
                className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap"
              >
                Целевая ОС:
              </label>
              <select
                id="global-platform-select"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as PlatformTarget)}
                className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="macos">macOS (Apple Silicon / Intel)</option>
                <option value="windows">Windows 10 / 11 (x64 / ARM)</option>
                <option value="android">Android (APK / Termux)</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="global-voiceover-select"
                className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap"
              >
                Озвучка по умолчанию:
              </label>
              <select
                id="global-voiceover-select"
                value={defaultVoiceover}
                onChange={(e) => setDefaultVoiceover(e.target.value)}
                className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                {VOICEOVER_STUDIOS.map((vo) => (
                  <option key={vo} value={vo}>
                    {vo}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="global-quality-select"
                className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap"
              >
                Качество видео:
              </label>
              <select
                id="global-quality-select"
                value={defaultQuality}
                onChange={(e) => setDefaultQuality(e.target.value as VideoQuality)}
                className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                {VIDEO_QUALITIES.map((q) => (
                  <option key={q.value} value={q.value}>
                    {q.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setSimulateOfflineMode((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                effectiveOffline
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400'
                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <WifiOff className="w-3.5 h-3.5" />
              {effectiveOffline ? 'Оффлайн-режим: Активен' : 'Сеть: Онлайн'}
            </button>

            <button
              type="button"
              onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              aria-label="Переключить тему оформления"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {theme === 'dark' ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-sky-400" />
                  Тёмная тема
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  Светлая тема
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleExportLocalBackup}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
            >
              <HardDrive className="w-3.5 h-3.5" />
              Локальный бэкап (.json)
            </button>
          </div>
        </div>
      </section>

      {/* STATUS TOAST */}
      {statusBanner && (
        <div
          role="status"
          className="bg-sky-600 text-white px-6 py-2.5 text-xs font-medium flex items-center justify-between"
        >
          <div className="max-w-[1360px] mx-auto w-full flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {statusBanner}
            </span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="underline text-sky-100 hover:text-white cursor-pointer whitespace-nowrap"
            >
              Скрыть
            </button>
          </div>
        </div>
      )}

      {/* MAIN CONTENT VIEWPORT */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-6 py-8 space-y-8">
        {/* TAB 1: ПОИСК И ГЛАВНАЯ (catalog) */}
        {activeSection === 'catalog' && (
          <>
            <section
              aria-labelledby="extractor-heading"
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h1
                    id="extractor-heading"
                    className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white tracking-tight"
                  >
                    Универсальный поиск и загрузка аниме
                  </h1>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Введите название аниме на русском или английском (например, «Магическая битва», «Человек-бензопила», «О моем перерождении в слизь») или прямую ссылку с YummyAnime.TV, AnimeGO или AnimeVost.org.
                  </p>
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 shrink-0">
                  <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                    <ShieldCheck className="w-4 h-4" />
                    Защита: HTTPS + AniLibria API
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    Путь:{' '}
                    {platform === 'macos'
                      ? '~/Movies/AniMac'
                      : platform === 'windows'
                      ? 'C:\\Videos\\AniMac'
                      : '/storage/emulated/0/Movies/AniMac'}
                  </span>
                </div>
              </div>

              <form onSubmit={handleUniversalSearchSubmit} className="mt-5 flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <label htmlFor="anime-universal-input" className="sr-only">
                    Введите название аниме или ссылку с YummyAnime.TV, AnimeGO, AnimeVost.org
                  </label>
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="anime-universal-input"
                    type="text"
                    value={universalInput}
                    onChange={(e) => setUniversalInput(e.target.value)}
                    placeholder="Название («Человек-бензопила», «Магическая битва») или ссылка https://animego.org/..."
                    className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  {universalInput && (
                    <button
                      type="button"
                      onClick={() => setUniversalInput('')}
                      aria-label="Очистить поле поиска"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Search className="w-4 h-4" />
                  Найти на 3 сайтах
                </button>
              </form>

              {/* Popular Search Suggestion Chips */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 inline-flex items-center gap-1 mr-1">
                  <Sparkles className="w-3.5 h-3.5 text-sky-500" />
                  Популярные запросы:
                </span>
                {POPULAR_SEARCH_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleQuickChipSearch(chip)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      activeQueryLabel?.toLowerCase() === chip.toLowerCase()
                        ? 'bg-sky-600 text-white border-sky-600'
                        : 'bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-sky-500 hover:text-sky-600 dark:hover:text-sky-400'
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {searchFeedback && (
                <div
                  role="alert"
                  className={`mt-4 p-3.5 rounded-lg border text-xs flex items-center justify-between gap-3 ${
                    searchFeedback.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  <span className="inline-flex items-center gap-2 font-medium">
                    {searchFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                    )}
                    {searchFeedback.message}
                  </span>
                  {searchResults.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchResults([]);
                        setActiveQueryLabel(null);
                        setSearchFeedback(null);
                        setUniversalInput('');
                      }}
                      className="font-semibold underline whitespace-nowrap cursor-pointer"
                    >
                      Сбросить результаты
                    </button>
                  )}
                </div>
              )}
            </section>

            {/* DYNAMIC SEARCH RESULTS */}
            {searchResults.length > 0 && (
              <section aria-labelledby="search-results-heading" className="space-y-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2
                      id="search-results-heading"
                      className="text-lg font-bold text-slate-900 dark:text-white"
                    >
                      Результаты поиска по запросу «{activeQueryLabel}» ({filteredSearchResults.length})
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Синхронная выдача с YummyAnime.TV, AnimeGO и AnimeVost.org с выбором всех сезонов, серий, озвучки, качества и добавлением в Избранное.
                    </p>
                  </div>

                  <div
                    role="group"
                    aria-label="Фильтр результатов по сайту-источнику"
                    className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-200/80 dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 self-start"
                  >
                    {(['ALL', 'YummyAnime.TV', 'AnimeGO', 'AnimeVost.org'] as const).map((site) => (
                      <button
                        key={site}
                        type="button"
                        onClick={() => setSiteFilter(site)}
                        className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          siteFilter === site
                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {site === 'ALL' ? 'Все 3 сайта' : site}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {filteredSearchResults.map((anime) => {
                    const sel = getCardSelection(anime);
                    const activeSeason =
                      anime.seasons.find((s) => s.id === sel.seasonId) || anime.seasons[0];
                    const rangeGroups = buildEpisodeRangeGroups(activeSeason.episodes.length, 25);
                    const safeRangeIndex =
                      sel.rangeIndex >= 0 && sel.rangeIndex < rangeGroups.length
                        ? sel.rangeIndex
                        : 0;
                    const activeRange = rangeGroups[safeRangeIndex] || rangeGroups[0];

                    const cleanEpQuery = sel.episodeSearch.trim();
                    const visibleEpisodes = cleanEpQuery
                      ? activeSeason.episodes.filter((ep) => {
                          const qNum = Number(cleanEpQuery);
                          if (!Number.isNaN(qNum) && qNum > 0) {
                            return ep.number === qNum || String(ep.number).startsWith(cleanEpQuery);
                          }
                          return (
                            String(ep.number).includes(cleanEpQuery.toLowerCase()) ||
                            ep.title.toLowerCase().includes(cleanEpQuery.toLowerCase())
                          );
                        })
                      : activeSeason.episodes.filter(
                          (ep) => ep.number >= activeRange.start && ep.number <= activeRange.end
                        );

                    const selectedEp =
                      activeSeason.episodes.find((e) => e.number === sel.episodeNumber) ||
                      activeSeason.episodes[0];
                    const estMB = estimateEpisodeSizeMB(selectedEp.durationSeconds, sel.quality);
                    const favCategory = getFavoriteCategoryForAnime(anime.title);

                    return (
                      <article
                        key={anime.id}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col md:flex-row"
                      >
                        {/* Left Real Poster Column */}
                        <div className="md:w-52 shrink-0 p-3 md:pr-0 flex items-stretch">
                          <div className="w-full h-64 md:h-full rounded-xl overflow-hidden bg-slate-950 relative">
                            <AnimeArtwork
                              title={anime.title}
                              originalTitle={anime.originalTitle}
                              posterUrl={anime.posterUrl}
                              theme={anime.artworkTheme}
                              className="w-full h-full object-cover rounded-xl"
                            />
                          </div>
                        </div>

                        {/* Right Content Column */}
                        <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                          <div>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                <span className="font-semibold text-sky-600 dark:text-sky-400">
                                  {anime.sourceSite}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums">{activeSeason.year}</span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums">Рейтинг {anime.rating}</span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300">
                                  {activeSeason.title}: {activeSeason.episodes.length} сер.
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{anime.genres.join(' / ')}</span>
                              </div>

                              {/* Favorites Button & Category Selector on Anime Card */}
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleToggleOrSetFavorite(anime)}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                                    favCategory
                                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400'
                                      : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-rose-500/50'
                                  }`}
                                >
                                  <Heart
                                    className={`w-3.5 h-3.5 ${
                                      favCategory ? 'fill-rose-500 text-rose-500' : ''
                                    }`}
                                  />
                                  {favCategory ? 'В избранном' : 'В избранное'}
                                </button>
                                <select
                                  aria-label={`Выбрать список избранного для ${anime.title}`}
                                  value={favCategory || ''}
                                  onChange={(e) => {
                                    const val = e.target.value as FavoriteCategory | '';
                                    if (val) {
                                      handleToggleOrSetFavorite(anime, val);
                                    }
                                  }}
                                  className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                                >
                                  <option value="" disabled>
                                    Список…
                                  </option>
                                  {FAVORITE_CATEGORIES.map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                      {cat.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <h3 className="mt-1.5 text-lg font-bold text-slate-900 dark:text-white leading-snug">
                              {anime.title}
                            </h3>
                            <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                              {anime.originalTitle}
                            </p>
                            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              {anime.synopsis}
                            </p>
                          </div>

                          {/* Season Switcher Tabs */}
                          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label={`Сезоны ${anime.title}`}>
                                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 inline-flex items-center gap-1 mr-1">
                                  <Layers className="w-3.5 h-3.5 text-sky-500" />
                                  Сезон:
                                </span>
                                {anime.seasons.map((season) => {
                                  const isSelected = season.id === activeSeason.id;
                                  return (
                                    <button
                                      key={season.id}
                                      type="button"
                                      role="tab"
                                      aria-selected={isSelected}
                                      onClick={() =>
                                        updateCardSelection(anime, {
                                          seasonId: season.id,
                                          rangeIndex: 0,
                                          episodeSearch: '',
                                          episodeNumber: 1,
                                        })
                                      }
                                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                                        isSelected
                                          ? 'bg-sky-600 text-white border-sky-600'
                                          : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-sky-500'
                                      }`}
                                    >
                                      {season.title} ({season.episodes.length} сер.)
                                    </button>
                                  );
                                })}
                              </div>

                              {activeSeason.subtitle && (
                                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {activeSeason.subtitle}
                                </span>
                              )}
                            </div>

                            {activeSeason.episodes.length > 24 && (
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-1">
                                    Серии:
                                  </span>
                                  {rangeGroups.map((grp, rIdx) => (
                                    <button
                                      key={grp.label}
                                      type="button"
                                      onClick={() => {
                                        updateCardSelection(anime, {
                                          rangeIndex: rIdx,
                                          episodeSearch: '',
                                          episodeNumber: grp.start,
                                        });
                                      }}
                                      className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold transition-colors cursor-pointer ${
                                        safeRangeIndex === rIdx && !cleanEpQuery
                                          ? 'bg-sky-600 text-white'
                                          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-sky-500'
                                      }`}
                                    >
                                      {grp.label}
                                    </button>
                                  ))}
                                </div>

                                <div className="relative sm:w-48 shrink-0">
                                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                  <input
                                    type="text"
                                    value={sel.episodeSearch}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const num = Number(val.trim());
                                      const matchedEp =
                                        !Number.isNaN(num) &&
                                        num >= 1 &&
                                        num <= activeSeason.episodes.length
                                          ? num
                                          : sel.episodeNumber;
                                      updateCardSelection(anime, {
                                        episodeSearch: val,
                                        episodeNumber: matchedEp,
                                      });
                                    }}
                                    placeholder={`Поиск № серии (1–${activeSeason.episodes.length})`}
                                    aria-label={`Поиск по номеру серии для ${anime.title}`}
                                    className="w-full pl-8 pr-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                                  />
                                </div>
                              </div>
                            )}

                            {/* Interactive Episode Number Buttons Grid */}
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                                <span>
                                  Быстрый выбор серии ({visibleEpisodes.length} из {activeSeason.episodes.length}):
                                </span>
                                <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                                  Выбрана: Серия {selectedEp.number} — «{selectedEp.title}»
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1">
                                {visibleEpisodes.map((ep) => {
                                  const isEpActive = ep.number === selectedEp.number;
                                  return (
                                    <button
                                      key={ep.number}
                                      type="button"
                                      onClick={() =>
                                        updateCardSelection(anime, { episodeNumber: ep.number })
                                      }
                                      title={`Серия ${ep.number}: ${ep.title}`}
                                      className={`min-w-[36px] px-2 py-1 rounded-md text-xs font-mono tabular-nums font-semibold border transition-colors cursor-pointer ${
                                        isEpActive
                                          ? 'bg-sky-600 text-white border-sky-600'
                                          : 'bg-slate-50 dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-sky-500'
                                      }`}
                                    >
                                      {ep.number}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Episode Dropdown, Voiceover & Video Quality Controls */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                              <div>
                                <label
                                  htmlFor={`ep-select-${anime.id}`}
                                  className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
                                >
                                  Полный список ({activeSeason.episodes.length} сер.)
                                </label>
                                <select
                                  id={`ep-select-${anime.id}`}
                                  value={selectedEp.number}
                                  onChange={(e) => {
                                    const nextEpNum = Number(e.target.value);
                                    const nextRangeIdx = rangeGroups.findIndex(
                                      (g) => nextEpNum >= g.start && nextEpNum <= g.end
                                    );
                                    updateCardSelection(anime, {
                                      episodeNumber: nextEpNum,
                                      rangeIndex: nextRangeIdx >= 0 ? nextRangeIdx : sel.rangeIndex,
                                    });
                                  }}
                                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100"
                                >
                                  {activeSeason.episodes.map((ep) => (
                                    <option key={ep.number} value={ep.number}>
                                      Серия {ep.number}: {ep.title}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label
                                  htmlFor={`vo-select-${anime.id}`}
                                  className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
                                >
                                  Озвучка
                                </label>
                                <select
                                  id={`vo-select-${anime.id}`}
                                  value={sel.voiceover}
                                  onChange={(e) =>
                                    updateCardSelection(anime, { voiceover: e.target.value })
                                  }
                                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100"
                                >
                                  {anime.availableVoiceovers.map((vo) => (
                                    <option key={vo} value={vo}>
                                      {vo}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label
                                  htmlFor={`q-select-${anime.id}`}
                                  className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
                                >
                                  Качество (~{estMB} МБ)
                                </label>
                                <select
                                  id={`q-select-${anime.id}`}
                                  value={sel.quality}
                                  onChange={(e) =>
                                    updateCardSelection(anime, {
                                      quality: e.target.value as VideoQuality,
                                    })
                                  }
                                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono font-medium text-slate-900 dark:text-slate-100"
                                >
                                  {anime.availableQualities.map((q) => (
                                    <option key={q} value={q}>
                                      {q}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() =>
                                  handleQueueEpisode(
                                    anime,
                                    selectedEp,
                                    sel.voiceover,
                                    sel.quality,
                                    activeSeason.title
                                  )
                                }
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                              >
                                <Download className="w-3.5 h-3.5" />
                                Скачать серию {selectedEp.number}
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  handleOpenInPlayer(
                                    anime,
                                    selectedEp,
                                    sel.voiceover,
                                    sel.quality,
                                    0,
                                    activeSeason.id
                                  )
                                }
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                              >
                                <Play className="w-3.5 h-3.5 text-sky-500" />
                                Смотреть серию {selectedEp.number}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleQueueSeasonEpisodes(anime, activeSeason)}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                              >
                                <FolderDown className="w-3.5 h-3.5 text-sky-500" />
                                Скачать весь сезон ({activeSeason.episodes.length} сер.)
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {/* HOME BLOCK A: COMPACT SOURCE SITES STATUS & QUICK LINKS */}
            <section aria-labelledby="sources-status-heading" className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <h2
                  id="sources-status-heading"
                  className="text-base font-bold text-slate-900 dark:text-white"
                >
                  Подключённые сайты-источники и каталог AniLibria
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Прямой парсинг потоков и озвучек
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {SOURCE_SITES_DIRECTORY.map((src) => (
                  <div
                    key={src.site}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white inline-flex items-center gap-2">
                          <Globe className="w-4 h-4 text-sky-500 shrink-0" />
                          {src.site}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          {src.statusLabel}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Озвучки: {src.supportedStudios}
                      </p>
                      <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        Домен: {src.mirrorDomain} · Макс. поток: {src.maxResolution}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                      <button
                        type="button"
                        onClick={() => {
                          const q =
                            universalInput.trim() || activeQueryLabel || 'Магическая битва';
                          setUniversalInput(q);
                          executeUniversalSearch(q);
                          setSiteFilter(src.site);
                        }}
                        className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 transition-colors cursor-pointer text-center"
                      >
                        Искать на {src.site}
                      </button>
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
                      >
                        Открыть сайт ↗
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {/* TAB 2: ВСТРОЕННЫЙ ПЛЕЕР (player) */}
        {activeSection === 'player' && (
          <section aria-labelledby="player-heading" className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 id="player-heading" className="text-2xl font-bold text-slate-900 dark:text-white">
                  Встроенный плеер · {activePlayerAnime.title} ({activePlayerSeason.title})
                </h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Серия {activePlayerEpisode.number}: {activePlayerEpisode.title} · Озвучка:{' '}
                  {playerState.voiceover} · Поток {playerState.quality} ({activePlayerAnime.sourceSite})
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label
                  htmlFor="player-anime-switcher"
                  className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap"
                >
                  Источник / Релиз:
                </label>
                <select
                  id="player-anime-switcher"
                  value={activePlayerAnime.id}
                  onChange={(e) => {
                    const nextAnime =
                      availablePlayerAnimeChoices.find((a) => a.id === e.target.value) ||
                      DEFAULT_PLAYER_ANIME_LIST[0];
                    setPlayerState({
                      anime: nextAnime,
                      seasonId: nextAnime.defaultSeasonId,
                      episodeNumber: 1,
                      voiceover: nextAnime.availableVoiceovers[0],
                      quality: nextAnime.availableQualities[0],
                      initialProgressSeconds: getSavedEpisodeTimecode(
                        nextAnime.title,
                        nextAnime.defaultSeasonId,
                        1
                      ),
                      playlistEpisodes: null,
                    });
                  }}
                  className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100"
                >
                  {availablePlayerAnimeChoices.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} ({a.sourceSite})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <VideoPlayerView
              anime={activePlayerAnime}
              season={activePlayerSeason}
              episode={activePlayerEpisode}
              voiceover={playerState.voiceover}
              quality={playerState.quality}
              initialProgressSeconds={playerState.initialProgressSeconds}
              favoriteCategory={getFavoriteCategoryForAnime(activePlayerAnime.title)}
              onToggleFavorite={handleToggleOrSetFavorite}
              playlistEpisodes={playerState.playlistEpisodes}
              onClearPlaylistMode={() =>
                setPlayerState((prev) => ({ ...prev, playlistEpisodes: null }))
              }
              onSelectSeason={(nextSeason) =>
                setPlayerState((prev) => ({
                  ...prev,
                  seasonId: nextSeason.id,
                  episodeNumber: 1,
                  initialProgressSeconds: getSavedEpisodeTimecode(
                    activePlayerAnime.title,
                    nextSeason.id,
                    1
                  ),
                  playlistEpisodes: null,
                }))
              }
              onSelectEpisode={(ep) =>
                handleOpenInPlayer(
                  activePlayerAnime,
                  ep,
                  playerState.voiceover,
                  playerState.quality,
                  0,
                  activePlayerSeason.id,
                  playerState.playlistEpisodes
                )
              }
              onChangeVoiceover={(vo) =>
                setPlayerState((prev) => ({ ...prev, voiceover: vo }))
              }
              onChangeQuality={(q) =>
                setPlayerState((prev) => ({ ...prev, quality: q }))
              }
              onUpdateProgress={handlePlayerProgressUpdate}
              onQueueEpisode={handleQueueEpisode}
              onQueueSeason={handleQueueSeasonEpisodes}
            />
          </section>
        )}

        {/* TAB 3: ИЗБРАННОЕ (favorites) */}
        {activeSection === 'favorites' && (
          <section aria-labelledby="favorites-heading" className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1
                  id="favorites-heading"
                  className="text-2xl font-bold text-slate-900 dark:text-white"
                >
                  Избранное ({favorites.length})
                </h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Ваши персональные списки аниме: «Смотрю», «В планах», «Просмотрено» и «Любимое» с быстрым запуском просмотра.
                </p>
              </div>

              {/* Category Filter Tabs */}
              <div
                role="group"
                aria-label="Фильтр избранного по категориям"
                className="flex flex-wrap items-center gap-1.5"
              >
                <button
                  type="button"
                  onClick={() => setFavoriteFilter('ALL')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    favoriteFilter === 'ALL'
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Все ({favorites.length})
                </button>
                {FAVORITE_CATEGORIES.map((cat) => {
                  const count = favorites.filter((f) => f.category === cat.id).length;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setFavoriteFilter(cat.id)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                        favoriteFilter === cat.id
                          ? 'bg-sky-600 text-white border-sky-600'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {cat.label} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {filteredFavorites.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center space-y-3">
                <Heart className="w-8 h-8 text-rose-500 mx-auto" />
                <p className="text-base font-semibold text-slate-900 dark:text-white">
                  В этом списке избранного пока нет тайтлов
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Нажмите кнопку «В избранное» или выберите категорию («Смотрю», «В планах», «Просмотрено», «Любимое») на любой карточке аниме в поиске или в плеере.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveSection('catalog')}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 text-white hover:bg-sky-500 transition-colors cursor-pointer"
                >
                  Перейти к поиску аниме
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredFavorites.map((fav) => {
                  const matchedAnime = resolveAnimeForHistoryOrTask(
                    fav.animeId,
                    fav.title,
                    fav.sourceSite
                  );
                  const firstEp = matchedAnime.episodes[0];
                  return (
                    <div
                      key={fav.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div className="w-16 h-24 rounded-xl overflow-hidden shrink-0 bg-slate-950">
                          <AnimeArtwork
                            title={fav.title}
                            originalTitle={fav.originalTitle}
                            posterUrl={fav.posterUrl || matchedAnime.posterUrl}
                            className="w-full h-full object-cover rounded-xl"
                          />
                        </div>
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-rose-500">
                              {FAVORITE_CATEGORIES.find((c) => c.id === fav.category)?.label}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{fav.sourceSite}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">★ {fav.rating}</span>
                          </div>
                          <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                            {fav.title}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {fav.originalTitle}
                          </p>
                          <div className="flex items-center gap-2 pt-0.5">
                            <select
                              aria-label={`Изменить категорию для ${fav.title}`}
                              value={fav.category}
                              onChange={(e) =>
                                handleToggleOrSetFavorite(
                                  matchedAnime,
                                  e.target.value as FavoriteCategory
                                )
                              }
                              className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-medium text-slate-800 dark:text-slate-200"
                            >
                              {FAVORITE_CATEGORIES.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                  {cat.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenInPlayer(
                              matchedAnime,
                              firstEp,
                              defaultVoiceover,
                              defaultQuality,
                              0
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Смотреть
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveFavorite(fav.title)}
                          aria-label={`Удалить ${fav.title} из избранного`}
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* TAB 4: ОЧЕРЕДЬ ЗАГРУЗОК (queue — ONLY active/paused downloads, grouped sequentially by anime title) */}
        {activeSection === 'queue' && (
          <section aria-labelledby="queue-heading" className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h1 id="queue-heading" className="text-2xl font-bold text-slate-900 dark:text-white">
                  Очередь загрузок ({downloadQueue.length})
                </h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Здесь отображаются только активные закачки. Разные аниме группируются по тайтлам и скачиваются строго по очереди, а после достижения 100% автоматически переходят во вкладку «Сохраненное».
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    setDownloadQueue((prev) =>
                      enforceSequentialAnimeQueue(
                        prev.map((t) =>
                          t.status === 'paused' ? { ...t, status: 'queued' } : t
                        )
                      )
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Play className="w-3.5 h-3.5" />
                  Запустить очередь
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setDownloadQueue((prev) =>
                      prev.map((t) => ({ ...t, status: 'paused', speedMBps: 0 }))
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Pause className="w-3.5 h-3.5" />
                  Приостановить все
                </button>

                <button
                  type="button"
                  onClick={handleExportBatchScript}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Terminal className="w-3.5 h-3.5 text-sky-500" />
                  Экспорт скрипта ({platform === 'windows' ? '.ps1' : '.sh'})
                </button>
              </div>
            </div>

            {/* Queue Summary Metrics Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <span className="text-xs text-slate-500 dark:text-slate-400">Тайтлов в очереди</span>
                <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {activeQueueGroups.length}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <span className="text-xs text-slate-500 dark:text-slate-400">Текущая скорость</span>
                <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400">
                  {queueMetrics.totalSpeedMBps} МБ/с
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <span className="text-xs text-slate-500 dark:text-slate-400">Активных / В ожидании</span>
                <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {downloadQueue.length} сер.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <span className="text-xs text-slate-500 dark:text-slate-400">Перенесено в Сохраненное</span>
                <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  {savedEpisodes.length} сер.
                </p>
              </div>
            </div>

            {/* Grouped Queue List by Anime Title */}
            {activeQueueGroups.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center space-y-3">
                <p className="text-base font-semibold text-slate-900 dark:text-white">
                  Активных загрузок сейчас нет
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Все завершённые на 100% серии автоматически перенесены во вкладку «Сохраненное» ({savedEpisodes.length} сер.).
                </p>
                <div className="flex items-center justify-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveSection('saved')}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 transition-colors cursor-pointer"
                  >
                    Открыть Сохраненное ({savedPlaylists.length} плейлистов)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSection('catalog')}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 text-white hover:bg-sky-500 transition-colors cursor-pointer"
                  >
                    Найти новые серии
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {activeQueueGroups.map((group, groupIndex) => (
                  <div
                    key={group.groupKey}
                    data-testid={`queue-anime-group-${groupIndex}`}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
                  >
                    {/* Anime Group Header */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-12 h-16 rounded-lg overflow-hidden shrink-0 bg-slate-950">
                          <AnimeArtwork
                            title={group.animeTitle}
                            originalTitle={group.originalTitle}
                            posterUrl={group.posterUrl}
                            theme={group.artworkTheme}
                            className="w-full h-full object-cover rounded-lg"
                          />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span
                              className={`px-2 py-0.5 rounded font-semibold ${
                                group.isActiveGroup
                                  ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {group.isActiveGroup
                                ? `Очередь #${groupIndex + 1} · Скачивается сейчас`
                                : `Очередь #${groupIndex + 1} · Ожидает завершения предыдущего аниме`}
                            </span>
                            <span className="text-slate-500 dark:text-slate-400">
                              {group.tasks.length} сер. в группе
                            </span>
                          </div>
                          <h2 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                            {group.animeTitle}
                          </h2>
                        </div>
                      </div>
                    </div>

                    {/* Episodes inside this Anime Group */}
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {group.tasks.map((task) => (
                        <div
                          key={task.id}
                          className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                        >
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                              <span className="font-semibold text-sky-600 dark:text-sky-400">
                                {task.sourceSite}
                              </span>
                              {task.seasonTitle && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{task.seasonTitle}</span>
                                </>
                              )}
                              <span aria-hidden="true">·</span>
                              <span>Озвучка: {task.voiceover}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono">{task.quality}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono">
                                {task.downloadedMB} / {task.sizeMB} МБ
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-semibold">
                                {task.status === 'downloading'
                                  ? `Качается (${task.speedMBps} МБ/с)`
                                  : task.status === 'paused'
                                  ? 'На паузе'
                                  : 'В очереди по порядку'}
                              </span>
                            </div>

                            <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                              Серия {String(task.episodeNumber).padStart(2, '0')}: {task.episodeTitle}
                            </h3>

                            <div className="flex items-center gap-3 pt-1">
                              <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-300 ${
                                    task.status === 'paused'
                                      ? 'bg-amber-500'
                                      : task.status === 'downloading'
                                      ? 'bg-sky-500'
                                      : 'bg-slate-400 dark:bg-slate-600'
                                  }`}
                                  style={{ width: `${task.progressPercent}%` }}
                                />
                              </div>
                              <span className="text-xs font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300 w-12 text-right">
                                {task.progressPercent}%
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleToggleTaskPause(task.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                            >
                              {task.status === 'paused' ? (
                                <>
                                  <Play className="w-3.5 h-3.5" />
                                  Продолжить
                                </>
                              ) : (
                                <>
                                  <Pause className="w-3.5 h-3.5" />
                                  Пауза
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleInstantFinishDownload(task)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Завершить на 100%
                            </button>

                            <button
                              type="button"
                              onClick={() => handleRemoveTask(task.id)}
                              aria-label={`Удалить задачу ${task.animeTitle} серия ${task.episodeNumber}`}
                              className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* TAB 5: СОХРАНЕННОЕ (saved — Per-anime Playlist Folders + Local .json Backup) */}
        {activeSection === 'saved' && (
          <section aria-labelledby="saved-heading" className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h1 id="saved-heading" className="text-2xl font-bold text-slate-900 dark:text-white">
                  Сохраненное · Папки-плейлисты ({savedPlaylists.length})
                </h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Все скачанные на 100% серии автоматически группируются по отдельным папкам-плейлистам для каждого аниме. Выберите плейлист для просмотра серий подряд.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleExportLocalBackup}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer whitespace-nowrap"
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  Локальный бэкап (.json)
                </button>
                <button
                  type="button"
                  onClick={() => backupFileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5 text-sky-500" />
                  Импорт бэкапа (.json)
                </button>
              </div>
            </div>

            {savedPlaylists.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center space-y-3">
                <FolderOpen className="w-8 h-8 text-sky-500 mx-auto" />
                <p className="text-base font-semibold text-slate-900 dark:text-white">
                  У вас пока нет сохранённых плейлистов
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Когда серия в «Очереди загрузок» скачивается на 100%, она автоматически перемещается сюда и формирует папку-плейлист своего аниме.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveSection('catalog')}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 text-white hover:bg-sky-500 transition-colors cursor-pointer"
                >
                  Перейти к поиску аниме
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column: Per-Anime Playlist Folder Cards */}
                <div className="lg:col-span-5 space-y-3">
                  <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Папки-плейлисты по аниме ({savedPlaylists.length})
                  </h2>
                  {savedPlaylists.map((playlist) => {
                    const isSelected =
                      activeSelectedPlaylist?.playlistKey === playlist.playlistKey;
                    const matchedAnime = resolveAnimeForHistoryOrTask(
                      playlist.animeId,
                      playlist.animeTitle,
                      playlist.sourceSite
                    );
                    return (
                      <div
                        key={playlist.playlistKey}
                        data-testid={`saved-playlist-folder-${playlist.playlistKey}`}
                        onClick={() => setSelectedPlaylistKey(playlist.playlistKey)}
                        className={`rounded-xl border p-4 transition-colors cursor-pointer flex items-center justify-between gap-4 ${
                          isSelected
                            ? 'border-sky-500 bg-sky-500/10 dark:bg-sky-500/10'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-sky-500/50'
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-14 h-20 rounded-xl overflow-hidden shrink-0 bg-slate-950">
                            <AnimeArtwork
                              title={playlist.animeTitle}
                              originalTitle={playlist.originalTitle}
                              posterUrl={playlist.posterUrl || matchedAnime.posterUrl}
                              theme={playlist.artworkTheme}
                              className="w-full h-full object-cover rounded-xl"
                            />
                          </div>
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 text-xs text-sky-600 dark:text-sky-400 font-semibold">
                              <ListVideo className="w-3.5 h-3.5 shrink-0" />
                              <span>Сохранено серий: {playlist.episodes.length}</span>
                            </div>
                            <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                              {playlist.animeTitle}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                              Объём: {playlist.totalSizeMB} МБ · {playlist.sourceSite}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
                      </div>
                    );
                  })}
                </div>

                {/* Right Column: Opened Playlist Episodes in Order (Серия 1, Серия 2...) */}
                <div className="lg:col-span-7">
                  {activeSelectedPlaylist && (
                    <div
                      data-testid="active-saved-playlist-view"
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
                    >
                      <div className="p-5 bg-slate-50 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            Плейлист аниме · {activeSelectedPlaylist.episodes.length} сер. по порядку
                          </span>
                          <h2 className="mt-0.5 text-xl font-bold text-slate-900 dark:text-white">
                            {activeSelectedPlaylist.animeTitle}
                          </h2>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {activeSelectedPlaylist.originalTitle} · Суммарный размер:{' '}
                            {activeSelectedPlaylist.totalSizeMB} МБ
                          </p>
                        </div>

                        <button
                          type="button"
                          data-testid="play-saved-playlist-button"
                          onClick={() => handlePlaySavedPlaylist(activeSelectedPlaylist)}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <Play className="w-4 h-4" />
                          Смотреть плейлист подряд
                        </button>
                      </div>

                      <div className="divide-y divide-slate-200 dark:divide-slate-800">
                        {activeSelectedPlaylist.episodes.map((epTask) => {
                          const matchedAnime = resolveAnimeForHistoryOrTask(
                            epTask.animeId,
                            epTask.animeTitle,
                            epTask.sourceSite
                          );
                          const epInfo: EpisodeInfo = {
                            number: epTask.episodeNumber,
                            title: epTask.episodeTitle,
                            durationSeconds: epTask.durationSeconds || 1440,
                            releaseDate: '2025',
                          };
                          const orderedEpisodeInfos: EpisodeInfo[] =
                            activeSelectedPlaylist.episodes.map((e) => ({
                              number: e.episodeNumber,
                              title: e.episodeTitle,
                              durationSeconds: e.durationSeconds || 1440,
                              releaseDate: '2025',
                            }));

                          return (
                            <div
                              key={epTask.id}
                              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                  <span className="font-mono font-bold text-sky-600 dark:text-sky-400">
                                    Серия {epTask.episodeNumber}
                                  </span>
                                  {epTask.seasonTitle && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span>{epTask.seasonTitle}</span>
                                    </>
                                  )}
                                  <span aria-hidden="true">·</span>
                                  <span>{epTask.voiceover}</span>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono">
                                    {epTask.quality} ({epTask.sizeMB} МБ)
                                  </span>
                                </div>
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                  Серия {epTask.episodeNumber}: {epTask.episodeTitle}
                                </h3>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleOpenInPlayer(
                                      matchedAnime,
                                      epInfo,
                                      epTask.voiceover,
                                      epTask.quality,
                                      0,
                                      matchedAnime.defaultSeasonId,
                                      orderedEpisodeInfos
                                    )
                                  }
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  <Play className="w-3.5 h-3.5" />
                                  Смотреть
                                </button>
                                <button
                                  type="button"
                                  onClick={() => triggerBrowserFileDownload(epTask)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  <HardDrive className="w-3.5 h-3.5" />
                                  .mp4
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSavedEpisode(epTask.id)}
                                  aria-label={`Удалить серию ${epTask.episodeNumber} из сохраненного`}
                                  className="p-2 rounded-lg text-slate-400 hover:text-rose-500 cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* TAB 6: ИСТОРИЯ (history) */}
        {activeSection === 'history' && (
          <section aria-labelledby="history-heading" className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1
                  id="history-heading"
                  className="text-2xl font-bold text-slate-900 dark:text-white"
                >
                  История просмотров ({watchHistory.length})
                </h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Автоматическое сохранение секунды просмотра (таймкода), выбранной озвучки и качества в localStorage.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleExportLocalBackup}
                  className="px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Экспорт бэкапа (.json)
                </button>
                {watchHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setWatchHistory([]);
                      showBanner('История просмотров очищена.');
                    }}
                    className="px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Очистить историю
                  </button>
                )}
              </div>
            </div>

            {watchHistory.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center space-y-3">
                <p className="text-base font-semibold text-slate-900 dark:text-white">
                  История просмотров пуста
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Найдите любое аниме через поиск и запустите серию во встроенном плеере, чтобы таймкод автоматически сохранился.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                {watchHistory.map((item) => {
                  const pct = Math.min(
                    100,
                    Math.round((item.progressSeconds / Math.max(1, item.durationSeconds)) * 100)
                  );
                  const matchedAnime = resolveAnimeForHistoryOrTask(
                    item.animeId,
                    item.animeTitle,
                    item.sourceSite
                  );
                  const matchedEp = matchedAnime.episodes.find(
                    (e) => e.number === item.episodeNumber
                  ) || {
                    number: item.episodeNumber,
                    title: item.episodeTitle,
                    durationSeconds: item.durationSeconds,
                    releaseDate: '2025',
                  };

                  return (
                    <div
                      key={item.id}
                      className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div className="w-14 h-20 rounded-xl overflow-hidden shrink-0 bg-slate-950">
                          <AnimeArtwork
                            title={matchedAnime.title}
                            originalTitle={matchedAnime.originalTitle}
                            posterUrl={item.posterUrl || matchedAnime.posterUrl}
                            theme={matchedAnime.artworkTheme}
                            className="w-full h-full object-cover rounded-xl"
                          />
                        </div>
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-sky-600 dark:text-sky-400">
                              {item.sourceSite}
                            </span>
                            {item.seasonTitle && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{item.seasonTitle}</span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <span>Озвучка: {item.voiceover}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{item.quality}</span>
                          </div>

                          <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                            {item.animeTitle} — Серия {String(item.episodeNumber).padStart(2, '0')}:{' '}
                            {item.episodeTitle}
                          </h3>

                          <div className="flex items-center gap-3 pt-1">
                            <div className="w-48 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-sky-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                              <Clock className="w-3 h-3 inline mr-1" />
                              {formatTimecode(item.progressSeconds)} /{' '}
                              {formatTimecode(item.durationSeconds)} ({pct}%)
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenInPlayer(
                              matchedAnime,
                              matchedEp,
                              item.voiceover,
                              item.quality,
                              item.progressSeconds
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Продолжить с {formatTimecode(item.progressSeconds)}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setWatchHistory((prev) => prev.filter((h) => h.id !== item.id));
                          }}
                          aria-label={`Удалить из истории ${item.animeTitle}`}
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>

      {/* QUIET FOOTER */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>
            AniMac Studio · Прямая интеграция с каталогом AniLibria (HLS 1080p) · Автономное хранение в localStorage и IndexedDB
          </span>
          <span className="font-mono">
            macOS · Windows 10/11 · Android PWA
          </span>
        </div>
      </footer>
    </div>
  );
}
