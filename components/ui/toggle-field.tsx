'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Interruptor sobre <input type="checkbox">. El estado lo comunica el propio
 * elemento nativo; el dibujo es puramente decorativo y va con aria-hidden.
 */
type ToggleFieldProps = {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
};

export function ToggleField({
  label,
  hint,
  checked,
  onChange,
  disabled = false,
  className,
}: ToggleFieldProps) {
  const hintId = React.useId();

  return (
    <label
      className={cn(
        'flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-3',
        'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-muted',
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint ? (
          <span id={hintId} className="mt-0.5 block text-xs text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </span>

      <span className="relative inline-flex shrink-0 items-center">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          aria-describedby={hint ? hintId : undefined}
          onChange={(event) => onChange(event.currentTarget.checked)}
          className="peer absolute inset-0 size-full cursor-inherit opacity-0"
        />
        <span
          aria-hidden="true"
          className={cn(
            'block h-6 w-11 rounded-full border transition-colors',
            checked ? 'border-primary bg-primary' : 'border-border bg-muted',
          )}
        >
          <span
            className={cn(
              'mt-0.5 block size-5 rounded-full bg-card shadow-sm transition-transform',
              checked ? 'translate-x-5.5' : 'translate-x-0.5',
            )}
          />
        </span>
      </span>
    </label>
  );
}
