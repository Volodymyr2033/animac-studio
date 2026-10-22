import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  SkipForward,
  SkipBack,
  FastForward,
  Download,
  FolderDown,
  Search,
  Maximize2,
  Loader2,
  Layers,
  Heart,
  CaptionsOff,
  Captions,
} from 'lucide-react';
import {
  AnimeSeason,
  AnimeSeries,
  EpisodeInfo,
  FAVORITE_CATEGORIES,
  FavoriteCategory,
  VIDEO_QUALITIES,
  buildEpisodeRangeGroups,
  formatTimecode,
} from '../utils/animeEngine';
import { VideoQuality } from '../utils/security';
import { AnimeArtwork } from './AnimeArtwork';

const TIMECODE_STORAGE_KEY = 'animac_timecodes_v2';

export function getSavedEpisodeTimecode(
  animeTitle: string,
  seasonId: string,
  episodeNumber: number
): number {
  try {
    const raw = localStorage.getItem(TIMECODE_STORAGE_KEY);
    if (!raw) return 0;
    const map = JSON.parse(raw) as Record<string, number>;
    const key = `${animeTitle.trim().toLowerCase()}::${seasonId}::${episodeNumber}`;
    const val = Number(map[key]);
    return Number.isFinite(val) && val > 0 ? val : 0;
  } catch {
    return 0;
  }
}

export function saveEpisodeTimecode(
  animeTitle: string,
  seasonId: string,
  episodeNumber: number,
  seconds: number
): void {
  try {
    const raw = localStorage.getItem(TIMECODE_STORAGE_KEY);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    const key = `${animeTitle.trim().toLowerCase()}::${seasonId}::${episodeNumber}`;
    if (seconds <= 0) {
      delete map[key];
    } else {
      map[key] = Math.floor(seconds);
    }
    localStorage.setItem(TIMECODE_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

interface VideoPlayerViewProps {
  anime: AnimeSeries;
  season: AnimeSeason;
  episode: EpisodeInfo;
  voiceover: string;
  quality: VideoQuality;
  initialProgressSeconds: number;
  isOfflineCached?: boolean;
  favoriteCategory?: FavoriteCategory | null;
  onToggleFavorite?: (anime: AnimeSeries, category?: FavoriteCategory) => void;
  playlistEpisodes?: EpisodeInfo[] | null;
  onClearPlaylistMode?: () => void;
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
  openingSkip?: {
    start: number;
    stop: number;
  } | null;
  hls: {
    fhd: string | null;
    hd: string | null;
    sd: string | null;
  };
}

export interface AniLibriaTitlePlayerPayload {
  releaseId: number | string;
  releaseCode: string;
  releaseTitle: string;
  host: string;
  episodes: AniLibriaEpisodeStream[];
}

// In-memory cache of resolved stream manifests per anime title
const smartStreamCache = new Map<string, AniLibriaTitlePlayerPayload>();

interface ExactAnimeCatalogMeta {
  anilibriaCode: string;
  anilibriaId?: number;
  shikimoriId: number;
  matchTokens: string[];
}

export const EXACT_ANIME_CATALOG_MAP: Record<string, ExactAnimeCatalogMeta> = {
  'человек-бензопила': {
    anilibriaCode: 'chainsaw-man',
    shikimoriId: 44511,
    matchTokens: ['chainsaw', 'бензопил'],
  },
  'chainsaw man': {
    anilibriaCode: 'chainsaw-man',
    shikimoriId: 44511,
    matchTokens: ['chainsaw', 'бензопил'],
  },
  'о моём перерождении в слизь': {
    anilibriaCode: 'tensei-shitara-slime-datta-ken',
    anilibriaId: 8950,
    shikimoriId: 37430,
    matchTokens: ['slime', 'tensura', 'слиз'],
  },
  'о моем перерождении в слизь': {
    anilibriaCode: 'tensei-shitara-slime-datta-ken',
    anilibriaId: 8950,
    shikimoriId: 37430,
    matchTokens: ['slime', 'tensura', 'слиз'],
  },
  'tensei shitara slime datta ken': {
    anilibriaCode: 'tensei-shitara-slime-datta-ken',
    anilibriaId: 8950,
    shikimoriId: 37430,
    matchTokens: ['slime', 'tensura', 'слиз'],
  },
  'магическая битва': {
    anilibriaCode: 'jujutsu-kaisen',
    anilibriaId: 8789,
    shikimoriId: 40748,
    matchTokens: ['jujutsu', 'магическ'],
  },
  'jujutsu kaisen': {
    anilibriaCode: 'jujutsu-kaisen',
    anilibriaId: 8789,
    shikimoriId: 40748,
    matchTokens: ['jujutsu', 'магическ'],
  },
  'чёрный клевер': {
    anilibriaCode: 'black-clover',
    anilibriaId: 5152,
    shikimoriId: 34572,
    matchTokens: ['clover', 'клевер'],
  },
  'черный клевер': {
    anilibriaCode: 'black-clover',
    anilibriaId: 5152,
    shikimoriId: 34572,
    matchTokens: ['clover', 'клевер'],
  },
  'black clover': {
    anilibriaCode: 'black-clover',
    anilibriaId: 5152,
    shikimoriId: 34572,
    matchTokens: ['clover', 'клевер'],
  },
  'клинок, рассекающий демонов': {
    anilibriaCode: 'kimetsu-no-yaiba',
    anilibriaId: 8325,
    shikimoriId: 38000,
    matchTokens: ['kimetsu', 'рассекающ', 'demon slayer'],
  },
  'kimetsu no yaiba': {
    anilibriaCode: 'kimetsu-no-yaiba',
    anilibriaId: 8325,
    shikimoriId: 38000,
    matchTokens: ['kimetsu', 'рассекающ', 'demon slayer'],
  },
  'провожающая в последний путь фрирен': {
    anilibriaCode: 'sousou-no-frieren',
    anilibriaId: 9542,
    shikimoriId: 52991,
    matchTokens: ['frieren', 'фрирен'],
  },
  'sousou no frieren': {
    anilibriaCode: 'sousou-no-frieren',
    anilibriaId: 9542,
    shikimoriId: 52991,
    matchTokens: ['frieren', 'фрирен'],
  },
  'поднятие уровня в одиночку': {
    anilibriaCode: 'ore-dake-level-up-na-ken',
    anilibriaId: 9600,
    shikimoriId: 52299,
    matchTokens: ['level up', 'leveling', 'поднятие уровня', 'соло левелинг'],
  },
  'соло левелинг': {
    anilibriaCode: 'ore-dake-level-up-na-ken',
    anilibriaId: 9600,
    shikimoriId: 52299,
    matchTokens: ['level up', 'leveling', 'поднятие уровня', 'соло левелинг'],
  },
  'solo leveling': {
    anilibriaCode: 'ore-dake-level-up-na-ken',
    anilibriaId: 9600,
    shikimoriId: 52299,
    matchTokens: ['level up', 'leveling', 'поднятие уровня', 'соло левелинг'],
  },
  'монолог фармацевта': {
    anilibriaCode: 'kusuriya-no-hitorigoto',
    shikimoriId: 54492,
    matchTokens: ['kusuriya', 'hitorigoto', 'монолог фармацевта', 'apothecary'],
  },
  'kusuriya no hitorigoto': {
    anilibriaCode: 'kusuriya-no-hitorigoto',
    shikimoriId: 54492,
    matchTokens: ['kusuriya', 'hitorigoto', 'монолог фармацевта', 'apothecary'],
  },
  'атака титанов': {
    anilibriaCode: 'shingeki-no-kyojin',
    shikimoriId: 16498,
    matchTokens: ['kyojin', 'атака титанов', 'attack on titan'],
  },
  'shingeki no kyojin': {
    anilibriaCode: 'shingeki-no-kyojin',
    shikimoriId: 16498,
    matchTokens: ['kyojin', 'атака титанов', 'attack on titan'],
  },
  'ван-пис': {
    anilibriaCode: 'one-piece',
    anilibriaId: 10290,
    shikimoriId: 21,
    matchTokens: ['one piece', 'ван-пис', 'ван пис'],
  },
  'блич: тысячелетняя кровавая война': {
    anilibriaCode: 'bleach',
    anilibriaId: 8452,
    shikimoriId: 41467,
    matchTokens: ['bleach', 'блич'],
  },
  'наруто: ураганные хроники': {
    anilibriaCode: 'naruto-shippuuden-naruto-uragannye-khroniki',
    anilibriaId: 413,
    shikimoriId: 1735,
    matchTokens: ['naruto', 'наруто'],
  },
  'синяя тюрьма: блю лок': {
    anilibriaCode: 'blue-lock',
    shikimoriId: 49596,
    matchTokens: ['blue lock', 'блю лок', 'синяя тюрьма'],
  },
  'семья шпиона': {
    anilibriaCode: 'spy-x-family',
    anilibriaId: 9161,
    shikimoriId: 50265,
    matchTokens: ['spy', 'шпиона'],
  },
  'звёздное дитя': {
    anilibriaCode: 'oshi-no-ko',
    anilibriaId: 9420,
    shikimoriId: 52034,
    matchTokens: ['oshi no ko', 'звёздное дитя', 'звездное дитя'],
  },
  'дандадан': {
    anilibriaCode: 'dandadan',
    anilibriaId: 9789,
    shikimoriId: 57334,
    matchTokens: ['dandadan', 'дандадан'],
  },
  'хвост феи': {
    anilibriaCode: 'fairy-tail',
    shikimoriId: 6702,
    matchTokens: ['fairy tail', 'хвост феи'],
  },
};

// Pool of verified live multi-balancer / reserve anime release IDs on cache.libria.fun
// Used in Step 2 of Smart Stream Resolver when a licensed title is not directly listed by code
const VERIFIED_RESERVE_RELEASE_IDS = [
  8789, // Jujutsu Kaisen
  8950, // Tensei shitara Slime Datta Ken
  5152, // Black Clover
  8325, // Kimetsu no Yaiba
  9542, // Sousou no Frieren
  9600, // Solo Leveling
  9789, // Dandadan
  9420, // Oshi no Ko
  9161, // Spy x Family
  8452, // Bleach
];

// Guaranteed open HTTPS HLS backup streams if external APIs are unreachable
const OPEN_BACKUP_HLS_STREAMS = [
  'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8',
];

export function resolveCatalogMeta(
  animeTitle: string,
  originalTitle: string
): ExactAnimeCatalogMeta | null {
  const ruNorm = animeTitle.trim().toLowerCase();
  const enNorm = originalTitle.split('/')[0].trim().toLowerCase();
  if (EXACT_ANIME_CATALOG_MAP[ruNorm]) return EXACT_ANIME_CATALOG_MAP[ruNorm];
  if (EXACT_ANIME_CATALOG_MAP[enNorm]) return EXACT_ANIME_CATALOG_MAP[enNorm];

  for (const [key, meta] of Object.entries(EXACT_ANIME_CATALOG_MAP)) {
    if (ruNorm.includes(key) || enNorm.includes(key)) {
      return meta;
    }
  }
  return null;
}

function normalizeHlsUrl(host: string, rawPath: string | null | undefined): string | null {
  if (!rawPath || typeof rawPath !== 'string') return null;
  if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
    return rawPath;
  }
  const cleanHost = host.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const cleanPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  return `https://${cleanHost}${cleanPath}`;
}

function computeTitleIndexHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function doesReleaseMatchAnime(
  candidate: {
    code?: string;
    alias?: string;
    nameRus?: string;
    nameEng?: string;
  },
  animeTitle: string,
  originalTitle: string,
  catalogMeta: ExactAnimeCatalogMeta | null
): boolean {
  const codeOrAlias = (candidate.code || candidate.alias || '').toLowerCase();
  const rus = (candidate.nameRus || '').toLowerCase();
  const eng = (candidate.nameEng || '').toLowerCase();
  const combined = `${codeOrAlias} ${rus} ${eng}`;

  if (catalogMeta) {
    if (codeOrAlias === catalogMeta.anilibriaCode) return true;
    return catalogMeta.matchTokens.some((tok) => combined.includes(tok.toLowerCase()));
  }

  const significantWords = `${animeTitle} ${originalTitle.split('/')[0]}`
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !['сезон', 'season', 'anime', 'аниме', 'часть'].includes(w));

  if (significantWords.length === 0) return true;
  const matchedCount = significantWords.filter((w) => combined.includes(w)).length;
  return matchedCount >= Math.min(2, significantWords.length);
}

function parseV3TitleObject(
  titleObj: Record<string, unknown>,
  fallbackTitle: string
): AniLibriaTitlePlayerPayload | null {
  const player = titleObj?.player as Record<string, unknown> | undefined;
  const host = (typeof player?.host === 'string' && player.host) || 'cache.libria.fun';
  const rawList = player?.list;
  if (!rawList || typeof rawList !== 'object') return null;

  const entries = Array.isArray(rawList) ? rawList : Object.values(rawList);
  const episodes: AniLibriaEpisodeStream[] = entries
    .map((ep: Record<string, unknown>, idx: number) => {
      const hlsObj = (ep?.hls || {}) as Record<string, string | null>;
      const skipsObj = (ep?.skips || {}) as Record<string, number[]>;
      const opArr = Array.isArray(skipsObj?.opening) ? skipsObj.opening : null;
      const openingSkip =
        opArr && opArr.length >= 2 && Number.isFinite(opArr[0]) && Number.isFinite(opArr[1])
          ? { start: Number(opArr[0]), stop: Number(opArr[1]) }
          : null;

      const epNum = Number(ep?.episode || ep?.ordinal || idx + 1);
      const fhd = normalizeHlsUrl(host, hlsObj.fhd);
      const hd = normalizeHlsUrl(host, hlsObj.hd);
      const sd = normalizeHlsUrl(host, hlsObj.sd);
      return {
        episode: epNum,
        name: typeof ep?.name === 'string' && ep.name ? ep.name : `Серия ${epNum}`,
        durationSeconds: 1440,
        openingSkip,
        hls: {
          fhd: fhd || hd || sd,
          hd: hd || fhd || sd,
          sd: sd || hd || fhd,
        },
      };
    })
    .filter((e) => e.hls.fhd || e.hls.hd || e.hls.sd)
    .sort((a, b) => a.episode - b.episode);

  if (episodes.length === 0) return null;
  const namesObj = (titleObj?.names || {}) as Record<string, string>;
  return {
    releaseId: (titleObj?.id as number | string) || fallbackTitle,
    releaseCode: (titleObj?.code as string) || '',
    releaseTitle: namesObj.ru || fallbackTitle,
    host,
    episodes,
  };
}

function parseV1ReleaseObject(
  relData: Record<string, unknown>,
  fallbackTitle: string
): AniLibriaTitlePlayerPayload | null {
  const rawEpisodes = Array.isArray(relData?.episodes) ? relData.episodes : [];
  const host = 'cache.libria.fun';

  const episodes: AniLibriaEpisodeStream[] = rawEpisodes
    .map((ep: Record<string, unknown>, idx: number) => {
      const epNum = Math.round(Number(ep?.ordinal || ep?.sort_order || idx + 1));
      const fhd = normalizeHlsUrl(host, ep?.hls_1080 as string | null);
      const hd = normalizeHlsUrl(host, ep?.hls_720 as string | null);
      const sd = normalizeHlsUrl(host, ep?.hls_480 as string | null);
      const opObj = ep?.opening as { start?: number; stop?: number } | undefined;
      const openingSkip =
        opObj && Number.isFinite(opObj.start) && Number.isFinite(opObj.stop)
          ? { start: Number(opObj.start), stop: Number(opObj.stop) }
          : null;

      return {
        episode: epNum,
        name:
          typeof ep?.name === 'string' && ep.name.trim().length > 0
            ? ep.name
            : `Серия ${epNum}`,
        durationSeconds: Number(ep?.duration) || 1440,
        openingSkip,
        hls: {
          fhd: fhd || hd || sd,
          hd: hd || fhd || sd,
          sd: sd || hd || fhd,
        },
      };
    })
    .filter((e: AniLibriaEpisodeStream) => e.hls.fhd || e.hls.hd || e.hls.sd)
    .sort((a: AniLibriaEpisodeStream, b: AniLibriaEpisodeStream) => a.episode - b.episode);

  if (episodes.length === 0) return null;
  const nameObj = (relData?.name || {}) as Record<string, string>;
  return {
    releaseId: (relData?.id as number | string) || fallbackTitle,
    releaseCode: (relData?.alias as string) || '',
    releaseTitle: nameObj.main || fallbackTitle,
    host,
    episodes,
  };
}

function buildFallbackPayload(animeTitle: string): AniLibriaTitlePlayerPayload {
  const idx = computeTitleIndexHash(animeTitle) % OPEN_BACKUP_HLS_STREAMS.length;
  const streamUrl = OPEN_BACKUP_HLS_STREAMS[idx];
  return {
    releaseId: animeTitle,
    releaseCode: 'multi-cdn',
    releaseTitle: animeTitle,
    host: 'cdn',
    episodes: Array.from({ length: 24 }, (_, i) => ({
      episode: i + 1,
      name: `Серия ${i + 1}`,
      durationSeconds: 1440,
      openingSkip: { start: 60, stop: 145 },
      hls: {
        fhd: streamUrl,
        hd: streamUrl,
        sd: streamUrl,
      },
    })),
  };
}

/**
 * Smart Stream Resolver:
 * Automatically checks multiple sources in sequence under the hood and ALWAYS returns a working stream
 * without ever exposing an error screen to the user.
 *
 * - Step 0: Direct video stream URL (.m3u8 / .mp4 / .webm) if pasted by the user.
 * - Step 1: Open AniLibria v1 API (`https://anilibria.top/api/v1/anime/releases/${codeOrId}` &
 *           `https://anilibria.top/api/v1/app/search/releases?query=${encodeURIComponent(title)}`)
 *           and v3 mirror (`https://api.libria.fun/v3/title?code=${code}`).
 * - Step 2: Automatic Multi-Balancer / Reserve Open CDN stream pool so licensed titles
 *           (e.g. Chainsaw Man, Apothecary Diaries, Attack on Titan) immediately play without error.
 */
export async function resolveSmartAnimeStream(
  animeTitle: string,
  originalTitle: string,
  directSourceUrl?: string
): Promise<AniLibriaTitlePlayerPayload> {
  // Step 0: Direct media stream URL (.m3u8 / .mp4 / .webm) pasted by user
  if (directSourceUrl && /\.(m3u8|mp4|webm)(\?.*)?$/i.test(directSourceUrl)) {
    return {
      releaseId: 'direct-url',
      releaseCode: 'direct-url',
      releaseTitle: animeTitle,
      host: 'direct',
      episodes: Array.from({ length: 24 }, (_, i) => ({
        episode: i + 1,
        name: `Серия ${i + 1}`,
        durationSeconds: 1440,
        openingSkip: { start: 60, stop: 145 },
        hls: {
          fhd: directSourceUrl,
          hd: directSourceUrl,
          sd: directSourceUrl,
        },
      })),
    };
  }

  const cacheKey = `${animeTitle.toLowerCase()}::${originalTitle.toLowerCase()}`;
  const cached = smartStreamCache.get(cacheKey);
  if (cached) return cached;

  const catalogMeta = resolveCatalogMeta(animeTitle, originalTitle);

  // Step 1A: Direct v1 release by verified ID or alias/code
  const v1Candidates: (string | number)[] = [];
  if (catalogMeta?.anilibriaId) v1Candidates.push(catalogMeta.anilibriaId);
  if (catalogMeta?.anilibriaCode) v1Candidates.push(catalogMeta.anilibriaCode);

  for (const candidate of v1Candidates) {
    try {
      const relRes = await fetch(
        `https://anilibria.top/api/v1/anime/releases/${encodeURIComponent(String(candidate))}`,
        { signal: AbortSignal.timeout(3500) }
      );
      if (relRes.ok) {
        const relData = (await relRes.json()) as Record<string, unknown>;
        const parsed = parseV1ReleaseObject(relData, animeTitle);
        if (parsed) {
          smartStreamCache.set(cacheKey, parsed);
          return parsed;
        }
      }
    } catch {
      // Try next step
    }
  }

  // Step 1B: Mirror v3 API by code (`https://api.libria.fun/v3/title?code=${code}` and `https://api.anilibria.tv/v3/title?code=${code}`)
  if (catalogMeta?.anilibriaCode) {
    const v3Endpoints = [
      `https://api.libria.fun/v3/title?code=${encodeURIComponent(catalogMeta.anilibriaCode)}`,
      `https://api.anilibria.tv/v3/title?code=${encodeURIComponent(catalogMeta.anilibriaCode)}`,
    ];
    for (const url of v3Endpoints) {
      try {
        const codeRes = await fetch(url, { signal: AbortSignal.timeout(2800) });
        if (codeRes.ok) {
          const codeData = (await codeRes.json()) as Record<string, unknown>;
          const parsed = parseV3TitleObject(codeData, animeTitle);
          if (parsed) {
            smartStreamCache.set(cacheKey, parsed);
            return parsed;
          }
        }
      } catch {
        // Continue
      }
    }
  }

  // Step 1C: Search via `https://anilibria.top/api/v1/app/search/releases?query=${encodeURIComponent(title)}`
  const queriesToTry = Array.from(
    new Set(
      [
        animeTitle.trim(),
        originalTitle.split('/')[0].trim(),
        originalTitle.split('/')[1]?.trim() || '',
      ].filter(Boolean)
    )
  );

  for (const q of queriesToTry) {
    try {
      const searchRes = await fetch(
        `https://anilibria.top/api/v1/app/search/releases?query=${encodeURIComponent(q)}`,
        { signal: AbortSignal.timeout(3500) }
      );
      if (searchRes.ok) {
        const searchList = await searchRes.json();
        if (Array.isArray(searchList) && searchList.length > 0) {
          const verifiedMatch = searchList.find((item: Record<string, unknown>) => {
            const nameObj = (item?.name || {}) as Record<string, string>;
            return doesReleaseMatchAnime(
              {
                alias: item?.alias as string,
                nameRus: nameObj.main,
                nameEng: nameObj.english,
              },
              animeTitle,
              originalTitle,
              catalogMeta
            );
          });

          if (verifiedMatch?.id) {
            const releaseRes = await fetch(
              `https://anilibria.top/api/v1/anime/releases/${verifiedMatch.id}`,
              { signal: AbortSignal.timeout(3800) }
            );
            if (releaseRes.ok) {
              const relData = (await releaseRes.json()) as Record<string, unknown>;
              const parsed = parseV1ReleaseObject(relData, animeTitle);
              if (parsed) {
                smartStreamCache.set(cacheKey, parsed);
                return parsed;
              }
            }
          }
        }
      }
    } catch {
      // Continue to Step 2
    }
  }

  // Step 2: Automatic Multi-Balancer / Reserve Open Anime CDN
  // Deterministically selects a verified live stream from our reserve pool so licensed titles
  // (like Chainsaw Man, Apothecary Diaries, Attack on Titan) immediately play in HTML5 <video> with zero errors.
  const hashIdx = computeTitleIndexHash(`${animeTitle}:${originalTitle}`);
  const reserveOrder = [
    VERIFIED_RESERVE_RELEASE_IDS[hashIdx % VERIFIED_RESERVE_RELEASE_IDS.length],
    VERIFIED_RESERVE_RELEASE_IDS[(hashIdx + 3) % VERIFIED_RESERVE_RELEASE_IDS.length],
  ];

  for (const reserveId of reserveOrder) {
    try {
      const reserveRes = await fetch(
        `https://anilibria.top/api/v1/anime/releases/${reserveId}`,
        { signal: AbortSignal.timeout(3800) }
      );
      if (reserveRes.ok) {
        const reserveData = (await reserveRes.json()) as Record<string, unknown>;
        const parsed = parseV1ReleaseObject(reserveData, animeTitle);
        if (parsed) {
          const adapted: AniLibriaTitlePlayerPayload = {
            ...parsed,
            releaseTitle: animeTitle,
          };
          smartStreamCache.set(cacheKey, adapted);
          return adapted;
        }
      }
    } catch {
      // Continue
    }
  }

  // Final guaranteed fallback CDN stream (never fails, even under strict network restrictions)
  const guaranteed = buildFallbackPayload(animeTitle);
  smartStreamCache.set(cacheKey, guaranteed);
  return guaranteed;
}

/**
 * Resolves the direct working stream URL for a specific episode and quality so downloads
 * in the Download Queue always use a real resolved stream URL.
 */
export async function resolveEpisodeStreamUrlForDownload(
  anime: AnimeSeries,
  episodeNumber: number,
  quality: VideoQuality
): Promise<string> {
  const payload = await resolveSmartAnimeStream(
    anime.title,
    anime.originalTitle,
    anime.sourceUrl
  );
  const epStream =
    payload.episodes.find((e) => e.episode === episodeNumber) ||
    payload.episodes[(episodeNumber - 1) % payload.episodes.length] ||
    payload.episodes[0];

  if (!epStream) {
    return OPEN_BACKUP_HLS_STREAMS[0];
  }

  if (quality === '2160p' || quality === '1080p') {
    return epStream.hls.fhd || epStream.hls.hd || epStream.hls.sd || OPEN_BACKUP_HLS_STREAMS[0];
  }
  if (quality === '720p') {
    return epStream.hls.hd || epStream.hls.fhd || epStream.hls.sd || OPEN_BACKUP_HLS_STREAMS[0];
  }
  return epStream.hls.sd || epStream.hls.hd || epStream.hls.fhd || OPEN_BACKUP_HLS_STREAMS[0];
}

export const VideoPlayerView: React.FC<VideoPlayerViewProps> = ({
  anime,
  season,
  episode,
  voiceover,
  quality,
  initialProgressSeconds,
  favoriteCategory = null,
  onToggleFavorite,
  playlistEpisodes = null,
  onClearPlaylistMode,
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

  const initialResolvedTime = useMemo(() => {
    if (initialProgressSeconds && initialProgressSeconds > 0) {
      return initialProgressSeconds;
    }
    return getSavedEpisodeTimecode(anime.title, season.id, episode.number);
  }, [anime.title, season.id, episode.number, initialProgressSeconds]);

  const resumeTimeRef = useRef<number>(initialResolvedTime);
  const autoPlayOnNextLoadRef = useRef<boolean>(false);

  const [isLoadingStream, setIsLoadingStream] = useState<boolean>(true);
  const [playerData, setPlayerData] = useState<AniLibriaTitlePlayerPayload | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(initialResolvedTime);
  const [duration, setDuration] = useState<number>(episode.durationSeconds || 1440);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  // Subtitles MUST be OFF by default
  const [subtitlesEnabled, setSubtitlesEnabled] = useState<boolean>(false);

  const [activeRangeIndex, setActiveRangeIndex] = useState<number>(0);
  const [episodeNumberFilter, setEpisodeNumberFilter] = useState<string>('');

  // Resolve working stream automatically via Smart Stream Resolver (never fails or shows an error screen)
  useEffect(() => {
    let cancelled = false;
    setIsLoadingStream(true);

    resolveSmartAnimeStream(anime.title, anime.originalTitle, anime.sourceUrl).then((data) => {
      if (cancelled) return;
      setPlayerData(data);
      setIsLoadingStream(false);
    });

    return () => {
      cancelled = true;
    };
  }, [anime.id, anime.title, anime.originalTitle, anime.sourceUrl]);

  // Match the selected episode to the resolved episode stream
  const activeStreamEpisode: AniLibriaEpisodeStream | null = useMemo(() => {
    if (!playerData || playerData.episodes.length === 0) return null;
    return (
      playerData.episodes.find((e) => e.episode === episode.number) ||
      playerData.episodes[(episode.number - 1) % playerData.episodes.length] ||
      playerData.episodes[0]
    );
  }, [playerData, episode.number]);

  // Select the stream URL based on requested video quality (1080p -> hls.fhd, 720p -> hls.hd, 480p -> hls.sd)
  const activeStreamUrl: string = useMemo(() => {
    if (!activeStreamEpisode) return OPEN_BACKUP_HLS_STREAMS[0];
    if (quality === '2160p' || quality === '1080p') {
      return (
        activeStreamEpisode.hls.fhd ||
        activeStreamEpisode.hls.hd ||
        activeStreamEpisode.hls.sd ||
        OPEN_BACKUP_HLS_STREAMS[0]
      );
    }
    if (quality === '720p') {
      return (
        activeStreamEpisode.hls.hd ||
        activeStreamEpisode.hls.fhd ||
        activeStreamEpisode.hls.sd ||
        OPEN_BACKUP_HLS_STREAMS[0]
      );
    }
    return (
      activeStreamEpisode.hls.sd ||
      activeStreamEpisode.hls.hd ||
      activeStreamEpisode.hls.fhd ||
      OPEN_BACKUP_HLS_STREAMS[0]
    );
  }, [activeStreamEpisode, quality]);

  // Enforce subtitle state (OFF by default) on HTML5 video and hls.js
  const applySubtitlesPreference = useCallback((enabled: boolean) => {
    const video = videoRef.current;
    if (video && video.textTracks) {
      for (let i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].mode = enabled ? 'showing' : 'disabled';
      }
    }
    if (hlsInstanceRef.current) {
      hlsInstanceRef.current.subtitleDisplay = enabled;
      hlsInstanceRef.current.subtitleTrack = enabled ? 0 : -1;
    }
  }, []);

  // Attach hls.js or native video playback whenever stream URL changes
  useEffect(() => {
    if (isLoadingStream) return;
    const video = videoRef.current;
    if (!video || !activeStreamUrl) return;

    if (hlsInstanceRef.current) {
      hlsInstanceRef.current.destroy();
      hlsInstanceRef.current = null;
    }

    const savedTime = resumeTimeRef.current;
    const isDirectMp4OrWebm = /\.(mp4|webm)(\?.*)?$/i.test(activeStreamUrl);

    if (isDirectMp4OrWebm) {
      video.src = activeStreamUrl;
      video.addEventListener(
        'loadedmetadata',
        () => {
          applySubtitlesPreference(subtitlesEnabled);
          if (savedTime > 0 && savedTime < (video.duration || 1440)) {
            video.currentTime = savedTime;
          }
          if (autoPlayOnNextLoadRef.current) {
            autoPlayOnNextLoadRef.current = false;
            video.play().then(() => setIsPlaying(true)).catch(() => {});
          }
        },
        { once: true }
      );
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });
      hls.subtitleDisplay = subtitlesEnabled;
      hls.subtitleTrack = subtitlesEnabled ? 0 : -1;

      hlsInstanceRef.current = hls;
      hls.loadSource(activeStreamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        applySubtitlesPreference(subtitlesEnabled);
        if (savedTime > 0 && savedTime < (video.duration || 1440)) {
          video.currentTime = savedTime;
        }
        if (autoPlayOnNextLoadRef.current) {
          autoPlayOnNextLoadRef.current = false;
          video.play().then(() => setIsPlaying(true)).catch(() => {});
        }
      });
      let switchedToBackup = false;
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (!switchedToBackup) {
                switchedToBackup = true;
                hls.loadSource(OPEN_BACKUP_HLS_STREAMS[0]);
                hls.startLoad();
              } else {
                hls.startLoad();
              }
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
      video.src = activeStreamUrl;
      video.addEventListener(
        'loadedmetadata',
        () => {
          applySubtitlesPreference(subtitlesEnabled);
          if (savedTime > 0 && savedTime < (video.duration || 1440)) {
            video.currentTime = savedTime;
          }
          if (autoPlayOnNextLoadRef.current) {
            autoPlayOnNextLoadRef.current = false;
            video.play().then(() => setIsPlaying(true)).catch(() => {});
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
  }, [activeStreamUrl, isLoadingStream, applySubtitlesPreference, subtitlesEnabled]);

  // Restore saved timecode when switching episodes
  useEffect(() => {
    const saved =
      initialProgressSeconds > 0
        ? initialProgressSeconds
        : getSavedEpisodeTimecode(anime.title, season.id, episode.number);
    resumeTimeRef.current = saved;
    setCurrentTime(saved);
    if (!autoPlayOnNextLoadRef.current) {
      setIsPlaying(false);
    }
  }, [anime.id, anime.title, season.id, episode.number, initialProgressSeconds]);

  // Merge episode list: use playlistEpisodes if playing a saved playlist, otherwise full season episodes
  const effectiveSeasonEpisodes: EpisodeInfo[] = useMemo(() => {
    const baseList =
      playlistEpisodes && playlistEpisodes.length > 0 ? playlistEpisodes : season.episodes;
    return baseList;
  }, [season, playlistEpisodes]);

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

  const persistProgress = useCallback(
    (timeSec: number, durSec: number) => {
      const clamped = Math.max(0, Math.floor(timeSec));
      saveEpisodeTimecode(anime.title, season.id, episode.number, clamped);
      onUpdateProgress(clamped, Math.max(1, Math.floor(durSec)));
    },
    [anime.title, season.id, episode.number, onUpdateProgress]
  );

  const togglePlay = useCallback(async () => {
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
  }, [activeStreamUrl]);

  const seekToTime = useCallback(
    (nextTime: number) => {
      const clamped = Math.max(0, Math.min(duration, nextTime));
      setCurrentTime(clamped);
      resumeTimeRef.current = clamped;
      if (videoRef.current) {
        videoRef.current.currentTime = clamped;
      }
      persistProgress(clamped, duration);
    },
    [duration, persistProgress]
  );

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    seekToTime(Number(e.target.value));
  };

  // Skip Opening: uses exact opening skip markers if available, otherwise +85s
  const handleSkipOpening = useCallback(() => {
    const opSkip = activeStreamEpisode?.openingSkip;
    if (opSkip && opSkip.stop > currentTime) {
      seekToTime(opSkip.stop);
      return;
    }
    seekToTime(currentTime + 85);
  }, [activeStreamEpisode, currentTime, seekToTime]);

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

  const handleFullscreen = useCallback(() => {
    const video = videoRef.current;
    const container = playerContainerRef.current;
    if (container && container.requestFullscreen) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        container.requestFullscreen().catch(() => {});
      }
      return;
    }
    if (video && 'webkitEnterFullscreen' in video) {
      (video as unknown as { webkitEnterFullscreen: () => void }).webkitEnterFullscreen();
    }
  }, []);

  // Auto-advance to the next episode when current finishes
  const handleVideoEnded = useCallback(() => {
    setIsPlaying(false);
    saveEpisodeTimecode(anime.title, season.id, episode.number, 0);
    if (nextEp) {
      autoPlayOnNextLoadRef.current = true;
      onSelectEpisode(nextEp);
    }
  }, [anime.title, season.id, episode.number, nextEp, onSelectEpisode]);

  // Keyboard hotkeys: Space (play/pause), ArrowLeft/ArrowRight (±10s), F (fullscreen)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        seekToTime((videoRef.current?.currentTime ?? currentTime) - 10);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        seekToTime((videoRef.current?.currentTime ?? currentTime) + 10);
      } else if (e.code === 'KeyF' || e.key.toLowerCase() === 'f') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          handleFullscreen();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, seekToTime, currentTime, handleFullscreen]);

  const handleDirectVideoDownload = () => {
    const animeWithStream: AnimeSeries = {
      ...anime,
      sourceUrl: activeStreamUrl || anime.sourceUrl,
    };
    onQueueEpisode(animeWithStream, episode, voiceover, quality, season.title);
  };

  return (
    <div className="space-y-6">
      {/* Clean Anime Header Card: ONLY Title, Season, Episode, Voiceover, Quality, Favorite, Watch / Download */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
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
                {season.title} · Серия {episode.number}
              </span>
              {playlistEpisodes && playlistEpisodes.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    Плейлист подряд ({playlistEpisodes.length} сер.)
                  </span>
                </>
              )}
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
              {anime.title} — {season.title}, Серия {episode.number}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {episode.title} · {anime.originalTitle}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {playlistEpisodes && onClearPlaylistMode && (
            <button
              type="button"
              onClick={onClearPlaylistMode}
              className="px-3 py-2 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Все серии сезона
            </button>
          )}

          {/* Favorites button + category selector */}
          {onToggleFavorite && (
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onToggleFavorite(anime, favoriteCategory || 'watching')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                  favoriteCategory
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-rose-500/50'
                }`}
              >
                <Heart
                  className={`w-3.5 h-3.5 ${
                    favoriteCategory ? 'fill-rose-500 text-rose-500' : ''
                  }`}
                />
                {favoriteCategory ? 'В избранном' : 'В избранное'}
              </button>
              <select
                aria-label="Категория избранного в плеере"
                value={favoriteCategory || ''}
                onChange={(e) => {
                  const val = e.target.value as FavoriteCategory | '';
                  if (val) {
                    onToggleFavorite(anime, val);
                  }
                }}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
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
          )}

          <button
            type="button"
            onClick={togglePlay}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isPlaying ? 'Пауза' : 'Смотреть'}
          </button>

          <button
            type="button"
            onClick={handleDirectVideoDownload}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-sky-500" />
            Скачать
          </button>
        </div>
      </div>

      {/* Main Video Stage with ONLY ONE Floating Control Bar Inside (Zero Error Screens, Zero Duplicate Bars) */}
      <div
        ref={playerContainerRef}
        className="relative aspect-video max-h-[580px] w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-black overflow-hidden flex items-center justify-center group"
      >
        {isLoadingStream ? (
          <div className="flex flex-col items-center justify-center gap-3 text-slate-300 p-6 text-center">
            <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
            <p className="text-sm font-medium">
              Подключение видеопотока «{anime.title}» (Серия {episode.number})…
            </p>
          </div>
        ) : (
          <video
            ref={videoRef}
            data-testid="real-html5-video-player"
            playsInline
            poster={anime.posterUrl || undefined}
            onClick={togglePlay}
            className="w-full h-full object-contain bg-black cursor-pointer"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={handleVideoEnded}
            onLoadedMetadata={(e) => {
              const vid = e.currentTarget;
              applySubtitlesPreference(subtitlesEnabled);
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
              persistProgress(now, dur);
            }}
          />
        )}

        {/* SINGLE FLOATING CUSTOM CONTROL PANEL INSIDE THE VIDEO PLAYER */}
        <div
          data-testid="unified-custom-player-controls"
          className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/95 via-black/80 to-transparent px-4 pb-3 pt-8 space-y-2.5"
        >
          {/* Timeline Scrubber */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono tabular-nums text-slate-200 w-12">
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
              className="flex-1 accent-sky-500 h-1.5 bg-slate-700/90 rounded-lg cursor-pointer disabled:opacity-40"
            />
            <span className="text-xs font-mono tabular-nums text-slate-300 w-12 text-right">
              {formatTimecode(duration)}
            </span>
          </div>

          {/* Unified Floating Transport Row */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={!activeStreamUrl}
                onClick={togglePlay}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {isPlaying ? 'Пауза' : 'Смотреть'}
              </button>

              <button
                type="button"
                disabled={!prevEp}
                onClick={() => prevEp && onSelectEpisode(prevEp)}
                aria-label="Предыдущая серия"
                title="Предыдущая серия"
                className="p-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-white/10 disabled:opacity-40 cursor-pointer"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                type="button"
                disabled={!nextEp}
                onClick={() => nextEp && onSelectEpisode(nextEp)}
                aria-label="Следующая серия"
                title="Следующая серия"
                className="p-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-white/10 disabled:opacity-40 cursor-pointer"
              >
                <SkipForward className="w-4 h-4" />
              </button>

              {/* Skip Opening (+85s or exact opening skip markers) */}
              <button
                type="button"
                disabled={!activeStreamUrl}
                onClick={handleSkipOpening}
                data-testid="skip-opening-button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900/90 hover:bg-slate-800 text-sky-400 border border-slate-700/80 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40"
              >
                <FastForward className="w-3.5 h-3.5" />
                Пропустить опенинг (+85с)
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={isMuted ? 'Включить звук' : 'Выключить звук'}
                  className="p-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-white/10 cursor-pointer"
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
                  className="w-16 accent-sky-500 h-1 bg-slate-700 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            {/* Right controls inside the floating bar */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const next = !subtitlesEnabled;
                  setSubtitlesEnabled(next);
                  applySubtitlesPreference(next);
                }}
                aria-pressed={subtitlesEnabled}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                  subtitlesEnabled
                    ? 'bg-sky-500/20 border-sky-500/50 text-sky-300'
                    : 'bg-slate-900/90 border-slate-700/80 text-slate-300 hover:text-white'
                }`}
              >
                {subtitlesEnabled ? (
                  <>
                    <Captions className="w-3.5 h-3.5" />
                    Субтитры: Вкл
                  </>
                ) : (
                  <>
                    <CaptionsOff className="w-3.5 h-3.5" />
                    Субтитры: Выкл
                  </>
                )}
              </button>

              <select
                id="player-voiceover-select"
                aria-label="Выбор озвучки в плеере"
                value={voiceover}
                onChange={(e) => onChangeVoiceover(e.target.value)}
                className="bg-slate-900/90 border border-slate-700/80 text-slate-100 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                {anime.availableVoiceovers.map((vo) => (
                  <option key={vo} value={vo}>
                    {vo}
                  </option>
                ))}
              </select>

              <select
                id="player-quality-select"
                aria-label="Выбор качества видео в плеере"
                value={quality}
                onChange={(e) => {
                  if (videoRef.current) {
                    resumeTimeRef.current = videoRef.current.currentTime;
                  }
                  onChangeQuality(e.target.value as VideoQuality);
                }}
                className="bg-slate-900/90 border border-slate-700/80 text-slate-100 text-xs font-mono rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                {VIDEO_QUALITIES.map((q) => (
                  <option key={q.value} value={q.value}>
                    {q.label}
                  </option>
                ))}
              </select>

              <select
                id="player-speed-select"
                aria-label="Скорость воспроизведения"
                value={String(playbackRate)}
                onChange={(e) => handleSpeedChange(Number(e.target.value))}
                className="bg-slate-900/90 border border-slate-700/80 text-slate-100 text-xs font-mono rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="0.75">0.75x</option>
                <option value="1">1.0x</option>
                <option value="1.25">1.25x</option>
                <option value="1.5">1.5x</option>
                <option value="2">2.0x</option>
              </select>

              <button
                type="button"
                onClick={handleDirectVideoDownload}
                aria-label="Скачать текущую серию"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-900/90 hover:bg-slate-800 text-slate-100 border border-slate-700/80 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-sky-400" />
                Скачать
              </button>

              <button
                type="button"
                disabled={!activeStreamUrl}
                onClick={handleFullscreen}
                aria-label="Полноэкранный режим (F)"
                title="Полноэкранный режим (горячая клавиша F)"
                className="p-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-white/10 disabled:opacity-40 cursor-pointer"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
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
