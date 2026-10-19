import { useEffect, useState } from 'react'
import { Select } from './Field'

/** Options are filled after mount so server and browser ICU data never disagree during hydration. */
export function TimezoneSelect({ id, value, onChange, disabled }: { id: string; value: string; onChange: (tz: string) => void; disabled?: boolean }) {
  const [zones, setZones] = useState<string[]>([])
  useEffect(() => {
    try {
      setZones(Intl.supportedValuesOf('timeZone'))
    } catch {
      setZones([])
    }
  }, [])
  const list = zones.includes(value) || !value ? zones : [value, ...zones]
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {list.length === 0 && <option value={value}>{value}</option>}
      {list.map((z) => (
        <option key={z} value={z}>
          {z.replaceAll('_', ' ')}
        </option>
      ))}
    </Select>
  )
}
