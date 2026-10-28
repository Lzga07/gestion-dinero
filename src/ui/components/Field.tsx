import { useId, type ReactNode } from 'react'

/** Atributos que el control hijo debe aplicar para quedar asociado a su etiqueta, ayuda y error. */
export interface FieldControlProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
}

interface FieldProps {
  label: string
  hint?: string
  error?: string | null
  /** Recibe los atributos de accesibilidad del control. */
  children: (control: FieldControlProps) => ReactNode
}

/** Etiqueta visible + control + ayuda + error en línea. */
export default function Field({ label, hint, error, children }: FieldProps) {
  const base = useId()
  const id = `${base}-control`
  const hintId = `${base}-hint`
  const errorId = `${base}-error`
  const describedBy = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ')
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children({
        id,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : undefined,
      })}
      {hint && (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field__error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
