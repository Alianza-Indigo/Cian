'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { OptionGroup, type Option } from '@/components/ui/option-group';
import { ToggleField } from '@/components/ui/toggle-field';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { savePreferences } from '@/lib/preferences/actions';
import type { EffectivePreferences } from '@/lib/preferences/types';
import {
  DENSITIES,
  DENSITY_HINTS,
  DENSITY_LABELS,
  DETAIL_LEVELS,
  DETAIL_LEVEL_HINTS,
  DETAIL_LEVEL_LABELS,
  THEMES,
  THEME_LABELS,
  TEXT_SCALE_STEPS,
} from '@/lib/preferences/presentation';

const DENSITY_OPTIONS = DENSITIES.map((value) => ({
  value,
  label: DENSITY_LABELS[value],
  hint: DENSITY_HINTS[value],
})) satisfies Option<(typeof DENSITIES)[number]>[];

const THEME_OPTIONS = THEMES.map((value) => ({
  value,
  label: THEME_LABELS[value],
})) satisfies Option<(typeof THEMES)[number]>[];

const DETAIL_OPTIONS = DETAIL_LEVELS.map((value) => ({
  value,
  label: DETAIL_LEVEL_LABELS[value],
  hint: DETAIL_LEVEL_HINTS[value],
})) satisfies Option<(typeof DETAIL_LEVELS)[number]>[];

const TEXT_SCALE_LABELS: Record<number, string> = {
  85: 'Pequeño',
  100: 'Normal',
  115: 'Grande',
  130: 'Más grande',
  150: 'Máximo',
};

const TEXT_SCALE_OPTIONS = TEXT_SCALE_STEPS.map((step) => ({
  value: String(step),
  label: TEXT_SCALE_LABELS[step] ?? `${step}%`,
  hint: `${step}%`,
}));

type Status = { kind: 'idle' } | { kind: 'saved' } | { kind: 'error'; message: string };

/**
 * Aplica la preferencia al documento de inmediato, antes de que responda el
 * servidor. Quien sube el tamano de letra porque no alcanza a leer no deberia
 * esperar a un viaje de red para verlo.
 */
function applyToDocument(preferences: EffectivePreferences): void {
  const root = document.documentElement;
  root.setAttribute('data-density', preferences.density);
  root.setAttribute('data-reduced-motion', String(preferences.reducedMotion));
  root.setAttribute('data-theme-preference', preferences.theme);
  root.style.setProperty('--cian-text-scale', String(preferences.textScale / 100));

  const resolvedTheme =
    preferences.theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : preferences.theme;

  root.setAttribute('data-theme', resolvedTheme);
}

export function AccessibilityForm({
  initialPreferences,
}: {
  initialPreferences: EffectivePreferences;
}) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [isPending, startTransition] = useTransition();
  const lastSaved = useRef(initialPreferences);

  // El tema "según el sistema" debe seguir los cambios del sistema en vivo.
  useEffect(() => {
    if (preferences.theme !== 'system') return;

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      document.documentElement.setAttribute(
        'data-theme',
        query.matches ? 'dark' : 'light',
      );
    };

    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [preferences.theme]);

  function update(patch: Partial<EffectivePreferences>) {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    applyToDocument(next);
    setStatus({ kind: 'idle' });

    startTransition(async () => {
      const result = await savePreferences(patch);

      if (result.ok) {
        lastSaved.current = result.preferences;
        setPreferences(result.preferences);
        applyToDocument(result.preferences);
        setStatus({ kind: 'saved' });
        return;
      }

      // Si no se pudo guardar, se revierte: la interfaz no debe quedar
      // mostrando un estado que la base de datos no tiene.
      setPreferences(lastSaved.current);
      applyToDocument(lastSaved.current);
      setStatus({ kind: 'error', message: result.error });
    });
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <p
        role="status"
        aria-live="polite"
        className="text-sm text-muted-foreground"
      >
        {isPending
          ? 'Guardando…'
          : status.kind === 'saved'
            ? 'Preferencias guardadas.'
            : status.kind === 'error'
              ? status.message
              : ''}
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Apariencia</CardTitle>
          <CardDescription>
            Elige el tema con el que te sientas mejor. «Según el sistema» sigue
            la configuración de tu teléfono o computadora.
          </CardDescription>
        </CardHeader>
        <OptionGroup
          legend="Tema"
          name="theme"
          value={preferences.theme}
          options={THEME_OPTIONS}
          onChange={(theme) => update({ theme })}
        />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Densidad de la información</CardTitle>
          <CardDescription>
            Cuánto espacio hay entre los elementos y qué tan grandes son los
            botones.
          </CardDescription>
        </CardHeader>
        <OptionGroup
          legend="Densidad"
          name="density"
          value={preferences.density}
          options={DENSITY_OPTIONS}
          onChange={(density) => update({ density })}
        />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tamaño del texto</CardTitle>
          <CardDescription>
            Todo el contenido crece junto, sin que se encimen los elementos.
          </CardDescription>
        </CardHeader>
        <OptionGroup
          legend="Tamaño del texto"
          name="textScale"
          value={String(preferences.textScale)}
          options={TEXT_SCALE_OPTIONS}
          onChange={(value) => update({ textScale: Number(value) })}
        />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Movimiento</CardTitle>
          <CardDescription>
            CIAN no usa animaciones automáticas, parpadeos ni reproducción
            automática. Con esta opción se reducen también las transiciones.
          </CardDescription>
        </CardHeader>
        <ToggleField
          label="Reducir el movimiento"
          hint="Quita las transiciones de la interfaz."
          checked={preferences.reducedMotion}
          onChange={(reducedMotion) => update({ reducedMotion })}
        />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nivel de detalle</CardTitle>
          <CardDescription>
            Qué tan extensas quieres las respuestas de CIAN cuando la
            conversación esté disponible.
          </CardDescription>
        </CardHeader>
        <OptionGroup
          legend="Nivel de detalle"
          name="detailLevel"
          value={preferences.detailLevel}
          options={DETAIL_OPTIONS}
          onChange={(detailLevel) => update({ detailLevel })}
        />
      </Card>
    </div>
  );
}
