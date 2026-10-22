import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  SkipForward,
  SkipBack,
  CheckCircle2,
  Download,
  ShieldCheck,
  Subtitles,
  FolderDown,
  Search,
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

const SUBTITLE_LINES: Record<number, string[]> = {
  1: [
    '— Сигнал с ретранслятора подтверждён. Начинаем синхронизацию сектора.',
    '— Внимание: уровень атмосферных помех превышает норму.',
    '— Переключаю питание на резервный контур. Держите строй!',
    '— Озвучка синхронизирована. Поток декодируется без потерь.',
  ],
  2: [
    '— Мы обнаружили древний архив под обсерваторией.',
    '— Координаты ведут к северному архипелагу.',
    '— Время до затмения — ровно четырнадцать минут.',
    '— Проверьте контрольную сумму ключа перед запуском.',
  ],
};

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
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(initialProgressSeconds || 0);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [activeRangeIndex, setActiveRangeIndex] = useState(0);
  const [episodeNumberFilter, setEpisodeNumberFilter] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const isPlayingRef = useRef(isPlaying);
  const currentTimeRef = useRef(currentTime);
  const playbackRateRef = useRef(playbackRate);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    playbackRateRef.current = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    setCurrentTime(initialProgressSeconds || 0);
  }, [anime.id, season.id, episode.number, initialProgressSeconds]);

  // Keep range group synced when episode changes
  const rangeGroups = useMemo(
    () => buildEpisodeRangeGroups(season.episodes.length, 25),
    [season.episodes.length]
  );

  useEffect(() => {
    const idx = rangeGroups.findIndex(
      (g) => episode.number >= g.start && episode.number <= g.end
    );
    if (idx >= 0) {
      setActiveRangeIndex(idx);
    } else {
      setActiveRangeIndex(0);
    }
  }, [season.id, episode.number, rangeGroups]);

  const displayedEpisodes = useMemo(() => {
    const cleanFilter = episodeNumberFilter.trim();
    if (cleanFilter) {
      const targetNum = Number(cleanFilter);
      if (!Number.isNaN(targetNum) && targetNum > 0) {
        return season.episodes.filter(
          (ep) =>
            ep.number === targetNum ||
            String(ep.number).startsWith(cleanFilter)
        );
      }
      const lower = cleanFilter.toLowerCase();
      return season.episodes.filter(
        (ep) =>
          String(ep.number).includes(lower) ||
          ep.title.toLowerCase().includes(lower)
      );
    }
    const group = rangeGroups[activeRangeIndex] || rangeGroups[0];
    if (!group) return season.episodes;
    return season.episodes.filter(
      (ep) => ep.number >= group.start && ep.number <= group.end
    );
  }, [season.episodes, rangeGroups, activeRangeIndex, episodeNumberFilter]);

  // Ambient Web Audio synthesizer when playing
  useEffect(() => {
    if (!isPlaying || isMuted) {
      if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
        audioCtxRef.current.suspend().catch(() => {});
      }
      return;
    }

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioCtxRef.current && AudioContextClass) {
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 196;
        gain.gain.value = 0.015;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        audioCtxRef.current = ctx;
      } else if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
    } catch {
      // Ignore Web Audio autoplay blocks in headless browsers
    }

    return () => {
      if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
        audioCtxRef.current.suspend().catch(() => {});
      }
    };
  }, [isPlaying, isMuted]);

  // Playback timer and watch history auto-sync
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        const next = Math.min(episode.durationSeconds, prev + 1 * playbackRateRef.current);
        onUpdateProgress(Math.floor(next), episode.durationSeconds);
        if (next >= episode.durationSeconds) {
          setIsPlaying(false);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, episode.durationSeconds, onUpdateProgress]);

  // Render animated anime scene on Canvas (respecting headless browser throttling per ultra-mode rules)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isHeadless =
      navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent);

    let animId = 0;
    let frameCount = 0;

    const drawFrame = () => {
      frameCount++;
      const w = canvas.width;
      const h = canvas.height;
      const t = currentTimeRef.current + (isPlayingRef.current ? frameCount * 0.03 : 0);

      const grad = ctx.createLinearGradient(0, 0, 0, h);
      if (anime.artworkTheme === 'samurai' || anime.artworkTheme === 'shrine') {
        grad.addColorStop(0, '#090D16');
        grad.addColorStop(0.6, '#1E1B4B');
        grad.addColorStop(1, '#7C2D12');
      } else if (anime.artworkTheme === 'mecha' || anime.artworkTheme === 'cyber') {
        grad.addColorStop(0, '#020617');
        grad.addColorStop(0.6, '#0F172A');
        grad.addColorStop(1, '#0369A1');
      } else {
        grad.addColorStop(0, '#0C192C');
        grad.addColorStop(0.6, '#1E3A5F');
        grad.addColorStop(1, '#0E7490');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const moonX = w * 0.72 + Math.sin(t * 0.4) * 18;
      const moonY = h * 0.34;
      ctx.fillStyle = 'rgba(253, 224, 71, 0.22)';
      ctx.beginPath();
      ctx.arc(moonX, moonY, 68, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(251, 191, 36, 0.78)';
      ctx.beginPath();
      ctx.arc(moonX, moonY, 44, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#090D16';
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 40) {
        const ridge = h * 0.72 - Math.abs(Math.sin((x + t * 12) * 0.015)) * 48;
        ctx.lineTo(x, ridge);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(15, 23, 42, 0.68)';
      ctx.fillRect(20, 20, 420, 54);
      ctx.fillStyle = '#F8FAFC';
      ctx.font = '600 14px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(`${anime.title} · ${season.title} — Серия ${episode.number}`, 32, 42);
      ctx.fillStyle = '#38BDF8';
      ctx.font = '500 12px "JetBrains Mono", monospace';
      ctx.fillText(`Озвучка: ${voiceover} · Поток ${quality} · ${anime.sourceSite}`, 32, 61);
    };

    drawFrame();

    if (isPlaying) {
      const intervalMs = isHeadless ? 120 : 40;
      const timer = window.setInterval(drawFrame, intervalMs);
      return () => window.clearInterval(timer);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [anime, season, episode, voiceover, quality, isPlaying]);

  const lines = SUBTITLE_LINES[episode.number] || SUBTITLE_LINES[1];
  const currentSubtitle = lines[Math.floor(currentTime / 6) % lines.length];

  const currentIdx = season.episodes.findIndex((e) => e.number === episode.number);
  const prevEp = currentIdx > 0 ? season.episodes[currentIdx - 1] : null;
  const nextEp =
    currentIdx >= 0 && currentIdx < season.episodes.length - 1
      ? season.episodes[currentIdx + 1]
      : null;

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setCurrentTime(val);
    onUpdateProgress(Math.floor(val), episode.durationSeconds);
  };

  const togglePlay = () => {
    const nextState = !isPlaying;
    setIsPlaying(nextState);
    if (nextState) {
      const nextTime = Math.min(episode.durationSeconds, Math.max(1, currentTime + 15));
      setCurrentTime(nextTime);
      onUpdateProgress(Math.floor(nextTime), episode.durationSeconds);
    }
  };

  return (
    <div className="space-y-6">
      {/* Main Video Stage */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 overflow-hidden">
        <div className="relative aspect-video w-full bg-slate-950 flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={960}
            height={540}
            data-testid="anime-video-canvas"
            className="w-full h-full object-cover"
          />

          {/* Top-right status indicator */}
          <div className="absolute top-4 right-4 flex items-center gap-3 bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-lg text-xs text-slate-200">
            <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              TLS 1.3
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {isOfflineCached
                ? 'Воспроизведение из оффлайн-памяти'
                : `Источник: ${anime.sourceSite}`}
            </span>
          </div>

          {/* Subtitles overlay */}
          {showSubtitles && (
            <div className="absolute bottom-20 inset-x-8 flex justify-center pointer-events-none">
              <p className="px-4 py-2 rounded-lg bg-black/80 text-white text-sm md:text-base font-medium text-center max-w-2xl">
                [{voiceover}] {currentSubtitle}
              </p>
            </div>
          )}

          {/* Center Play Button Overlay when paused */}
          {!isPlaying && (
            <button
              type="button"
              onClick={togglePlay}
              aria-label="Запустить воспроизведение серии"
              className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-sky-600/95 hover:bg-sky-500 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 cursor-pointer"
            >
              <Play className="w-7 h-7 fill-current ml-0.5" />
            </button>
          )}
        </div>

        {/* Player Controls Bar */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 space-y-3">
          {/* Timeline Scrubber */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono tabular-nums text-slate-300 w-12">
              {formatTimecode(currentTime)}
            </span>
            <label htmlFor="player-timeline-range" className="sr-only">
              Позиция воспроизведения
            </label>
            <input
              id="player-timeline-range"
              type="range"
              min={0}
              max={episode.durationSeconds}
              value={Math.floor(currentTime)}
              onChange={handleSeek}
              className="flex-1 accent-sky-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
            />
            <span className="text-xs font-mono tabular-nums text-slate-400 w-12 text-right">
              {formatTimecode(episode.durationSeconds)}
            </span>
          </div>

          {/* Primary Transport & Track Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={togglePlay}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
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

              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                aria-label={isMuted ? 'Включить звук' : 'Выключить звук'}
                className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                {isMuted ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowSubtitles(!showSubtitles)}
                aria-label="Переключить субтитры"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  showSubtitles ? 'bg-slate-800 text-sky-400' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Subtitles className="w-4 h-4" />
                Субтитры
              </button>
            </div>

            {/* Studio Voiceover, Video Quality & Speed Selectors */}
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
                  onChange={(e) => onChangeQuality(e.target.value as VideoQuality)}
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
                  onChange={(e) => setPlaybackRate(Number(e.target.value))}
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
                onClick={() => onQueueEpisode(anime, episode, voiceover, quality, season.title)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5 text-sky-400" />
                Скачать серию ({quality})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Episode Matrix & Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Список эпизодов · {anime.title} ({season.title} — {season.episodes.length} сер.)
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {season.subtitle
                  ? `${season.subtitle} · Выберите сезон, диапазон или номер серии`
                  : 'Выберите сезон и эпизод для воспроизведения или скачивания'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onQueueSeason(anime, season)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start"
            >
              <FolderDown className="w-3.5 h-3.5" />
              Скачать весь сезон ({season.episodes.length} сер.)
            </button>
          </div>

          {/* Season Switcher Tabs */}
          {anime.seasons.length > 1 && (
            <div
              role="tablist"
              aria-label="Выбор сезона в плеере"
              className="flex flex-wrap items-center gap-1.5 pt-1"
            >
              {anime.seasons.map((s) => {
                const isActive = s.id === season.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => {
                      setEpisodeNumberFilter('');
                      onSelectSeason(s);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-sky-600 text-white border-sky-600'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-sky-500'
                    }`}
                  >
                    {s.title} ({s.episodes.length} сер.)
                  </button>
                );
              })}
            </div>
          )}

          {/* Range Grouping & Episode Number Search when > 24 episodes */}
          {season.episodes.length > 24 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-1">
                  Диапазон серий:
                </span>
                {rangeGroups.map((group, idx) => (
                  <button
                    key={group.label}
                    type="button"
                    onClick={() => {
                      setEpisodeNumberFilter('');
                      setActiveRangeIndex(idx);
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold transition-colors cursor-pointer ${
                      activeRangeIndex === idx && !episodeNumberFilter
                        ? 'bg-sky-600 text-white'
                        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-sky-500'
                    }`}
                  >
                    {group.label}
                  </button>
                ))}
              </div>

              <div className="relative sm:w-48 shrink-0">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={episodeNumberFilter}
                  onChange={(e) => setEpisodeNumberFilter(e.target.value)}
                  placeholder={`Поиск № (1–${season.episodes.length})`}
                  aria-label="Поиск по номеру серии"
                  className="w-full pl-8 pr-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          )}

          <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[440px] overflow-y-auto pr-1">
            {displayedEpisodes.map((ep) => {
              const isCurrent = ep.number === episode.number;
              return (
                <div
                  key={ep.number}
                  className={`py-2.5 px-3 flex items-center justify-between gap-4 rounded-lg transition-colors ${
                    isCurrent
                      ? 'bg-sky-50/80 dark:bg-sky-950/40'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono tabular-nums font-semibold text-sky-600 dark:text-sky-400">
                        Серия {String(ep.number).padStart(2, '0')}
                      </span>
                      <span aria-hidden="true" className="text-slate-400">
                        ·
                      </span>
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {ep.title}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      Длительность: {formatTimecode(ep.durationSeconds)} · Выход: {ep.releaseDate}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onSelectEpisode(ep)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        isCurrent
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {isCurrent ? 'Сейчас в плеере' : 'Смотреть'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onQueueEpisode(anime, ep, voiceover, quality, season.title)
                      }
                      aria-label={`Скачать серию ${ep.number}`}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      В очередь
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 self-start">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Параметры потока и защита
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {anime.synopsis}
          </p>
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Источник:</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {anime.sourceSite}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Активный сезон:</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {season.title} ({season.episodes.length} сер.)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Выбранная студия:</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">{voiceover}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Разрешение видео:</span>
              <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                {quality}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Статус оффлайн-кэша:</span>
              <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {isOfflineCached ? 'Сохранено локально' : 'Потоковый буфер'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
