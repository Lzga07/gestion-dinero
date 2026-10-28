import { useEffect, useState } from 'react'
import { formatPesos, parsePesos, type Centavos } from '../../domain/money'
import Field from './Field'

interface MoneyInputProps {
  value: Centavos | null
  onChange: (valor: Centavos | null) => void
  label: string
  error?: string | null
  hint?: string
  placeholder?: string
}

export const ERROR_MONTO = 'Monto inválido. Usá coma para los decimales (ej: 1.234,50)'

/**
 * Campo de pesos. Mientras se tipea avisa `onChange` con los centavos (o null si está vacío o es
 * inválido); al salir del campo reformatea con `formatPesos` y marca el texto inválido.
 */
export default function MoneyInput({ value, onChange, label, error, hint, placeholder }: MoneyInputProps) {
  const [texto, setTexto] = useState(() => (value === null ? '' : formatPesos(value)))
  const [tocado, setTocado] = useState(false)

  // Si el padre cambia el valor por su cuenta, el texto lo sigue (salvo que ya lo represente).
  useEffect(() => {
    if (parsePesos(texto) === value) return
    if (value === null && texto.trim() !== '') return // texto inválido: el padre solo ve null
    setTexto(value === null ? '' : formatPesos(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const invalido = tocado && texto.trim() !== '' && parsePesos(texto) === null

  return (
    <Field label={label} hint={hint} error={invalido ? ERROR_MONTO : error}>
      {(control) => (
        <input
          {...control}
          className="input input--money"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder={placeholder ?? '$ 0'}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            onChange(parsePesos(e.target.value))
          }}
          onBlur={() => {
            setTocado(true)
            const c = parsePesos(texto)
            if (c !== null) setTexto(formatPesos(c))
          }}
        />
      )}
    </Field>
  )
}
