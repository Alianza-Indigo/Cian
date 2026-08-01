import { cn } from '@/lib/utils';

/**
 * Marca de CIAN: anillo abierto en indigo con acento en oro.
 * El hueco del anillo representa el espacio que la plataforma deja para la
 * persona; se mantiene simple a proposito, sin degradados ni ruido visual.
 */
export function CianMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label="CIAN"
      className={cn('shrink-0', className)}
    >
      <rect width="64" height="64" rx="14" className="fill-primary" />
      <path
        d="M44 20a17 17 0 1 0 0 24"
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        className="stroke-accent"
      />
      <circle cx="32" cy="32" r="4" className="fill-accent" />
    </svg>
  );
}
