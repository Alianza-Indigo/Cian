'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Lectura por voz de una respuesta.
 *
 * Usa `SpeechSynthesis`, que vive en el navegador: no sale nada del
 * dispositivo y no cuesta nada.
 *
 * Criterio de aceptación: «respeta la velocidad configurada y se puede
 * detener a media frase». Lo segundo importa más de lo que parece — quien
 * activa la lectura por error necesita cortarla ya, no esperar a que termine
 * el párrafo.
 *
 * Nunca arranca sola: la reproducción automática está prohibida (regla 3.7).
 */
export function ReadAloud({
  text,
  rate,
  label,
}: {
  text: string;
  /** Velocidad guardada en las preferencias, de 0.5 a 2. */
  rate: number;
  label: string;
}) {
  const [state, setState] = useState<'idle' | 'speaking' | 'paused'>('idle');
  const [supported, setSupported] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    setSupported(
      typeof window !== 'undefined' && 'speechSynthesis' in window,
    );
  }, []);

  // Salir de la pantalla con la voz hablando dejaría a alguien escuchando un
  // texto que ya no está a la vista.
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function start() {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-MX';
    utterance.rate = Math.min(2, Math.max(0.5, rate));
    utterance.onend = () => setState('idle');
    utterance.onerror = () => setState('idle');

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setState('speaking');
  }

  function toggle() {
    if (state === 'speaking') {
      window.speechSynthesis.pause();
      setState('paused');
      return;
    }
    if (state === 'paused') {
      window.speechSynthesis.resume();
      setState('speaking');
      return;
    }
    start();
  }

  function stop() {
    // `cancel` corta de inmediato, aunque esté a mitad de una palabra.
    window.speechSynthesis.cancel();
    setState('idle');
  }

  if (!supported || text.trim().length === 0) return null;

  return (
    <div className="mt-2 flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={toggle}
        aria-label={
          state === 'speaking'
            ? `Pausar la lectura de ${label}`
            : state === 'paused'
              ? `Continuar la lectura de ${label}`
              : `Escuchar ${label}`
        }
      >
        {state === 'speaking' ? (
          <Pause aria-hidden="true" />
        ) : state === 'paused' ? (
          <Play aria-hidden="true" />
        ) : (
          <Volume2 aria-hidden="true" />
        )}
        {state === 'idle' ? 'Escuchar' : state === 'paused' ? 'Continuar' : 'Pausar'}
      </Button>

      {state !== 'idle' ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={stop}
          aria-label={`Detener la lectura de ${label}`}
        >
          <Square aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
