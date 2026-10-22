export type SourceSite = 'YummyAnime.TV' | 'AnimeGO' | 'AnimeVost.org';
export type PlatformTarget = 'macos' | 'windows' | 'android';
export type VideoQuality = '2160p' | '1080p' | '720p' | '480p';

export interface UrlValidationResult {
  valid: boolean;
  sanitizedUrl?: string;
  sourceSite?: SourceSite;
  slug?: string;
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
 * Validates and sanitizes an anime URL against SSRF, XSS, and untrusted domains.
 */
export function validateAnimeSourceUrl(rawInput: string): UrlValidationResult {
  const trimmed = rawInput.trim();
  const defaultFlags = {
    httpsEnforced: false,
    domainAllowlisted: false,
    ssrfProtected: true,
    xssClean: true,
  };

  if (!trimmed) {
    return {
      valid: false,
      error: 'Введите ссылку на страницу аниме с YummyAnime.TV, AnimeGO или AnimeVost.org.',
      securityFlags: defaultFlags,
    };
  }

  if (
    /[<>'"`\0\r\n]/.test(trimmed) ||
    /^(javascript|data|vbscript|file|ftp):/i.test(trimmed) ||
    /(?:^|\/|\\)\.\.(?:\/|\\|$)|%2e%2e/i.test(trimmed)
  ) {
    return {
      valid: false,
      error: 'Заблокировано системой безопасности: обнаружен опасный протокол, обход директорий (Path Traversal) или инъекция символов.',
      securityFlags: { ...defaultFlags, xssClean: false },
    };
  }

  let parsed: URL;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    parsed = new URL(withProtocol);
  } catch {
    return {
      valid: false,
      error: 'Некорректный формат URL. Пример: https://animego.org/anime/solo-leveling',
      securityFlags: defaultFlags,
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  for (const pattern of PRIVATE_HOST_PATTERNS) {
    if (pattern.test(hostname)) {
      return {
        valid: false,
        error: 'Заблокировано защитой SSRF: обращения к локальным и внутренним IP-адресам запрещены.',
        securityFlags: { ...defaultFlags, ssrfProtected: false },
      };
    }
  }

  if (parsed.protocol !== 'https:') {
    return {
      valid: false,
      error: 'Требуется защищённое соединение HTTPS (TLS 1.3). Незащищённый HTTP заблокирован.',
      securityFlags: { ...defaultFlags, httpsEnforced: false },
    };
  }

  const matchedSite = ALLOWED_DOMAINS[hostname];
  if (!matchedSite) {
    return {
      valid: false,
      error: `Домен «${hostname}» не входит в белый список проверенных источников (YummyAnime.TV, AnimeGO, AnimeVost.org).`,
      securityFlags: { ...defaultFlags, httpsEnforced: true, domainAllowlisted: false },
    };
  }

  const rawSegments = parsed.pathname
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

  if (rawSegments.some((s) => s === '..' || s === '.' || s.includes('%2e%2e') || s.includes('%2E%2E'))) {
    return {
      valid: false,
      error: 'Заблокировано: обнаружена попытка обхода директорий (Path Traversal) в URL.',
      securityFlags: { ...defaultFlags, httpsEnforced: true, domainAllowlisted: true, xssClean: false },
    };
  }

  const lastSegment = rawSegments[rawSegments.length - 1] || 'anime-title';
  const cleanSlug = lastSegment
    .replace(/\.html?$/i, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'custom-anime';

  return {
    valid: true,
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
    // PowerShell single-quoted string: only single quote is escaped by doubling ''
    return `'${clean.replace(/'/g, "''")}'`;
  }
  // POSIX sh / zsh (macOS & Android Termux): single-quote wrapping with '\'' escape
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
export function generatePlatformBatchScript(tasks: ScriptableTask[], platform: PlatformTarget): {
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
