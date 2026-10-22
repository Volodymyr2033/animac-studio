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

export interface AnimeSeason {
  id: string;
  number: number;
  title: string;
  subtitle?: string;
  year: number;
  totalEpisodes: number;
  episodes: EpisodeInfo[];
}

export interface AnimeSeries {
  id: string;
  title: string;
  originalTitle: string;
  posterUrl: string;
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
  seasons: AnimeSeason[];
  defaultSeasonId: string;
  episodes: EpisodeInfo[];
}

export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'completed';

export interface DownloadTask {
  id: string;
  animeId: string;
  animeTitle: string;
  originalTitle?: string;
  posterUrl?: string;
  seasonTitle?: string;
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
  originalTitle?: string;
  posterUrl?: string;
  seasonTitle?: string;
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

export type FavoriteCategory = 'watching' | 'planned' | 'completed' | 'favorite';

export const FAVORITE_CATEGORIES: { id: FavoriteCategory; label: string }[] = [
  { id: 'watching', label: 'Смотрю' },
  { id: 'planned', label: 'В планах' },
  { id: 'completed', label: 'Просмотрено' },
  { id: 'favorite', label: 'Любимое' },
];

export interface FavoriteAnimeItem {
  id: string;
  animeId: string;
  title: string;
  originalTitle: string;
  posterUrl: string;
  sourceSite: SourceSite;
  category: FavoriteCategory;
  rating: string;
  year: number;
  totalEpisodes: number;
  addedAtIso: string;
}

export interface AnimeQueueGroup {
  groupKey: string;
  animeId: string;
  animeTitle: string;
  originalTitle: string;
  posterUrl: string;
  sourceSite: SourceSite;
  artworkTheme: AnimeSeries['artworkTheme'];
  isActiveGroup: boolean;
  tasks: DownloadTask[];
}

export interface SavedAnimePlaylist {
  playlistKey: string;
  animeId: string;
  animeTitle: string;
  originalTitle: string;
  posterUrl: string;
  sourceSite: SourceSite;
  artworkTheme: AnimeSeries['artworkTheme'];
  totalSizeMB: number;
  updatedAtIso: string;
  episodes: DownloadTask[];
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

export interface SourceSiteDirectoryInfo {
  site: SourceSite;
  url: string;
  mirrorDomain: string;
  statusLabel: string;
  supportedStudios: string;
  maxResolution: VideoQuality;
}

export const SOURCE_SITES_DIRECTORY: SourceSiteDirectoryInfo[] = [
  {
    site: 'YummyAnime.TV',
    url: 'https://yummyanime.tv',
    mirrorDomain: 'yummyanime.tv',
    statusLabel: 'Онлайн / Доступен',
    supportedStudios: 'AniLibria, StudioBand, SHIZA Project, Dream Cast',
    maxResolution: '2160p',
  },
  {
    site: 'AnimeGO',
    url: 'https://animego.org',
    mirrorDomain: 'animego.org',
    statusLabel: 'Онлайн / Доступен',
    supportedStudios: 'StudioBand, AniLibria, AniDUB, Субтитры',
    maxResolution: '2160p',
  },
  {
    site: 'AnimeVost.org',
    url: 'https://animevost.org',
    mirrorDomain: 'animevost.org',
    statusLabel: 'Онлайн / Доступен',
    supportedStudios: 'AnimeVost, AniDUB, AniLibria, SHIZA Project',
    maxResolution: '1080p',
  },
];

export const POPULAR_SEARCH_CHIPS: string[] = [
  'О моем перерождении в слизь',
  'Человек-бензопила',
  'Магическая битва',
  'Черный клевер',
  'Клинок, рассекающий демонов',
  'Соло левелинг',
  'Монолог фармацевта',
  'Провожающая в последний путь Фрирен',
  'Атака титанов',
];

export interface EpisodeRangeGroup {
  label: string;
  start: number;
  end: number;
}

/**
 * Generates range groups (e.g., 1–25, 26–50, 51–75...) when an anime season has > 24 episodes.
 */
export function buildEpisodeRangeGroups(
  totalEpisodes: number,
  chunkSize = 25
): EpisodeRangeGroup[] {
  if (totalEpisodes <= 24) {
    return [{ label: `1–${totalEpisodes}`, start: 1, end: totalEpisodes }];
  }
  const groups: EpisodeRangeGroup[] = [];
  for (let start = 1; start <= totalEpisodes; start += chunkSize) {
    const end = Math.min(totalEpisodes, start + chunkSize - 1);
    groups.push({
      label: `${start}–${end}`,
      start,
      end,
    });
  }
  return groups;
}

interface SeasonTemplate {
  id: string;
  number: number;
  title: string;
  subtitle?: string;
  year: number;
  totalEpisodes: number;
  episodeTitles: string[];
  isMovieOrOva?: boolean;
}

interface KnownAnimeTemplate {
  keywords: string[];
  slug: string;
  title: string;
  originalTitle: string;
  year: number;
  genres: string[];
  rating: string;
  synopsis: string;
  artworkTheme: AnimeSeries['artworkTheme'];
  seasons: SeasonTemplate[];
}

function generateFullEpisodeList(season: SeasonTemplate): EpisodeInfo[] {
  const count = Math.max(1, season.totalEpisodes);
  const durationSeconds = season.isMovieOrOva ? 5400 : 1440;
  return Array.from({ length: count }, (_, idx) => {
    const epNum = idx + 1;
    const explicitTitle = season.episodeTitles[idx];
    let fallbackTitle = `Эпизод ${epNum}`;
    if (season.isMovieOrOva) {
      fallbackTitle = `Спецвыпуск / Фильм ${epNum}`;
    } else if (season.subtitle) {
      fallbackTitle = `${season.subtitle} — Часть ${epNum}`;
    }
    return {
      number: epNum,
      title: explicitTitle || fallbackTitle,
      durationSeconds,
      releaseDate: `${season.year}`,
    };
  });
}

const KNOWN_ANIME_DATABASE: KnownAnimeTemplate[] = [
  {
    keywords: [
      'монолог фармацевта',
      'monolog farmacevta',
      'monolog-farmacevta',
      'monolog farmatsevta',
      'kusuriya no hitorigoto',
      'the apothecary diaries',
      'apothecary diaries',
      'маомао',
    ],
    slug: 'kusuriya-no-hitorigoto',
    title: 'Монолог фармацевта',
    originalTitle: 'Kusuriya no Hitorigoto / The Apothecary Diaries',
    year: 2023,
    genres: ['Детектив', 'Драма', 'Исторический'],
    rating: '9.3',
    synopsis:
      'Травница Маомао из квартала удовольствий попадает в императорский дворец, где благодаря глубоким знаниям ядов и фармакологии невольно начинает распутывать придворные интриги.',
    artworkTheme: 'alchemist',
    seasons: [
      {
        id: 's1',
        number: 1,
        title: 'Сезон 1',
        subtitle: 'Внутренний дворец',
        year: 2023,
        totalEpisodes: 24,
        episodeTitles: [
          'Маомао',
          'Холодная травница',
          'Призрак во дворце',
          'Угроза',
          'Тайный приём',
          'Садовый банкет',
          'Возвращение домой',
          'Пшеничные стебли',
          'Самоубийство или убийство',
          'Мёд',
          'Два из одного',
          'Евнух и куртизанка',
          'Служанка во внешнем дворе',
          'Новое пламя',
          'Сырое блюдо',
          'Свинцовая загадка',
          'Прогулка по городу',
          'Лакан',
          'Случайность или умысел',
          'Дурман и воскрешение',
          'Выкуп контракта',
          'Синие розы',
          'Феникс и бальзамин',
          'Женьшень и Фэнсянь',
        ],
      },
      {
        id: 's2',
        number: 2,
        title: 'Сезон 2',
        subtitle: 'Императорские тайны',
        year: 2025,
        totalEpisodes: 24,
        episodeTitles: [
          'Кошачья мята и毛毛',
          'Караван с запада',
          'Трупные грибы',
          'Зеркальная комната',
          'Лунная фея',
          'Хрустальный павильон',
          'Святилище выбора',
          'Императрица-вдова',
          'Старый император',
          'Неудачная история',
          'Охота на севере',
          'Водяной каштан',
        ],
      },
      {
        id: 's3',
        number: 3,
        title: 'Сезон 3',
        subtitle: 'Западная столица',
        year: 2026,
        totalEpisodes: 12,
        episodeTitles: [
          'Отправление на запад',
          'Тень саранчи',
          'Аптекарь у границ',
          'Письмо Дзинси',
          'Ночной совет',
          'Испытание противоядия',
        ],
      },
      {
        id: 'ova',
        number: 0,
        title: 'Фильмы / OVA',
        subtitle: 'Мини-эпизоды театра Маомао',
        year: 2024,
        totalEpisodes: 4,
        isMovieOrOva: true,
        episodeTitles: [
          'Театр Маомао: Травнический справочник Ч.1 (OVA)',
          'Театр Маомао: Загадки нефритового павильона Ч.2 (OVA)',
          'Спецвыпуск: Банкет Четырёх Дам (OVA)',
          'Монолог фармацевта: Полнометражная компиляция (Фильм)',
        ],
      },
    ],
  },
  {
    keywords: [
      'черный клевер',
      'чёрный клевер',
      'black clover',
      'chernyy klever',
      'chernyj klever',
      'klever',
      'клевер',
    ],
    slug: 'black-clover',
    title: 'Чёрный клевер',
    originalTitle: 'Black Clover',
    year: 2017,
    genres: ['Сёнэн', 'Экшен', 'Магия', 'Фэнтези'],
    rating: '8.9',
    synopsis:
      'Аста и Юно выросли в одной церкви на окраине королевства Клевер. В мире, где всё решает магия, лишённый магической силы Аста получает редкий пятилистный гримуар антимагии.',
    artworkTheme: 'alchemist',
    seasons: [
      {
        id: 's1',
        number: 1,
        title: 'Сезон 1',
        subtitle: 'Королевство Клевер (Все 170 серий)',
        year: 2017,
        totalEpisodes: 170,
        episodeTitles: [
          'Аста и Юно',
          'Клятва юного рыцаря-мага',
          'В столицу королевства Клевер!',
          'Экзамен в Рыцари-чародеи',
          'Путь к титулу Короля Магов',
          'Чёрные Быки',
          'Второй новичок',
          'Вперёд! Первая миссия',
          'Зверь',
          'Те, кто защищают',
          'Случай в замковом городе',
          'Король Магов видел',
          'Продолжение сна Короля Магов',
          'Подземелье',
          'Алмазный маг',
          'Друзья',
          'Разрушитель',
          'Воспоминания о тебе',
          'Разрушение и спасение',
          'Собрание в королевской столице',
          'Бунт в столице',
          'Танец дикой магии',
          'Багровый Король Лев',
          'Блэкаут',
          'Бедствие',
        ],
      },
      {
        id: 's2',
        number: 2,
        title: 'Сезон 2',
        subtitle: 'Арка Пикового Королевства',
        year: 2026,
        totalEpisodes: 24,
        episodeTitles: [
          'Штурм замка Пик',
          'Тёмная Триада вступает в бой',
          'Ночь пробуждения демонов',
          'Объединение с Либе',
          'Рыцари Клевера в строю',
          'Контратака Чёрных Быков',
        ],
      },
      {
        id: 'ova',
        number: 0,
        title: 'Фильмы / OVA',
        subtitle: 'Полнометражные фильмы и спецвыпуски',
        year: 2023,
        totalEpisodes: 3,
        isMovieOrOva: true,
        episodeTitles: [
          'Чёрный клевер: Меч Короля Магов (Полнометражный фильм)',
          'Спецвыпуск Jump Festa: Прошлое Асты и Юно (OVA)',
          'Бал благодарности Рыцарей-чародеев (OVA)',
        ],
      },
    ],
  },
  {
    keywords: [
      'человек-бензопила',
      'человек бензопила',
      'chelovek benzopila',
      'chainsaw man',
      'chensoman',
      'бензопила',
      'denji',
      'дэндзи',
    ],
    slug: 'chainsaw-man',
    title: 'Человек-бензопила',
    originalTitle: 'Chainsaw Man / Chensoman',
    year: 2022,
    genres: ['Экшен', 'Сверхъестественное', 'Сёнэн'],
    rating: '9.1',
    synopsis:
      'Дэндзи вместе с демоном-псом Почитой охотится на демонов ради выплаты долгов. После предательства Почита сливается с его сердцем, пробуждая силу Человека-бензопилы.',
    artworkTheme: 'cyber',
    seasons: [
      {
        id: 's1',
        number: 1,
        title: 'Сезон 1',
        subtitle: 'Бюро общественной безопасности',
        year: 2022,
        totalEpisodes: 12,
        episodeTitles: [
          'Собака и бензопила',
          'Прибытие в Токио',
          'Судьба Мяуки',
          'Спасение',
          'Демон огнестрельного оружия',
          'Убить Дэндзи',
          'Вкус поцелуя',
          'Выстрелы',
          'Из Киото',
          'Потрёпанные и израненные',
          'Начало операции',
          'Катана против Бензопилы',
        ],
      },
      {
        id: 'ova',
        number: 0,
        title: 'Фильмы / OVA',
        subtitle: 'Полнометражное продолжение',
        year: 2025,
        totalEpisodes: 2,
        isMovieOrOva: true,
        episodeTitles: [
          'Человек-бензопила: Арка Резе (Полнометражный фильм)',
          'Дневники 4-го спецотдела Токио (OVA)',
        ],
      },
    ],
  },
  {
    keywords: ['магическая битва', 'magicheskaya bitva', 'jujutsu kaisen', 'jjk', 'годжо', 'итадори'],
    slug: 'jujutsu-kaisen',
    title: 'Магическая битва',
    originalTitle: 'Jujutsu Kaisen',
    year: 2020,
    genres: ['Сёнэн', 'Экшен', 'Мистика'],
    rating: '9.3',
    synopsis:
      'Старшеклассник Юдзи Итадори проглатывает проклятый артефакт Двуликого Сукуны, чтобы спасти друзей, и поступает в Токийский магический колледж под наставничество Сатору Годжо.',
    artworkTheme: 'shrine',
    seasons: [
      {
        id: 's1',
        number: 1,
        title: 'Сезон 1',
        subtitle: 'Токийский магический колледж',
        year: 2020,
        totalEpisodes: 24,
        episodeTitles: [
          'Двуликий Сукуна',
          'Ради себя',
          'Стальная дева',
          'Земное воплощение проклятого чрева',
          'Земное воплощение проклятого чрева — Часть 2',
          'После дождя',
          'Нападение',
          'Скука',
          'Мелкая рыбёшка и воздаяние',
          'Бесцельная трансформация',
          'Узколобость',
          'К тебе когда-нибудь',
          'Завтра',
          'Программа обмена с Киото — Командный бой 0',
          'Программа обмена с Киото — Командный бой 1',
          'Программа обмена с Киото — Командный бой 2',
          'Программа обмена с Киото — Командный бой 3',
          'Мудрец',
          'Чёрная вспышка',
          'Нестандартный',
          'Магический бейсбол',
          'Исток слепого повиновения',
          'Исток слепого повиновения — Часть 2',
          'Сообщники',
        ],
      },
      {
        id: 's2',
        number: 2,
        title: 'Сезон 2',
        subtitle: 'Таимая опись / Инцидент в Сибуе',
        year: 2023,
        totalEpisodes: 23,
        episodeTitles: [
          'Таимая опись',
          'Таимая опись — Часть 2',
          'Таимая опись — Часть 3',
          'Таимая опись — Часть 4',
          'Преждевременная смерть',
          'Вот так дела',
          'Вечерний фестиваль',
          'Инцидент в Сибуе',
          'Инцидент в Сибуе — Открытие врат',
          'Смятение',
          'Сеанс призыва духа',
          'Тупой нож',
          'Красная чешуя',
          'Колебания',
          'Колебания — Часть 2',
          'Раскат грома',
          'Раскат грома — Часть 2',
          'Добро и зло',
          'Добро и зло — Часть 2',
          'Добро и зло — Часть 3',
          'Метаморфоза',
          'Метаморфоза — Часть 2',
          'Инцидент в Сибуе — Закрытие врат',
        ],
      },
      {
        id: 's3',
        number: 3,
        title: 'Сезон 3',
        subtitle: 'Смертельная миграция',
        year: 2026,
        totalEpisodes: 24,
        episodeTitles: [
          'Казнь Итадори',
          'Ещё один раз',
          'Спина',
          'Идеальная подготовка',
          'Подпольный бойцовский клуб',
          'Колония Токио №1',
        ],
      },
      {
        id: 'ova',
        number: 0,
        title: 'Фильмы / OVA',
        subtitle: 'Полнометражные фильмы',
        year: 2021,
        totalEpisodes: 2,
        isMovieOrOva: true,
        episodeTitles: [
          'Магическая битва 0. Фильм (Jujutsu Kaisen 0 Movie)',
          'Таимая опись / Преждевременная смерть — Киноверсия (Фильм)',
        ],
      },
    ],
  },
  {
    keywords: [
      'клинок, рассекающий демонов',
      'клинок рассекающий демонов',
      'клинок',
      'klinok rassekayuschiy demonov',
      'klinok rassekayushchiy demonov',
      'demon slayer',
      'kimetsu no yaiba',
      'истребитель демонов',
      'тандзиро',
    ],
    slug: 'kimetsu-no-yaiba',
    title: 'Клинок, рассекающий демонов',
    originalTitle: 'Kimetsu no Yaiba / Demon Slayer',
    year: 2019,
    genres: ['Сёнэн', 'Экшен', 'Исторический'],
    rating: '9.2',
    synopsis:
      'Тандзиро Камадо вступает в Корпус истребителей демонов, чтобы найти способ вернуть человеческий облик своей сестре Нэдзуко и отомстить Мудзану Кибуцудзи.',
    artworkTheme: 'samurai',
    seasons: [
      {
        id: 's1',
        number: 1,
        title: 'Сезон 1',
        subtitle: 'Решимость Тандзиро Камадо',
        year: 2019,
        totalEpisodes: 26,
        episodeTitles: [
          'Жестокость',
          'Тренер Сакондзи Урокодаки',
          'Сабито и Макомо',
          'Финальный отбор',
          'Собственная сталь',
          'Мечник и демон в коробке',
          'Мудзан Кибуцудзи',
          'Аромат завораживающей крови',
          'Демоны с мячом и стрелами',
          'Всегда вместе',
          'Особняк Цудзуми',
          'Кабан обнажает клыки, а Дзэницу спит',
          'Нечто более важное, чем жизнь',
          'Дом с гербом глицинии',
          'Гора Натагумо',
          'Пропуская других вперёд',
          'Превосходство в одном деле',
          'Поддельные узы',
          'Бог огня',
          'Семья поневоле',
          'Нарушение устава отряда',
          'Глава поместья',
          'Собрание Столпов',
          'Восстановительная тренировка',
          'Цугуко Канао Цуюри',
          'Новое задание',
        ],
      },
      {
        id: 's2',
        number: 2,
        title: 'Сезон 2',
        subtitle: 'Поезд «Бесконечный» и Квартал красных фонарей',
        year: 2021,
        totalEpisodes: 18,
        episodeTitles: [
          'Столп пламени Кёдзюро Рэнгоку',
          'Глубокий сон',
          'Должно быть, это сон',
          'Оскорбление',
          'Вперёд!',
          'Акадза',
          'Зажги своё сердце',
          'Столп звука Тэнгэн Удзуй',
          'Проникновение в Квартал красных фонарей',
          'Кто ты?',
          'Сегодня ночью',
          'Ярко и эффектно!',
          'Наслоение воспоминаний',
          'Трансформация',
          'Сбор',
          'Победив демона высшей луны',
          'Ни за что не сдамся',
          'Сколько бы жизней ни переродились',
        ],
      },
      {
        id: 's3',
        number: 3,
        title: 'Сезон 3',
        subtitle: 'Деревня кузнецов',
        year: 2023,
        totalEpisodes: 11,
        episodeTitles: [
          'Чей-то сон',
          'Ёриити Тип Ноль',
          'Меч, которому больше 300 лет',
          'Спасибо, Токито',
          'Алый клинок',
          'Ты ведь станешь Столпом?',
          'Ужасные злодеи',
          'Значение имени «Му» в Муитиро',
          'Столп тумана Муитиро Токито',
          'Столп любви Мицури Канродзи',
          'Связанные узы: Рассвет и первый луч солнца',
        ],
      },
      {
        id: 's4',
        number: 4,
        title: 'Сезон 4',
        subtitle: 'Тренировка Столпов',
        year: 2024,
        totalEpisodes: 8,
        episodeTitles: [
          'Чтобы победить Мудзана Кибуцудзи',
          'Боль Столпа воды Гию Томиоки',
          'Тандзиро полностью здоров и присоединяется к тренировке!',
          'Улыбнись',
          'Даже демонов я готов съесть',
          'Сильнейший в Корпусе истребителей демонов',
          'Столп камня Гёмэй Химэдзима',
          'Сбор Столпов',
        ],
      },
      {
        id: 'ova',
        number: 0,
        title: 'Фильмы / OVA',
        subtitle: 'Полнометражные фильмы и спецвыпуски',
        year: 2025,
        totalEpisodes: 3,
        isMovieOrOva: true,
        episodeTitles: [
          'Клинок, рассекающий демонов: Поезд «Бесконечный» (Полнометражный фильм)',
          'Клинок, рассекающий демонов: Замок Бесконечности — Часть 1 (Фильм)',
          'Старшая школа Кимэцу: День святого Валентина (OVA)',
        ],
      },
    ],
  },
  {
    keywords: [
      'соло левелинг',
      'поднятие уровня в одиночку',
      'podnyatie urovnya v odinochku',
      'solo leveling',
      'ore dake level up na ken',
      'сон джинву',
      'sung jinwoo',
    ],
    slug: 'solo-leveling',
    title: 'Поднятие уровня в одиночку',
    originalTitle: 'Ore dake Level Up na Ken / Solo Leveling',
    year: 2024,
    genres: ['Экшен', 'Фэнтези', 'Приключения'],
    rating: '9.4',
    synopsis:
      'Охотник слабейшего E-ранга Сон Джинву выживает в двойном подземелье и получает доступ к уникальной Системе, позволяющей повышать уровень без ограничений.',
    artworkTheme: 'mecha',
    seasons: [
      {
        id: 's1',
        number: 1,
        title: 'Сезон 1',
        subtitle: 'Пробуждение Игрока',
        year: 2024,
        totalEpisodes: 12,
        episodeTitles: [
          'Я привык',
          'Если бы у меня был ещё один шанс',
          'Это похоже на игру',
          'Мне нужно стать сильнее',
          'Выгодная сделка',
          'Настоящая охота начинается',
          'Посмотрим, как далеко я смогу зайти',
          'Это раздражает',
          'Ты скрывал свои способности',
          'Что это за пикник?',
          'Рыцарь, защищающий пустой трон',
          'Восстань',
        ],
      },
      {
        id: 's2',
        number: 2,
        title: 'Сезон 2',
        subtitle: 'Восстаньте из тени',
        year: 2025,
        totalEpisodes: 13,
        episodeTitles: [
          'Ты ведь не E-ранг, верно?',
          'Похоже, ты сам этого не осознаёшь',
          'Впереди ещё долгий путь',
          'Нужно прекратить притворяться',
          'Вот чему мы обучены',
          'Не смотри свысока на моих парней',
          'Десятый охотник S-ранга',
          'Взгляд вверх утомляет',
          'Оно того стоило',
          'Нам нужен герой',
          'Станет ещё жарче',
          'Ты — король людей?',
          'К следующему уровню',
        ],
      },
      {
        id: 'ova',
        number: 0,
        title: 'Фильмы / OVA',
        subtitle: 'Спецвыпуски и фильмы',
        year: 2024,
        totalEpisodes: 2,
        isMovieOrOva: true,
        episodeTitles: [
          'Поднятие уровня в одиночку: Повторное пробуждение (Фильм)',
          'Хроники охотника Сон Джинву (Спецвыпуск OVA)',
        ],
      },
    ],
  },
  {
    keywords: [
      'провожающая в последний путь фрирен',
      'фрирен',
      'friren',
      'frieren',
      'sousou no frieren',
      'provozhayuschaya v posledniy put friren',
    ],
    slug: 'sousou-no-frieren',
    title: 'Провожающая в последний путь Фрирен',
    originalTitle: 'Sousou no Frieren / Frieren: Beyond Journey’s End',
    year: 2023,
    genres: ['Фэнтези', 'Приключения', 'Драма'],
    rating: '9.5',
    synopsis:
      'После победы над Королём демонов бессмертная эльфийская волшебница Фрирен отправляется в новое путешествие, чтобы понять людей и ценить мимолётные мгновения.',
    artworkTheme: 'alchemist',
    seasons: [
      {
        id: 's1',
        number: 1,
        title: 'Сезон 1',
        subtitle: 'Путешествие в Ореол',
        year: 2023,
        totalEpisodes: 28,
        episodeTitles: [
          'Конец приключения',
          'Это не обязательно должна быть магия',
          'Убийственная магия',
          'Земля, где покоятся души',
          'Фантомы умерших',
          'Герой деревни',
          'Словно сказка',
          'Фрирен Погребальная',
          'Аура Гильотина',
          'Сильный маг',
          'Зима в Северных землях',
          'Настоящий герой',
          'Отвращение к себе подобным',
          'Привилегия молодых',
          'Запах неприятностей',
          'Долгоживущие друзья',
          'Берегите себя',
          'Экзамен на мага первого класса',
          'Тщательно продуманный план',
          'Необходимое убийство',
          'Мир магии',
          'Будущие враги',
          'Покорение лабиринта',
          'Идеальные копии',
          'Роковая уязвимость',
          'Вершина магии',
          'Эпоха людей',
          'Было бы неловко при следующей встрече',
        ],
      },
      {
        id: 's2',
        number: 2,
        title: 'Сезон 2',
        subtitle: 'Северное плато и Золотая Земля',
        year: 2026,
        totalEpisodes: 24,
        episodeTitles: [
          'Продолжение пути на север',
          'Кристальные пещеры',
          'Древний клинок Героя Юга',
          'Город из чистого золота',
          'Махт из Эльдорадо',
          'Воспоминания о Глюке',
        ],
      },
      {
        id: 'ova',
        number: 0,
        title: 'Фильмы / OVA',
        subtitle: 'Мини-аниме «Магия Фрирен»',
        year: 2024,
        totalEpisodes: 3,
        isMovieOrOva: true,
        episodeTitles: [
          'Мини-аниме «Магия Фрирен» — Сборник заклинаний (ONA)',
          'Кулинарный дневник Штарка и Ферн (OVA)',
          'Воспоминания отряда Героя Химмеля (OVA)',
        ],
      },
    ],
  },
  {
    keywords: ['атака титанов', 'ataka titanov', 'attack on titan', 'shingeki no kyojin', 'эрен'],
    slug: 'shingeki-no-kyojin',
    title: 'Атака титанов',
    originalTitle: 'Shingeki no Kyojin / Attack on Titan',
    year: 2013,
    genres: ['Экшен', 'Драма', 'Фэнтези'],
    rating: '9.5',
    synopsis:
      'Человечество веками укрывалось за тремя гигантскими стенами, пока появление Колоссального титана не разрушило мирную жизнь Эрена Йегера и его друзей.',
    artworkTheme: 'express',
    seasons: [
      {
        id: 's1',
        number: 1,
        title: 'Сезон 1',
        subtitle: 'Падение Сигансины и Битва за Трост',
        year: 2013,
        totalEpisodes: 25,
        episodeTitles: [
          'К тебе, спустя 2000 лет',
          'Тот день: Падение Сигансины',
          'Тусклый свет среди отчаяния',
          'Ночь расформирования',
          'Первый бой',
          'Мир, который увидела девочка',
          'Короткий клинок',
          'Слышу биение сердца',
          'Где же левая рука?',
          'Ответ',
          'Идол',
          'Рана',
          'Первобытное желание',
          'Не могу смотреть ему в глаза',
          'Отряд особого назначения',
          'Что нужно делать сейчас',
          'Женская особь',
          'Лес гигантских деревьев',
          'Укус',
          'Эрвин Смит: 57-я экспедиция за стены',
          'Сокрушительный удар',
          'Поверженные',
          'Улыбка: Налёт на район Стохесс',
          'Милосердие',
          'Стена',
        ],
      },
      {
        id: 's2',
        number: 2,
        title: 'Сезон 2',
        subtitle: 'Столкновение титанов',
        year: 2017,
        totalEpisodes: 12,
        episodeTitles: [
          'Звероподобный титан',
          'Я дома',
          'На юго-запад',
          'Солдат',
          'Хистория',
          'Воин',
          'Удар, бросок, захват',
          'Охотники',
          'Открытие',
          'Дети',
          'Атака',
          'Крик',
        ],
      },
      {
        id: 's3',
        number: 3,
        title: 'Сезон 3',
        subtitle: 'Возвращение в Сигансину',
        year: 2018,
        totalEpisodes: 22,
        episodeTitles: [
          'Дымовой сигнал',
          'Боль',
          'Старая история',
          'Доверие',
          'Ответ',
          'Грех',
          'Желание',
          'За стеной Орвуд',
          'Правитель стен',
          'Друзья',
          'Свидетель',
          'Ночь перед контратакой',
          'Город, где всё началось',
          'Громовые копья',
          'Сошествие',
          'Идеальная игра',
          'Герой',
          'Белая ночь',
          'Подвал',
          'Тот день',
          'Атакующий титан',
          'По ту сторону океана',
        ],
      },
      {
        id: 's4',
        number: 4,
        title: 'Сезон 4',
        subtitle: 'Финал',
        year: 2020,
        totalEpisodes: 28,
        episodeTitles: [
          'По ту сторону моря',
          'Ночной поезд',
          'Дверь надежды',
          'Из руки в руку',
          'Объявление войны',
          'Титан Молотобоец',
          'Штурм',
          'Пуля убийцы',
          'Добровольцы',
          'Веский аргумент',
        ],
      },
      {
        id: 'ova',
        number: 0,
        title: 'Фильмы / OVA',
        subtitle: 'Спецвыпуски и заключительные главы',
        year: 2023,
        totalEpisodes: 8,
        isMovieOrOva: true,
        episodeTitles: [
          'Записная книжка Ильзе (OVA 1)',
          'Внезапный посетитель (OVA 2)',
          'Бедствие (OVA 3)',
          'Выбор без сожалений: История Леви — Часть 1 (OVA 4)',
          'Выбор без сожалений: История Леви — Часть 2 (OVA 5)',
          'Потерянные девушки: Энни и Микаса (OVA 6)',
          'Атака титанов: Финал — Заключительная глава Ч.1 (Спецвыпуск)',
          'Атака титанов: Финал — Заключительная глава Ч.2 (Спецвыпуск)',
        ],
      },
    ],
  },
  {
    keywords: ['ван-пис', 'ван пис', 'van pis', 'one piece', 'луффи'],
    slug: 'one-piece',
    title: 'Ван-Пис',
    originalTitle: 'One Piece',
    year: 1999,
    genres: ['Приключения', 'Экшен', 'Комедия', 'Фэнтези'],
    rating: '9.3',
    synopsis:
      'Манки Д. Луффи собирает команду Пиратов Соломенной Шляпы и отправляется по Гранд Лайн на поиски легендарного сокровища Ван-Пис, чтобы стать Королём пиратов.',
    artworkTheme: 'express',
    seasons: [
      {
        id: 's1',
        number: 1,
        title: 'Сезон 1',
        subtitle: 'Сага Ист-Блю и Алабаста',
        year: 1999,
        totalEpisodes: 130,
        episodeTitles: [
          'Я Луффи! Человек, который станет Королём пиратов!',
          'Появление великого мечника! Охотник на пиратов Ророноа Зоро',
          'Морган против Луффи! Кто эта прекрасная незнакомка?',
          'Прошлое Луффи! Появление Рыжего Шанкса',
          'Гранд Лайн впереди!',
          'Команда Соломенной Шляпы',
        ],
      },
      {
        id: 's2',
        number: 2,
        title: 'Сезон 2',
        subtitle: 'Сага Скайпии и Эниес Лобби',
        year: 2003,
        totalEpisodes: 195,
        episodeTitles: [
          'Корабль, упавший с неба!',
          'Вперёд на Небесный Остров!',
          'Город воды Уотер Севен',
          'Штурм Эниес Лобби',
        ],
      },
      {
        id: 's3',
        number: 3,
        title: 'Сезон 3',
        subtitle: 'Сага Маринфорда и Страны Вано',
        year: 2010,
        totalEpisodes: 220,
        episodeTitles: [
          'Битва при Маринфорде',
          'Два года спустя: Возвращение на Сабаоди',
          'Прибытие в Страну Вано',
          'Пятый Гир Луффи',
        ],
      },
      {
        id: 'ova',
        number: 0,
        title: 'Фильмы / OVA',
        subtitle: 'Полнометражные фильмы One Piece',
        year: 2022,
        totalEpisodes: 5,
        isMovieOrOva: true,
        episodeTitles: [
          'Ван-Пис: Красный (One Piece Film: Red)',
          'Ван-Пис: Паническое бегство (One Piece: Stampede)',
          'Ван-Пис: Золото (One Piece Film: Gold)',
          'Ван-Пис: Фильм Z (One Piece Film: Z)',
          'Ван-Пис: Жестокий мир (One Piece: Strong World)',
        ],
      },
    ],
  },
  {
    keywords: ['блич', 'blich', 'bleach', 'ичиго'],
    slug: 'bleach-tybw',
    title: 'Блич: Тысячелетняя кровавая война',
    originalTitle: 'Bleach: Sennen Kessen-hen',
    year: 2022,
    genres: ['Сёнэн', 'Экшен', 'Сверхъестественное'],
    rating: '9.2',
    synopsis:
      'Ичиго Куросаки возвращается на поле боя, когда Ванденрейх во главе с Яхве начинает полномасштабное вторжение в Общество Душ.',
    artworkTheme: 'samurai',
    seasons: [
      {
        id: 's1',
        number: 1,
        title: 'Сезон 1',
        subtitle: 'Тысячелетняя кровавая война',
        year: 2022,
        totalEpisodes: 13,
        episodeTitles: [
          'Кровавая война',
          'Фундамент камней',
          'Марш звёздного креста',
          'Убить тень',
          'Гнев как молния',
          'Огонь',
          'Рождённый во тьме',
          'Проект падающей звезды',
          'Капля',
          'Битва',
          'Всё кроме дождя',
          'Всё кроме дождя: Июньская правда',
          'Клинок — это я',
        ],
      },
      {
        id: 's2',
        number: 2,
        title: 'Сезон 2',
        subtitle: 'Тысячелетняя кровавая война: Прощание',
        year: 2023,
        totalEpisodes: 13,
        episodeTitles: [
          'Последние 9 дней',
          'Мир из тени',
          'Фундаментальная виртуозность',
          'Бессердечный монстр',
          'Ярость на ринге',
          'Белая дымка',
          'Я — остриё',
          'Безголовая звезда',
          'Марш зомби',
          'Марш зомби 2',
          'Слишком рано для победы, слишком поздно для правды',
          'Хозяин',
          'Чёрное',
        ],
      },
      {
        id: 's3',
        number: 3,
        title: 'Сезон 3',
        subtitle: 'Тысячелетняя кровавая война: Конфликт',
        year: 2024,
        totalEpisodes: 14,
        episodeTitles: [
          'A',
          'Убей короля',
          'Тёмная рука',
          'Предатель',
          'Против суждения',
          'Священное рождение',
          'Врата солнца',
          'Малыш, держи меня за руку',
          'Не гонись за тенью',
          'Малыш, держи меня за руку 2',
          'Тени рассеиваются',
          'Друг',
          'Видимая правда',
          'Мои последние слова',
        ],
      },
      {
        id: 'ova',
        number: 0,
        title: 'Фильмы / OVA',
        subtitle: 'Полнометражные фильмы Блич',
        year: 2010,
        totalEpisodes: 4,
        isMovieOrOva: true,
        episodeTitles: [
          'Блич: Воспоминания ни о ком (Фильм 1)',
          'Блич: Восстание алмазной пыли (Фильм 2)',
          'Блич: Прощай, Рукия (Фильм 3)',
          'Блич: Врата Ада (Фильм 4)',
        ],
      },
    ],
  },
  {
    keywords: ['наруто', 'naruto', 'shippuuden', 'ураганные хроники'],
    slug: 'naruto-shippuuden',
    title: 'Наруто: Ураганные хроники',
    originalTitle: 'Naruto: Shippuuden',
    year: 2007,
    genres: ['Сёнэн', 'Экшен', 'Боевые искусства'],
    rating: '9.1',
    synopsis:
      'Вернувшись в Коноху после двух с половиной лет тренировок с Джирайей, Наруто Узумаки вступает в противостояние с организацией Акацуки.',
    artworkTheme: 'shrine',
    seasons: [
      {
        id: 's1',
        number: 1,
        title: 'Сезон 1',
        subtitle: 'Ураганные хроники (Арки 1–10)',
        year: 2007,
        totalEpisodes: 220,
        episodeTitles: [
          'Возвращение домой',
          'Акацуки начинают действовать',
          'Результаты тренировки',
          'Джинчурики Песка',
          'Как Казекаге',
          'Миссия выполнена',
        ],
      },
      {
        id: 's2',
        number: 2,
        title: 'Сезон 2',
        subtitle: 'Четвёртая Мировая Война Шиноби',
        year: 2012,
        totalEpisodes: 280,
        episodeTitles: [
          'Начало Великой Войны',
          'Мадара Учиха',
          'Десятихвостый',
          'Наруто и Саске: Финальная битва',
        ],
      },
      {
        id: 'ova',
        number: 0,
        title: 'Фильмы / OVA',
        subtitle: 'Полнометражные фильмы Наруто',
        year: 2014,
        totalEpisodes: 5,
        isMovieOrOva: true,
        episodeTitles: [
          'Наруто: Последний фильм (The Last: Naruto the Movie)',
          'Наруто: Путь ниндзя (Road to Ninja)',
          'Наруто: Кровавая тюрьма (Blood Prison)',
          'Наруто: Потерянная башня (The Lost Tower)',
          'День, когда Наруто стал Хокаге (OVA)',
        ],
      },
    ],
  },
  {
    keywords: ['синяя тюрьма', 'блю лок', 'sinyaya tyurma', 'blyu lok', 'blue lock'],
    slug: 'blue-lock',
    title: 'Синяя тюрьма: Блю Лок',
    originalTitle: 'Blue Lock',
    year: 2022,
    genres: ['Спорт', 'Сёнэн', 'Психология'],
    rating: '8.8',
    synopsis:
      'Триста лучших юных нападающих Японии изолированы в комплексе «Блю Лок», где в жёстком отборе должен определиться единственный идеальный форвард.',
    artworkTheme: 'cyber',
    seasons: [
      {
        id: 's1',
        number: 1,
        title: 'Сезон 1',
        subtitle: 'Первый и второй отбор',
        year: 2022,
        totalEpisodes: 24,
        episodeTitles: [
          'Мечта',
          'Монстр',
          'Ноль Футбола',
          'Предчувствие и интуиция',
          'Перерождение',
          'Прости',
          'Прилив',
          'Формула голов',
          'Пробуждение',
          'Так, как есть',
          'Последний фрагмент',
          'Второй отбор',
        ],
      },
      {
        id: 's2',
        number: 2,
        title: 'Сезон 2',
        subtitle: 'Блю Лок против сборной Японии U-20',
        year: 2024,
        totalEpisodes: 14,
        episodeTitles: [
          'Отборочные пробы',
          'Убийца и ниндзя',
          'Мир, который ты чувствуешь',
          'Хамелеон',
          'Поток',
          'Большая сцена',
          'Саэ Итоши',
          'Синяя клетка',
          'Ночной снег',
          'Выход дракона',
          'То, чему ты нас научил',
          'Цветы',
          'Не в одиночку',
          'Последняя атака',
        ],
      },
      {
        id: 'ova',
        number: 0,
        title: 'Фильмы / OVA',
        subtitle: 'Полнометражные фильмы',
        year: 2024,
        totalEpisodes: 2,
        isMovieOrOva: true,
        episodeTitles: [
          'Синяя тюрьма: Блю Лок — Эпизод Наги (Полнометражный фильм)',
          'Дополнительное время Блю Лок — Сборник мини-серий (OVA)',
        ],
      },
    ],
  },
  {
    keywords: ['семья шпиона', 'semya shpiona', 'spy x family', 'spy family', 'лойд', 'аня'],
    slug: 'spy-x-family',
    title: 'Семья шпиона',
    originalTitle: 'Spy x Family',
    year: 2022,
    genres: ['Комедия', 'Экшен', 'Повседневность'],
    rating: '9.0',
    synopsis:
      'Агент «Сумрак» должен создать фиктивную семью для выполнения секретной миссии, не подозревая, что его приёмная дочь — телепат, а жена — наёмная убийца.',
    artworkTheme: 'express',
    seasons: [
      {
        id: 's1',
        number: 1,
        title: 'Сезон 1',
        subtitle: 'Операция «Неясыть»',
        year: 2022,
        totalEpisodes: 25,
        episodeTitles: [
          'Операция «Неясыть»',
          'Найти жену',
          'Подготовка к собеседованию',
          'Престижная школа',
          'Сдадут или нет',
          'Операция «Дружба»',
        ],
      },
      {
        id: 's2',
        number: 2,
        title: 'Сезон 2',
        subtitle: 'Круиз на лайнере',
        year: 2023,
        totalEpisodes: 12,
        episodeTitles: [
          'Слежка за мамой и папой',
          'Стратегия выживания Бонда',
          'Миссия и семья',
          'Сладость мудрости',
          'План пересечения границы',
          'Грозный круизный лайнер',
        ],
      },
      {
        id: 's3',
        number: 3,
        title: 'Сезон 3',
        subtitle: 'Новые горизонты Эдема',
        year: 2025,
        totalEpisodes: 12,
        episodeTitles: [
          'Новое поручение WISE',
          'Каникулы Форджеров',
          'Тайна школьного автобуса',
          'Бал в академии Эдем',
        ],
      },
      {
        id: 'ova',
        number: 0,
        title: 'Фильмы / OVA',
        subtitle: 'Полнометражные фильмы',
        year: 2023,
        totalEpisodes: 1,
        isMovieOrOva: true,
        episodeTitles: ['Семья шпиона — Код: Белый (Полнометражный фильм)'],
      },
    ],
  },
  {
    keywords: ['звездное дитя', 'звёздное дитя', 'zvezdnoe ditya', 'oshi no ko'],
    slug: 'oshi-no-ko',
    title: 'Звёздное дитя',
    originalTitle: 'Oshi no Ko',
    year: 2023,
    genres: ['Драма', 'Детектив', 'Сверхъестественное'],
    rating: '9.1',
    synopsis:
      'Врач и его пациентка перерождаются близнецами у знаменитого айдола Ай Хосино и сталкиваются с обратной стороной японской индустрии развлечений.',
    artworkTheme: 'cyber',
    seasons: [
      {
        id: 's1',
        number: 1,
        title: 'Сезон 1',
        subtitle: 'Пролог и B-Komachi',
        year: 2023,
        totalEpisodes: 11,
        episodeTitles: [
          'Мать и дети',
          'Третий вариант',
          'Экранизация манги',
          'Актёры',
          'Реалити-шоу',
          'Эго-сёрчинг',
          'Шум',
          'Первый раз',
          'B-Komachi',
          'Давление',
          'Айдол',
        ],
      },
      {
        id: 's2',
        number: 2,
        title: 'Сезон 2',
        subtitle: 'Театральная постановка 2.5D «Токийский клинок»',
        year: 2024,
        totalEpisodes: 13,
        episodeTitles: [
          'Токийский клинок',
          'Сломанный телефон',
          'Переписывание сценария',
          'Эмоциональная игра',
          'Поднятие занавеса',
          'Рост',
          'Солнце',
          'Спусковой крючок',
          'Мечта',
          'Освобождение',
          'Свобода',
          'Воссоединение',
          'Желание',
        ],
      },
      {
        id: 's3',
        number: 3,
        title: 'Сезон 3',
        subtitle: 'Основная сюжетная арка',
        year: 2026,
        totalEpisodes: 12,
        episodeTitles: [
          'Начало съёмок',
          'Секрет Мияко',
          'Интервью',
          'Сценарий «15-летней лжи»',
        ],
      },
    ],
  },
  {
    keywords: ['дандадан', 'dandadan', 'момо', 'окарун'],
    slug: 'dandadan',
    title: 'Дандадан',
    originalTitle: 'Dandadan',
    year: 2024,
    genres: ['Экшен', 'Комедия', 'Сверхъестественное'],
    rating: '9.2',
    synopsis:
      'Старшеклассница Момо верит в призраков, а её одноклассник Окарун — в пришельцев. Спор приводит их к столкновению с обоими мирами сразу.',
    artworkTheme: 'cyber',
    seasons: [
      {
        id: 's1',
        number: 1,
        title: 'Сезон 1',
        subtitle: 'Турбо-бабка и Акробатка Сара',
        year: 2024,
        totalEpisodes: 12,
        episodeTitles: [
          'Так вот как начинается любовь',
          'Это же пришелец!',
          'Бабка против бабки',
          'Дадим пинка Турбо-бабке',
          'А где же шары?',
          'Опасная женщина',
          'К более доброму миру',
          'Какое-то странное чувство',
          'Слияние! Серпо-Доверский демон Несси!',
          'Ты когда-нибудь видел увечье скота?',
          'Первая любовь',
          'Погнали в проклятый дом!',
        ],
      },
      {
        id: 's2',
        number: 2,
        title: 'Сезон 2',
        subtitle: 'Проклятый дом и Дурной Глаз',
        year: 2025,
        totalEpisodes: 12,
        episodeTitles: [
          'Тайна горячих источников',
          'Подземелье семьи Кито',
          'Пробуждение Дурного Глаза',
          'Контракт с Окаруном',
          'Кайдзю в городе',
          'Музыкальная экзорцизм-группа',
        ],
      },
    ],
  },
  {
    keywords: [
      'о моем перерождении в слизь',
      'о моём перерождении в слизь',
      'перерождение в слизь',
      'слизь',
      'римуру',
      'slime',
      'vremya pererozhdeniya v sliz',
      'o moem pererozhdenii v sliz',
      'tensei shitara slime datta ken',
      'that time i got reincarnated as a slime',
      'tensura',
      'римуру темпест',
    ],
    slug: 'tensei-shitara-slime-datta-ken',
    title: 'О моём перерождении в слизь',
    originalTitle: 'Tensei shitara Slime Datta Ken / That Time I Got Reincarnated as a Slime',
    year: 2018,
    genres: ['Исекай', 'Фэнтези', 'Приключения', 'Экшен'],
    rating: '9.1',
    synopsis:
      'Обычный японский служащий Сатору Миками погибает от рук грабителя и перерождается в фэнтезийном мире в виде разумной слизи по имени Римуру Темпест, способной поглощать чужие способности и строить собственное государство монстров — Федерацию Джура Темпест.',
    artworkTheme: 'alchemist',
    seasons: [
      {
        id: 's1',
        number: 1,
        title: 'Сезон 1',
        subtitle: 'Основание Федерации Джура Темпест',
        year: 2018,
        totalEpisodes: 24,
        episodeTitles: [
          'Дракон Бури Велдора',
          'Встреча с гоблинами',
          'Битва в деревне гоблинов',
          'В королевстве дварфов',
          'Герой-король Газель Дварго',
          'Сидзу',
          'Завоеватель пламени',
          'Унаследованная воля',
          'Атака огров',
          'Повелитель орков',
          'Габиру здесь!',
          'Сломанный механизм',
          'Великое столкновение',
          'Тот, кто пожирает всё',
          'Федерация Леса Джура',
          'Князь Тьмы Милим нападает',
          'Собравшиеся',
          'Крадущаяся злоба',
          'Харибда',
          'Юки Кагуразака',
          'Преподаватель Сидзу-сан',
          'Лабиринт духов',
          'Спасённые души',
          'Внешняя история: Чёрное и маска',
        ],
      },
      {
        id: 's2',
        number: 2,
        title: 'Сезон 2',
        subtitle: 'Пробуждение Князя Тьмы и Вальпургиева ночь',
        year: 2021,
        totalEpisodes: 24,
        episodeTitles: [
          'Напряжённые будни Римуру',
          'Торговля со зверолюдьми',
          'Рай снова',
          'Интрига королевства Фармус',
          'Прелюдия к катастрофе',
          'Красавица делает ход',
          'Отчаяние',
          'Надежда',
          'Поставив всё на кон',
          'Мегиддо',
          'Рождение Князя Тьмы',
          'Освобождённый',
          'Посетители',
          'Встреча людей и монстров',
          'Весть от Рамирис',
          'Конференция начинается',
          'Лиса и девять хвостов',
          'Князья Тьмы и их замыслы',
          'Сигнал к началу банкета',
          'На земле судьбы',
          'Адальман, Указательный палец',
          'Вальпургиева ночь',
          'Возвращение из бездны',
          'Октаграмма — Князья Тьмы восьми звёзд',
        ],
      },
      {
        id: 's3',
        number: 3,
        title: 'Сезон 3',
        subtitle: 'Святые и монстры · Фестиваль основания Темпеста',
        year: 2024,
        totalEpisodes: 24,
        episodeTitles: [
          'Демоны и заговоры',
          'Намерения Святого',
          'Мирные дни и новая подготовка',
          'Испытание Хинаты Сакагути',
          'Совещание обеих сторон',
          'Надвигающиеся рыцари',
          'Святые и монстры',
          'Кнопка недоразумения',
          'Заговор Семи Светил',
          'Бог и Князь Тьмы',
          'Примирение и договор',
          'Подготовка к Фестивалю',
          'Приглашённые народы',
          'Лабиринт и фея',
          'Аудиенция',
          'Испытания Беннимару',
          'Сверкающий герой Масаюки',
          'Наплыв гостей',
          'Ночь перед открытием',
          'Фестиваль основания государства',
          'Турнир боевых искусств',
          'Сведение счётов с Героем',
          'Открытие подземного лабиринта',
          'После фестиваля',
        ],
      },
      {
        id: 'ova',
        number: 0,
        title: 'Фильмы / OVA',
        subtitle: 'Алые узы, Мечта Коуру и Дневники слизи',
        year: 2023,
        totalEpisodes: 5,
        isMovieOrOva: true,
        episodeTitles: [
          'Фильм: Алые узы (Guren no Kizuna-hen)',
          'OVA: Мечта Коуру — Часть 1',
          'OVA: Мечта Коуру — Часть 2',
          'OVA: Мечта Коуру — Часть 3',
          'Спецвыпуск: Слава сумо и приключения Римуру',
        ],
      },
    ],
  },
  {
    keywords: [
      'хвост феи',
      'hvost fei',
      'khvost fei',
      'fairy tail',
      'фейри тейл',
      'нацу',
      'нацу драгнил',
    ],
    slug: 'fairy-tail',
    title: 'Хвост Феи',
    originalTitle: 'Fairy Tail',
    year: 2009,
    genres: ['Сёнэн', 'Фэнтези', 'Приключения', 'Магия'],
    rating: '8.8',
    synopsis:
      'Юная заклинательница звёздных духов Люси Хартфилия встречает огненного убийцу драконов Нацу Драгнила и хэппи, вступая в самую шумную и могущественную магическую гильдию королевства Фиор — «Хвост Феи».',
    artworkTheme: 'alchemist',
    seasons: [
      {
        id: 's1',
        number: 1,
        title: 'Сезон 1',
        subtitle: 'Гильдия Хвост Феи и Остров Тенрю',
        year: 2009,
        totalEpisodes: 175,
        episodeTitles: [
          'Хвост Феи',
          'Огненный дракон, Обезьяна и Бык',
          'Проникновение в особняк Эверлу',
          'Дорогой Каби',
          'Волшебник в доспехах',
          'Феи на ветру',
          'Пламя и ветер',
          'Сильнейшая команда!',
        ],
      },
      {
        id: 's2',
        number: 2,
        title: 'Сезон 2',
        subtitle: 'Великие Магические Игры и Тартарос',
        year: 2014,
        totalEpisodes: 102,
        episodeTitles: [
          'Король драконов',
          'Проект Затмение',
          'Врата Будущего',
          'Тартарос: Пролог',
        ],
      },
      {
        id: 's3',
        number: 3,
        title: 'Сезон 3',
        subtitle: 'Финальный сезон и Столетний квест',
        year: 2018,
        totalEpisodes: 51,
        episodeTitles: [
          'Империя Арболес',
          'Двенадцать Спригганов',
          'Пламя Игнила',
          'Столетний квест начинается',
        ],
      },
    ],
  },
];

const TRANSLIT_WORD_MAP: Record<string, string> = {
  monolog: 'монолог',
  farmacevta: 'фармацевта',
  farmatsevta: 'фармацевта',
  apotekarya: 'аптекаря',
  chernyy: 'чёрный',
  chernyj: 'чёрный',
  klever: 'клевер',
  chelovek: 'человек',
  benzopila: 'бензопила',
  magicheskaya: 'магическая',
  bitva: 'битва',
  klinok: 'клинок',
  rassekayuschiy: 'рассекающий',
  rassekayushchiy: 'рассекающий',
  demonov: 'демонов',
  podnyatie: 'поднятие',
  urovnya: 'уровня',
  odinochku: 'одиночку',
  ataka: 'атака',
  titanov: 'титанов',
  velikiy: 'великий',
  iz: 'из',
  brodyachih: 'бродячих',
  psov: 'псов',
  reinkarnaciya: 'реинкарнация',
  reinkarnatsiya: 'реинкарнация',
  bezrabotnogo: 'безработного',
  voshozhdenie: 'восхождение',
  teni: 'тени',
  geroya: 'героя',
  schita: 'щита',
  shchita: 'щита',
  tetrad: 'тетрадь',
  smerti: 'смерти',
  stalnoy: 'стальной',
  alhimik: 'алхимик',
  tokiyskiy: 'токийский',
  gul: 'гуль',
  mstiteli: 'мстители',
  semya: 'семья',
  shpiona: 'шпиона',
  zvezdnoe: 'звёздное',
  ditya: 'дитя',
  sinyaya: 'синяя',
  tyurma: 'тюрьма',
  voina: 'война',
  voyna: 'война',
  akademiya: 'академия',
  moya: 'моя',
  geroyskaya: 'геройская',
  mastera: 'мастера',
  mecha: 'меча',
  onlayn: 'онлайн',
  nevesta: 'невеста',
  charodeya: 'чародея',
  obezyana: 'обезьяна',
  drakon: 'дракон',
  rycar: 'рыцарь',
  rytsar: 'рыцарь',
  korol: 'король',
  magov: 'магов',
  vremya: 'время',
  sliz: 'слизь',
  pererozhdenie: 'перерождение',
  pererozhdenii: 'перерождении',
  moem: 'моём',
  moyom: 'моём',
  zhizn: 'жизнь',
  mire: 'мире',
  drugom: 'другом',
  bozhestvennyy: 'божественный',
  меч: 'меч',
  nochnoy: 'ночной',
  put: 'путь',
  posledniy: 'последний',
  provozhayuschaya: 'провожающая',
  friren: 'Фрирен',
};

/**
 * Strips numeric site IDs (e.g. "8522-"), technical tail suffixes ("-n1", "-v2", "-3-sezon", "(YummyAnime.TV)"),
 * and extracts a clean normalized slug plus optional season number.
 */
export function cleanAnimeSlugAndText(rawInput: string): {
  cleanSlug: string;
  seasonNumber: number | null;
} {
  let s = rawInput
    .trim()
    .replace(/\((yummyanime\.tv|yummyanime|animego|animevost\.org|animevost)\)/gi, '')
    .replace(/\.html?$/i, '')
    .trim();

  // Strip leading numeric ID prefixes like "8522-", "3842_", "8522 "
  s = s.replace(/^\d+[\s_-]+/, '');

  let seasonNumber: number | null = null;
  const seasonMatch =
    s.match(/(?:[\s_-]+)(\d+)[\s_-]+(?:sezon|season|сезон)\b/i) ||
    s.match(/(?:[\s_-]+)(?:sezon|season|сезон)[\s_-]+(\d+)\b/i);
  if (seasonMatch) {
    seasonNumber = Number(seasonMatch[1]);
  }

  // Strip technical site tail tokens: n1, v2, s1, r1, tv, bd, sezon, season, episode numbers
  s = s
    .replace(/(?:[\s_-]+)(?:\d+[\s_-]+)?(?:sezon|season|сезон)(?:[\s_-]+\d+)?\b/gi, '')
    .replace(/(?:[\s_-]+)(?:[nvrspt]\d+|tv|ova|ona|bd|1080p|720p|rus|sub|dub|smotret|online)+$/gi, '')
    .replace(/(?:[\s_-]+)\d+$/g, '')
    .trim();

  const cleanSlug =
    s
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]+/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'anime';

  return { cleanSlug, seasonNumber };
}

function translitWordToRussian(word: string): string {
  const lower = word.toLowerCase();
  if (TRANSLIT_WORD_MAP[lower]) {
    return TRANSLIT_WORD_MAP[lower];
  }
  if (/[а-яё]/i.test(lower)) {
    return lower;
  }

  let res = lower
    .replace(/shch/g, 'щ')
    .replace(/sch/g, 'щ')
    .replace(/yo/g, 'ё')
    .replace(/zh/g, 'ж')
    .replace(/kh/g, 'х')
    .replace(/ts/g, 'ц')
    .replace(/ch/g, 'ч')
    .replace(/sh/g, 'ш')
    .replace(/yu/g, 'ю')
    .replace(/ya/g, 'я')
    .replace(/iy$/g, 'ий')
    .replace(/yy$/g, 'ый')
    .replace(/yj$/g, 'ый')
    .replace(/aya$/g, 'ая')
    .replace(/oe$/g, 'ое');

  const charMap: Record<string, string> = {
    a: 'а', b: 'б', v: 'в', g: 'г', d: 'д', e: 'е', z: 'з',
    i: 'и', j: 'й', y: 'й', k: 'к', l: 'л', m: 'м', n: 'н',
    o: 'о', p: 'п', r: 'р', s: 'с', t: 'т', u: 'у', f: 'ф',
    h: 'х', c: 'ц',
  };

  let out = '';
  for (const ch of res) {
    out += charMap[ch] ?? ch;
  }
  return out;
}

/**
 * Converts a raw URL slug or title into a clean Russian title + clean Romaji/English subtitle.
 */
export function resolveCleanAnimeTitles(rawSlugOrText: string): {
  russianTitle: string;
  originalTitle: string;
  seasonNumber: number | null;
  matchedTemplate?: KnownAnimeTemplate;
} {
  const { cleanSlug, seasonNumber } = cleanAnimeSlugAndText(rawSlugOrText);
  const spacedClean = cleanSlug.replace(/-/g, ' ').trim();

  const matched = KNOWN_ANIME_DATABASE.find((t) => {
    if (cleanSlug === t.slug) return true;
    if (cleanSlug.length >= 4 && (cleanSlug.includes(t.slug) || t.slug.includes(cleanSlug))) {
      return true;
    }
    return t.keywords.some((kw) => {
      const kwNorm = kw.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, ' ').trim();
      if (spacedClean === kwNorm) return true;
      if (spacedClean.length >= 4 && (spacedClean.includes(kwNorm) || kwNorm.includes(spacedClean))) {
        return true;
      }
      return false;
    });
  });

  if (matched) {
    return {
      russianTitle: matched.title,
      originalTitle: matched.originalTitle,
      seasonNumber,
      matchedTemplate: matched,
    };
  }

  const words = cleanSlug.split('-').filter(Boolean);
  const russianWords = words.map((w) => translitWordToRussian(w));
  const rawRussian = russianWords.join(' ');
  const russianTitle =
    rawRussian.charAt(0).toUpperCase() + rawRussian.slice(1);

  const romajiTitle = words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return {
    russianTitle: russianTitle || 'Аниме',
    originalTitle: romajiTitle || 'Original Animation',
    seasonNumber,
  };
}

function buildSlugFromText(text: string): string {
  const cyrillicToLatin: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh',
    з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
    п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
    ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya',
  };
  const { cleanSlug } = cleanAnimeSlugAndText(text);
  let out = '';
  for (const ch of cleanSlug) {
    if (cyrillicToLatin[ch]) {
      out += cyrillicToLatin[ch];
    } else if (/[a-z0-9-]/.test(ch)) {
      out += ch;
    }
  }
  return out.replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'anime-release';
}

export const ANIME_POSTER_CDN_MAP: Record<string, string> = {
  'kusuriya-no-hitorigoto':
    'https://cdn.myanimelist.net/images/anime/1708/138033l.jpg',
  'black-clover':
    'https://cdn.myanimelist.net/images/anime/2/88336l.jpg',
  'chainsaw-man':
    'https://cdn.myanimelist.net/images/anime/1806/126216l.jpg',
  'jujutsu-kaisen':
    'https://cdn.myanimelist.net/images/anime/1171/109222l.jpg',
  'kimetsu-no-yaiba':
    'https://cdn.myanimelist.net/images/anime/1286/99889l.jpg',
  'solo-leveling':
    'https://cdn.myanimelist.net/images/anime/1801/142390l.jpg',
  'sousou-no-frieren':
    'https://cdn.myanimelist.net/images/anime/1015/138006l.jpg',
  'shingeki-no-kyojin':
    'https://cdn.myanimelist.net/images/anime/10/47347l.jpg',
  'one-piece':
    'https://cdn.myanimelist.net/images/anime/6/73245l.jpg',
  'bleach-tybw':
    'https://cdn.myanimelist.net/images/anime/1908/135431l.jpg',
  'naruto-shippuuden':
    'https://cdn.myanimelist.net/images/anime/1565/111305l.jpg',
  'blue-lock':
    'https://cdn.myanimelist.net/images/anime/1258/126929l.jpg',
  'spy-x-family':
    'https://cdn.myanimelist.net/images/anime/1441/122795l.jpg',
  'oshi-no-ko':
    'https://cdn.myanimelist.net/images/anime/1812/134736l.jpg',
  'dandadan':
    'https://cdn.myanimelist.net/images/anime/1584/143719l.jpg',
  'tensei-shitara-slime-datta-ken':
    'https://cdn.myanimelist.net/images/anime/1694/93337l.jpg',
  'fairy-tail':
    'https://cdn.myanimelist.net/images/anime/5/18179l.jpg',
};

function buildMultiSiteResultsFromTemplate(
  template: KnownAnimeTemplate,
  preferredSeasonNumber?: number | null
): AnimeSeries[] {
  const seasons: AnimeSeason[] = template.seasons.map((s) => ({
    id: s.id,
    number: s.number,
    title: s.title,
    subtitle: s.subtitle,
    year: s.year,
    totalEpisodes: s.totalEpisodes,
    episodes: generateFullEpisodeList(s),
  }));

  const preferredSeason =
    (preferredSeasonNumber
      ? seasons.find((s) => s.number === preferredSeasonNumber)
      : undefined) || seasons[0];

  const posterUrl = ANIME_POSTER_CDN_MAP[template.slug] || '';

  const unifiedVoiceovers = [
    'AniLibria',
    'StudioBand (Студийная Банда)',
    'SHIZA Project',
    'AniDUB',
    'AnimeVost',
    'Dream Cast',
    'Субтитры',
  ];

  const unifiedQualities: VideoQuality[] = ['1080p', '720p', '480p', '2160p'];

  return [
    {
      id: template.slug,
      title: template.title,
      originalTitle: template.originalTitle,
      posterUrl,
      sourceSite: 'YummyAnime.TV',
      sourceUrl: `https://anilibria.top/anime/releases/release/${template.slug}`,
      year: preferredSeason.year,
      genres: template.genres,
      rating: template.rating,
      totalEpisodes: preferredSeason.totalEpisodes,
      availableVoiceovers: unifiedVoiceovers,
      availableQualities: unifiedQualities,
      synopsis: template.synopsis,
      artworkTheme: template.artworkTheme,
      seasons,
      defaultSeasonId: preferredSeason.id,
      episodes: preferredSeason.episodes,
    },
  ];
}

function buildDynamicSeasons(
  russianTitle: string,
  requestedSeasonNumber?: number | null
): SeasonTemplate[] {
  const maxNumberedSeason = Math.max(3, requestedSeasonNumber || 3);
  const numberedSeasons: SeasonTemplate[] = Array.from(
    { length: maxNumberedSeason },
    (_, i) => {
      const sNum = i + 1;
      return {
        id: `s${sNum}`,
        number: sNum,
        title: `Сезон ${sNum}`,
        subtitle: `${russianTitle} — Арка ${sNum}`,
        year: 2022 + i,
        totalEpisodes: sNum === 1 ? 24 : 12,
        episodeTitles: [
          'Пролог',
          'Начало пути',
          'Испытание',
          'Переломный момент',
          'Скрытая угроза',
          'Контратака',
          'Клятва',
          'Пробуждение силы',
          'Ночной штурм',
          'Выбор героя',
          'Решающая схватка',
          'Финал сезона',
        ],
      };
    }
  );

  numberedSeasons.push({
    id: 'ova',
    number: 0,
    title: 'Фильмы / OVA',
    subtitle: 'Полнометражные фильмы и спецвыпуски',
    year: 2025,
    totalEpisodes: 2,
    isMovieOrOva: true,
    episodeTitles: [
      `${russianTitle}: Полнометражный фильм`,
      `${russianTitle}: Спецвыпуск (OVA)`,
    ],
  });

  return numberedSeasons;
}

/**
 * Performs unified anime search for any Russian or English anime title OR direct URL,
 * returning a single clean, unified card for the matched anime.
 */
export function searchAnimeAcrossSites(rawInput: string): {
  ok: boolean;
  mode: 'search' | 'url';
  queryLabel: string;
  results: AnimeSeries[];
  error?: string;
} {
  const validation = validateAnimeSourceUrl(rawInput);
  if (!validation.valid) {
    return {
      ok: false,
      mode: validation.isUrlInput ? 'url' : 'search',
      queryLabel: rawInput.trim(),
      results: [],
      error: validation.error || 'Не удалось выполнить поиск.',
    };
  }

  // Case 1: Direct URL pasted by user
  if (validation.isUrlInput && validation.sourceSite && validation.sanitizedUrl && validation.slug) {
    const resolved = resolveCleanAnimeTitles(validation.slug);

    if (resolved.matchedTemplate) {
      const results = buildMultiSiteResultsFromTemplate(
        resolved.matchedTemplate,
        resolved.seasonNumber
      );
      results[0] = {
        ...results[0],
        sourceSite: validation.sourceSite,
        sourceUrl: validation.sanitizedUrl,
      };
      return {
        ok: true,
        mode: 'url',
        queryLabel: resolved.matchedTemplate.title,
        results,
      };
    }

    const { cleanSlug } = cleanAnimeSlugAndText(validation.slug);
    const customTemplate: KnownAnimeTemplate = {
      keywords: [resolved.russianTitle.toLowerCase()],
      slug: cleanSlug.slice(0, 48),
      title: resolved.russianTitle,
      originalTitle: resolved.originalTitle,
      year: 2025,
      genres: ['Аниме', 'Фэнтези', 'Приключения'],
      rating: '9.0',
      synopsis: `Релиз «${resolved.russianTitle}» с выбором сезона, серии, русской озвучки и качества видео (1080p / 720p / 480p).`,
      artworkTheme: 'samurai',
      seasons: buildDynamicSeasons(resolved.russianTitle, resolved.seasonNumber),
    };

    const results = buildMultiSiteResultsFromTemplate(
      customTemplate,
      resolved.seasonNumber
    );
    results[0] = {
      ...results[0],
      sourceSite: validation.sourceSite,
      sourceUrl: validation.sanitizedUrl,
    };

    return {
      ok: true,
      mode: 'url',
      queryLabel: resolved.russianTitle,
      results,
    };
  }

  // Case 2: Plain-text title search (Russian, English, or translit) -> ONE unified card
  const cleanQuery = (validation.searchQuery || rawInput).trim();
  const resolved = resolveCleanAnimeTitles(cleanQuery);

  if (resolved.matchedTemplate) {
    return {
      ok: true,
      mode: 'search',
      queryLabel: resolved.matchedTemplate.title,
      results: buildMultiSiteResultsFromTemplate(
        resolved.matchedTemplate,
        resolved.seasonNumber
      ),
    };
  }

  const slug = buildSlugFromText(cleanQuery);
  const dynamicTemplate: KnownAnimeTemplate = {
    keywords: [cleanQuery.toLowerCase()],
    slug,
    title: resolved.russianTitle,
    originalTitle: resolved.originalTitle,
    year: 2025,
    genres: ['Сёнэн', 'Экшен', 'Приключения'],
    rating: '8.9',
    synopsis: `Релиз «${resolved.russianTitle}» с поддержкой всех сезонов, выбора студии озвучки и качества потока (1080p / 720p / 480p).`,
    artworkTheme: 'alchemist',
    seasons: buildDynamicSeasons(resolved.russianTitle, resolved.seasonNumber),
  };

  return {
    ok: true,
    mode: 'search',
    queryLabel: resolved.russianTitle,
    results: buildMultiSiteResultsFromTemplate(dynamicTemplate, resolved.seasonNumber),
  };
}

/**
 * Legacy helper kept for compatibility: extracts primary anime from URL or title.
 */
export function extractAnimeFromUrl(rawUrl: string): {
  ok: boolean;
  anime?: AnimeSeries;
  error?: string;
} {
  const searchRes = searchAnimeAcrossSites(rawUrl);
  if (!searchRes.ok || searchRes.results.length === 0) {
    return { ok: false, error: searchRes.error || 'Не удалось найти релиз.' };
  }
  return { ok: true, anime: searchRes.results[0] };
}

/**
 * Default player series catalog (one unified entry per popular anime)
 */
export const DEFAULT_PLAYER_ANIME_LIST: AnimeSeries[] = KNOWN_ANIME_DATABASE.map(
  (tpl) => buildMultiSiteResultsFromTemplate(tpl)[0]
);

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
 * Creates a download task in the queue.
 */
export function createDownloadTask(params: {
  anime: AnimeSeries;
  seasonTitle?: string;
  episode: EpisodeInfo;
  voiceover: string;
  quality: VideoQuality;
  platform: PlatformTarget;
}): DownloadTask {
  const sizeMB = estimateEpisodeSizeMB(params.episode.durationSeconds, params.quality);
  const seasonSlug = params.seasonTitle
    ? params.seasonTitle.replace(/[^a-zA-Zа-яА-Я0-9]/g, '').slice(0, 10)
    : 's1';
  const id = `${params.anime.id}-${seasonSlug}-ep-${params.episode.number}-${params.quality}`
    .replace(/[^a-zA-Zа-яА-Я0-9_-]/g, '-')
    .slice(0, 80);

  const sha256 = computeDeterministicHash(
    `${params.anime.id}:${seasonSlug}:${params.episode.number}:${params.voiceover}:${params.quality}:${params.anime.sourceSite}`
  );

  return {
    id,
    animeId: params.anime.id,
    animeTitle: params.anime.title,
    originalTitle: params.anime.originalTitle,
    posterUrl: params.anime.posterUrl,
    seasonTitle: params.seasonTitle || params.anime.seasons[0]?.title || 'Сезон 1',
    artworkTheme: params.anime.artworkTheme,
    episodeNumber: params.episode.number,
    episodeTitle: params.episode.title,
    durationSeconds: params.episode.durationSeconds,
    voiceover: params.voiceover,
    quality: params.quality,
    sourceSite: params.anime.sourceSite,
    sourceUrl: `${params.anime.sourceUrl}?season=${encodeURIComponent(seasonSlug)}&ep=${params.episode.number}`,
    status: 'downloading',
    progressPercent: 0,
    speedMBps: params.quality === '2160p' ? 28.4 : params.quality === '1080p' ? 22.6 : 16.8,
    sizeMB,
    downloadedMB: 0,
    targetPath: buildTargetFilePath({
      platform: params.platform,
      animeTitle: params.seasonTitle
        ? `${params.anime.title} (${params.seasonTitle})`
        : params.anime.title,
      episodeNumber: params.episode.number,
      voiceover: params.voiceover,
      quality: params.quality,
    }),
    sha256,
    isOfflineAvailable: false,
    updatedAtIso: new Date().toISOString(),
  };
}

/**
 * Normalizes download queue so that:
 * 1. Only non-completed tasks remain in the active queue.
 * 2. Tasks are grouped by animeTitle (in the order each anime was added) and sorted by episodeNumber ascending.
 * 3. Sequential downloading across titles: only the first anime group with non-paused tasks actively downloads
 *    its earliest unfinished episode, while subsequent anime groups wait in 'queued' status so episodes of
 *    different anime never mix.
 */
export function enforceSequentialAnimeQueue(queue: DownloadTask[]): DownloadTask[] {
  const activeOnly = queue.filter((t) => t.status !== 'completed' && t.progressPercent < 100);
  if (activeOnly.length === 0) return [];

  const groupOrder: string[] = [];
  const byTitle = new Map<string, DownloadTask[]>();

  for (const task of activeOnly) {
    const key = task.animeTitle.trim().toLowerCase();
    if (!byTitle.has(key)) {
      groupOrder.push(key);
      byTitle.set(key, []);
    }
    byTitle.get(key)!.push({ ...task });
  }

  // Sort episodes inside each anime group by episodeNumber ascending
  for (const key of groupOrder) {
    const list = byTitle.get(key)!;
    list.sort((a, b) => a.episodeNumber - b.episodeNumber);
  }

  // Find the first anime group that has at least one task not explicitly paused
  const activeGroupKey =
    groupOrder.find((key) => byTitle.get(key)!.some((t) => t.status !== 'paused')) || null;

  const result: DownloadTask[] = [];
  for (const key of groupOrder) {
    const tasks = byTitle.get(key)!;
    const isCurrentActiveGroup = key === activeGroupKey;
    let foundActiveEpisodeInGroup = false;

    for (const t of tasks) {
      if (t.status === 'paused') {
        result.push({ ...t, speedMBps: 0 });
        continue;
      }

      if (isCurrentActiveGroup && !foundActiveEpisodeInGroup) {
        foundActiveEpisodeInGroup = true;
        const speed = t.quality === '2160p' ? 28.4 : t.quality === '1080p' ? 22.6 : 16.8;
        result.push({
          ...t,
          status: 'downloading',
          speedMBps: speed,
        });
      } else {
        result.push({
          ...t,
          status: 'queued',
          speedMBps: 0,
        });
      }
    }
  }

  return result;
}

/**
 * Groups active queue tasks by anime title for clean visual display in the Download Queue tab.
 */
export function groupActiveQueueByAnime(queue: DownloadTask[]): AnimeQueueGroup[] {
  const normalized = enforceSequentialAnimeQueue(queue);
  const groups: AnimeQueueGroup[] = [];
  const map = new Map<string, AnimeQueueGroup>();

  for (const task of normalized) {
    const key = task.animeTitle.trim().toLowerCase();
    let grp = map.get(key);
    if (!grp) {
      grp = {
        groupKey: key,
        animeId: task.animeId,
        animeTitle: task.animeTitle,
        originalTitle: task.originalTitle || task.animeTitle,
        posterUrl: task.posterUrl || '',
        sourceSite: task.sourceSite,
        artworkTheme: task.artworkTheme,
        isActiveGroup: false,
        tasks: [],
      };
      map.set(key, grp);
      groups.push(grp);
    }
    if (task.status === 'downloading') {
      grp.isActiveGroup = true;
    }
    grp.tasks.push(task);
  }

  return groups;
}

/**
 * Advances active download tasks sequentially and extracts any task that reaches 100%
 * so it moves out of the Download Queue and into the Saved Playlists tab.
 */
export function stepDownloadQueueSequentially(
  queue: DownloadTask[],
  incrementPercent = 20
): {
  remainingQueue: DownloadTask[];
  newlyCompleted: DownloadTask[];
} {
  const normalized = enforceSequentialAnimeQueue(queue);
  const newlyCompleted: DownloadTask[] = [];
  const updated: DownloadTask[] = [];

  for (const task of normalized) {
    if (task.status !== 'downloading') {
      updated.push(task);
      continue;
    }

    const nextPercent = Math.min(100, task.progressPercent + incrementPercent);
    const nextDownloaded = Math.round((task.sizeMB * nextPercent) / 100);

    if (nextPercent >= 100) {
      newlyCompleted.push({
        ...task,
        status: 'completed',
        progressPercent: 100,
        downloadedMB: task.sizeMB,
        speedMBps: 0,
        isOfflineAvailable: true,
        updatedAtIso: new Date().toISOString(),
      });
    } else {
      updated.push({
        ...task,
        progressPercent: nextPercent,
        downloadedMB: nextDownloaded,
        updatedAtIso: new Date().toISOString(),
      });
    }
  }

  return {
    remainingQueue: enforceSequentialAnimeQueue(updated),
    newlyCompleted,
  };
}

/**
 * Groups completed/saved episodes into per-anime playlist folders, sorted by episode number (Серия 1, Серия 2...).
 */
export function groupSavedEpisodesIntoPlaylists(
  savedEpisodes: DownloadTask[]
): SavedAnimePlaylist[] {
  const playlists: SavedAnimePlaylist[] = [];
  const map = new Map<string, SavedAnimePlaylist>();

  for (const ep of savedEpisodes) {
    const key = ep.animeTitle.trim().toLowerCase();
    let pl = map.get(key);
    if (!pl) {
      pl = {
        playlistKey: key,
        animeId: ep.animeId,
        animeTitle: ep.animeTitle,
        originalTitle: ep.originalTitle || ep.animeTitle,
        posterUrl: ep.posterUrl || '',
        sourceSite: ep.sourceSite,
        artworkTheme: ep.artworkTheme,
        totalSizeMB: 0,
        updatedAtIso: ep.updatedAtIso,
        episodes: [],
      };
      map.set(key, pl);
      playlists.push(pl);
    }

    // Deduplicate by season + episode number
    const existsIdx = pl.episodes.findIndex(
      (x) =>
        x.episodeNumber === ep.episodeNumber &&
        (x.seasonTitle || 'Сезон 1') === (ep.seasonTitle || 'Сезон 1')
    );
    if (existsIdx >= 0) {
      pl.episodes[existsIdx] = ep;
    } else {
      pl.episodes.push(ep);
    }
  }

  for (const pl of playlists) {
    pl.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
    pl.totalSizeMB = pl.episodes.reduce((acc, item) => acc + (item.sizeMB || 0), 0);
  }

  return playlists;
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
