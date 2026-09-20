import { memo } from 'react';
import { cn } from '../lib/cn';

/**
 * Rosace guillochée, à la manière des motifs de sécurité des billets et des titres.
 * Chaque bande superpose des anneaux sinusoïdaux légèrement décalés : leur moiré
 * produit le tressage caractéristique.
 */

interface Band {
  radius: number;
  amplitude: number;
  petals: number;
  copies: number;
}

const BANDS: Band[] = [
  { radius: 152, amplitude: 12, petals: 40, copies: 7 },
  { radius: 116, amplitude: 20, petals: 20, copies: 10 },
  { radius: 74, amplitude: 17, petals: 13, copies: 8 },
  { radius: 34, amplitude: 11, petals: 8, copies: 6 },
];

function ring(band: Band, copy: number): string {
  const steps = band.petals * 12;
  const shift = (copy / band.copies) * ((Math.PI * 2) / band.petals);
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    const rho = band.radius + band.amplitude * Math.sin(band.petals * theta);
    const x = rho * Math.cos(theta + shift);
    const y = rho * Math.sin(theta + shift);
    d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${d}Z`;
}

const PATHS = BANDS.map((band) => Array.from({ length: band.copies }, (_, copy) => ring(band, copy)));

export const Guilloche = memo(function Guilloche({ className }: { className?: string }) {
  return (
    <svg viewBox="-170 -170 340 340" aria-hidden className={cn('guilloche', className)} fill="none">
      {PATHS.map((band, b) => (
        <g key={b} style={{ animationDelay: `${b * 140}ms` }} className="guilloche-band">
          {band.map((d, i) => (
            <path key={i} d={d} pathLength={1} strokeWidth={b === 0 ? 0.55 : 0.7} />
          ))}
        </g>
      ))}
      <circle r={168} strokeWidth={0.6} className="guilloche-frame" />
      <circle r={164} strokeWidth={0.4} className="guilloche-frame" />
    </svg>
  );
});

/** Marque de l'application : rosace simple, lisible en petit. */
export function RosetteMark({ className }: { className?: string }) {
  return (
    <svg viewBox="-24 -24 48 48" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth={1.6}>
      {[0, 30, 60, 90, 120, 150].map((a) => (
        <ellipse key={a} rx={19} ry={6.8} transform={`rotate(${a})`} />
      ))}
      <circle r={3.6} fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span className="flex size-8 items-center justify-center rounded-[9px] bg-vault text-gilt shadow-sm">
        <RosetteMark className="size-6" />
      </span>
      <span className="display text-[19px] leading-none text-ink">Pécule</span>
    </span>
  );
}
