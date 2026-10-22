import React, { useEffect, useState } from 'react';
import { AnimeSeries } from '../utils/animeEngine';

interface AnimeArtworkProps {
  title?: string;
  originalTitle?: string;
  posterUrl?: string;
  poster?: string;
  theme?: AnimeSeries['artworkTheme'];
  className?: string;
}

const POSTER_STORAGE_KEY = 'animac_poster_cache_v5';

// In-memory Map cache hydrated from localStorage to prevent redundant API requests
const posterMemoryCache = new Map<string, string>();

try {
  const rawSaved = localStorage.getItem(POSTER_STORAGE_KEY);
  if (rawSaved) {
    const parsed = JSON.parse(rawSaved) as Record<string, string>;
    for (const [k, v] of Object.entries(parsed)) {
      if (
        typeof k === 'string' &&
        typeof v === 'string' &&
        v.startsWith('http') &&
        !v.includes('desu.shikimori.one')
      ) {
        posterMemoryCache.set(k, v);
      }
    }
  }
} catch {
  // Ignore localStorage parse errors
}

function savePosterToCache(key: string, url: string): void {
  const normKey = key.trim().toLowerCase();
  if (!normKey || !url) return;
  posterMemoryCache.set(normKey, url);
  try {
    const serialized: Record<string, string> = {};
    for (const [k, v] of posterMemoryCache.entries()) {
      serialized[k] = v;
    }
    localStorage.setItem(POSTER_STORAGE_KEY, JSON.stringify(serialized));
  } catch {
    // Ignore quota errors
  }
}

/**
 * Maps any outdated/legacy MyAnimeList or Shikimori poster URLs to verified 200 OK MyAnimeList CDN URLs.
 */
const URL_MIRROR_REPAIR_MAP: Record<string, string> = {
  'https://cdn.myanimelist.net/images/anime/1066/123146l.jpg':
    'https://cdn.myanimelist.net/images/anime/1694/93337l.jpg',
  'https://desu.shikimori.one/uploads/poster/animes/37430/main_2x-1937ff7b7ca829b3a0a383b16a246a47.webp':
    'https://cdn.myanimelist.net/images/anime/1694/93337l.jpg',
  'https://cdn.myanimelist.net/images/anime/1015/138075l.jpg':
    'https://cdn.myanimelist.net/images/anime/1015/138006l.jpg',
  'https://cdn.myanimelist.net/images/anime/2/88339l.jpg':
    'https://cdn.myanimelist.net/images/anime/2/88336l.jpg',
  'https://cdn.myanimelist.net/images/anime/1826/140700l.jpg':
    'https://cdn.myanimelist.net/images/anime/1801/142390l.jpg',
};

/**
 * Verified working MyAnimeList CDN posters for popular anime titles.
 */
export const LOCAL_MAL_POSTER_DICTIONARY: Record<string, string> = {
  'о моем перерождении в слизь': 'https://cdn.myanimelist.net/images/anime/1694/93337l.jpg',
  'о моём перерождении в слизь': 'https://cdn.myanimelist.net/images/anime/1694/93337l.jpg',
  'перерождение в слизь': 'https://cdn.myanimelist.net/images/anime/1694/93337l.jpg',
  'слизь': 'https://cdn.myanimelist.net/images/anime/1694/93337l.jpg',
  'tensei shitara slime datta ken': 'https://cdn.myanimelist.net/images/anime/1694/93337l.jpg',
  'that time i got reincarnated as a slime': 'https://cdn.myanimelist.net/images/anime/1694/93337l.jpg',
  'магическая битва': 'https://cdn.myanimelist.net/images/anime/1171/109222l.jpg',
  'jujutsu kaisen': 'https://cdn.myanimelist.net/images/anime/1171/109222l.jpg',
  'клинок, рассекающий демонов': 'https://cdn.myanimelist.net/images/anime/1286/99889l.jpg',
  'клинок рассекающий демонов': 'https://cdn.myanimelist.net/images/anime/1286/99889l.jpg',
  'клинок': 'https://cdn.myanimelist.net/images/anime/1286/99889l.jpg',
  'kimetsu no yaiba': 'https://cdn.myanimelist.net/images/anime/1286/99889l.jpg',
  'demon slayer': 'https://cdn.myanimelist.net/images/anime/1286/99889l.jpg',
  'провожающая в последний путь фрирен': 'https://cdn.myanimelist.net/images/anime/1015/138006l.jpg',
  'фрирен': 'https://cdn.myanimelist.net/images/anime/1015/138006l.jpg',
  'sousou no frieren': 'https://cdn.myanimelist.net/images/anime/1015/138006l.jpg',
  'frieren': 'https://cdn.myanimelist.net/images/anime/1015/138006l.jpg',
  'атака титанов': 'https://cdn.myanimelist.net/images/anime/10/47347l.jpg',
  'shingeki no kyojin': 'https://cdn.myanimelist.net/images/anime/10/47347l.jpg',
  'attack on titan': 'https://cdn.myanimelist.net/images/anime/10/47347l.jpg',
  'черный клевер': 'https://cdn.myanimelist.net/images/anime/2/88336l.jpg',
  'чёрный клевер': 'https://cdn.myanimelist.net/images/anime/2/88336l.jpg',
  'black clover': 'https://cdn.myanimelist.net/images/anime/2/88336l.jpg',
  'человек-бензопила': 'https://cdn.myanimelist.net/images/anime/1806/126216l.jpg',
  'человек бензопила': 'https://cdn.myanimelist.net/images/anime/1806/126216l.jpg',
  'бензопила': 'https://cdn.myanimelist.net/images/anime/1806/126216l.jpg',
  'chainsaw man': 'https://cdn.myanimelist.net/images/anime/1806/126216l.jpg',
  'соло левелинг': 'https://cdn.myanimelist.net/images/anime/1801/142390l.jpg',
  'поднятие уровня в одиночку': 'https://cdn.myanimelist.net/images/anime/1801/142390l.jpg',
  'solo leveling': 'https://cdn.myanimelist.net/images/anime/1801/142390l.jpg',
  'ore dake level up na ken': 'https://cdn.myanimelist.net/images/anime/1801/142390l.jpg',
  'монолог фармацевта': 'https://cdn.myanimelist.net/images/anime/1708/138033l.jpg',
  'kusuriya no hitorigoto': 'https://cdn.myanimelist.net/images/anime/1708/138033l.jpg',
  'the apothecary diaries': 'https://cdn.myanimelist.net/images/anime/1708/138033l.jpg',
  'ван-пис': 'https://cdn.myanimelist.net/images/anime/6/73245l.jpg',
  'ван пис': 'https://cdn.myanimelist.net/images/anime/6/73245l.jpg',
  'one piece': 'https://cdn.myanimelist.net/images/anime/6/73245l.jpg',
  'блич': 'https://cdn.myanimelist.net/images/anime/1908/135431l.jpg',
  'bleach': 'https://cdn.myanimelist.net/images/anime/1908/135431l.jpg',
  'наруто': 'https://cdn.myanimelist.net/images/anime/1565/111305l.jpg',
  'naruto': 'https://cdn.myanimelist.net/images/anime/1565/111305l.jpg',
  'синяя тюрьма': 'https://cdn.myanimelist.net/images/anime/1258/126929l.jpg',
  'блю лок': 'https://cdn.myanimelist.net/images/anime/1258/126929l.jpg',
  'blue lock': 'https://cdn.myanimelist.net/images/anime/1258/126929l.jpg',
  'семья шпиона': 'https://cdn.myanimelist.net/images/anime/1441/122795l.jpg',
  'spy x family': 'https://cdn.myanimelist.net/images/anime/1441/122795l.jpg',
  'звездное дитя': 'https://cdn.myanimelist.net/images/anime/1812/134736l.jpg',
  'звёздное дитя': 'https://cdn.myanimelist.net/images/anime/1812/134736l.jpg',
  'oshi no ko': 'https://cdn.myanimelist.net/images/anime/1812/134736l.jpg',
  'дандадан': 'https://cdn.myanimelist.net/images/anime/1584/143719l.jpg',
  'dandadan': 'https://cdn.myanimelist.net/images/anime/1584/143719l.jpg',
  'великий из бродячих псов': 'https://cdn.myanimelist.net/images/anime/3/79409l.jpg',
  'bungou stray dogs': 'https://cdn.myanimelist.net/images/anime/3/79409l.jpg',
  'тетрадь смерти': 'https://cdn.myanimelist.net/images/anime/1079/138100l.jpg',
  'death note': 'https://cdn.myanimelist.net/images/anime/1079/138100l.jpg',
  'стальной алхимик': 'https://cdn.myanimelist.net/images/anime/1208/94745l.jpg',
  'fullmetal alchemist': 'https://cdn.myanimelist.net/images/anime/1208/94745l.jpg',
  'токийский гуль': 'https://cdn.myanimelist.net/images/anime/1498/134443l.jpg',
  'tokyo ghoul': 'https://cdn.myanimelist.net/images/anime/1498/134443l.jpg',
  'реинкарнация безработного': 'https://cdn.myanimelist.net/images/anime/1530/117776l.jpg',
  'mushoku tensei': 'https://cdn.myanimelist.net/images/anime/1530/117776l.jpg',
  'восхождение в тени': 'https://cdn.myanimelist.net/images/anime/1874/121869l.jpg',
  'the eminence in shadow': 'https://cdn.myanimelist.net/images/anime/1874/121869l.jpg',
  'восхождение героя щита': 'https://cdn.myanimelist.net/images/anime/1490/101365l.jpg',
  'герой щита': 'https://cdn.myanimelist.net/images/anime/1490/101365l.jpg',
  'мастера меча онлайн': 'https://cdn.myanimelist.net/images/anime/11/39717l.jpg',
  'sword art online': 'https://cdn.myanimelist.net/images/anime/11/39717l.jpg',
};

function findLocalPoster(query: string): string | null {
  const lower = query.trim().toLowerCase();
  if (!lower) return null;

  const cached = posterMemoryCache.get(lower);
  if (cached) return URL_MIRROR_REPAIR_MAP[cached] || cached;

  for (const [k, url] of Object.entries(LOCAL_MAL_POSTER_DICTIONARY)) {
    if (lower === k || (lower.length >= 4 && (lower.includes(k) || k.includes(lower)))) {
      savePosterToCache(lower, url);
      return url;
    }
  }
  return null;
}

/**
 * Dynamically searches Jikan API (https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=1)
 * and falls back to AniLibria API if not found in local dictionary.
 */
export async function fetchDynamicAnimePoster(query: string): Promise<string | null> {
  const clean = query.trim();
  if (!clean) return null;

  const local = findLocalPoster(clean);
  if (local) return local;

  const lower = clean.toLowerCase();

  // 1. Primary: Jikan REST API (CORS-friendly MyAnimeList CDN URLs)
  try {
    const jikanRes = await fetch(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(clean)}&limit=1`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (jikanRes.ok) {
      const data = await jikanRes.json();
      const poster =
        data?.data?.[0]?.images?.webp?.large_image_url ||
        data?.data?.[0]?.images?.jpg?.large_image_url ||
        data?.data?.[0]?.images?.jpg?.image_url;
      if (poster && typeof poster === 'string') {
        savePosterToCache(lower, poster);
        return poster;
      }
    }
  } catch {
    // Fallback to AniLibria search API
  }

  // 2. Secondary: AniLibria public API
  try {
    const libriaRes = await fetch(
      `https://anilibria.top/api/v1/app/search/releases?query=${encodeURIComponent(clean)}`,
      { signal: AbortSignal.timeout(3500) }
    );
    if (libriaRes.ok) {
      const list = await libriaRes.json();
      const relPath = list?.[0]?.poster?.src || list?.[0]?.poster?.optimized?.src;
      if (relPath && typeof relPath === 'string') {
        const fullUrl = relPath.startsWith('http')
          ? relPath
          : `https://anilibria.top${relPath}`;
        savePosterToCache(lower, fullUrl);
        return fullUrl;
      }
    }
  } catch {
    // Offline or unreachable
  }

  return null;
}

export const AnimeArtwork: React.FC<AnimeArtworkProps> = ({
  title = 'Аниме',
  originalTitle = '',
  posterUrl = '',
  poster = '',
  className = 'w-full h-full object-cover rounded-xl',
}) => {
  const rawInitialUrl = (posterUrl || poster || '').trim();
  const initialRepairedUrl =
    (rawInitialUrl ? URL_MIRROR_REPAIR_MAP[rawInitialUrl] || rawInitialUrl : '') ||
    findLocalPoster(title) ||
    (originalTitle ? findLocalPoster(originalTitle) : '') ||
    '';

  const [activeSrc, setActiveSrc] = useState<string>(initialRepairedUrl);
  const [hasImageError, setHasImageError] = useState<boolean>(false);
  const [isSearchingApi, setIsSearchingApi] = useState<boolean>(!initialRepairedUrl);

  useEffect(() => {
    let cancelled = false;
    setHasImageError(false);

    const directPropUrl = (posterUrl || poster || '').trim();
    const resolvedDirect = directPropUrl
      ? URL_MIRROR_REPAIR_MAP[directPropUrl] || directPropUrl
      : '';

    if (resolvedDirect) {
      savePosterToCache(title, resolvedDirect);
      setActiveSrc(resolvedDirect);
      setIsSearchingApi(false);
      return;
    }

    const fromLocalDict =
      findLocalPoster(title) ||
      (originalTitle ? findLocalPoster(originalTitle.split('/')[0].trim()) : null);

    if (fromLocalDict) {
      setActiveSrc(fromLocalDict);
      setIsSearchingApi(false);
      return;
    }

    setActiveSrc('');
    setIsSearchingApi(true);

    (async () => {
      const cleanOrig =
        originalTitle && !originalTitle.includes('Original Animation')
          ? originalTitle.split('/')[0].trim()
          : '';

      // Query Jikan API with English/Romaji title first if available, then Russian title
      const firstQuery = cleanOrig || title;
      const foundFirst = await fetchDynamicAnimePoster(firstQuery);
      if (cancelled) return;
      if (foundFirst) {
        savePosterToCache(title, foundFirst);
        setActiveSrc(foundFirst);
        setIsSearchingApi(false);
        return;
      }

      if (cleanOrig && cleanOrig.toLowerCase() !== title.toLowerCase()) {
        const foundSecond = await fetchDynamicAnimePoster(title);
        if (cancelled) return;
        if (foundSecond) {
          savePosterToCache(title, foundSecond);
          setActiveSrc(foundSecond);
          setIsSearchingApi(false);
          return;
        }
      }

      if (!cancelled) {
        setHasImageError(true);
        setIsSearchingApi(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [posterUrl, poster, title, originalTitle]);

  return (
    <div className="relative w-full h-full overflow-hidden rounded-xl bg-slate-900 select-none">
      {activeSrc && !hasImageError ? (
        <img
          src={activeSrc}
          alt={title}
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
          className={`${className} w-full h-full object-cover rounded-xl`}
          onError={(e) => {
            const img = e.currentTarget;
            // If URL is in repair map, swap to verified 200 OK mirror first
            const repaired = URL_MIRROR_REPAIR_MAP[img.src];
            if (repaired && img.src !== repaired) {
              setActiveSrc(repaired);
              return;
            }
            // If CDN rejected anonymous CORS header, retry once without crossOrigin attribute
            if (img.hasAttribute('crossorigin')) {
              img.removeAttribute('crossorigin');
              img.src = activeSrc;
              return;
            }
            // Only if the image genuinely failed to load — switch to neutral placeholder
            setHasImageError(true);
          }}
        />
      ) : isSearchingApi ? (
        <div
          aria-hidden="true"
          className="w-full h-full bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 animate-pulse rounded-xl"
        />
      ) : (
        <div
          data-testid="anime-poster-fallback"
          className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-slate-800/80 rounded-xl"
        >
          <img
            src="/icon.svg"
            alt={title}
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            className="w-12 h-12 rounded-xl opacity-80 mb-3 shadow-md"
          />
          <span className="text-xs font-bold text-slate-100 line-clamp-3 leading-snug">
            {title}
          </span>
          {originalTitle && !originalTitle.includes('Original Animation') && (
            <span className="mt-1 text-[10px] font-medium text-slate-400 line-clamp-2">
              {originalTitle.split('/')[0].trim()}
            </span>
          )}
          <span className="mt-2.5 px-2 py-0.5 rounded bg-slate-800/90 text-[10px] font-mono text-sky-400">
            AniMac Studio
          </span>
        </div>
      )}
    </div>
  );
};
