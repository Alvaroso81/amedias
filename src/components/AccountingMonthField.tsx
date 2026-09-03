import {
  changeAccountingMonthPart,
  formatAccountingMonth,
} from '../utils/accountingMonth'

const monthNames = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(new Date(2020, index, 1)),
)

const accountingYears = Array.from({ length: 301 }, (_, index) => 1900 + index)

type AccountingMonthFieldProps = {
  id: string
  value: string
  automaticValue: string
  disabled?: boolean
  labelledBy?: string
  onChange: (accountingMonth: string) => void
  onUseAutomatic: () => void
}

export function AccountingMonthField({
  id,
  value,
  automaticValue,
  disabled = false,
  labelledBy,
  onChange,
  onUseAutomatic,
}: AccountingMonthFieldProps) {
  const selectedYear = Number(value.slice(0, 4))
  const selectedMonth = Number(value.slice(5, 7))
  const isManual = value !== automaticValue

  return (
    <div className="accounting-month-field">
      <div className="accounting-month-controls" aria-labelledby={labelledBy}>
        <select
          id={`${id}-month`}
          value={selectedMonth}
          disabled={disabled}
          aria-label="Mes contable"
          onChange={(event) =>
            onChange(changeAccountingMonthPart(value, 'month', Number(event.target.value)))
          }
        >
          {monthNames.map((month, index) => (
            <option value={index + 1} key={month}>
              {month.charAt(0).toLocaleUpperCase('es-ES')}{month.slice(1)}
            </option>
          ))}
        </select>
        <select
          id={`${id}-year`}
          value={selectedYear}
          disabled={disabled}
          aria-label="Año contable"
          onChange={(event) =>
            onChange(changeAccountingMonthPart(value, 'year', Number(event.target.value)))
          }
        >
          {accountingYears.map((year) => (
            <option value={year} key={year}>{year}</option>
          ))}
        </select>
      </div>
      <span className="accounting-month-value">{formatAccountingMonth(value)}</span>
      {isManual && (
        <button
          className="accounting-month-auto"
          type="button"
          disabled={disabled}
          onClick={onUseAutomatic}
        >
          Usar automático ({formatAccountingMonth(automaticValue)})
        </button>
      )}
    </div>
  )
}
