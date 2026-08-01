import type { Metadata, Viewport } from 'next';
import './globals.css';
import { loadPresentationPreferences } from '@/lib/preferences/server';
import {
  THEME_BOOTSTRAP_SCRIPT,
  textScaleStyle,
  toPresentationAttributes,
} from '@/lib/preferences/presentation';
import { RegisterServiceWorker } from '@/components/pwa/register-service-worker';

export const metadata: Metadata = {
  title: {
    default: 'CIAN — Centro Integral de Apoyo a la Neurodivergencia',
    template: '%s · CIAN',
  },
  description:
    'Herramientas, recursos y acompañamiento para personas neurodivergentes, sus familias, cuidadores, docentes y profesionales.',
  applicationName: 'CIAN',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'CIAN',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Nunca bloquear el zoom: es una ayuda de accesibilidad, no un detalle.
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8f5' },
    { media: '(prefers-color-scheme: dark)', color: '#16130f' },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const preferences = await loadPresentationPreferences();
  const attributes = toPresentationAttributes(preferences);

  return (
    <html lang="es-MX" style={textScaleStyle(preferences.textScale)} {...attributes}>
      <head>
        {/*
          Resuelve el tema "según el sistema" antes del primer pintado.
          Es la unica via razonable de evitar el destello de tema equivocado,
          que para una persona con sensibilidad a la luz no es cosmetico.
        */}
        <script
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
        />
      </head>
      <body className="antialiased">
        <a href="#contenido-principal" className="cian-skip-link">
          Saltar al contenido principal
        </a>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
