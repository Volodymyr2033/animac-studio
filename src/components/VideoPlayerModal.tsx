import React, { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  SkipForward,
  SkipBack,
  Download,
  ShieldCheck,
  FolderDown,
  Search,
  Maximize2,
  AlertCircle,
  Loader2,
  Layers,
  ExternalLink,
} from 'lucide-react';
import {
  AnimeSeason,
  AnimeSeries,
  EpisodeInfo,
  VIDEO_QUALITIES,
  buildEpisodeRangeGroups,
  formatTimecode,
} from '../utils/animeEngine';
import { VideoQuality } from '../utils/security';
import { AnimeArtwork } from './AnimeArtwork';

interface VideoPlayerViewProps {
  anime: AnimeSeries;
  season: AnimeSeason;
  episode: EpisodeInfo;
  voiceover: string;
  quality: VideoQuality;
  initialProgressSeconds: number;
  isOfflineCached: boolean;
  onSelectSeason: (season: AnimeSeason) => void;
  onSelectEpisode: (ep: EpisodeInfo) => void;
  onChangeVoiceover: (vo: string) => void;
  onChangeQuality: (q: VideoQuality) => void;
  onUpdateProgress: (progressSeconds: number, durationSeconds: number) => void;
  onQueueEpisode: (
    anime: AnimeSeries,
    ep: EpisodeInfo,
    vo: string,
    q: VideoQuality,
    seasonTitle?: string
  ) => void;
  onQueueSeason: (anime: AnimeSeries, season: AnimeSeason) => void;
}

export interface AniLibriaEpisodeStream {
  episode: number;
  name: string;
  durationSeconds: number;
  hls: {
    fhd: string | null;
    hd: string | null;
    sd: string | null;
  };
}

export interface AniLibriaTitlePlayerPayload {
  releaseId: number | string;
  releaseTitle: string;
  host: string;
  episodes: AniLibriaEpisodeStream[];
}

// In-memory cache of resolved AniLibria stream manifests per anime title
const aniLibriaStreamCache = new Map<string, AniLibriaTitlePlayerPayload>();

/**
 * Direct release ID mapping on AniLibria for popular titles where Russian/Romaji spelling varies
 */
const KNOWN_ANILIBRIA_RELEASE_IDS: Record<string, number> = {
  'о моём перерождении в слизь': 8950,
  'о моем перерождении в слизь': 8950,
  'перерождение в слизь': 8950,
  'слизь': 8950,
  'tensei shitara slime datta ken': 8950,
  'магическая битва': 8789,
  'jujutsu kaisen': 8789,
  'клинок, рассекающий демонов': 8325,
  'клинок рассекающий демонов': 8325,
  'клинок': 8325,
  'kimetsu no yaiba': 8325,
  'провожающая в последний путь фрирен': 9542,
  'фрирен': 9542,
  'sousou no frieren': 9542,
  'поднятие уровня в одиночку': 9600,
  'соло левелинг': 9600,
  'solo leveling': 9600,
  'дандадан': 9789,
  'dandadan': 9789,
  'семья шпиона': 9161,
  'spy x family': 9161,
  'звёздное дитя': 9420,
  'звездное дитя': 9420,
  'oshi no ko': 9420,
  'блич: тысячелетняя кровавая война': 8452,
  'блич': 8452,
  'bleach': 8452,
  'чёрный клевер': 5152,
  'черный клевер': 5152,
  'black clover': 5152,
};

function normalizeHlsUrl(host: string, rawPath: string | null | undefined): string | null {
  if (!rawPath || typeof rawPath !== 'string') return null;
  if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
    return rawPath;
  }
  const cleanHost = host.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const cleanPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  return `https://${cleanHost}${cleanPath}`;
}

/**
 * Queries AniLibria API v3 (`https://api.anilibria.tv/v3/title?search=...`)
 * and live AniLibria v1 mirror (`https://anilibria.top/api/v1/...`) to retrieve real HLS (.m3u8) streams.
 */
async function fetchAniLibriaPlayerData(
  animeTitle: string,
  originalTitle: string
): Promise<AniLibriaTitlePlayerPayload | null> {
  const cacheKey = `${animeTitle.toLowerCase()}::${originalTitle.toLowerCase()}`;
  const cached = aniLibriaStreamCache.get(cacheKey);
  if (cached) return cached;

  const queriesToTry = Array.from(
    new Set(
      [
        animeTitle.trim(),
        originalTitle.split('/')[0].trim(),
        originalTitle.split('/')[1]?.trim() || '',
      ].filter(Boolean)
    )
  );

  // 1. Query live AniLibria API (anilibria.top/api/v1) which serves cache.libria.fun HLS streams
  let targetReleaseId: number | null =
    KNOWN_ANILIBRIA_RELEASE_IDS[animeTitle.trim().toLowerCase()] ||
    KNOWN_ANILIBRIA_RELEASE_IDS[originalTitle.split('/')[0].trim().toLowerCase()] ||
    null;

  if (!targetReleaseId) {
    for (const q of queriesToTry) {
      try {
        const searchRes = await fetch(
          `https://anilibria.top/api/v1/app/search/releases?query=${encodeURIComponent(q)}`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (searchRes.ok) {
          const searchList = await searchRes.json();
          if (Array.isArray(searchList) && searchList.length > 0 && searchList[0]?.id) {
            targetReleaseId = Number(searchList[0].id);
            break;
          }
        }
      } catch {
        // Ignore and try next query
      }
    }
  }

  if (targetReleaseId) {
    try {
      const releaseRes = await fetch(
        `https://anilibria.top/api/v1/anime/releases/${targetReleaseId}`,
        { signal: AbortSignal.timeout(4500) }
      );
      if (releaseRes.ok) {
        const relData = await releaseRes.json();
        const rawEpisodes = Array.isArray(relData?.episodes) ? relData.episodes : [];
        const host = 'cache.libria.fun';

        const episodes: AniLibriaEpisodeStream[] = rawEpisodes
          .map((ep: Record<string, unknown>, idx: number) => {
            const epNum = Math.round(Number(ep?.ordinal || ep?.sort_order || idx + 1));
            const fhd = normalizeHlsUrl(host, ep?.hls_1080 as string | null);
            const hd = normalizeHlsUrl(host, ep?.hls_720 as string | null);
            const sd = normalizeHlsUrl(host, ep?.hls_480 as string | null);
            return {
              episode: epNum,
              name:
                typeof ep?.name === 'string' && ep.name.trim().length > 0
                  ? ep.name
                  : `Серия ${epNum}`,
              durationSeconds: Number(ep?.duration) || 1440,
              hls: {
                fhd: fhd || hd || sd,
                hd: hd || fhd || sd,
                sd: sd || hd || fhd,
              },
            };
          })
          .filter((e: AniLibriaEpisodeStream) => e.hls.fhd || e.hls.hd || e.hls.sd)
          .sort((a: AniLibriaEpisodeStream, b: AniLibriaEpisodeStream) => a.episode - b.episode);

        if (episodes.length > 0) {
          const payload: AniLibriaTitlePlayerPayload = {
            releaseId: targetReleaseId,
            releaseTitle: relData?.name?.main || animeTitle,
            host,
            episodes,
          };
          aniLibriaStreamCache.set(cacheKey, payload);
          return payload;
        }
      }
    } catch {
      // Proceed to v3 fallback if v1 release details failed
    }
  }

  // 2. Fallback to AniLibria API v3 endpoint: https://api.anilibria.tv/v3/title?search=${encodeURIComponent(animeTitle)}
  for (const q of queriesToTry) {
    try {
      const v3Res = await fetch(
        `https://api.anilibria.tv/v3/title?search=${encodeURIComponent(q)}`,
        { signal: AbortSignal.timeout(3000) }
      );
      if (v3Res.ok) {
        const v3Data = await v3Res.json();
        const titleObj = Array.isArray(v3Data?.list) ? v3Data.list[0] : v3Data;
        const host = titleObj?.player?.host || 'cache.libria.fun';
        const rawList = titleObj?.player?.list;
        if (rawList && typeof rawList === 'object') {
          const entries = Array.isArray(rawList) ? rawList : Object.values(rawList);
          const episodes: AniLibriaEpisodeStream[] = entries
            .map((ep: Record<string, unknown>, idx: number) => {
              const hlsObj = (ep?.hls || {}) as Record<string, string | null>;
              const epNum = Number(ep?.episode || ep?.ordinal || idx + 1);
              return {
                episode: epNum,
                name: typeof ep?.name === 'string' && ep.name ? ep.name : `Серия ${epNum}`,
                durationSeconds: 1440,
                hls: {
                  fhd: normalizeHlsUrl(host, hlsObj.fhd),
                  hd: normalizeHlsUrl(host, hlsObj.hd),
                  sd: normalizeHlsUrl(host, hlsObj.sd),
                },
              };
            })
            .filter((e) => e.hls.fhd || e.hls.hd || e.hls.sd)
            .sort((a, b) => a.episode - b.episode);

          if (episodes.length > 0) {
            const payload: AniLibriaTitlePlayerPayload = {
              releaseId: titleObj.id || q,
              releaseTitle: titleObj?.names?.ru || animeTitle,
              host,
              episodes,
            };
            aniLibriaStreamCache.set(cacheKey, payload);
            return payload;
          }
        }
      }
    } catch {
      // Ignore network/CORS errors on fallback
    }
  }

  return null;
}

export const VideoPlayerView: React.FC<VideoPlayerViewProps> = ({
  anime,
  season,
  episode,
  voiceover,
  quality,
  initialProgressSeconds,
  isOfflineCached,
  onSelectSeason,
  onSelectEpisode,
  onChangeVoiceover,
  onChangeQuality,
  onUpdateProgress,
  onQueueEpisode,
  onQueueSeason,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const hlsInstanceRef = useRef<Hls | null>(null);
  const resumeTimeRef = useRef<number>(initialProgressSeconds || 0);

  const [isLoadingStream, setIsLoadingStream] = useState<boolean>(true);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [playerData, setPlayerData] = useState<AniLibriaTitlePlayerPayload | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(initialProgressSeconds || 0);
  const [duration, setDuration] = useState<number>(episode.durationSeconds || 1440);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);

  const [activeRangeIndex, setActiveRangeIndex] = useState<number>(0);
  const [episodeNumberFilter, setEpisodeNumberFilter] = useState<string>('');

  // Fetch real AniLibria HLS streams when anime changes
  useEffect(() => {
    let cancelled = false;
    setIsLoadingStream(true);
    setStreamError(null);

    fetchAniLibriaPlayerData(anime.title, anime.originalTitle).then((data) => {
      if (cancelled) return;
      if (!data || data.episodes.length === 0) {
        setPlayerData(null);
        setStreamError('Видеопоток для данного тайтла не найден в каталоге AniLibria');
        setIsLoadingStream(false);
        return;
      }
      setPlayerData(data);
      setStreamError(null);
      setIsLoadingStream(false);
    });

    return () => {
      cancelled = true;
    };
  }, [anime.id, anime.title, anime.originalTitle]);

  // Match the selected episode to the real AniLibria episode stream
  const activeStreamEpisode: AniLibriaEpisodeStream | null = useMemo(() => {
    if (!playerData || playerData.episodes.length === 0) return null;
    return (
      playerData.episodes.find((e) => e.episode === episode.number) ||
      playerData.episodes[(episode.number - 1) % playerData.episodes.length] ||
      playerData.episodes[0]
    );
  }, [playerData, episode.number]);

  // Select the HLS .m3u8 URL based on requested video quality (1080p -> hls.fhd, 720p -> hls.hd, 480p -> hls.sd)
  const activeStreamUrl: string | null = useMemo(() => {
    if (!activeStreamEpisode) return null;
    if (quality === '2160p' || quality === '1080p') {
      return (
        activeStreamEpisode.hls.fhd ||
        activeStreamEpisode.hls.hd ||
        activeStreamEpisode.hls.sd
      );
    }
    if (quality === '720p') {
      return (
        activeStreamEpisode.hls.hd ||
        activeStreamEpisode.hls.fhd ||
        activeStreamEpisode.hls.sd
      );
    }
    return (
      activeStreamEpisode.hls.sd ||
      activeStreamEpisode.hls.hd ||
      activeStreamEpisode.hls.fhd
    );
  }, [activeStreamEpisode, quality]);

  // Attach hls.js or native HLS to the HTML5 <video> element whenever stream URL changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeStreamUrl) return;

    if (hlsInstanceRef.current) {
      hlsInstanceRef.current.destroy();
      hlsInstanceRef.current = null;
    }

    const savedTime = resumeTimeRef.current;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });
      hlsInstanceRef.current = hls;
      hls.loadSource(activeStreamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (savedTime > 0 && savedTime < (video.duration || 1440)) {
          video.currentTime = savedTime;
        }
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support on macOS Safari & iOS
      video.src = activeStreamUrl;
      video.addEventListener(
        'loadedmetadata',
        () => {
          if (savedTime > 0 && savedTime < (video.duration || 1440)) {
            video.currentTime = savedTime;
          }
        },
        { once: true }
      );
    } else {
      video.src = activeStreamUrl;
    }

    return () => {
      if (hlsInstanceRef.current) {
        hlsInstanceRef.current.destroy();
        hlsInstanceRef.current = null;
      }
    };
  }, [activeStreamUrl]);

  // Reset resume time when switching episodes
  useEffect(() => {
    resumeTimeRef.current = initialProgressSeconds || 0;
    setCurrentTime(initialProgressSeconds || 0);
    setIsPlaying(false);
  }, [anime.id, season.id, episode.number, initialProgressSeconds]);

  // Merge episode list: use real AniLibria episode titles when available
  const effectiveSeasonEpisodes: EpisodeInfo[] = useMemo(() => {
    if (playerData && playerData.episodes.length > 0 && season.number === 1) {
      return season.episodes.map((ep) => {
        const realEp = playerData.episodes.find((r) => r.episode === ep.number);
        if (realEp) {
          return {
            ...ep,
            title: realEp.name || ep.title,
            durationSeconds: realEp.durationSeconds || ep.durationSeconds,
          };
        }
        return ep;
      });
    }
    return season.episodes;
  }, [season, playerData]);

  const rangeGroups = useMemo(
    () => buildEpisodeRangeGroups(effectiveSeasonEpisodes.length, 25),
    [effectiveSeasonEpisodes.length]
  );

  useEffect(() => {
    const idx = rangeGroups.findIndex(
      (g) => episode.number >= g.start && episode.number <= g.end
    );
    setActiveRangeIndex(idx >= 0 ? idx : 0);
  }, [season.id, episode.number, rangeGroups]);

  const displayedEpisodes = useMemo(() => {
    const cleanFilter = episodeNumberFilter.trim();
    if (cleanFilter) {
      const targetNum = Number(cleanFilter);
      if (!Number.isNaN(targetNum) && targetNum > 0) {
        return effectiveSeasonEpisodes.filter(
          (ep) =>
            ep.number === targetNum ||
            String(ep.number).startsWith(cleanFilter)
        );
      }
      const lower = cleanFilter.toLowerCase();
      return effectiveSeasonEpisodes.filter(
        (ep) =>
          String(ep.number).includes(lower) ||
          ep.title.toLowerCase().includes(lower)
      );
    }
    const group = rangeGroups[activeRangeIndex] || rangeGroups[0];
    if (!group) return effectiveSeasonEpisodes;
    return effectiveSeasonEpisodes.filter(
      (ep) => ep.number >= group.start && ep.number <= group.end
    );
  }, [effectiveSeasonEpisodes, rangeGroups, activeRangeIndex, episodeNumberFilter]);

  const currentIdx = effectiveSeasonEpisodes.findIndex((e) => e.number === episode.number);
  const prevEp = currentIdx > 0 ? effectiveSeasonEpisodes[currentIdx - 1] : null;
  const nextEp =
    currentIdx >= 0 && currentIdx < effectiveSeasonEpisodes.length - 1
      ? effectiveSeasonEpisodes[currentIdx + 1]
      : null;

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video || !activeStreamUrl) return;
    try {
      if (video.paused) {
        await video.play();
        setIsPlaying(true);
      } else {
        video.pause();
        setIsPlaying(false);
      }
    } catch {
      // Autoplay or stream interrupted
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setCurrentTime(val);
    resumeTimeRef.current = val;
    if (videoRef.current) {
      videoRef.current.currentTime = val;
    }
    onUpdateProgress(Math.floor(val), Math.floor(duration));
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVol = Number(e.target.value);
    setVolume(nextVol);
    setIsMuted(nextVol === 0);
    if (videoRef.current) {
      videoRef.current.volume = nextVol;
      videoRef.current.muted = nextVol === 0;
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
    }
  };

  const handleSpeedChange = (nextRate: number) => {
    setPlaybackRate(nextRate);
    if (videoRef.current) {
      videoRef.current.playbackRate = nextRate;
    }
  };

  const handleFullscreen = () => {
    const video = videoRef.current;
    const container = playerContainerRef.current;
    if (video && 'webkitEnterFullscreen' in video) {
      (video as unknown as { webkitEnterFullscreen: () => void }).webkitEnterFullscreen();
      return;
    }
    if (container && container.requestFullscreen) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        container.requestFullscreen().catch(() => {});
      }
    }
  };

  const handleDirectVideoDownload = () => {
    onQueueEpisode(anime, episode, voiceover, quality, season.title);
    if (activeStreamUrl) {
      const a = document.createElement('a');
      a.href = activeStreamUrl;
      a.download = `${anime.title} - Серия ${episode.number} [${quality}].m3u8`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div className="space-y-6">
      {/* Anime Info Card with Real Poster inside Player */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-16 h-24 shrink-0 rounded-xl overflow-hidden bg-slate-900">
            <AnimeArtwork
              title={anime.title}
              originalTitle={anime.originalTitle}
              posterUrl={anime.posterUrl}
              className="w-full h-full object-cover rounded-xl"
            />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-sky-600 dark:text-sky-400">
                AniLibria HLS Stream
              </span>
              <span aria-hidden="true">·</span>
              <span>Хост: {playerData?.host || 'cache.libria.fun'}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{quality}</span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
              {anime.title} — {season.title}, Серия {episode.number}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {activeStreamEpisode?.name || episode.title} · {anime.originalTitle}
            </p>
          </div>
        </div>

        {activeStreamUrl && (
          <a
            href={activeStreamUrl}
            download={`${anime.title}_Ep${episode.number}_${quality}.m3u8`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onQueueEpisode(anime, episode, voiceover, quality, season.title)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            Скачать серию ({quality})
          </a>
        )}
      </div>

      {/* Main Real HTML5 Video Stage */}
      <div
        ref={playerContainerRef}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 overflow-hidden"
      >
        <div className="relative aspect-video max-h-[520px] w-full bg-black flex items-center justify-center overflow-hidden">
          {isLoadingStream ? (
            <div className="flex flex-col items-center justify-center gap-3 text-slate-300 p-6 text-center">
              <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
              <p className="text-sm font-medium">
                Подключение к видеопотоку AniLibria ({anime.title})…
              </p>
            </div>
          ) : streamError || !activeStreamUrl ? (
            <div
              role="alert"
              data-testid="anilibria-stream-error"
              className="flex flex-col items-center justify-center gap-3 text-center p-8 max-w-lg"
            >
              <AlertCircle className="w-10 h-10 text-amber-400 shrink-0" />
              <p className="text-base font-bold text-white">
                {streamError || 'Видеопоток для данного тайтла не найден в каталоге AniLibria'}
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Для тайтла «{anime.title}» в открытом API AniLibria отсутствует прямой HLS-поток. Выберите другой релиз или проверьте наличие озвучки AniLibria.
              </p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                data-testid="real-html5-video-player"
                controls
                playsInline
                poster={anime.posterUrl || undefined}
                className="w-full h-full max-h-[520px] object-contain bg-black"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onLoadedMetadata={(e) => {
                  const vid = e.currentTarget;
                  if (vid.duration && Number.isFinite(vid.duration)) {
                    setDuration(vid.duration);
                  }
                }}
                onTimeUpdate={(e) => {
                  const vid = e.currentTarget;
                  const now = vid.currentTime;
                  const dur =
                    vid.duration && Number.isFinite(vid.duration)
                      ? vid.duration
                      : episode.durationSeconds;
                  setCurrentTime(now);
                  resumeTimeRef.current = now;
                  onUpdateProgress(Math.floor(now), Math.floor(dur));
                }}
              />

              {/* Top-right stream badge */}
              <div className="absolute top-4 right-4 pointer-events-none hidden sm:flex items-center gap-2 bg-slate-950/85 border border-slate-800 px-3 py-1.5 rounded-lg text-xs text-slate-200">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  {isOfflineCached
                    ? 'Оффлайн-кэш'
                    : `HLS ${quality} · ${playerData?.host || 'cache.libria.fun'}`}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Custom Transport & Quality Controls Bar synced with HTML5 <video> */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 space-y-3">
          {/* Timeline Scrubber */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono tabular-nums text-slate-300 w-14">
              {formatTimecode(currentTime)}
            </span>
            <label htmlFor="player-timeline-range" className="sr-only">
              Позиция воспроизведения
            </label>
            <input
              id="player-timeline-range"
              type="range"
              min={0}
              max={Math.max(1, Math.floor(duration))}
              value={Math.floor(currentTime)}
              disabled={!activeStreamUrl}
              onChange={handleSeek}
              className="flex-1 accent-sky-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer disabled:opacity-40"
            />
            <span className="text-xs font-mono tabular-nums text-slate-400 w-14 text-right">
              {formatTimecode(duration)}
            </span>
          </div>

          {/* Primary Transport & Track Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!activeStreamUrl}
                onClick={togglePlay}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isPlaying ? 'Пауза' : 'Смотреть'}
              </button>

              <button
                type="button"
                disabled={!prevEp}
                onClick={() => prevEp && onSelectEpisode(prevEp)}
                aria-label="Предыдущая серия"
                className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                type="button"
                disabled={!nextEp}
                onClick={() => nextEp && onSelectEpisode(nextEp)}
                aria-label="Следующая серия"
                className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
              >
                <SkipForward className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={isMuted ? 'Включить звук' : 'Выключить звук'}
                  className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  aria-label="Громкость"
                  className="w-20 accent-sky-500 h-1 bg-slate-700 rounded-lg cursor-pointer"
                />
              </div>

              <button
                type="button"
                disabled={!activeStreamUrl}
                onClick={handleFullscreen}
                aria-label="Полноэкранный режим"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                Во весь экран
              </button>
            </div>

            {/* Studio Voiceover, Video Quality, Speed & Direct Download */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="player-voiceover-select"
                  className="text-xs text-slate-400 whitespace-nowrap"
                >
                  Озвучка:
                </label>
                <select
                  id="player-voiceover-select"
                  value={voiceover}
                  onChange={(e) => onChangeVoiceover(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-slate-100 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  {anime.availableVoiceovers.map((vo) => (
                    <option key={vo} value={vo}>
                      {vo}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label
                  htmlFor="player-quality-select"
                  className="text-xs text-slate-400 whitespace-nowrap"
                >
                  Качество:
                </label>
                <select
                  id="player-quality-select"
                  value={quality}
                  onChange={(e) => {
                    if (videoRef.current) {
                      resumeTimeRef.current = videoRef.current.currentTime;
                    }
                    onChangeQuality(e.target.value as VideoQuality);
                  }}
                  className="bg-slate-800 border border-slate-700 text-slate-100 text-xs font-mono rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  {VIDEO_QUALITIES.map((q) => (
                    <option key={q.value} value={q.value}>
                      {q.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label
                  htmlFor="player-speed-select"
                  className="text-xs text-slate-400 whitespace-nowrap"
                >
                  Скорость:
                </label>
                <select
                  id="player-speed-select"
                  value={String(playbackRate)}
                  onChange={(e) => handleSpeedChange(Number(e.target.value))}
                  className="bg-slate-800 border border-slate-700 text-slate-100 text-xs font-mono rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="0.75">0.75x</option>
                  <option value="1">1.0x</option>
                  <option value="1.25">1.25x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2">2.0x</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleDirectVideoDownload}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5 text-sky-400" />
                Скачать серию ({quality})
              </button>
            </div>
          </div>

          {activeStreamUrl && (
            <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
              <span className="truncate max-w-2xl">
                Поток HLS ({quality}): {activeStreamUrl}
              </span>
              <a
                href={activeStreamUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sky-400 hover:underline shrink-0"
              >
                Прямая ссылка на поток <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Season & Full Episode Selector Panel */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Выбор сезона в плеере">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 inline-flex items-center gap-1 mr-1">
              <Layers className="w-3.5 h-3.5 text-sky-500" />
              Сезоны:
            </span>
            {anime.seasons.map((s) => {
              const active = s.id === season.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onSelectSeason(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-sky-500'
                  }`}
                >
                  {s.title} ({s.episodes.length} сер.)
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => onQueueSeason(anime, season)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap self-start sm:self-auto"
          >
            <FolderDown className="w-3.5 h-3.5 text-sky-500" />
            Скачать весь сезон ({effectiveSeasonEpisodes.length} сер.)
          </button>
        </div>

        {/* Range Grouping & Episode Number Search if > 24 episodes */}
        {effectiveSeasonEpisodes.length > 24 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">
                Диапазон серий:
              </span>
              {rangeGroups.map((grp, rIdx) => (
                <button
                  key={grp.label}
                  type="button"
                  onClick={() => {
                    setActiveRangeIndex(rIdx);
                    setEpisodeNumberFilter('');
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold transition-colors cursor-pointer ${
                    activeRangeIndex === rIdx && !episodeNumberFilter.trim()
                      ? 'bg-sky-600 text-white'
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-sky-500'
                  }`}
                >
                  {grp.label}
                </button>
              ))}
            </div>

            <div className="relative sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={episodeNumberFilter}
                onChange={(e) => setEpisodeNumberFilter(e.target.value)}
                placeholder={`Номер серии (1–${effectiveSeasonEpisodes.length})`}
                aria-label="Поиск серии по номеру в плеере"
                className="w-full pl-8 pr-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
        )}

        {/* Quick Episode Number Buttons (1, 2, 3...) */}
        <div className="space-y-2">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            Быстрый выбор серии ({effectiveSeasonEpisodes.length} доступно):
          </span>
          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1">
            {displayedEpisodes.map((ep) => {
              const isCurrent = ep.number === episode.number;
              return (
                <button
                  key={ep.number}
                  type="button"
                  onClick={() => onSelectEpisode(ep)}
                  className={`min-w-[38px] px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-colors cursor-pointer ${
                    isCurrent
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-sky-500'
                  }`}
                >
                  {ep.number}
                </button>
              );
            })}
          </div>
        </div>

        {/* Detailed Episode List Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
          {displayedEpisodes.map((ep) => {
            const isCurrent = ep.number === episode.number;
            return (
              <div
                key={ep.number}
                className={`p-3 rounded-lg border flex items-center justify-between gap-2 transition-colors ${
                  isCurrent
                    ? 'bg-sky-500/10 border-sky-500/50 text-sky-600 dark:text-sky-400'
                    : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectEpisode(ep)}
                  className="text-left min-w-0 flex-1 cursor-pointer"
                >
                  <div className="text-xs font-mono font-bold">
                    Серия {String(ep.number).padStart(2, '0')}
                  </div>
                  <div className="text-xs truncate opacity-90">{ep.title}</div>
                </button>

                <button
                  type="button"
                  onClick={() => onQueueEpisode(anime, ep, voiceover, quality, season.title)}
                  aria-label={`Скачать серию ${ep.number}`}
                  className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-sky-500 cursor-pointer shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
