'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Grupo de opciones excluyentes construido sobre <fieldset> + <input radio>.
 *
 * Se eligio el radio nativo a proposito: las flechas del teclado, el anuncio
 * "opcion 2 de 3" en lectores de pantalla y el soporte de navegadores viejos
 * salen gratis y no dependen de que nuestro JavaScript se cargue.
 */
export type Option<T extends string> = {
  value: T;
  label: string;
  hint?: string;
};

type OptionGroupProps<T extends string> = {
  legend: string;
  description?: string;
  name: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
};

export function OptionGroup<T extends string>({
  legend,
  description,
  name,
  value,
  options,
  onChange,
  disabled = false,
  className,
}: OptionGroupProps<T>) {
  const descriptionId = React.useId();

  return (
    <fieldset
      className={cn('min-w-0', className)}
      disabled={disabled}
      aria-describedby={description ? descriptionId : undefined}
    >
      <legend className="text-sm font-medium text-foreground">{legend}</legend>
      {description ? (
        <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                checked
                  ? 'border-primary bg-primary-soft'
                  : 'border-border bg-card hover:bg-muted',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{option.label}</span>
                {option.hint ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {option.hint}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
