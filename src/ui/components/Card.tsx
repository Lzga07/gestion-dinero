import type { ElementType, ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  /** Sin padding interno: para listas de filas que llegan hasta el borde. */
  flush?: boolean
  as?: ElementType
  className?: string
  'aria-label'?: string
}

export default function Card({ children, flush = false, as: Tag = 'div', className, 'aria-label': ariaLabel }: CardProps) {
  const clases = ['card', flush ? 'card--flush' : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <Tag className={clases} aria-label={ariaLabel}>
      {children}
    </Tag>
  )
}
