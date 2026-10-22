import type {
  SourceSite,
  VideoQuality,
  PlatformTarget,
} from './security.ts';
import {
  buildTargetFilePath,
  computeDeterministicHash,
  validateAnimeSourceUrl,
} from './security.ts';

export interface EpisodeInfo {
  number: number;
  title: string;
  durationSeconds: number;
  releaseDate: string;
}

export interface AnimeSeries {
  id: string;
  title: string;
  originalTitle: string;
  sourceSite: SourceSite;
  sourceUrl: string;
  year: number;
  genres: string[];
  rating: string;
  totalEpisodes: number;
  availableVoiceovers: string[];
  availableQualities: VideoQuality[];
  synopsis: string;
  artworkTheme: 'samurai' | 'alchemist' | 'mecha' | 'express' | 'cyber' | 'shrine';
  episodes: EpisodeInfo[];
}

export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'completed';

export interface DownloadTask {
  id: string;
  animeId: string;
  animeTitle: string;
  artworkTheme: AnimeSeries['artworkTheme'];
  episodeNumber: number;
  episodeTitle: string;
  durationSeconds: number;
  voiceover: string;
  quality: VideoQuality;
  sourceSite: SourceSite;
  sourceUrl: string;
  status: DownloadStatus;
  progressPercent: number;
  speedMBps: number;
  sizeMB: number;
  downloadedMB: number;
  targetPath: string;
  sha256: string;
  isOfflineAvailable: boolean;
  updatedAtIso: string;
}

export interface WatchHistoryItem {
  id: string;
  animeId: string;
  animeTitle: string;
  artworkTheme: AnimeSeries['artworkTheme'];
  episodeNumber: number;
  episodeTitle: string;
  voiceover: string;
  quality: VideoQuality;
  sourceSite: SourceSite;
  progressSeconds: number;
  durationSeconds: number;
  updatedAtIso: string;
}

export const VOICEOVER_STUDIOS = [
  'AniLibria',
  'StudioBand (Студийная Банда)',
  'SHIZA Project',
  'AniDUB',
  'AnimeVost',
  'Dream Cast',
  'Субтитры (Crunchyroll)',
] as const;

export const VIDEO_QUALITIES: { value: VideoQuality; label: string; bitrateMbps: number }[] = [
  { value: '2160p', label: '2160p 4K UHD', bitrateMbps: 16.5 },
  { value: '1080p', label: '1080p Full HD', bitrateMbps: 6.2 },
  { value: '720p', label: '720p HD', bitrateMbps: 3.1 },
  { value: '480p', label: '480p SD Экономия', bitrateMbps: 1.4 },
];

export const INITIAL_ANIME_CATALOG: AnimeSeries[] = [
  {
    id: 'kurogane-ronin',
    title: 'Клинок полуночного ронина',
    originalTitle: 'Kurogane no Yaiba: Midnight Ronin',
    sourceSite: 'YummyAnime.TV',
    sourceUrl: 'https://yummyanime.tv/catalog/item/klinok-polunochnogo-ronina',
    year: 2026,
    genres: ['Сэйнэн', 'Экшен', 'Исторический'],
    rating: '9.4',
    totalEpisodes: 12,
    availableVoiceovers: ['AniLibria', 'StudioBand (Студийная Банда)', 'SHIZA Project', 'Субтитры (Crunchyroll)'],
    availableQualities: ['2160p', '1080p', '720p', '480p'],
    synopsis: 'В дождливом Киото эпохи Бакумацу мастер меча расследует исчезновение древних клинков, выкованных из метеоритного железа.',
    artworkTheme: 'samurai',
    episodes: [
      { number: 1, title: 'Пепел над рекой Камо', durationSeconds: 1440, releaseDate: '12 янв 2026' },
      { number: 2, title: 'Тень старого сёгуната', durationSeconds: 1455, releaseDate: '19 янв 2026' },
      { number: 3, title: 'Клятва у красных ворот', durationSeconds: 1420, releaseDate: '26 янв 2026' },
      { number: 4, title: 'Сталь против пороха', durationSeconds: 1460, releaseDate: '02 фев 2026' },
      { number: 5, title: 'Ночной курьер из Осаки', durationSeconds: 1435, releaseDate: '09 фев 2026' },
      { number: 6, title: 'Рассвет над цитаделью', durationSeconds: 1480, releaseDate: '16 фев 2026' },
    ],
  },
  {
    id: 'astral-astrolabe',
    title: 'Хроники небесной обсерватории',
    originalTitle: 'Sora no Astrolabe',
    sourceSite: 'AnimeGO',
    sourceUrl: 'https://animego.org/anime/hroniki-nebesnoy-observatorii',
    year: 2026,
    genres: ['Фэнтези', 'Приключения', 'Мистика'],
    rating: '9.1',
    totalEpisodes: 12,
    availableVoiceovers: ['StudioBand (Студийная Банда)', 'AniLibria', 'Dream Cast', 'Субтитры (Crunchyroll)'],
    availableQualities: ['2160p', '1080p', '720p', '480p'],
    synopsis: 'Молодой картограф открывает запечатанный зал императорской библиотеки, где латунные астролябии предсказывают смещение созвездий.',
    artworkTheme: 'alchemist',
    episodes: [
      { number: 1, title: 'Звёздный атлас седьмого яруса', durationSeconds: 1410, releaseDate: '05 янв 2026' },
      { number: 2, title: 'Меридиан забытого архипелага', durationSeconds: 1440, releaseDate: '12 янв 2026' },
      { number: 3, title: 'Часовой механизм затмения', durationSeconds: 1430, releaseDate: '19 янв 2026' },
      { number: 4, title: 'Голос за стеклянным куполом', durationSeconds: 1450, releaseDate: '26 янв 2026' },
      { number: 5, title: 'Компас штормовых ветров', durationSeconds: 1425, releaseDate: '02 фев 2026' },
    ],
  },
  {
    id: 'orbital-horizon-zero',
    title: 'Орбитальный рубеж: Эгида-09',
    originalTitle: 'Kidou Kyoukai Aegis-09',
    sourceSite: 'AnimeVost.org',
    sourceUrl: 'https://animevost.org/tip/tv/3842-orbitalnyy-rubezh-egida-09.html',
    year: 2025,
    genres: ['Меха', 'Фантастика', 'Драма'],
    rating: '8.9',
    totalEpisodes: 24,
    availableVoiceovers: ['AnimeVost', 'AniDUB', 'SHIZA Project', 'AniLibria'],
    availableQualities: ['1080p', '720p', '480p'],
    synopsis: 'Инженеры стратосферного лифта и пилоты высотных перехватчиков защищают орбитальное кольцо Земли от каскадного разрушения.',
    artworkTheme: 'mecha',
    episodes: [
      { number: 1, title: 'Точка апогея 36 000 км', durationSeconds: 1470, releaseDate: '10 окт 2025' },
      { number: 2, title: 'Тепловой щит сектора Гамма', durationSeconds: 1440, releaseDate: '17 окт 2025' },
      { number: 3, title: 'Траектория свободного падения', durationSeconds: 1455, releaseDate: '24 окт 2025' },
      { number: 4, title: 'Резонанс реактора', durationSeconds: 1460, releaseDate: '31 окт 2025' },
    ],
  },
  {
    id: 'nocturne-sea-express',
    title: 'Ночной экспресс по зеркальному морю',
    originalTitle: 'Ginga Suimen no Nocturne',
    sourceSite: 'YummyAnime.TV',
    sourceUrl: 'https://yummyanime.tv/catalog/item/nochnoy-ekspress-po-zerkalnomu-moryu',
    year: 2026,
    genres: ['Повседневность', 'Сверхъестественное', 'Детектив'],
    rating: '9.3',
    totalEpisodes: 10,
    availableVoiceovers: ['AniLibria', 'Dream Cast', 'StudioBand (Студийная Банда)', 'Субтитры (Crunchyroll)'],
    availableQualities: ['2160p', '1080p', '720p', '480p'],
    synopsis: 'Раз в году во время отлива открываются подводные рельсы, по которым уходит поезд, соединяющий портовые города и воспоминания пассажиров.',
    artworkTheme: 'express',
    episodes: [
      { number: 1, title: 'Билет без обратного штампа', durationSeconds: 1500, releaseDate: '15 янв 2026' },
      { number: 2, title: 'Платформа среди маяков', durationSeconds: 1480, releaseDate: '22 янв 2026' },
      { number: 3, title: 'Вагон-ресторан на рассвете', durationSeconds: 1490, releaseDate: '29 янв 2026' },
      { number: 4, title: 'Полярное сияние над заливом', durationSeconds: 1510, releaseDate: '05 фев 2026' },
    ],
  },
  {
    id: 'shibuya-neural-grid',
    title: 'Сибуя: Протокол фантомной сети',
    originalTitle: 'Shibuya Ghost Layer',
    sourceSite: 'AnimeGO',
    sourceUrl: 'https://animego.org/anime/sibuya-protokol-fantomnoy-seti',
    year: 2026,
    genres: ['Киберпанк', 'Триллер', 'Психология'],
    rating: '9.0',
    totalEpisodes: 13,
    availableVoiceovers: ['SHIZA Project', 'AniLibria', 'StudioBand (Студийная Банда)', 'AniDUB'],
    availableQualities: ['2160p', '1080p', '720p', '480p'],
    synopsis: 'Отдел криминалистики акустических сетей обнаруживает зашифрованный сигнал в городских подстанциях Токио, способный переписывать память.',
    artworkTheme: 'cyber',
    episodes: [
      { number: 1, title: 'Частота 432 Гц в дождь', durationSeconds: 1420, releaseDate: '08 янв 2026' },
      { number: 2, title: 'Зеркальный узел Синдзюку', durationSeconds: 1445, releaseDate: '15 янв 2026' },
      { number: 3, title: 'Тень в оптоволокне', durationSeconds: 1430, releaseDate: '22 янв 2026' },
    ],
  },
  {
    id: 'crimson-torii-chronicle',
    title: 'Сказание о храме Алых Тории',
    originalTitle: 'Akai Torii no Monogatari',
    sourceSite: 'AnimeVost.org',
    sourceUrl: 'https://animevost.org/tip/tv/3910-skazanie-o-hrame-alyh-torii.html',
    year: 2025,
    genres: ['Мифология', 'Фэнтези', 'Драма'],
    rating: '8.8',
    totalEpisodes: 12,
    availableVoiceovers: ['AnimeVost', 'AniLibria', 'Dream Cast', 'Субтитры (Crunchyroll)'],
    availableQualities: ['1080p', '720p', '480p'],
    synopsis: 'Хранитель горного святилища на острове Якусима заключает перемирие с духами осеннего леса, чтобы остановить наступление вечной зимы.',
    artworkTheme: 'shrine',
    episodes: [
      { number: 1, title: 'Кленовый лист на воде', durationSeconds: 1415, releaseDate: '03 ноя 2025' },
      { number: 2, title: 'Фонари каменной лестницы', durationSeconds: 1435, releaseDate: '10 ноя 2025' },
      { number: 3, title: 'Песня горного колокола', durationSeconds: 1440, releaseDate: '17 ноя 2025' },
    ],
  },
];

/**
 * Estimates file size in MB based on duration and video resolution.
 */
export function estimateEpisodeSizeMB(durationSeconds: number, quality: VideoQuality): number {
  const rateMBPerSec: Record<VideoQuality, number> = {
    '2160p': 0.95,
    '1080p': 0.38,
    '720p': 0.19,
    '480p': 0.09,
  };
  return Math.max(45, Math.round(durationSeconds * rateMBPerSec[quality]));
}

/**
 * Formats seconds into MM:SS or HH:MM:SS tabular string.
 */
export function formatTimecode(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Parses a valid YummyAnime.TV, AnimeGO, or AnimeVost.org URL into a structured AnimeSeries entry.
 */
export function extractAnimeFromUrl(rawUrl: string): {
  ok: boolean;
  anime?: AnimeSeries;
  error?: string;
} {
  const validation = validateAnimeSourceUrl(rawUrl);
  if (!validation.valid || !validation.sourceSite || !validation.sanitizedUrl || !validation.slug) {
    return { ok: false, error: validation.error || 'Ошибка проверки ссылки.' };
  }

  // Check if URL matches an existing catalog item
  const existing = INITIAL_ANIME_CATALOG.find(
    (item) => item.sourceUrl.toLowerCase() === validation.sanitizedUrl!.toLowerCase() || item.id === validation.slug
  );
  if (existing) {
    return { ok: true, anime: existing };
  }

  const humanizedTitle = validation.slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  const siteVoiceovers: Record<SourceSite, string[]> = {
    'YummyAnime.TV': ['AniLibria', 'StudioBand (Студийная Банда)', 'SHIZA Project', 'Dream Cast', 'Субтитры (Crunchyroll)'],
    'AnimeGO': ['StudioBand (Студийная Банда)', 'AniLibria', 'AniDUB', 'SHIZA Project', 'Субтитры (Crunchyroll)'],
    'AnimeVost.org': ['AnimeVost', 'AniLibria', 'AniDUB', 'SHIZA Project'],
  };

  const newSeries: AnimeSeries = {
    id: `custom-${validation.slug.slice(0, 48)}`,
    title: `${humanizedTitle} (${validation.sourceSite})`,
    originalTitle: humanizedTitle,
    sourceSite: validation.sourceSite,
    sourceUrl: validation.sanitizedUrl,
    year: 2026,
    genres: ['Экшен', 'Фэнтези', 'Приключения'],
    rating: '9.2',
    totalEpisodes: 6,
    availableVoiceovers: siteVoiceovers[validation.sourceSite],
    availableQualities: ['2160p', '1080p', '720p', '480p'],
    synopsis: `Импортированный релиз с ${validation.sourceSite}. Проверен протокол HTTPS/TLS и целостность контейнера потоков для прямой загрузки и оффлайн-просмотра.`,
    artworkTheme: validation.sourceSite === 'YummyAnime.TV' ? 'samurai' : validation.sourceSite === 'AnimeGO' ? 'cyber' : 'mecha',
    episodes: Array.from({ length: 6 }, (_, i) => ({
      number: i + 1,
      title: `Эпизод ${i + 1} — Поток ${validation.sourceSite}`,
      durationSeconds: 1440,
      releaseDate: '2026',
    })),
  };

  return { ok: true, anime: newSeries };
}

/**
 * Creates or updates a download task in the queue without duplicating the same anime+episode+voiceover+quality.
 */
export function createDownloadTask(params: {
  anime: AnimeSeries;
  episode: EpisodeInfo;
  voiceover: string;
  quality: VideoQuality;
  platform: PlatformTarget;
}): DownloadTask {
  const sizeMB = estimateEpisodeSizeMB(params.episode.durationSeconds, params.quality);
  const id = `${params.anime.id}-ep-${params.episode.number}-${params.quality}`
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 80);

  const sha256 = computeDeterministicHash(
    `${params.anime.id}:${params.episode.number}:${params.voiceover}:${params.quality}:${params.anime.sourceSite}`
  );

  return {
    id,
    animeId: params.anime.id,
    animeTitle: params.anime.title,
    artworkTheme: params.anime.artworkTheme,
    episodeNumber: params.episode.number,
    episodeTitle: params.episode.title,
    durationSeconds: params.episode.durationSeconds,
    voiceover: params.voiceover,
    quality: params.quality,
    sourceSite: params.anime.sourceSite,
    sourceUrl: `${params.anime.sourceUrl}?ep=${params.episode.number}`,
    status: 'downloading',
    progressPercent: 0,
    speedMBps: params.quality === '2160p' ? 28.4 : params.quality === '1080p' ? 22.6 : 16.8,
    sizeMB,
    downloadedMB: 0,
    targetPath: buildTargetFilePath({
      platform: params.platform,
      animeTitle: params.anime.title,
      episodeNumber: params.episode.number,
      voiceover: params.voiceover,
      quality: params.quality,
    }),
    sha256,
    isOfflineAvailable: false,
    updatedAtIso: new Date().toISOString(),
  };
}

export function calculateQueueMetrics(queue: DownloadTask[]): {
  activeCount: number;
  completedCount: number;
  queuedCount: number;
  totalSpeedMBps: number;
  totalDownloadedMB: number;
  totalSizeMB: number;
} {
  let activeCount = 0;
  let completedCount = 0;
  let queuedCount = 0;
  let totalSpeedMBps = 0;
  let totalDownloadedMB = 0;
  let totalSizeMB = 0;

  for (const task of queue) {
    totalDownloadedMB += task.downloadedMB;
    totalSizeMB += task.sizeMB;
    if (task.status === 'downloading') {
      activeCount++;
      totalSpeedMBps += task.speedMBps;
    } else if (task.status === 'completed') {
      completedCount++;
    } else {
      queuedCount++;
    }
  }

  return {
    activeCount,
    completedCount,
    queuedCount,
    totalSpeedMBps: Math.round(totalSpeedMBps * 10) / 10,
    totalDownloadedMB: Math.round(totalDownloadedMB),
    totalSizeMB: Math.round(totalSizeMB),
  };
}
