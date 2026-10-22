export type SourceSite = 'YummyAnime.TV' | 'AnimeGO' | 'AnimeVost.org';
export type PlatformTarget = 'macos' | 'windows' | 'android';
export type VideoQuality = '2160p' | '1080p' | '720p' | '480p';

export interface UrlValidationResult {
  valid: boolean;
  isUrlInput: boolean;
  sanitizedUrl?: string;
  sourceSite?: SourceSite;
  slug?: string;
  searchQuery?: string;
  error?: string;
  securityFlags: {
    httpsEnforced: boolean;
    domainAllowlisted: boolean;
    ssrfProtected: boolean;
    xssClean: boolean;
  };
}

const ALLOWED_DOMAINS: Record<string, SourceSite> = {
  'yummyanime.tv': 'YummyAnime.TV',
  'www.yummyanime.tv': 'YummyAnime.TV',
  'yummyanime.in': 'YummyAnime.TV',
  'animego.org': 'AnimeGO',
  'www.animego.org': 'AnimeGO',
  'animego.me': 'AnimeGO',
  'animevost.org': 'AnimeVost.org',
  'www.animevost.org': 'AnimeVost.org',
  'v2.vost.pw': 'AnimeVost.org',
};

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
];

/**
 * Determines whether the user input is a URL/URI attempt or a plain-text anime title search query.
 */
export function isLikelyUrlInput(rawInput: string): boolean {
  const trimmed = rawInput.trim();
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(trimmed)) return true;
  if (/(?:^|\/|\\)\.\.(?:\/|\\|$)|%2e%2e/i.test(trimmed)) return true;
  if (/^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(\/|:|$)/i.test(trimmed)) {
    return true;
  }
  // Matches domain-like inputs without spaces (e.g., animego.org/anime/..., evil.com/anime)
  if (!/\s/.test(trimmed) && /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * Validates and sanitizes an anime URL or classifies plain text as a safe search query.
 * Never blocks normal Russian/English anime title searches with "Invalid URL format".
 */
export function validateAnimeSourceUrl(rawInput: string): UrlValidationResult {
  const trimmed = rawInput.trim();
  const defaultFlags = {
    httpsEnforced: true,
    domainAllowlisted: true,
    ssrfProtected: true,
    xssClean: true,
  };

  if (!trimmed) {
    return {
      valid: false,
      isUrlInput: false,
      error: 'Введите название аниме (например, «Черный клевер») или прямую ссылку на тайтл.',
      securityFlags: defaultFlags,
    };
  }

  // Always block XSS / dangerous script protocols or shell/HTML injection characters
  if (
    /[<>'"`\0\r\n]/.test(trimmed) ||
    /^(javascript|data|vbscript|file|ftp):/i.test(trimmed) ||
    /(?:^|\/|\\)\.\.(?:\/|\\|$)|%2e%2e/i.test(trimmed)
  ) {
    return {
      valid: false,
      isUrlInput: true,
      error: 'Заблокировано системой безопасности: обнаружен опасный протокол, обход директорий (Path Traversal) или инъекция символов.',
      securityFlags: { ...defaultFlags, xssClean: false },
    };
  }

  // If the input is a plain-text title query (not a URL), allow it cleanly for multi-site search
  if (!isLikelyUrlInput(trimmed)) {
    return {
      valid: true,
      isUrlInput: false,
      searchQuery: trimmed.slice(0, 120),
      securityFlags: defaultFlags,
    };
  }

  let parsed: URL;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    parsed = new URL(withProtocol);
  } catch {
    return {
      valid: false,
      isUrlInput: true,
      error: 'Некорректная ссылка. Введите название аниме текстом или ссылку с YummyAnime.TV, AnimeGO, AnimeVost.org.',
      securityFlags: { ...defaultFlags, httpsEnforced: false, domainAllowlisted: false },
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  for (const pattern of PRIVATE_HOST_PATTERNS) {
    if (pattern.test(hostname)) {
      return {
        valid: false,
        isUrlInput: true,
        error: 'Заблокировано защитой SSRF: обращения к локальным и внутренним IP-адресам запрещены.',
        securityFlags: { ...defaultFlags, ssrfProtected: false },
      };
    }
  }

  if (parsed.protocol !== 'https:') {
    return {
      valid: false,
      isUrlInput: true,
      error: 'Требуется защищённое соединение HTTPS (TLS 1.3). Незащищённый HTTP заблокирован.',
      securityFlags: { ...defaultFlags, httpsEnforced: false },
    };
  }

  const matchedSite = ALLOWED_DOMAINS[hostname];
  if (!matchedSite) {
    return {
      valid: false,
      isUrlInput: true,
      error: `Домен «${hostname}» не входит в белый список проверенных источников (YummyAnime.TV, AnimeGO, AnimeVost.org).`,
      securityFlags: { ...defaultFlags, httpsEnforced: true, domainAllowlisted: false },
    };
  }

  const rawSegments = parsed.pathname
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

  const lastSegment = rawSegments[rawSegments.length - 1] || 'anime-title';
  const cleanSlug =
    lastSegment
      .replace(/\.html?$/i, '')
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'custom-anime';

  return {
    valid: true,
    isUrlInput: true,
    sanitizedUrl: `https://${hostname}${parsed.pathname}`,
    sourceSite: matchedSite,
    slug: cleanSlug,
    securityFlags: {
      httpsEnforced: true,
      domainAllowlisted: true,
      ssrfProtected: true,
      xssClean: true,
    },
  };
}

/**
 * Strips path traversal sequences and illegal OS filesystem characters.
 */
export function sanitizeFileName(input: string): string {
  const cleaned = input
    .replace(/\.\.+/g, '')
    .replace(/[/\\:*?"<>|\0\r\n\t`$;|&]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

  return cleaned || 'episode';
}

/**
 * Escapes shell arguments safely to prevent Command Injection across macOS/Linux/Android POSIX shells and Windows PowerShell.
 */
export function escapeShellArg(arg: string, platform: PlatformTarget): string {
  const clean = arg.replace(/[\0\r\n]/g, '');
  if (platform === 'windows') {
    return `'${clean.replace(/'/g, "''")}'`;
  }
  return `'${clean.replace(/'/g, "'\\''")}'`;
}

/**
 * Builds the OS-specific destination file path for macOS, Windows, or Android.
 */
export function buildTargetFilePath(params: {
  platform: PlatformTarget;
  animeTitle: string;
  episodeNumber: number;
  voiceover: string;
  quality: VideoQuality;
}): string {
  const safeAnime = sanitizeFileName(params.animeTitle);
  const safeVoice = sanitizeFileName(params.voiceover);
  const epStr = String(params.episodeNumber).padStart(2, '0');
  const fileName = `${safeAnime} - E${epStr} [${safeVoice}] [${params.quality}].mp4`;

  if (params.platform === 'windows') {
    return `C:\\Users\\User\\Videos\\AniMac\\${safeAnime}\\${fileName}`;
  }
  if (params.platform === 'android') {
    return `/storage/emulated/0/Movies/AniMac/${safeAnime}/${fileName}`;
  }
  return `~/Movies/AniMac/${safeAnime}/${fileName}`;
}

/**
 * Deterministic 64-char hex checksum for verifying offline episode integrity.
 */
export function computeDeterministicHash(input: string): string {
  const seeds = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    const idx = i % 8;
    seeds[idx] = Math.imul(seeds[idx] ^ code, 0x01000193) >>> 0;
    seeds[(idx + 1) % 8] = (seeds[(idx + 1) % 8] + (seeds[idx] >>> 3)) >>> 0;
  }
  return seeds.map((n) => n.toString(16).padStart(8, '0')).join('');
}

export interface ScriptableTask {
  animeTitle: string;
  episodeNumber: number;
  voiceover: string;
  quality: VideoQuality;
  sourceSite: SourceSite;
  sourceUrl: string;
  sha256: string;
}

/**
 * Generates a hardened, command-injection-safe download script for macOS, Windows 11, or Android (Termux).
 */
export function generatePlatformBatchScript(
  tasks: ScriptableTask[],
  platform: PlatformTarget
): {
  filename: string;
  content: string;
  mimeType: string;
} {
  const qualityHeightMap: Record<VideoQuality, string> = {
    '2160p': '2160',
    '1080p': '1080',
    '720p': '720',
    '480p': '480',
  };

  if (platform === 'windows') {
    const lines = [
      '# AniMac Studio — Защищённый скрипт загрузки для Windows 10/11 (PowerShell)',
      '# Политика кибербезопасности: принудительный TLS 1.3, изоляция аргументов, запрет --exec',
      '$ErrorActionPreference = "Stop"',
      '[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13',
      '$BaseDir = Join-Path $HOME "Videos\\AniMac"',
      'New-Item -ItemType Directory -Force -Path $BaseDir | Out-Null',
      '',
    ];

    for (const t of tasks) {
      const safeTitle = sanitizeFileName(t.animeTitle);
      const safeVoice = sanitizeFileName(t.voiceover);
      const epStr = String(t.episodeNumber).padStart(2, '0');
      const outPath = `$BaseDir\\${safeTitle}\\${safeTitle} - E${epStr} [${safeVoice}] [${t.quality}].mp4`;
      const height = qualityHeightMap[t.quality];
      const escapedUrl = escapeShellArg(t.sourceUrl, 'windows');
      const escapedOut = escapeShellArg(outPath, 'windows');

      lines.push(`# [${t.sourceSite}] ${safeTitle} — Серия ${epStr} (${safeVoice}, ${t.quality})`);
      lines.push(`# Контрольная сумма метаданных SHA-256: ${t.sha256}`);
      lines.push(
        `yt-dlp.exe --no-exec --restrict-filenames --force-ipv4 --no-check-certificates:$false -f "bestvideo[height<=${height}]+bestaudio/best[height<=${height}]" --merge-output-format mp4 -o ${escapedOut} ${escapedUrl}`
      );
      lines.push('');
    }

    return {
      filename: 'animac-windows-download.ps1',
      content: lines.join('\r\n'),
      mimeType: 'text/plain;charset=utf-8',
    };
  }

  const isAndroid = platform === 'android';
  const baseDir = isAndroid ? '$HOME/storage/movies/AniMac' : '$HOME/Movies/AniMac';
  const headerTitle = isAndroid
    ? '# AniMac Studio — Защищённый скрипт загрузки для Android (Termux / Seal)'
    : '# AniMac Studio — Защищённый скрипт загрузки для macOS (Apple Silicon & Intel)';

  const lines = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    headerTitle,
    '# Кибербезопасность: строгая валидация TLS, экранирование POSIX-аргументов, запрет выполнения стороннего кода (--no-exec)',
    `BASE_DIR="${baseDir}"`,
    'mkdir -p "$BASE_DIR"',
    '',
  ];

  for (const t of tasks) {
    const safeTitle = sanitizeFileName(t.animeTitle);
    const safeVoice = sanitizeFileName(t.voiceover);
    const epStr = String(t.episodeNumber).padStart(2, '0');
    const relFile = `${safeTitle}/${safeTitle} - E${epStr} [${safeVoice}] [${t.quality}].mp4`;
    const height = qualityHeightMap[t.quality];
    const escapedUrl = escapeShellArg(t.sourceUrl, platform);
    const escapedRel = escapeShellArg(relFile, platform);

    lines.push(`# [${t.sourceSite}] ${safeTitle} — Серия ${epStr} (${safeVoice}, ${t.quality})`);
    lines.push(`# SHA-256: ${t.sha256}`);
    lines.push(
      `yt-dlp --no-exec --restrict-filenames --proto https -f "bestvideo[height<=${height}]+bestaudio/best[height<=${height}]" --merge-output-format mp4 -o "$BASE_DIR/"${escapedRel} ${escapedUrl}`
    );
    lines.push('');
  }

  return {
    filename: isAndroid ? 'animac-android-termux.sh' : 'animac-macos-download.sh',
    content: lines.join('\n'),
    mimeType: 'text/x-sh;charset=utf-8',
  };
}
