// Vector art for the space-techno theme. Every piece is stroke-based neon line art on
// the same 120x120 grid, drawn with the theme palette and animated with the CSS classes
// from index.css (anim-orbit, anim-wave, anim-float, anim-sweep, anim-blink).
//
// Decorative only: every SVG is aria-hidden and sized by the .screen-art class
// (mobile-first: ~8.5rem wide on a phone, ~11rem on a desktop/TV).

import React from 'react';

const CYAN = '#22d3ee';
const MAGENTA = '#e879f9';
const VIOLET = '#8b5cf6';
const TRUTH = '#34d399';
const GOLD = '#fbbf24';
const DIM = '#8b9cc0';

interface ArtProps { className?: string; }

const base = (extra?: string) => `screen-art${extra ? ' ' + extra : ''}`;

/** G1 — a ringed planet with a moon in orbit: the game's front door. */
export const RingedPlanet = ({ className }: ArtProps) => (
    <svg className={base(className)} viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <circle cx="60" cy="60" r="26" stroke={CYAN} strokeWidth="2.5" />
        <path d="M38 52 q22 -14 44 0" stroke={CYAN} strokeWidth="1.2" opacity="0.5" />
        <path d="M36 66 q24 12 48 -2" stroke={CYAN} strokeWidth="1.2" opacity="0.5" />
        <ellipse cx="60" cy="60" rx="48" ry="15" stroke={MAGENTA} strokeWidth="2" transform="rotate(-16 60 60)" />
        <g className="anim-orbit">
            <circle cx="60" cy="12" r="4" fill={MAGENTA} />
        </g>
        <circle cx="16" cy="24" r="1.6" fill={DIM} />
        <circle cx="104" cy="98" r="1.6" fill={DIM} />
        <circle cx="99" cy="20" r="2" fill="#e6edf7" />
    </svg>
);

/** H1 — an orbital relay beaconing the join signal out to the crew. */
export const OrbitalRelay = ({ className }: ArtProps) => (
    <svg className={base(className)} viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <path d="M45 78 L60 50 L75 78 Z" stroke={CYAN} strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M42 50 a24 24 0 0 1 36 0" stroke={CYAN} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="60" cy="46" r="4" fill={MAGENTA} />
        <g className="anim-wave">
            <path d="M34 40 a34 34 0 0 1 52 0" stroke={MAGENTA} strokeWidth="2" strokeLinecap="round" />
        </g>
        <g className="anim-wave" style={{ animationDelay: '0.8s' }}>
            <path d="M26 33 a44 44 0 0 1 68 0" stroke={MAGENTA} strokeWidth="1.6" strokeLinecap="round" />
        </g>
        <path d="M30 92 h60" stroke={VIOLET} strokeWidth="2" strokeLinecap="round" />
        <path d="M40 100 h40" stroke={VIOLET} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
        <circle cx="18" cy="20" r="1.6" fill={DIM} />
        <circle cx="102" cy="26" r="2" fill="#e6edf7" />
    </svg>
);

/** H2 — the radar ring the countdown sits inside (sized by .timer-wrap, not .screen-art). */
export const RadarRing = () => (
    <svg viewBox="0 0 120 120" fill="none" aria-hidden="true" style={{ width: '100%', display: 'block' }}>
        <circle cx="60" cy="60" r="54" stroke={VIOLET} strokeWidth="1" opacity="0.5" />
        <circle cx="60" cy="60" r="46" stroke={CYAN} strokeWidth="2" />
        {[...Array(12)].map((_, i) => (
            <line
                key={i}
                x1="60" y1="8" x2="60" y2="13"
                stroke={DIM} strokeWidth={i % 3 === 0 ? 2 : 1}
                transform={`rotate(${i * 30} 60 60)`}
            />
        ))}
        <g className="anim-sweep">
            <path d="M60 60 L60 15" stroke={MAGENTA} strokeWidth="2" strokeLinecap="round" opacity="0.9" />
            <path d="M60 60 L74 19" stroke={MAGENTA} strokeWidth="1" strokeLinecap="round" opacity="0.35" />
        </g>
    </svg>
);

/** H3 — a scanner separating truth from noise. */
export const TruthScanner = ({ className }: ArtProps) => (
    <svg className={base(className)} viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <circle cx="60" cy="60" r="34" stroke={VIOLET} strokeWidth="2" />
        <circle cx="60" cy="60" r="22" stroke={VIOLET} strokeWidth="1" opacity="0.5" />
        <g className="anim-sweep">
            <path d="M60 60 L60 28" stroke={TRUTH} strokeWidth="2.5" strokeLinecap="round" />
        </g>
        <circle cx="48" cy="52" r="3" fill={DIM} />
        <circle cx="72" cy="70" r="3" fill={DIM} />
        <circle cx="68" cy="44" r="3.6" fill={TRUTH} className="anim-blink" />
        <path d="M14 60 h10 M96 60 h10 M60 14 v-6 M60 112 v-6" stroke={CYAN} strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
    </svg>
);

/** H5 — a constellation ranking: stars joined into a rising line. */
export const ScoreConstellation = ({ className }: ArtProps) => (
    <svg className={base(className)} viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <path d="M18 92 L44 66 L64 78 L98 34" stroke={CYAN} strokeWidth="1.6" opacity="0.7" />
        <circle cx="18" cy="92" r="3" fill={DIM} />
        <circle cx="44" cy="66" r="3.6" fill={VIOLET} />
        <circle cx="64" cy="78" r="3.6" fill={MAGENTA} />
        <g className="anim-blink">
            <circle cx="98" cy="34" r="5" fill={GOLD} />
            <path d="M98 22 v-7 M98 46 v7 M86 34 h-7 M110 34 h7" stroke={GOLD} strokeWidth="1.6" strokeLinecap="round" />
        </g>
        <circle cx="30" cy="30" r="1.6" fill={DIM} />
        <circle cx="76" cy="18" r="1.4" fill="#e6edf7" />
    </svg>
);

/** H6 — the champion's planet, crowned. */
export const ChampionPlanet = ({ className }: ArtProps) => (
    <svg className={base(className)} viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <circle cx="60" cy="66" r="24" stroke={GOLD} strokeWidth="2.5" />
        <ellipse cx="60" cy="66" rx="42" ry="12" stroke={CYAN} strokeWidth="2" transform="rotate(-14 60 66)" />
        <path d="M42 34 L48 22 L56 32 L62 18 L68 32 L76 22 L82 34"
            stroke={GOLD} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" fill="none" />
        <g className="anim-blink">
            <path d="M22 96 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2 Z" fill={MAGENTA} />
            <path d="M98 90 l1.6 3.2 3.2 1.6 -3.2 1.6 -1.6 3.2 -1.6 -3.2 -3.2 -1.6 3.2 -1.6 Z" fill={CYAN} />
        </g>
        <circle cx="20" cy="26" r="1.6" fill={DIM} />
        <circle cx="100" cy="18" r="2" fill="#e6edf7" />
    </svg>
);

/** C1 — an astronaut helmet: the visor is where the chosen emoji lives. */
export const HelmetBadge = ({ emoji, className }: ArtProps & { emoji: string }) => (
    <svg className={base(className)} viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <circle cx="60" cy="56" r="34" stroke={CYAN} strokeWidth="2.5" />
        <path d="M34 84 q26 16 52 0" stroke={CYAN} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M30 96 h60" stroke={VIOLET} strokeWidth="2" strokeLinecap="round" />
        <circle cx="60" cy="56" r="25" stroke={MAGENTA} strokeWidth="1.4" opacity="0.6" />
        <text x="60" y="66" textAnchor="middle" fontSize="28" fill="#e6edf7">{emoji}</text>
        <circle cx="18" cy="30" r="1.6" fill={DIM} />
        <circle cx="103" cy="86" r="1.6" fill={DIM} />
    </svg>
);

/** C2 — an astronaut adrift, tethered, in no hurry. */
export const DriftingAstronaut = ({ className }: ArtProps) => (
    <svg className={base(className)} viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g className="anim-float">
            <circle cx="62" cy="42" r="13" stroke={CYAN} strokeWidth="2.5" />
            <circle cx="62" cy="42" r="8" stroke={MAGENTA} strokeWidth="1.4" opacity="0.7" />
            <rect x="50" y="56" width="24" height="26" rx="8" stroke={CYAN} strokeWidth="2.5" />
            <path d="M50 62 L36 72 M74 62 L88 54" stroke={CYAN} strokeWidth="2.5" strokeLinecap="round" />
            <path d="M54 82 L48 96 M70 82 L76 96" stroke={CYAN} strokeWidth="2.5" strokeLinecap="round" />
            <path d="M88 54 q14 -8 16 -22" stroke={VIOLET} strokeWidth="1.4" strokeDasharray="3 4" />
        </g>
        <circle cx="20" cy="88" r="1.6" fill={DIM} />
        <circle cx="102" cy="100" r="1.4" fill="#e6edf7" />
        <circle cx="14" cy="20" r="2" fill={DIM} />
    </svg>
);

/** C3 — a beacon transmitting your truth upward. */
export const TruthBeacon = ({ className }: ArtProps) => (
    <svg className={base(className)} viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <path d="M48 98 L60 58 L72 98 Z" stroke={TRUTH} strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx="60" cy="52" r="5" fill={TRUTH} />
        <g className="anim-wave">
            <path d="M44 44 a22 22 0 0 1 32 0" stroke={TRUTH} strokeWidth="2" strokeLinecap="round" />
        </g>
        <g className="anim-wave" style={{ animationDelay: '0.8s' }}>
            <path d="M36 36 a32 32 0 0 1 48 0" stroke={TRUTH} strokeWidth="1.6" strokeLinecap="round" />
        </g>
        <g className="anim-wave" style={{ animationDelay: '1.6s' }}>
            <path d="M28 28 a42 42 0 0 1 64 0" stroke={TRUTH} strokeWidth="1.2" strokeLinecap="round" />
        </g>
        <path d="M36 104 h48" stroke={VIOLET} strokeWidth="2" strokeLinecap="round" />
        <circle cx="20" cy="70" r="1.6" fill={DIM} />
        <circle cx="100" cy="80" r="1.6" fill={DIM} />
    </svg>
);

/** C5 — a cloaked ship: the lie travels in disguise. */
export const CloakedShip = ({ className }: ArtProps) => (
    <svg className={base(className)} viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g className="anim-float">
            <path d="M28 66 L60 34 L92 66 L74 60 L60 70 L46 60 Z"
                stroke={MAGENTA} strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M52 76 L60 88 L68 76" stroke={MAGENTA} strokeWidth="2" strokeLinecap="round" className="anim-blink" />
            <path d="M20 74 q20 8 40 6 M100 74 q-14 6 -26 6" stroke={VIOLET} strokeWidth="1.2" strokeDasharray="4 5" opacity="0.7" />
        </g>
        <circle cx="24" cy="28" r="1.6" fill={DIM} />
        <circle cx="98" cy="24" r="2" fill="#e6edf7" />
        <circle cx="104" cy="98" r="1.4" fill={DIM} />
    </svg>
);

/** C4 — three signals, one genuine: the vote. */
export const SignalPicker = ({ className }: ArtProps) => (
    <svg className={base(className)} viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <path d="M24 84 q6 -20 0 -44" stroke={DIM} strokeWidth="2" strokeLinecap="round" />
        <path d="M60 88 q8 -26 0 -56" stroke={TRUTH} strokeWidth="2.5" strokeLinecap="round" className="anim-blink" />
        <path d="M96 84 q-6 -20 0 -44" stroke={DIM} strokeWidth="2" strokeLinecap="round" />
        <circle cx="24" cy="90" r="3" fill={DIM} />
        <circle cx="60" cy="94" r="3.6" fill={TRUTH} />
        <circle cx="96" cy="90" r="3" fill={DIM} />
        <path d="M50 20 L60 10 L70 20" stroke={CYAN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
        <circle cx="16" cy="24" r="1.6" fill={DIM} />
        <circle cx="104" cy="30" r="1.6" fill="#e6edf7" />
    </svg>
);
