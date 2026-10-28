import { useId } from 'react'

interface Opcion<T extends string> {
  value: T
  label: string
}

interface SegmentedProps<T extends string> {
  legend: string
  options: Opcion<T>[]
  value: T
  onChange: (valor: T) => void
  disabled?: boolean
}

/** Selector de una opción entre pocas (radios nativos con aspecto de segmentos). */
export default function Segmented<T extends string>({
  legend,
  options,
  value,
  onChange,
  disabled = false,
}: SegmentedProps<T>) {
  const nombre = useId()
  return (
    <fieldset className="field segmented-field">
      <legend className="field__label">{legend}</legend>
      <div className="segmented">
        {options.map((o) => (
          <label key={o.value} className="segmented__option">
            <input
              className="segmented__input"
              type="radio"
              name={nombre}
              value={o.value}
              checked={o.value === value}
              disabled={disabled}
              onChange={() => onChange(o.value)}
            />
            <span className="segmented__text">{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
