import React, { useEffect, useState } from 'react';
import { ANIME_POSTER_CDN_MAP, AnimeSeries } from '../utils/animeEngine';

interface AnimeArtworkProps {
  title?: string;
  originalTitle?: string;
  posterUrl?: string;
  theme?: AnimeSeries['artworkTheme'];
  className?: string;
}

const dynamicPosterCache = new Map<string, string>();

const ADDITIONAL_POSTER_FALLBACKS: Record<string, string> = {
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
  'токийский гуль':
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx20605-fmnHdf5M7m6p.jpg',
  'реинкарнация безработного':
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx108465-B9S9zC68e91j.jpg',
};

const DEFAULT_FALLBACK_POSTER =
  ANIME_POSTER_CDN_MAP['black-clover'] ||
  'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx97940-fyh8o7gNbha0.png';

async function fetchRealAnimePoster(searchQuery: string): Promise<string | null> {
  const clean = searchQuery.trim();
  if (!clean) return null;

  const cached = dynamicPosterCache.get(clean.toLowerCase());
  if (cached) return cached;

  // 1. Check built-in CDN dictionary first
  const lower = clean.toLowerCase();
  for (const [k, url] of Object.entries(ADDITIONAL_POSTER_FALLBACKS)) {
    if (lower.includes(k) || k.includes(lower)) {
      dynamicPosterCache.set(lower, url);
      return url;
    }
  }

  // 2. Try Shikimori public API (https://shikimori.one/api/animes?search=)
  try {
    const shikiRes = await fetch(
      `https://shikimori.one/api/animes?search=${encodeURIComponent(clean)}&limit=1`,
      { signal: AbortSignal.timeout(2500) }
    );
    if (shikiRes.ok) {
      const shikiData = await shikiRes.json();
      const relUrl = shikiData?.[0]?.image?.original || shikiData?.[0]?.image?.preview;
      if (relUrl && typeof relUrl === 'string') {
        const fullUrl = relUrl.startsWith('http') ? relUrl : `https://shikimori.one${relUrl}`;
        dynamicPosterCache.set(lower, fullUrl);
        return fullUrl;
      }
    }
  } catch {
    // Fallback to AniList / Jikan if Shikimori is blocked by CORS/Cloudflare
  }

  // 3. Try AniList GraphQL public API (https://graphql.anilist.co)
  try {
    const aniRes = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query:
          'query ($s: String) { Media(search: $s, type: ANIME) { coverImage { extraLarge large } } }',
        variables: { s: clean },
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (aniRes.ok) {
      const aniData = await aniRes.json();
      const cover =
        aniData?.data?.Media?.coverImage?.extraLarge ||
        aniData?.data?.Media?.coverImage?.large;
      if (cover && typeof cover === 'string') {
        dynamicPosterCache.set(lower, cover);
        return cover;
      }
    }
  } catch {
    // Continue to Jikan fallback
  }

  // 4. Try Jikan API (https://api.jikan.moe/v4/anime?q=)
  try {
    const jikanRes = await fetch(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(clean)}&limit=1`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (jikanRes.ok) {
      const jikanData = await jikanRes.json();
      const jpgUrl =
        jikanData?.data?.[0]?.images?.jpg?.large_image_url ||
        jikanData?.data?.[0]?.images?.jpg?.image_url;
      if (jpgUrl && typeof jpgUrl === 'string') {
        dynamicPosterCache.set(lower, jpgUrl);
        return jpgUrl;
      }
    }
  } catch {
    // Ignore network timeout
  }

  return null;
}

export const AnimeArtwork: React.FC<AnimeArtworkProps> = ({
  title = 'Аниме',
  originalTitle = '',
  posterUrl = '',
  className = 'w-full h-full object-cover',
}) => {
  const [resolvedUrl, setResolvedUrl] = useState<string>(() => {
    if (posterUrl) return posterUrl;
    const lowerTitle = title.toLowerCase();
    for (const [k, url] of Object.entries(ADDITIONAL_POSTER_FALLBACKS)) {
      if (lowerTitle.includes(k)) return url;
    }
    return '';
  });
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoaded(false);

    if (posterUrl) {
      setResolvedUrl(posterUrl);
      return;
    }

    const queryToUse =
      originalTitle && !originalTitle.includes('Original Animation')
        ? originalTitle.split('/')[0].trim()
        : title;

    fetchRealAnimePoster(queryToUse).then((url) => {
      if (cancelled) return;
      if (url) {
        setResolvedUrl(url);
      } else {
        fetchRealAnimePoster(title).then((ruUrl) => {
          if (cancelled) return;
          setResolvedUrl(ruUrl || DEFAULT_FALLBACK_POSTER);
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [posterUrl, title, originalTitle]);

  const finalSrc = resolvedUrl || posterUrl || DEFAULT_FALLBACK_POSTER;

  return (
    <div className="relative w-full h-full overflow-hidden rounded-xl bg-slate-900">
      {/* Smooth skeleton shimmer while real poster loads */}
      {!isLoaded && (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 animate-pulse"
        />
      )}
      <img
        src={finalSrc}
        alt={`Постер аниме ${title}`}
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
        onError={(e) => {
          const target = e.currentTarget;
          if (target.src !== DEFAULT_FALLBACK_POSTER) {
            target.src = DEFAULT_FALLBACK_POSTER;
          }
          setIsLoaded(true);
        }}
        style={{ objectFit: 'cover' }}
        className={`${className} w-full h-full object-cover rounded-xl transition-opacity duration-500 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
};
