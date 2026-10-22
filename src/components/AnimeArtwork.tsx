import React from 'react';
import { AnimeSeries } from '../utils/animeEngine';

interface AnimeArtworkProps {
  theme: AnimeSeries['artworkTheme'];
  className?: string;
}

export const AnimeArtwork: React.FC<AnimeArtworkProps> = ({ theme, className = 'w-full h-full' }) => {
  switch (theme) {
    case 'samurai':
      return (
        <svg viewBox="0 0 360 480" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} role="img" aria-label="Постер: Клинок полуночного ронина">
          <defs>
            <linearGradient id="samurai-sky" x1="0" y1="0" x2="0" y2="480" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#090D16" />
              <stop offset="55%" stopColor="#1E1B4B" />
              <stop offset="100%" stopColor="#7C2D12" />
            </linearGradient>
          </defs>
          <rect width="360" height="480" fill="url(#samurai-sky)" />
          <circle cx="240" cy="150" r="78" fill="#F97316" fillOpacity="0.85" />
          <circle cx="240" cy="150" r="64" fill="#FDE047" fillOpacity="0.45" />
          {/* Traditional Pagoda Silhouette */}
          <path d="M20 340L95 310L170 340H20Z" fill="#0F172A" />
          <path d="M35 312L95 285L155 312H35Z" fill="#0F172A" />
          {/* Ronin Silhouette & Katana */}
          <path d="M120 480L155 320L195 310L235 480H120Z" fill="#020617" />
          <circle cx="176" cy="282" r="22" fill="#020617" />
          <path d="M132 272L176 254L222 272H132Z" fill="#0F172A" />
          <line x1="90" y1="365" x2="295" y2="215" stroke="#38BDF8" strokeWidth="3.5" strokeLinecap="round" />
          <line x1="90" y1="365" x2="295" y2="215" stroke="#E0F2FE" strokeWidth="1.2" strokeLinecap="round" />
          {/* Rain streaks */}
          <g stroke="#94A3B8" strokeOpacity="0.3" strokeWidth="1">
            <line x1="60" y1="40" x2="40" y2="120" />
            <line x1="140" y1="80" x2="120" y2="160" />
            <line x1="310" y1="60" x2="290" y2="140" />
            <line x1="270" y1="260" x2="250" y2="340" />
          </g>
        </svg>
      );

    case 'alchemist':
      return (
        <svg viewBox="0 0 360 480" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} role="img" aria-label="Постер: Хроники небесной обсерватории">
          <defs>
            <linearGradient id="alch-bg" x1="0" y1="0" x2="360" y2="480" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#0C192C" />
              <stop offset="60%" stopColor="#1E3A5F" />
              <stop offset="100%" stopColor="#B45309" />
            </linearGradient>
          </defs>
          <rect width="360" height="480" fill="url(#alch-bg)" />
          {/* Celestial Astrolabe Rings */}
          <circle cx="180" cy="210" r="115" stroke="#FBBF24" strokeOpacity="0.4" strokeWidth="2" strokeDasharray="6 6" />
          <circle cx="180" cy="210" r="86" stroke="#38BDF8" strokeOpacity="0.65" strokeWidth="2" />
          <ellipse cx="180" cy="210" rx="110" ry="38" transform="rotate(-28 180 210)" stroke="#FDE68A" strokeOpacity="0.7" strokeWidth="1.8" />
          <ellipse cx="180" cy="210" rx="110" ry="38" transform="rotate(28 180 210)" stroke="#FDE68A" strokeOpacity="0.5" strokeWidth="1.5" />
          <circle cx="180" cy="210" r="14" fill="#FDE047" />
          {/* Observatory Dome Silhouette */}
          <path d="M0 480V370C60 330 120 330 180 355C240 330 300 330 360 370V480H0Z" fill="#090D16" />
        </svg>
      );

    case 'mecha':
      return (
        <svg viewBox="0 0 360 480" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} role="img" aria-label="Постер: Орбитальный рубеж">
          <defs>
            <linearGradient id="mecha-bg" x1="0" y1="0" x2="0" y2="480" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#020617" />
              <stop offset="65%" stopColor="#0F172A" />
              <stop offset="100%" stopColor="#0284C7" />
            </linearGradient>
          </defs>
          <rect width="360" height="480" fill="url(#mecha-bg)" />
          {/* Earth Curvature Horizon */}
          <circle cx="180" cy="620" r="300" fill="#0369A1" fillOpacity="0.45" stroke="#38BDF8" strokeWidth="3" />
          {/* Geometric Mecha Head & V-Fin */}
          <polygon points="180,115 105,260 180,235 255,260" fill="#1E293B" stroke="#E2E8F0" strokeWidth="2" />
          <polygon points="180,165 92,115 152,188" fill="#F43F5E" />
          <polygon points="180,165 268,115 208,188" fill="#F43F5E" />
          {/* Glowing Dual Optics */}
          <polygon points="145,202 174,210 150,218" fill="#38BDF8" />
          <polygon points="215,202 186,210 210,218" fill="#38BDF8" />
        </svg>
      );

    case 'express':
      return (
        <svg viewBox="0 0 360 480" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} role="img" aria-label="Постер: Ночной экспресс">
          <defs>
            <linearGradient id="exp-bg" x1="0" y1="0" x2="0" y2="480" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#090D16" />
              <stop offset="55%" stopColor="#1E1B4B" />
              <stop offset="100%" stopColor="#0E7490" />
            </linearGradient>
          </defs>
          <rect width="360" height="480" fill="url(#exp-bg)" />
          {/* Aurora & Stars */}
          <path d="M0 140C90 95 190 175 360 110" stroke="#2DD4BF" strokeOpacity="0.55" strokeWidth="14" strokeLinecap="round" />
          <path d="M0 175C120 130 220 205 360 145" stroke="#38BDF8" strokeOpacity="0.4" strokeWidth="8" strokeLinecap="round" />
          {/* Train Windows on Horizon */}
          <rect x="24" y="305" width="312" height="28" rx="6" fill="#0F172A" stroke="#38BDF8" strokeWidth="1.5" />
          <rect x="42" y="312" width="28" height="14" rx="2" fill="#FDE047" />
          <rect x="82" y="312" width="28" height="14" rx="2" fill="#FDE047" />
          <rect x="122" y="312" width="28" height="14" rx="2" fill="#FDE047" />
          <rect x="162" y="312" width="28" height="14" rx="2" fill="#FDE047" />
          <rect x="202" y="312" width="28" height="14" rx="2" fill="#FDE047" />
          <rect x="242" y="312" width="28" height="14" rx="2" fill="#FDE047" />
          <rect x="282" y="312" width="28" height="14" rx="2" fill="#FDE047" />
          {/* Water Reflection */}
          <rect x="0" y="335" width="360" height="145" fill="#082F49" fillOpacity="0.7" />
          <line x1="20" y1="352" x2="340" y2="352" stroke="#FDE047" strokeOpacity="0.35" strokeWidth="2" strokeDasharray="16 12" />
        </svg>
      );

    case 'cyber':
      return (
        <svg viewBox="0 0 360 480" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} role="img" aria-label="Постер: Сибуя Протокол">
          <rect width="360" height="480" fill="#090D16" />
          {/* City Grid & Towers */}
          <rect x="40" y="120" width="55" height="360" fill="#111827" stroke="#1E293B" />
          <rect x="110" y="75" width="75" height="405" fill="#0F172A" stroke="#334155" />
          <rect x="200" y="145" width="65" height="335" fill="#111827" stroke="#1E293B" />
          <rect x="275" y="100" width="50" height="380" fill="#0F172A" stroke="#1E293B" />
          {/* Acoustic Wave Signal */}
          <path d="M20 250L85 250L115 170L155 320L195 140L230 290L265 220L340 220" stroke="#0EA5E9" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="195" cy="140" r="6" fill="#38BDF8" />
        </svg>
      );

    case 'shrine':
    default:
      return (
        <svg viewBox="0 0 360 480" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} role="img" aria-label="Постер: Сказание о храме Алых Тории">
          <defs>
            <linearGradient id="shrine-bg" x1="0" y1="0" x2="0" y2="480" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#1E1B4B" />
              <stop offset="60%" stopColor="#4C1D95" />
              <stop offset="100%" stopColor="#9A3412" />
            </linearGradient>
          </defs>
          <rect width="360" height="480" fill="url(#shrine-bg)" />
          <circle cx="180" cy="175" r="85" fill="#FDE68A" fillOpacity="0.25" />
          {/* Crimson Torii Gate */}
          <path d="M55 170C135 190 225 190 305 170L315 188C225 206 135 206 45 188L55 170Z" fill="#EF4444" />
          <rect x="75" y="218" width="210" height="14" fill="#DC2626" />
          <rect x="95" y="192" width="18" height="240" fill="#B91C1C" />
          <rect x="247" y="192" width="18" height="240" fill="#B91C1C" />
          <path d="M0 420L360 420V480H0V420Z" fill="#090D16" />
        </svg>
      );
  }
};
