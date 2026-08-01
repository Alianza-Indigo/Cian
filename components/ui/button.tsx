import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Boton sobre <button> nativo. No usamos primitivas de terceros: para esta
 * plataforma el comportamiento nativo de teclado y de lector de pantalla es
 * una garantia, no un detalle.
 *
 * El alto minimo sigue la densidad elegida (--cian-control-height), asi que
 * los objetivos tactiles crecen cuando la persona pide una interfaz amplia.
 */
const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium',
    'transition-colors disabled:pointer-events-none disabled:opacity-60',
    'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring',
    '[&_svg]:size-4 [&_svg]:shrink-0',
  ),
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        accent: 'bg-accent text-accent-foreground hover:bg-accent/90',
        outline:
          'border border-border bg-card text-foreground hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
        danger: 'bg-danger text-danger-foreground hover:bg-danger/90',
      },
      size: {
        default: 'px-4 py-2',
        sm: 'px-3 py-1.5 text-sm',
        lg: 'px-6 py-3 text-base',
        icon: 'aspect-square p-2',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

export type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants>;

export function Button({
  className,
  variant,
  size,
  style,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      style={{ minHeight: 'var(--cian-control-height)', ...style }}
      {...props}
    />
  );
}

export { buttonVariants };
