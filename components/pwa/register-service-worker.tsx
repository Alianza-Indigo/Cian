'use client';

import { useEffect } from 'react';

/**
 * Registro del service worker.
 *
 * En Fase 0 el service worker solo sirve el cascaron sin conexion y hace que
 * la aplicacion sea instalable. No cachea datos: la verdad vive en Postgres y
 * servir datos viejos de salud seria peor que no servir nada.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Que falle el registro no debe romper la aplicacion: solo se pierde
        // la instalacion y el modo sin conexion.
      });
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
      return () => window.removeEventListener('load', register);
    }

    return undefined;
  }, []);

  return null;
}
