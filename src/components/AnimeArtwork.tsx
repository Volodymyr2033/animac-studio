import React, { useEffect, useState } from 'react';
import { AnimeSeries } from '../utils/animeEngine';

interface AnimeArtworkProps {
  title?: string;
  originalTitle?: string;
  posterUrl?: string;
  theme?: AnimeSeries['artworkTheme'];
  className?: string;
}

const POSTER_STORAGE_KEY = 'animac_poster_cache_v3';

// In-memory Map cache hydrated from localStorage to prevent redundant API requests
const posterMemoryCache = new Map<string, string>();

try {
  const rawSaved = localStorage.getItem(POSTER_STORAGE_KEY);
  if (rawSaved) {
    const parsed = JSON.parse(rawSaved) as Record<string, string>;
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k === 'string' && typeof v === 'string' && v.startsWith('http')) {
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

const ADDITIONAL_POSTER_FALLBACKS: Record<string, string> = {
  'о моем перерождении в слизь':
    'https://desu.shikimori.one/uploads/poster/animes/37430/main_2x-1937ff7b7ca829b3a0a383b16a246a47.webp',
  'о моём перерождении в слизь':
    'https://desu.shikimori.one/uploads/poster/animes/37430/main_2x-1937ff7b7ca829b3a0a383b16a246a47.webp',
  'перерождение в слизь':
    'https://desu.shikimori.one/uploads/poster/animes/37430/main_2x-1937ff7b7ca829b3a0a383b16a246a47.webp',
  'tensei shitara slime datta ken':
    'https://desu.shikimori.one/uploads/poster/animes/37430/main_2x-1937ff7b7ca829b3a0a383b16a246a47.webp',
  'that time i got reincarnated as a slime':
    'https://desu.shikimori.one/uploads/poster/animes/37430/main_2x-1937ff7b7ca829b3a0a383b16a246a47.webp',
  'великий из бродячих псов':
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21311-532b3t9B9X2H.jpg',
  'bungou stray dogs':
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21311-532b3t9B9X2H.jpg',
  'тетрадь смерти':
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1535-lawCwhzhi96X.jpg',
  'death note':
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1535-lawCwhzhi96X.jpg',
  'стальной алхимик':
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx5114-KJTQz9AIm64X.jpg',
  'fullmetal alchemist':
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx5114-KJTQz9AIm64X.jpg',
  'токийский гуль':
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx20605-fmnHdf5M7m6p.jpg',
  'tokyo ghoul':
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx20605-fmnHdf5M7m6p.jpg',
  'реинкарнация безработного':
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx108465-B9S9zC68e91j.jpg',
  'mushoku tensei':
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx108465-B9S9zC68e91j.jpg',
  'восхождение в тени':
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx130298-b5926H52uM5E.jpg',
  'the eminence in shadow':
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx130298-b5926H52uM5E.jpg',
  'восхождение героя щита':
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx99263-SJj9d65Q58xV.jpg',
  'герой щита':
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx99263-SJj9d65Q58xV.jpg',
  'мастера меча онлайн':
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx11757-Q9P2zjCPICq5.jpg',
  'sword art online':
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx11757-Q9P2zjCPICq5.jpg',
};

function findLocalFallbackPoster(query: string): string | null {
  const lower = query.trim().toLowerCase();
  if (!lower) return null;

  const cached = posterMemoryCache.get(lower);
  if (cached) return cached;

  for (const [k, url] of Object.entries(ADDITIONAL_POSTER_FALLBACKS)) {
    if (lower === k || (lower.length >= 4 && (lower.includes(k) || k.includes(lower)))) {
      savePosterToCache(lower, url);
      return url;
    }
  }
  return null;
}

/**
 * Fetches real anime poster from Shikimori public API:
 * https://shikimori.one/api/animes?search=${encodeURIComponent(query)}&limit=1
 * Extracts https://shikimori.one${data[0].image.original}
 */
export async function fetchRealAnimePoster(searchQuery: string): Promise<string | null> {
  const clean = searchQuery.trim();
  if (!clean) return null;

  const lower = clean.toLowerCase();
  const cached = posterMemoryCache.get(lower);
  if (cached) return cached;

  const localMatch = findLocalFallbackPoster(clean);
  if (localMatch) return localMatch;

  // 1. Primary: Shikimori public API
  try {
    const shikiRes = await fetch(
      `https://shikimori.one/api/animes?search=${encodeURIComponent(clean)}&limit=1`,
      {
        headers: {
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(4000),
      }
    );
    if (shikiRes.ok) {
      const data = await shikiRes.json();
      const rawOriginal = data?.[0]?.image?.original || data?.[0]?.image?.preview;
      if (rawOriginal && typeof rawOriginal === 'string') {
        const fullUrl = rawOriginal.startsWith('http')
          ? rawOriginal
          : `https://shikimori.one${rawOriginal}`;
        savePosterToCache(lower, fullUrl);
        return fullUrl;
      }
    }
  } catch {
    // Continue to secondary public API if Shikimori is unreachable
  }

  // 2. Secondary fallback: Jikan (MyAnimeList) public API
  try {
    const jikanRes = await fetch(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(clean)}&limit=1`,
      { signal: AbortSignal.timeout(3500) }
    );
    if (jikanRes.ok) {
      const jikanData = await jikanRes.json();
      const jpgUrl =
        jikanData?.data?.[0]?.images?.webp?.large_image_url ||
        jikanData?.data?.[0]?.images?.jpg?.large_image_url ||
        jikanData?.data?.[0]?.images?.jpg?.image_url;
      if (jpgUrl && typeof jpgUrl === 'string') {
        savePosterToCache(lower, jpgUrl);
        return jpgUrl;
      }
    }
  } catch {
    // Offline or blocked
  }

  return null;
}

export const AnimeArtwork: React.FC<AnimeArtworkProps> = ({
  title = 'Аниме',
  originalTitle = '',
  posterUrl = '',
  className = 'w-full h-full object-cover',
}) => {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(() => {
    if (posterUrl && posterUrl.trim().length > 0) {
      savePosterToCache(title, posterUrl);
      return posterUrl;
    }
    return (
      findLocalFallbackPoster(title) ||
      (originalTitle ? findLocalFallbackPoster(originalTitle) : null)
    );
  });
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isFetching, setIsFetching] = useState<boolean>(() => !resolvedUrl);

  useEffect(() => {
    let cancelled = false;
    setHasError(false);

    // 1. If the anime object already has its own exact posterUrl, use it immediately
    if (posterUrl && posterUrl.trim().length > 0) {
      savePosterToCache(title, posterUrl);
      setResolvedUrl(posterUrl);
      setIsFetching(false);
      return;
    }

    // 2. Check memory/localStorage cache by Russian title or originalTitle
    const cachedByTitle =
      findLocalFallbackPoster(title) ||
      (originalTitle ? findLocalFallbackPoster(originalTitle) : null);

    if (cachedByTitle) {
      setResolvedUrl(cachedByTitle);
      setIsFetching(false);
      return;
    }

    // 3. Dynamically query Shikimori API by Russian title first, then by originalTitle if needed
    setResolvedUrl(null);
    setIsLoaded(false);
    setIsFetching(true);

    (async () => {
      const byRussianTitle = await fetchRealAnimePoster(title);
      if (cancelled) return;
      if (byRussianTitle) {
        savePosterToCache(title, byRussianTitle);
        setResolvedUrl(byRussianTitle);
        setIsFetching(false);
        return;
      }

      const cleanOrig =
        originalTitle && !originalTitle.includes('Original Animation')
          ? originalTitle.split('/')[0].trim()
          : '';
      if (cleanOrig && cleanOrig.toLowerCase() !== title.toLowerCase()) {
        const byOrigTitle = await fetchRealAnimePoster(cleanOrig);
        if (cancelled) return;
        if (byOrigTitle) {
          savePosterToCache(title, byOrigTitle);
          setResolvedUrl(byOrigTitle);
          setIsFetching(false);
          return;
        }
      }

      if (!cancelled) {
        setResolvedUrl(null);
        setIsFetching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [posterUrl, title, originalTitle]);

  const showNeutralPlaceholder = !resolvedUrl || hasError;

  return (
    <div className="relative w-full h-full overflow-hidden rounded-xl bg-slate-900 select-none">
      {/* Loading shimmer while fetching or loading image */}
      {(isFetching || (resolvedUrl && !isLoaded && !hasError)) && (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 animate-pulse"
        />
      )}

      {resolvedUrl && !hasError ? (
        <img
          src={resolvedUrl}
          alt={`Постер аниме ${title}`}
          loading="lazy"
          onLoad={() => setIsLoaded(true)}
          onError={() => {
            setHasError(true);
            setIsLoaded(true);
          }}
          style={{ objectFit: 'cover' }}
          className={`${className} w-full h-full object-cover rounded-xl transition-opacity duration-500 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ) : null}

      {/* Neutral dark placeholder when offline or poster is not found — NEVER shows another anime's poster */}
      {showNeutralPlaceholder && !isFetching && (
        <div
          data-testid="anime-poster-fallback"
          className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-slate-800/80 rounded-xl"
        >
          <img
            src="/icon.svg"
            alt=""
            aria-hidden="true"
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
