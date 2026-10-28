import type { ElementType, ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  /** Sin padding interno: para listas de filas que llegan hasta el borde. */
  flush?: boolean
  as?: ElementType
  className?: string
}

export default function Card({ children, flush = false, as: Tag = 'div', className }: CardProps) {
  const clases = ['card', flush ? 'card--flush' : '', className ?? ''].filter(Boolean).join(' ')
  return <Tag className={clases}>{children}</Tag>
}
