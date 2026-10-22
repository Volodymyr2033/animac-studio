import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAnimeSourceUrl,
  sanitizeFileName,
  escapeShellArg,
  buildTargetFilePath,
  computeDeterministicHash,
  generatePlatformBatchScript,
} from './security.ts';
import {
  extractAnimeFromUrl,
  createDownloadTask,
  calculateQueueMetrics,
  formatTimecode,
  INITIAL_ANIME_CATALOG,
} from './animeEngine.ts';

test('validateAnimeSourceUrl allows official YummyAnime.TV, AnimeGO, and AnimeVost.org HTTPS links', () => {
  const yummy = validateAnimeSourceUrl('https://yummyanime.tv/catalog/item/solo-leveling');
  assert.equal(yummy.valid, true);
  assert.equal(yummy.sourceSite, 'YummyAnime.TV');
  assert.equal(yummy.slug, 'solo-leveling');

  const go = validateAnimeSourceUrl('https://animego.org/anime/frieren-2410');
  assert.equal(go.valid, true);
  assert.equal(go.sourceSite, 'AnimeGO');

  const vost = validateAnimeSourceUrl('https://animevost.org/tip/tv/3001-bleach.html');
  assert.equal(vost.valid, true);
  assert.equal(vost.sourceSite, 'AnimeVost.org');
  assert.equal(vost.slug, '3001-bleach');
});

test('validateAnimeSourceUrl blocks SSRF, HTTP, XSS, Path Traversal, and untrusted domains', () => {
  const ssrf = validateAnimeSourceUrl('https://127.0.0.1/admin');
  assert.equal(ssrf.valid, false);
  assert.equal(ssrf.securityFlags.ssrfProtected, false);

  const httpLink = validateAnimeSourceUrl('http://animego.org/anime/test');
  assert.equal(httpLink.valid, false);
  assert.equal(httpLink.securityFlags.httpsEnforced, false);

  const untrusted = validateAnimeSourceUrl('https://evil-phishing-site.com/anime/test');
  assert.equal(untrusted.valid, false);
  assert.equal(untrusted.securityFlags.domainAllowlisted, false);

  const xss = validateAnimeSourceUrl('javascript:alert(1)');
  assert.equal(xss.valid, false);
  assert.equal(xss.securityFlags.xssClean, false);

  const traversal = validateAnimeSourceUrl('https://animego.org/anime/../../etc/passwd');
  assert.equal(traversal.valid, false);
});

test('sanitizeFileName and escapeShellArg neutralize command injection and path traversal', () => {
  const maliciousName = '../../rm -rf /; $(whoami) `id` "test"';
  const safeName = sanitizeFileName(maliciousName);
  assert.equal(safeName.includes('..'), false);
  assert.equal(safeName.includes('/'), false);
  assert.equal(safeName.includes(';'), false);
  assert.equal(safeName.includes('`'), false);

  const posixEscaped = escapeShellArg("https://animego.org/anime/test'; rm -rf /", 'macos');
  assert.equal(posixEscaped, "'https://animego.org/anime/test'\\''; rm -rf /'");

  const winEscaped = escapeShellArg("C:\\Users\\O'Connor\\Videos", 'windows');
  assert.equal(winEscaped, "'C:\\Users\\O''Connor\\Videos'");
});

test('buildTargetFilePath and generatePlatformBatchScript support macOS, Windows, and Android', () => {
  const macPath = buildTargetFilePath({
    platform: 'macos',
    animeTitle: 'Клинок ронина',
    episodeNumber: 3,
    voiceover: 'AniLibria',
    quality: '1080p',
  });
  assert.equal(macPath.startsWith('~/Movies/AniMac/'), true);

  const winPath = buildTargetFilePath({
    platform: 'windows',
    animeTitle: 'Клинок ронина',
    episodeNumber: 3,
    voiceover: 'AniLibria',
    quality: '1080p',
  });
  assert.equal(winPath.startsWith('C:\\Users\\User\\Videos\\AniMac\\'), true);

  const androidPath = buildTargetFilePath({
    platform: 'android',
    animeTitle: 'Клинок ронина',
    episodeNumber: 3,
    voiceover: 'AniLibria',
    quality: '720p',
  });
  assert.equal(androidPath.startsWith('/storage/emulated/0/Movies/AniMac/'), true);

  const script = generatePlatformBatchScript(
    [
      {
        animeTitle: 'Клинок ронина',
        episodeNumber: 1,
        voiceover: 'AniLibria',
        quality: '1080p',
        sourceSite: 'YummyAnime.TV',
        sourceUrl: 'https://yummyanime.tv/catalog/item/klinok?ep=1',
        sha256: computeDeterministicHash('test'),
      },
    ],
    'windows'
  );
  assert.equal(script.filename, 'animac-windows-download.ps1');
  assert.equal(script.content.includes('--no-exec'), true);
});

test('extractAnimeFromUrl and queue metrics work deterministically', () => {
  const parsed = extractAnimeFromUrl('https://animego.org/anime/solo-leveling-season-2');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.anime?.sourceSite, 'AnimeGO');
  assert.equal((parsed.anime?.episodes.length ?? 0) > 0, true);

  const task1 = createDownloadTask({
    anime: INITIAL_ANIME_CATALOG[0],
    episode: INITIAL_ANIME_CATALOG[0].episodes[0],
    voiceover: 'AniLibria',
    quality: '1080p',
    platform: 'macos',
  });
  const metrics = calculateQueueMetrics([task1]);
  assert.equal(metrics.activeCount, 1);
  assert.equal(metrics.totalSizeMB > 100, true);
  assert.equal(formatTimecode(1445), '24:05');
});
