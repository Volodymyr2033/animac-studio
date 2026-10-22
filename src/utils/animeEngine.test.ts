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
  searchAnimeAcrossSites,
  cleanAnimeSlugAndText,
  resolveCleanAnimeTitles,
  buildEpisodeRangeGroups,
  createDownloadTask,
  calculateQueueMetrics,
  formatTimecode,
  DEFAULT_PLAYER_ANIME_LIST,
  enforceSequentialAnimeQueue,
  groupActiveQueueByAnime,
  stepDownloadQueueSequentially,
  groupSavedEpisodesIntoPlaylists,
} from './animeEngine.ts';

test('URL slug cleaner strips numeric IDs, technical suffixes, and resolves clean Russian + Romaji titles', () => {
  const cleaned = cleanAnimeSlugAndText('8522-monolog-farmacevta-3-sezon-n1');
  assert.equal(cleaned.cleanSlug, 'monolog-farmacevta');
  assert.equal(cleaned.seasonNumber, 3);

  const resolved = resolveCleanAnimeTitles('8522-monolog-farmacevta-3-sezon-n1');
  assert.equal(resolved.russianTitle, 'Монолог фармацевта');
  assert.equal(resolved.originalTitle, 'Kusuriya no Hitorigoto / The Apothecary Diaries');
  assert.equal(resolved.seasonNumber, 3);

  const urlSearch = searchAnimeAcrossSites(
    'https://yummyanime.tv/catalog/item/8522-monolog-farmacevta-3-sezon-n1'
  );
  assert.equal(urlSearch.ok, true);
  assert.equal(urlSearch.results[0].title, 'Монолог фармацевта');
  assert.equal(
    urlSearch.results[0].originalTitle,
    'Kusuriya no Hitorigoto / The Apothecary Diaries'
  );
  assert.equal(urlSearch.results[0].title.includes('8522'), false);
  assert.equal(urlSearch.results[0].title.includes('N1'), false);
  assert.equal(urlSearch.results[0].title.includes('YummyAnime'), false);
  assert.equal(urlSearch.results[0].defaultSeasonId, 's3');
  assert.equal(urlSearch.results[0].seasons.length, 4);

  // Also test an unlisted translit URL to ensure phonetic Russian conversion & suffix stripping
  const unlisted = searchAnimeAcrossSites(
    'https://animevost.org/tip/tv/2941-velikiy-iz-brodyachih-psov-4-sezon-v2.html'
  );
  assert.equal(unlisted.ok, true);
  assert.equal(unlisted.results[0].title, 'Великий из бродячих псов');
  assert.equal(unlisted.results[0].originalTitle, 'Velikiy Iz Brodyachih Psov');
  assert.equal(unlisted.results[0].defaultSeasonId, 's4');
});

test('Multi-season and full episode lists work without 6-episode cap and group ranges properly', () => {
  const clover = searchAnimeAcrossSites('Черный клевер');
  assert.equal(clover.ok, true);
  const cloverPrimary = clover.results[0];
  assert.equal(
    cloverPrimary.posterUrl,
    'https://cdn.myanimelist.net/images/anime/2/88336l.jpg'
  );
  assert.equal(cloverPrimary.seasons.length >= 3, true);
  const season1 = cloverPrimary.seasons.find((s) => s.number === 1);
  assert.ok(season1);
  assert.equal(season1.episodes.length, 170);
  assert.equal(season1.episodes[0].number, 1);
  assert.equal(season1.episodes[169].number, 170);

  const ovaSeason = cloverPrimary.seasons.find((s) => s.id === 'ova');
  assert.ok(ovaSeason);
  assert.equal(ovaSeason.title, 'Фильмы / OVA');
  assert.equal(ovaSeason.episodes.length, 3);

  const rangeGroups = buildEpisodeRangeGroups(170, 25);
  assert.equal(rangeGroups.length, 7);
  assert.equal(rangeGroups[0].label, '1–25');
  assert.equal(rangeGroups[1].label, '26–50');
  assert.equal(rangeGroups[6].label, '151–170');

  const jjk = searchAnimeAcrossSites('Магическая битва');
  assert.equal(jjk.ok, true);
  const jjkS1 = jjk.results[0].seasons.find((s) => s.number === 1);
  const jjkS2 = jjk.results[0].seasons.find((s) => s.number === 2);
  assert.equal(jjkS1?.episodes.length, 24);
  assert.equal(jjkS2?.episodes.length, 23);
});

test('validateAnimeSourceUrl accepts both plain-text anime titles and official HTTPS links', () => {
  const plainRu = validateAnimeSourceUrl('Черный клевер');
  assert.equal(plainRu.valid, true);
  assert.equal(plainRu.isUrlInput, false);
  assert.equal(plainRu.searchQuery, 'Черный клевер');

  const plainEn = validateAnimeSourceUrl('Black Clover');
  assert.equal(plainEn.valid, true);
  assert.equal(plainEn.isUrlInput, false);

  const yummy = validateAnimeSourceUrl('https://yummyanime.tv/catalog/item/solo-leveling');
  assert.equal(yummy.valid, true);
  assert.equal(yummy.isUrlInput, true);
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

test('searchAnimeAcrossSites returns results from YummyAnime.TV, AnimeGO, and AnimeVost.org for title queries', () => {
  const resRu = searchAnimeAcrossSites('Черный клевер');
  assert.equal(resRu.ok, true);
  assert.equal(resRu.mode, 'search');
  assert.equal(resRu.results.length, 3);
  const sites = resRu.results.map((r) => r.sourceSite);
  assert.deepEqual(sites, ['YummyAnime.TV', 'AnimeGO', 'AnimeVost.org']);
  assert.equal(resRu.results[0].title, 'Чёрный клевер');
  assert.equal(resRu.results[0].originalTitle, 'Black Clover');

  const resEn = searchAnimeAcrossSites('Black Clover');
  assert.equal(resEn.ok, true);
  assert.equal(resEn.results.length, 3);
  assert.equal(resEn.results[0].title, 'Чёрный клевер');
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
    animeTitle: 'Чёрный клевер',
    episodeNumber: 3,
    voiceover: 'AniLibria',
    quality: '1080p',
  });
  assert.equal(macPath.startsWith('~/Movies/AniMac/'), true);

  const winPath = buildTargetFilePath({
    platform: 'windows',
    animeTitle: 'Чёрный клевер',
    episodeNumber: 3,
    voiceover: 'AniLibria',
    quality: '1080p',
  });
  assert.equal(winPath.startsWith('C:\\Users\\User\\Videos\\AniMac\\'), true);

  const androidPath = buildTargetFilePath({
    platform: 'android',
    animeTitle: 'Чёрный клевер',
    episodeNumber: 3,
    voiceover: 'AniLibria',
    quality: '720p',
  });
  assert.equal(androidPath.startsWith('/storage/emulated/0/Movies/AniMac/'), true);

  const script = generatePlatformBatchScript(
    [
      {
        animeTitle: 'Чёрный клевер',
        episodeNumber: 1,
        voiceover: 'AniLibria',
        quality: '1080p',
        sourceSite: 'YummyAnime.TV',
        sourceUrl: 'https://yummyanime.tv/catalog/item/black-clover?ep=1',
        sha256: computeDeterministicHash('test'),
      },
    ],
    'windows'
  );
  assert.equal(script.filename, 'animac-windows-download.ps1');
  assert.equal(script.content.includes('--no-exec'), true);

  const task1 = createDownloadTask({
    anime: DEFAULT_PLAYER_ANIME_LIST[0],
    episode: DEFAULT_PLAYER_ANIME_LIST[0].episodes[0],
    voiceover: 'AniLibria',
    quality: '1080p',
    platform: 'macos',
  });
  const metrics = calculateQueueMetrics([task1]);
  assert.equal(metrics.activeCount, 1);
  assert.equal(formatTimecode(1445), '24:05');
});

test('Poster resolution maps Tensei shitara Slime Datta Ken accurately and never assigns Black Clover poster to other titles', () => {
  const slimeSearch = searchAnimeAcrossSites('О моем перерождении в слизь');
  assert.equal(slimeSearch.ok, true);
  assert.equal(slimeSearch.results[0].title, 'О моём перерождении в слизь');
  assert.equal(
    slimeSearch.results[0].posterUrl,
    'https://cdn.myanimelist.net/images/anime/1694/93337l.jpg'
  );

  const customQuery = searchAnimeAcrossSites('Волчица и пряности');
  assert.equal(customQuery.ok, true);
  // Unlisted titles must have empty posterUrl so AnimeArtwork fetches from Jikan API or renders neutral placeholder
  assert.equal(customQuery.results[0].posterUrl, '');
  assert.equal(customQuery.results[0].posterUrl.includes('88336l'), false);
});

test('Sequential anime download queue downloads one anime group at a time and moves completed episodes into Saved Playlists', () => {
  const fairyTail = searchAnimeAcrossSites('Хвост Феи').results[0];
  const onePiece = searchAnimeAcrossSites('Ван-Пис').results[0];

  const ftEp1 = createDownloadTask({
    anime: fairyTail,
    episode: fairyTail.episodes[0],
    voiceover: 'AniLibria',
    quality: '1080p',
    platform: 'macos',
  });
  const ftEp2 = createDownloadTask({
    anime: fairyTail,
    episode: fairyTail.episodes[1],
    voiceover: 'AniLibria',
    quality: '1080p',
    platform: 'macos',
  });
  const opEp1 = createDownloadTask({
    anime: onePiece,
    episode: onePiece.episodes[0],
    voiceover: 'AniLibria',
    quality: '1080p',
    platform: 'macos',
  });

  // Enforce sequential queue: only Fairy Tail ep 1 should be 'downloading', Fairy Tail ep 2 and One Piece ep 1 should be 'queued'
  const enforced = enforceSequentialAnimeQueue([ftEp1, ftEp2, opEp1]);
  assert.equal(enforced[0].status, 'downloading');
  assert.equal(enforced[1].status, 'queued');
  assert.equal(enforced[2].status, 'queued');

  const groups = groupActiveQueueByAnime(enforced);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].animeTitle, 'Хвост Феи');
  assert.equal(groups[0].isActiveGroup, true);
  assert.equal(groups[1].animeTitle, 'Ван-Пис');
  assert.equal(groups[1].isActiveGroup, false);

  // Step Fairy Tail Ep 1 to 100%: it should move out of remainingQueue and into newlyCompleted
  const nearlyDone = enforced.map((t, idx) => (idx === 0 ? { ...t, progressPercent: 95 } : t));
  const stepped1 = stepDownloadQueueSequentially(nearlyDone, 10);
  assert.equal(stepped1.newlyCompleted.length, 1);
  assert.equal(stepped1.newlyCompleted[0].animeTitle, 'Хвост Феи');
  assert.equal(stepped1.newlyCompleted[0].episodeNumber, 1);
  // Fairy Tail Ep 2 is now promoted to 'downloading', while One Piece Ep 1 remains 'queued'
  assert.equal(stepped1.remainingQueue.length, 2);
  assert.equal(stepped1.remainingQueue[0].animeTitle, 'Хвост Феи');
  assert.equal(stepped1.remainingQueue[0].episodeNumber, 2);
  assert.equal(stepped1.remainingQueue[0].status, 'downloading');
  assert.equal(stepped1.remainingQueue[1].animeTitle, 'Ван-Пис');
  assert.equal(stepped1.remainingQueue[1].status, 'queued');

  // Complete Fairy Tail Ep 2 -> One Piece Ep 1 automatically becomes 'downloading'
  const ftEp2NearlyDone = stepped1.remainingQueue.map((t, idx) =>
    idx === 0 ? { ...t, progressPercent: 95 } : t
  );
  const stepped2 = stepDownloadQueueSequentially(ftEp2NearlyDone, 10);
  assert.equal(stepped2.newlyCompleted.length, 1);
  assert.equal(stepped2.newlyCompleted[0].episodeNumber, 2);
  assert.equal(stepped2.remainingQueue.length, 1);
  assert.equal(stepped2.remainingQueue[0].animeTitle, 'Ван-Пис');
  assert.equal(stepped2.remainingQueue[0].status, 'downloading');

  // Saved playlists group completed episodes by anime and sort episodes ascending
  const savedPlaylists = groupSavedEpisodesIntoPlaylists([
    ...stepped2.newlyCompleted,
    ...stepped1.newlyCompleted,
  ]);
  assert.equal(savedPlaylists.length, 1);
  assert.equal(savedPlaylists[0].animeTitle, 'Хвост Феи');
  assert.equal(savedPlaylists[0].episodes.length, 2);
  assert.equal(savedPlaylists[0].episodes[0].episodeNumber, 1);
  assert.equal(savedPlaylists[0].episodes[1].episodeNumber, 2);
});


