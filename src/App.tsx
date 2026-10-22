import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download,
  Play,
  Pause,
  Trash2,
  FolderDown,
  ShieldCheck,
  Sun,
  Moon,
  Cloud,
  LogOut,
  Search,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
  Terminal,
  RefreshCw,
  Clock,
  WifiOff,
  Globe,
  Sparkles,
  X,
  Layers,
} from 'lucide-react';
import {
  AnimeSeason,
  AnimeSeries,
  DEFAULT_PLAYER_ANIME_LIST,
  DownloadTask,
  EpisodeInfo,
  POPULAR_SEARCH_CHIPS,
  SOURCE_SITES_DIRECTORY,
  VIDEO_QUALITIES,
  VOICEOVER_STUDIOS,
  WatchHistoryItem,
  buildEpisodeRangeGroups,
  calculateQueueMetrics,
  createDownloadTask,
  searchAnimeAcrossSites,
  formatTimecode,
  estimateEpisodeSizeMB,
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
import { VideoPlayerView } from './components/VideoPlayerModal';
import {
  StoredOfflineEpisode,
  listOfflineEpisodes,
  removeOfflineEpisode,
  saveEpisodeOffline,
  triggerBrowserFileDownload,
} from './lib/offlineStorage';
import {
  User,
  auth,
  ensureUserProfileInCloud,
  onAuthStateChanged,
  removeDownloadTaskFromCloud,
  removeWatchHistoryFromCloud,
  signInWithGoogleAccount,
  signOutAccount,
  subscribeToCloudSync,
  syncDownloadTaskToCloud,
  syncWatchHistoryItemToCloud,
  testFirestoreConnection,
} from './lib/firebase';

type ActiveSection = 'catalog' | 'queue' | 'player' | 'history' | 'offline';

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
  HISTORY: 'animac_history_v2',
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

  // Navigation section
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

  // Download Queue state (starts empty until user downloads episodes, persisted in v2 storage)
  const [downloadQueue, setDownloadQueue] = useState<DownloadTask[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.QUEUE);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore
    }
    return [];
  });

  // Watch History state (starts empty until user watches episodes, persisted in v2 storage)
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
  }>({
    anime: DEFAULT_PLAYER_ANIME_LIST[0],
    seasonId: DEFAULT_PLAYER_ANIME_LIST[0].defaultSeasonId,
    episodeNumber: 1,
    voiceover: 'AniLibria',
    quality: '1080p',
    initialProgressSeconds: 0,
  });

  // Offline IndexedDB episodes state
  const [offlineEpisodes, setOfflineEpisodes] = useState<StoredOfflineEpisode[]>([]);

  // Connectivity indicator
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [simulateOfflineMode, setSimulateOfflineMode] = useState(false);

  // Firebase Auth & Sync state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Toast notification banner
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

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
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(watchHistory));
  }, [watchHistory]);

  // Validate Firestore connection on boot and load offline episodes
  useEffect(() => {
    testFirestoreConnection();
    listOfflineEpisodes().then(setOfflineEpisodes);
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

  // Firebase Auth & Firestore real-time subscription
  useEffect(() => {
    let unsubCloud: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(
      auth,
      (user) => {
        setCurrentUser(user);
        if (unsubCloud) {
          unsubCloud();
          unsubCloud = null;
        }
        if (user) {
          ensureUserProfileInCloud({
            user,
            preferredPlatform: platform,
            preferredQuality: defaultQuality,
            preferredVoiceover: defaultVoiceover,
            theme,
          })
            .then(() => {
              setLastSyncTime(new Date().toLocaleTimeString('ru-RU'));
              unsubCloud = subscribeToCloudSync(user, {
                onProfile: (prof) => {
                  if (prof.preferredPlatform) setPlatform(prof.preferredPlatform);
                  if (prof.preferredQuality) setDefaultQuality(prof.preferredQuality);
                  if (prof.preferredVoiceover) setDefaultVoiceover(prof.preferredVoiceover);
                  if (prof.theme) setTheme(prof.theme);
                },
                onWatchHistory: (cloudItems) => {
                  if (cloudItems.length > 0) {
                    setWatchHistory((prev) => {
                      const merged = [...prev];
                      for (const ci of cloudItems) {
                        if (!ci.id || !ci.animeId) continue;
                        const idx = merged.findIndex((m) => m.id === ci.id);
                        const fullItem: WatchHistoryItem = {
                          id: ci.id,
                          animeId: ci.animeId,
                          animeTitle: ci.animeTitle || 'Аниме',
                          artworkTheme: 'alchemist',
                          episodeNumber: ci.episodeNumber || 1,
                          episodeTitle: ci.episodeTitle || 'Эпизод 1',
                          voiceover: ci.voiceover || 'AniLibria',
                          quality: (ci.quality as VideoQuality) || '1080p',
                          sourceSite: (ci.sourceSite as SourceSite) || 'YummyAnime.TV',
                          progressSeconds: ci.progressSeconds ?? 0,
                          durationSeconds: ci.durationSeconds ?? 1440,
                          updatedAtIso: new Date().toISOString(),
                        };
                        if (idx >= 0) {
                          merged[idx] = fullItem;
                        } else {
                          merged.unshift(fullItem);
                        }
                      }
                      return merged;
                    });
                    setLastSyncTime(new Date().toLocaleTimeString('ru-RU'));
                  }
                },
                onDownloadQueue: () => {
                  setLastSyncTime(new Date().toLocaleTimeString('ru-RU'));
                },
              });
            })
            .catch((err) => {
              console.error(err);
            });
        }
      },
      (err) => {
        console.error(err);
      }
    );

    return () => {
      unsubAuth();
      if (unsubCloud) unsubCloud();
    };
  }, []);

  // Download Queue active progress ticker
  useEffect(() => {
    const activeTasks = downloadQueue.some((t) => t.status === 'downloading');
    if (!activeTasks) return;

    const timer = setInterval(() => {
      setDownloadQueue((prev) =>
        prev.map((task) => {
          if (task.status !== 'downloading') return task;
          const nextPercent = Math.min(100, task.progressPercent + 10);
          const nextDownloaded = Math.round((task.sizeMB * nextPercent) / 100);
          if (nextPercent >= 100) {
            const completedTask: DownloadTask = {
              ...task,
              status: 'completed',
              progressPercent: 100,
              downloadedMB: task.sizeMB,
              speedMBps: 0,
              isOfflineAvailable: true,
              updatedAtIso: new Date().toISOString(),
            };
            saveEpisodeOffline(completedTask).then(() => {
              listOfflineEpisodes().then(setOfflineEpisodes);
            });
            if (currentUser) {
              syncDownloadTaskToCloud(currentUser, completedTask).catch(() => {});
            }
            return completedTask;
          }
          return {
            ...task,
            progressPercent: nextPercent,
            downloadedMB: nextDownloaded,
          };
        })
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [downloadQueue, currentUser]);

  // Filtered search results by site
  const filteredSearchResults = useMemo(() => {
    return searchResults.filter((anime) => {
      return siteFilter === 'ALL' || anime.sourceSite === siteFilter;
    });
  }, [searchResults, siteFilter]);

  const queueMetrics = useMemo(() => calculateQueueMetrics(downloadQueue), [downloadQueue]);

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

  // Add single episode to download queue
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
        const existsIdx = prev.findIndex((t) => t.id === newTask.id);
        if (existsIdx >= 0) {
          const updated = [...prev];
          updated[existsIdx] = {
            ...newTask,
            status: 'downloading',
            progressPercent: Math.max(15, prev[existsIdx].progressPercent),
          };
          return updated;
        }
        return [newTask, ...prev];
      });

      if (currentUser) {
        syncDownloadTaskToCloud(currentUser, newTask).catch(() => {});
      }

      showBanner(
        `Добавлено в очередь: «${anime.title}» (${resolvedSeasonTitle}, ${anime.sourceSite}) — Серия ${episode.number} [${voiceover}, ${quality}]`
      );
    },
    [platform, currentUser, showBanner]
  );

  // Batch queue all episodes of the selected season
  const handleQueueSeasonEpisodes = (anime: AnimeSeries, season: AnimeSeason) => {
    const sel = getCardSelection(anime);
    const newTasks = season.episodes.map((ep, idx) => {
      const task = createDownloadTask({
        anime,
        seasonTitle: season.title,
        episode: ep,
        voiceover: sel.voiceover,
        quality: sel.quality,
        platform,
      });
      if (idx > 1) {
        task.status = 'queued';
        task.speedMBps = 0;
      }
      return task;
    });

    setDownloadQueue((prev) => {
      const existingIds = new Set(prev.map((t) => t.id));
      const uniqueNew = newTasks.filter((t) => !existingIds.has(t.id));
      return [...uniqueNew, ...prev];
    });

    showBanner(
      `${season.title} (${season.episodes.length} сер.) «${anime.title}» (${anime.sourceSite}) добавлен в очередь загрузок`
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
      resumeSeconds = 0,
      seasonId?: string
    ) => {
      const activeSeason =
        (seasonId ? anime.seasons.find((s) => s.id === seasonId) : undefined) ||
        anime.seasons.find((s) => s.id === anime.defaultSeasonId) ||
        anime.seasons[0];

      setPlayerState({
        anime,
        seasonId: activeSeason.id,
        episodeNumber: episode.number,
        voiceover,
        quality,
        initialProgressSeconds: resumeSeconds,
      });

      const historyItem: WatchHistoryItem = {
        id: `${anime.id}-${activeSeason.id}-ep-${episode.number}`,
        animeId: anime.id,
        animeTitle: anime.title,
        seasonTitle: activeSeason.title,
        artworkTheme: anime.artworkTheme,
        episodeNumber: episode.number,
        episodeTitle: episode.title,
        voiceover,
        quality,
        sourceSite: anime.sourceSite,
        progressSeconds: resumeSeconds,
        durationSeconds: episode.durationSeconds,
        updatedAtIso: new Date().toISOString(),
      };

      setWatchHistory((prev) => {
        const filtered = prev.filter((item) => item.id !== historyItem.id);
        return [historyItem, ...filtered];
      });

      if (currentUser) {
        syncWatchHistoryItemToCloud(currentUser, historyItem).catch(() => {});
      }

      setActiveSection('player');
    },
    [currentUser]
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

      const updatedItem: WatchHistoryItem = {
        id: historyId,
        animeId: anime.id,
        animeTitle: anime.title,
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

      if (currentUser) {
        syncWatchHistoryItemToCloud(currentUser, updatedItem).catch(() => {});
      }
    },
    [playerState, currentUser]
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

  // Toggle task pause/resume
  const handleToggleTaskPause = (taskId: string) => {
    setDownloadQueue((prev) =>
      prev.map((task) => {
        if (task.id !== taskId || task.status === 'completed') return task;
        const nextStatus = task.status === 'downloading' ? 'paused' : 'downloading';
        const updated: DownloadTask = {
          ...task,
          status: nextStatus,
          speedMBps: nextStatus === 'downloading' ? 21.4 : 0,
          updatedAtIso: new Date().toISOString(),
        };
        if (currentUser) {
          syncDownloadTaskToCloud(currentUser, updated).catch(() => {});
        }
        return updated;
      })
    );
  };

  // Complete a download immediately (for instant offline caching)
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
    setDownloadQueue((prev) => prev.map((t) => (t.id === task.id ? completed : t)));
    await saveEpisodeOffline(completed);
    const updatedOffline = await listOfflineEpisodes();
    setOfflineEpisodes(updatedOffline);
    if (currentUser) {
      syncDownloadTaskToCloud(currentUser, completed).catch(() => {});
    }
    showBanner(`Серия ${task.episodeNumber} («${task.animeTitle}») сохранена в оффлайн-хранилище.`);
  };

  // Remove download task
  const handleRemoveTask = (taskId: string) => {
    setDownloadQueue((prev) => prev.filter((t) => t.id !== taskId));
    if (currentUser) {
      removeDownloadTaskFromCloud(currentUser, taskId).catch(() => {});
    }
  };

  // Export platform batch script (.sh / .ps1)
  const handleExportBatchScript = () => {
    const script = generatePlatformBatchScript(
      downloadQueue.map((t) => ({
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

  // Google Sign-In handler
  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      const user = await signInWithGoogleAccount();
      await ensureUserProfileInCloud({
        user,
        preferredPlatform: platform,
        preferredQuality: defaultQuality,
        preferredVoiceover: defaultVoiceover,
        theme,
      });
      for (const h of watchHistory) {
        await syncWatchHistoryItemToCloud(user, h);
      }
      for (const q of downloadQueue) {
        await syncDownloadTaskToCloud(user, q);
      }
      setLastSyncTime(new Date().toLocaleTimeString('ru-RU'));
      showBanner(`Аккаунт ${user.email || user.displayName} синхронизирован с облаком.`);
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? `Не удалось выполнить вход через окно авторизации: ${err.message}`
          : 'Ошибка авторизации'
      );
    }
  };

  const activePlayerAnime = playerState.anime;
  const activePlayerSeason =
    activePlayerAnime.seasons.find((s) => s.id === playerState.seasonId) ||
    activePlayerAnime.seasons[0];
  const activePlayerEpisode =
    activePlayerSeason.episodes.find((e) => e.number === playerState.episodeNumber) ||
    activePlayerSeason.episodes[0];
  const isCurrentEpisodeOffline = offlineEpisodes.some(
    (o) =>
      o.animeId === activePlayerAnime.id && o.episodeNumber === activePlayerEpisode.number
  );

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

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors">
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs">
        {/* Zone 1: Single brand link with Nekomimi icon */}
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
            className="w-7 h-7 rounded-lg shrink-0"
          />
          AniMac Studio
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav
          aria-label="Основная навигация"
          className="hidden md:flex items-center gap-6 overflow-x-auto text-sm font-medium"
        >
          <a
            href="#catalog"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('catalog');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === 'catalog'
                ? 'border-sky-500 text-sky-600 dark:text-sky-400 font-semibold'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Поиск и Главная
          </a>
          <a
            href="#queue"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('queue');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === 'queue'
                ? 'border-sky-500 text-sky-600 dark:text-sky-400 font-semibold'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Очередь загрузок ({downloadQueue.length})
          </a>
          <a
            href="#player"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('player');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === 'player'
                ? 'border-sky-500 text-sky-600 dark:text-sky-400 font-semibold'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Встроенный плеер
          </a>
          <a
            href="#history"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('history');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === 'history'
                ? 'border-sky-500 text-sky-600 dark:text-sky-400 font-semibold'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            История ({watchHistory.length})
          </a>
          <a
            href="#offline"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('offline');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === 'offline'
                ? 'border-sky-500 text-sky-600 dark:text-sky-400 font-semibold'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Оффлайн и Защита ({offlineEpisodes.length})
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <PWAInstallButton activePlatform={platform} />
        </div>
      </header>

      {/* MOBILE / ANDROID NAVIGATION BAR */}
      <nav
        aria-label="Мобильная навигация"
        className="md:hidden flex items-center gap-2 overflow-x-auto px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold"
      >
        {(
          [
            { id: 'catalog', label: 'Поиск' },
            { id: 'queue', label: `Очередь (${downloadQueue.length})` },
            { id: 'player', label: 'Плеер' },
            { id: 'history', label: `История (${watchHistory.length})` },
            { id: 'offline', label: `Оффлайн (${offlineEpisodes.length})` },
          ] as const
        ).map((tab) => (
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

      {/* WORKSPACE CONTROL BAR (Theme, OS Target, Default Voiceover & Quality, Account Sync) */}
      <section
        aria-label="Панель параметров загрузки и синхронизации"
        className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900/60 px-6 py-3"
      >
        <div className="max-w-[1360px] mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Left: Platform Target & Default Download Preferences */}
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

          {/* Right: Offline Mode Toggle, Theme Switcher, and Account Sync */}
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

            {currentUser ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600 dark:text-slate-300 font-medium truncate max-w-[180px]">
                  {currentUser.email || currentUser.displayName}
                </span>
                <button
                  type="button"
                  onClick={() => signOutAccount()}
                  aria-label="Выйти из аккаунта"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Выйти
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
              >
                <Cloud className="w-3.5 h-3.5" />
                Синхронизация аккаунта
              </button>
            )}
          </div>
        </div>
      </section>

      {/* STATUS TOAST / OFFLINE BANNER */}
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

      {effectiveOffline && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-6 py-2 text-xs text-amber-800 dark:text-amber-300">
          <div className="max-w-[1360px] mx-auto flex items-center justify-between gap-4">
            <span>
              <strong>Автономный оффлайн-режим активен:</strong> все скачанные серии ({offlineEpisodes.length} шт.) доступны для просмотра из локального хранилища IndexedDB без подключения к сети.
            </span>
            <button
              type="button"
              onClick={() => setActiveSection('offline')}
              className="font-semibold underline cursor-pointer whitespace-nowrap"
            >
              Открыть оффлайн-хранилище
            </button>
          </div>
        </div>
      )}

      {/* MAIN CONTENT VIEWPORT */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-6 py-8 space-y-8">
        {/* SECTION 1: UNIVERSAL SEARCH & HOME SCREEN */}
        {activeSection === 'catalog' && (
          <>
            {/* Universal Search & Link Extractor Box */}
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
                    Введите название аниме на русском или английском (например, «Черный клевер» / «Black Clover») или прямую ссылку с YummyAnime.TV, AnimeGO или AnimeVost.org.
                  </p>
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 shrink-0">
                  <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                    <ShieldCheck className="w-4 h-4" />
                    Защита: HTTPS + SSRF/XSS фильтр
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
                    placeholder="Название («Черный клевер», «Black Clover») или ссылка https://animego.org/..."
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

              {/* Popular Search Suggestion Chips (b) */}
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

            {/* DYNAMIC SEARCH RESULTS ACROSS YummyAnime.TV, AnimeGO, AnimeVost.org */}
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
                      Синхронная выдача с YummyAnime.TV, AnimeGO и AnimeVost.org с выбором всех сезонов, серий, озвучки и качества.
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

                    // Filter episodes by search query or active range group
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

                    return (
                      <article
                        key={anime.id}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col md:flex-row"
                      >
                        {/* Left Artwork Column */}
                        <div className="md:w-52 shrink-0 bg-slate-950 relative aspect-[16/9] md:aspect-auto">
                          <AnimeArtwork
                            theme={anime.artworkTheme}
                            className="w-full h-full object-cover"
                          />
                        </div>

                        {/* Right Content Column */}
                        <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                          <div>
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

                          {/* 1. Season Switcher Tabs */}
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

                            {/* 2. Episode Range Grouping (1–25, 26–50...) & Number Search when > 24 episodes */}
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

                            {/* Interactive Episode Number Buttons Grid for active range / season */}
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
                  Подключённые сайты-источники
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
                          const q = activeQueryLabel || 'Черный клевер';
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

            {/* HOME BLOCK C: RECENT DOWNLOADS & WATCH HISTORY */}
            <section aria-labelledby="recent-activity-heading" className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2
                    id="recent-activity-heading"
                    className="text-base font-bold text-slate-900 dark:text-white"
                  >
                    Последние загрузки и история просмотров
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Быстрый доступ к скачанным сериям и продолжению просмотра с последнего таймкода
                  </p>
                </div>
                {(downloadQueue.length > 0 || watchHistory.length > 0) && (
                  <div className="flex items-center gap-3 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setActiveSection('queue')}
                      className="text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                    >
                      Вся очередь ({downloadQueue.length})
                    </button>
                    <span aria-hidden="true" className="text-slate-400">
                      ·
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveSection('history')}
                      className="text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                    >
                      Вся история ({watchHistory.length})
                    </button>
                  </div>
                )}
              </div>

              {downloadQueue.length === 0 && watchHistory.length === 0 ? (
                <div
                  data-testid="empty-recent-downloads"
                  className="rounded-xl border border-dashed border-slate-300 dark:border-slate-800 bg-white/60 dark:bg-slate-900/50 p-10 text-center space-y-2.5"
                >
                  <HardDrive className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto" />
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Здесь появятся ваши скачанные серии
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    Выберите любой популярный запрос выше (например, «Черный клевер» или «Человек-бензопила») или введите название аниме в строку поиска, чтобы скачать серию или начать просмотр.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {downloadQueue.slice(0, 4).map((task) => {
                    const matchedAnime = resolveAnimeForHistoryOrTask(
                      task.animeId,
                      task.animeTitle,
                      task.sourceSite
                    );
                    const matchedEp = matchedAnime.episodes.find(
                      (e) => e.number === task.episodeNumber
                    ) || {
                      number: task.episodeNumber,
                      title: task.episodeTitle,
                      durationSeconds: task.durationSeconds,
                      releaseDate: '2025',
                    };

                    return (
                      <div
                        key={task.id}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
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
                            <span>{task.voiceover}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{task.quality}</span>
                          </div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                            {task.animeTitle} — Серия {String(task.episodeNumber).padStart(2, '0')}
                          </h3>
                          <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            Статус:{' '}
                            {task.status === 'completed'
                              ? 'Готово (Оффлайн)'
                              : `Загрузка ${task.progressPercent}%`}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenInPlayer(
                                matchedAnime,
                                matchedEp,
                                task.voiceover,
                                task.quality,
                                0
                              )
                            }
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer whitespace-nowrap"
                          >
                            Смотреть
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {watchHistory.slice(0, 4).map((item) => {
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
                        key={`hist-${item.id}`}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              Просмотрено
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{item.sourceSite}</span>
                            {item.seasonTitle && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{item.seasonTitle}</span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <span>{item.voiceover}</span>
                          </div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                            {item.animeTitle} — Серия {String(item.episodeNumber).padStart(2, '0')}
                          </h3>
                          <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            Таймкод: {formatTimecode(item.progressSeconds)} /{' '}
                            {formatTimecode(item.durationSeconds)}
                          </p>
                        </div>

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
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          Продолжить
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {/* SECTION 2: DOWNLOAD QUEUE */}
        {activeSection === 'queue' && (
          <section aria-labelledby="queue-heading" className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h1 id="queue-heading" className="text-2xl font-bold text-slate-900 dark:text-white">
                  Очередь загрузок ({downloadQueue.length})
                </h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Управление потоками скачивания с YummyAnime.TV, AnimeGO и AnimeVost.org, проверка SHA-256 и сохранение на {platform.toUpperCase()}.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    setDownloadQueue((prev) =>
                      prev.map((t) =>
                        t.status === 'paused' || t.status === 'queued'
                          ? { ...t, status: 'downloading', speedMBps: 22.4 }
                          : t
                      )
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Play className="w-3.5 h-3.5" />
                  Запустить все
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setDownloadQueue((prev) =>
                      prev.map((t) =>
                        t.status === 'downloading' ? { ...t, status: 'paused', speedMBps: 0 } : t
                      )
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
                  Экспорт скрипта для{' '}
                  {platform === 'macos'
                    ? 'macOS (.sh)'
                    : platform === 'windows'
                    ? 'Windows (.ps1)'
                    : 'Android (.sh)'}
                </button>
              </div>
            </div>

            {/* Queue Summary Metrics Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <span className="text-xs text-slate-500 dark:text-slate-400">Активные потоки</span>
                <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {queueMetrics.activeCount}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <span className="text-xs text-slate-500 dark:text-slate-400">Суммарная скорость</span>
                <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400">
                  {queueMetrics.totalSpeedMBps} МБ/с
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <span className="text-xs text-slate-500 dark:text-slate-400">Загружено объёма</span>
                <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {queueMetrics.totalDownloadedMB} / {queueMetrics.totalSizeMB} МБ
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <span className="text-xs text-slate-500 dark:text-slate-400">Готово (Оффлайн)</span>
                <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  {queueMetrics.completedCount} сер.
                </p>
              </div>
            </div>

            {/* Queue Table / List */}
            {downloadQueue.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center space-y-3">
                <p className="text-base font-semibold text-slate-900 dark:text-white">
                  Здесь появятся ваши скачанные серии
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Перейдите на вкладку «Поиск и Главная», введите название аниме (например, «Черный клевер») или ссылку с YummyAnime.TV, AnimeGO или AnimeVost.org.
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
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                {downloadQueue.map((task) => {
                  const matchedAnime = resolveAnimeForHistoryOrTask(
                    task.animeId,
                    task.animeTitle,
                    task.sourceSite
                  );
                  const matchedEp = matchedAnime.episodes.find(
                    (e) => e.number === task.episodeNumber
                  ) || {
                    number: task.episodeNumber,
                    title: task.episodeTitle,
                    durationSeconds: task.durationSeconds,
                    releaseDate: '2025',
                  };

                  return (
                    <div
                      key={task.id}
                      className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-semibold text-sky-600 dark:text-sky-400">
                            {task.sourceSite}
                          </span>
                          {task.seasonTitle && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-medium text-slate-700 dark:text-slate-300">
                                {task.seasonTitle}
                              </span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span>Озвучка: {task.voiceover}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">Качество: {task.quality}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {task.downloadedMB} / {task.sizeMB} МБ
                          </span>
                        </div>

                        <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                          {task.animeTitle} — Серия {String(task.episodeNumber).padStart(2, '0')}:{' '}
                          {task.episodeTitle}
                        </h3>

                        {/* Progress Bar */}
                        <div className="flex items-center gap-3 pt-1">
                          <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${
                                task.status === 'completed'
                                  ? 'bg-emerald-500'
                                  : task.status === 'paused'
                                  ? 'bg-amber-500'
                                  : 'bg-sky-500'
                              }`}
                              style={{ width: `${task.progressPercent}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300 w-12 text-right">
                            {task.progressPercent}%
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums pt-0.5">
                          <span>Файл: {task.targetPath}</span>
                          <span aria-hidden="true">·</span>
                          <span>SHA-256: {task.sha256.slice(0, 16)}…</span>
                        </div>
                      </div>

                      {/* Task Controls */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {task.status !== 'completed' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleToggleTaskPause(task.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                            >
                              {task.status === 'downloading' ? (
                                <>
                                  <Pause className="w-3.5 h-3.5" />
                                  Пауза
                                </>
                              ) : (
                                <>
                                  <Play className="w-3.5 h-3.5" />
                                  Продолжить
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleInstantFinishDownload(task)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Завершить сейчас
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => triggerBrowserFileDownload(task)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <HardDrive className="w-3.5 h-3.5" />
                          Сохранить .mp4
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleOpenInPlayer(
                              matchedAnime,
                              matchedEp,
                              task.voiceover,
                              task.quality,
                              0
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Play className="w-3.5 h-3.5 text-sky-500" />
                          Смотреть
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
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* SECTION 3: BUILT-IN VIDEO PLAYER */}
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

              {/* Source / Anime Switcher inside Player */}
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
                      initialProgressSeconds: 0,
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
              isOfflineCached={isCurrentEpisodeOffline}
              onSelectSeason={(nextSeason) =>
                setPlayerState((prev) => ({
                  ...prev,
                  seasonId: nextSeason.id,
                  episodeNumber: 1,
                  initialProgressSeconds: 0,
                }))
              }
              onSelectEpisode={(ep) =>
                handleOpenInPlayer(
                  activePlayerAnime,
                  ep,
                  playerState.voiceover,
                  playerState.quality,
                  0,
                  activePlayerSeason.id
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

        {/* SECTION 4: WATCH HISTORY & CLOUD ACCOUNT SYNC */}
        {activeSection === 'history' && (
          <section aria-labelledby="history-heading" className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1
                  id="history-heading"
                  className="text-2xl font-bold text-slate-900 dark:text-white"
                >
                  История просмотров и облачная синхронизация
                </h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Автоматическое сохранение таймкода, выбранной озвучки и качества между macOS, Windows и Android.
                </p>
              </div>

              <div className="flex items-center gap-3">
                {lastSyncTime && (
                  <span className="text-xs font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    Облако синхронизировано в {lastSyncTime}
                  </span>
                )}
                {watchHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (currentUser) {
                        watchHistory.forEach((h) =>
                          removeWatchHistoryFromCloud(currentUser, h.id).catch(() => {})
                        );
                      }
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

            {authError && (
              <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-300">
                {authError}
              </div>
            )}

            {watchHistory.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center space-y-3">
                <p className="text-base font-semibold text-slate-900 dark:text-white">
                  История просмотров пуста
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Найдите любое аниме через поиск и запустите серию во встроенном плеере, чтобы прогресс автоматически сохранился.
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
                            if (currentUser) {
                              removeWatchHistoryFromCloud(currentUser, item.id).catch(() => {});
                            }
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

        {/* SECTION 5: OFFLINE VAULT, CROSS-PLATFORM EXPORT & CYBERSECURITY AUDIT */}
        {activeSection === 'offline' && (
          <section aria-labelledby="offline-heading" className="space-y-8">
            <div>
              <h1
                id="offline-heading"
                className="text-2xl font-bold text-slate-900 dark:text-white"
              >
                Оффлайн-хранилище, Кроссплатформенность и Кибербезопасность
              </h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Локальный сейф серий IndexedDB для просмотра без интернета, экспорт на macOS / Windows / Android и аудит безопасности потоков.
              </p>
            </div>

            {/* Offline Stored Episodes */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Скачанные серии в оффлайн-памяти ({offlineEpisodes.length})
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Доступны для воспроизведения во встроенном плеере при полном отсутствии интернета.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => listOfflineEpisodes().then(setOfflineEpisodes)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Обновить
                </button>
              </div>

              {offlineEpisodes.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
                  Здесь появятся ваши скачанные серии. Нажмите «Завершить сейчас» в очереди загрузок, чтобы закэшировать серию в оффлайн-хранилище.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {offlineEpisodes.map((ep) => {
                    const matchedAnime = resolveAnimeForHistoryOrTask(
                      ep.animeId,
                      ep.animeTitle,
                      ep.sourceSite as SourceSite
                    );
                    const matchedEp =
                      matchedAnime.episodes.find((e) => e.number === ep.episodeNumber) ||
                      matchedAnime.episodes[0];

                    return (
                      <div
                        key={ep.taskId}
                        className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div>
                          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              Оффлайн-контейнер проверен
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{ep.sourceSite}</span>
                            <span aria-hidden="true">·</span>
                            <span>{ep.voiceover}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {ep.quality} ({ep.sizeMB} МБ)
                            </span>
                          </div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                            {ep.animeTitle} — Серия {String(ep.episodeNumber).padStart(2, '0')}:{' '}
                            {ep.episodeTitle}
                          </h3>
                          <p className="text-[11px] font-mono tabular-nums text-slate-400">
                            SHA-256: {ep.sha256}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenInPlayer(
                                matchedAnime,
                                matchedEp,
                                ep.voiceover,
                                ep.quality as VideoQuality,
                                0
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white cursor-pointer whitespace-nowrap"
                          >
                            <Play className="w-3.5 h-3.5" />
                            Смотреть оффлайн
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await removeOfflineEpisode(ep.taskId);
                              setOfflineEpisodes(await listOfflineEpisodes());
                            }}
                            aria-label={`Удалить оффлайн-копию ${ep.animeTitle}`}
                            className="p-2 rounded-lg text-slate-400 hover:text-rose-500 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Cybersecurity & Multi-Platform Architecture Matrix */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-500" />
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Архитектура кибербезопасности (Zero-Trust)
                  </h2>
                </div>
                <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  <li>
                    <strong>1. Строгий белый список источников и защита от SSRF:</strong> при вводе ссылок парсер принимает только HTTPS-соединения (TLS 1.3) к официальным доменам <code>yummyanime.tv</code>, <code>animego.org</code> и <code>animevost.org</code>. Обращения к <code>localhost</code>, <code>127.0.0.1</code> и внутренним подсетям блокируются.
                  </li>
                  <li>
                    <strong>2. Защита от Command Injection и Path Traversal:</strong> при генерации скриптов загрузки для macOS (<code>.sh</code>), Windows (<code>.ps1</code>) и Android (Termux) все аргументы экранируются на уровне синтаксиса POSIX/PowerShell, а флаг <code>--no-exec</code> запрещает выполнение стороннего кода.
                  </li>
                  <li>
                    <strong>3. Контроль целостности SHA-256:</strong> каждый оффлайн-контейнер в IndexedDB подписывается детерминированным хэшем SHA-256.
                  </li>
                  <li>
                    <strong>4. Изоляция облачных данных (Firestore Rules):</strong> доступ к истории и очереди возможен только для владельца аккаунта с подтверждённым email (<code>email_verified == true</code>) и проверкой схемы каждого поля.
                  </li>
                </ul>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-sky-500" />
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Кроссплатформенный профиль: macOS, Windows и Android
                  </h2>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Переключайте целевую операционную систему для автоматического пересчёта путей сохранения и формата пакетных скриптов:
                </p>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {(['macos', 'windows', 'android'] as const).map((os) => (
                    <button
                      key={os}
                      type="button"
                      onClick={() => setPlatform(os)}
                      className={`px-3 py-2.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                        platform === os
                          ? 'bg-sky-600 text-white border-sky-600'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {os === 'macos' ? 'macOS' : os === 'windows' ? 'Windows 11' : 'Android'}
                    </button>
                  ))}
                </div>
                <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-950 font-mono text-[11px] text-slate-700 dark:text-slate-300 overflow-x-auto">
                  Активный путь:{' '}
                  {buildTargetFilePath({
                    platform,
                    animeTitle: 'Чёрный клевер',
                    episodeNumber: 1,
                    voiceover: defaultVoiceover,
                    quality: defaultQuality,
                  })}
                </div>
                <button
                  type="button"
                  onClick={handleExportBatchScript}
                  className="w-full py-2.5 rounded-lg text-xs font-semibold bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Скачать пакетный скрипт для {platform.toUpperCase()}
                </button>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* QUIET FOOTER */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-5 px-6 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>AniMac Studio — Загрузчик и оффлайн-плеер аниме (macOS · Windows · Android)</span>
          <span>Поддержка источников: YummyAnime.TV · AnimeGO · AnimeVost.org</span>
        </div>
      </footer>
    </div>
  );
}
