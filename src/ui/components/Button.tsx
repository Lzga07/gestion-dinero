import type { ComponentProps } from 'react'

interface ButtonProps extends ComponentProps<'button'> {
  variante?: 'primario' | 'secundario' | 'peligro' | 'texto'
  /** Ocupa todo el ancho disponible. */
  block?: boolean
}

export default function Button({
  variante = 'primario',
  block = false,
  type = 'button',
  className,
  ...resto
}: ButtonProps) {
  const clases = ['btn', `btn--${variante}`, block ? 'btn--block' : '', className ?? '']
    .filter(Boolean)
    .join(' ')
  return <button type={type} className={clases} {...resto} />
}
