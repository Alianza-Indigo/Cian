/**
 * Genera los iconos PNG de la PWA a partir de la marca de CIAN.
 *
 * Se escribe el PNG a mano con `node:zlib` en lugar de agregar una
 * dependencia de imagen: las prohibiciones del PRD descartan binarios nativos
 * y la marca es lo bastante simple para dibujarla por pixel.
 *
 * Uso: node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const INDIGO = [0x1b, 0x1f, 0x5a];
const GOLD = [0xc9, 0xa2, 0x27];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filtro "none"
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profundidad de bits
  ihdr[9] = 6; // color RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Devuelve la cobertura de la marca en un punto normalizado (0..1 sobre el
 * area util). Coordenadas centradas: el origen es el centro del dibujo.
 */
function markCoverage(nx, ny) {
  const radius = Math.hypot(nx, ny);
  const angle = Math.atan2(ny, nx);

  // Anillo abierto: se interrumpe hacia la derecha, como una "C".
  const ringRadius = 0.62;
  const ringWidth = 0.19;
  const gapHalfAngle = Math.PI / 5;

  const inRing = Math.abs(radius - ringRadius) <= ringWidth / 2;
  const inGap = Math.abs(angle) < gapHalfAngle;

  if (inRing && !inGap) return 1;

  // Punto central.
  if (radius <= 0.16) return 1;

  return 0;
}

function insideRoundedSquare(x, y, size, radius) {
  const rx = Math.max(radius - x, x - (size - radius), 0);
  const ry = Math.max(radius - y, y - (size - radius), 0);
  return Math.hypot(rx, ry) <= radius;
}

/**
 * @param {number} size lado en pixeles
 * @param {{ rounded?: boolean, contentScale?: number }} options
 *   `contentScale` deja margen para el recorte de los iconos maskable.
 */
function renderIcon(size, { rounded = true, contentScale = 0.68 } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const cornerRadius = size * 0.22;
  const center = size / 2;
  const markRadius = (size * contentScale) / 2;
  const samples = 3;
  const step = 1 / (samples + 1);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let backgroundHits = 0;
      let markHits = 0;

      for (let sy = 1; sy <= samples; sy += 1) {
        for (let sx = 1; sx <= samples; sx += 1) {
          const px = x + sx * step;
          const py = y + sy * step;

          const inBackground = rounded
            ? insideRoundedSquare(px, py, size, cornerRadius)
            : true;

          if (!inBackground) continue;
          backgroundHits += 1;

          const coverage = markCoverage(
            (px - center) / markRadius,
            (py - center) / markRadius,
          );
          if (coverage > 0) markHits += 1;
        }
      }

      const total = samples * samples;
      const alpha = backgroundHits / total;
      const markRatio = backgroundHits === 0 ? 0 : markHits / backgroundHits;

      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        rgba[offset + channel] = Math.round(
          INDIGO[channel] * (1 - markRatio) + GOLD[channel] * markRatio,
        );
      }
      rgba[offset + 3] = Math.round(alpha * 255);
    }
  }

  return encodePng(size, size, rgba);
}

const OUTPUTS = [
  { file: 'icon-192.png', size: 192, options: {} },
  { file: 'icon-512.png', size: 512, options: {} },
  // Maskable: Android recorta hasta el 20% de cada borde, asi que la marca
  // ocupa menos y el fondo llega a la orilla.
  {
    file: 'icon-maskable-512.png',
    size: 512,
    options: { rounded: false, contentScale: 0.5 },
  },
  // iOS aplica su propia mascara: se entrega cuadrado y opaco.
  {
    file: 'apple-touch-icon.png',
    size: 180,
    options: { rounded: false, contentScale: 0.62 },
  },
  { file: 'favicon-32.png', size: 32, options: { contentScale: 0.72 } },
];

mkdirSync(OUTPUT_DIR, { recursive: true });

for (const output of OUTPUTS) {
  const png = renderIcon(output.size, output.options);
  writeFileSync(join(OUTPUT_DIR, output.file), png);
  console.log(`${output.file} — ${output.size}×${output.size} — ${png.length} bytes`);
}
