import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * La marca de CIAN.
 *
 * Es un archivo y no un SVG dibujado en código. Antes era un anillo hecho a
 * mano con `<path>`, y eso ataba la identidad de la organización a lo que
 * alguien pudiera reproducir con dos curvas: cambiarla obligaba a reescribir
 * geometría, y el resultado nunca era exactamente el logotipo real.
 *
 * ## Dos cosas que hubo que arreglar al traerlo
 *
 * **El fondo.** El original venía en RGB con fondo blanco sólido. Puesto tal
 * cual, en tema oscuro habría sido una caja blanca alrededor del logo. Se pasó
 * el blanco a transparente calculando el alfa a partir de la distancia al
 * blanco y desmultiplicando el color, para no dejar fleco en los bordes
 * suavizados.
 *
 * **La forma.** El logotipo es apaisado —más ancho que alto—, y aquí se pedía
 * en clases cuadradas (`size-9`). Forzarlo a un cuadrado lo aplastaba. Por eso
 * el alto lo pone quien lo usa y el ancho sale solo: `h-9 w-auto`, no `size-9`.
 */
export function CianMark({
  className,
  priority = false,
}: {
  className?: string;
  /**
   * Para donde se ve de entrada —la cabecera, el acceso—. Sin esto la marca
   * aparece un instante después que el resto y da un salto.
   */
  priority?: boolean;
}) {
  return (
    <Image
      src="/brand/cian-logo.png"
      alt="CIAN"
      width={512}
      height={359}
      priority={priority}
      className={cn('w-auto shrink-0 object-contain', className)}
    />
  );
}
