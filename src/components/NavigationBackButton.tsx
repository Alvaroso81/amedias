import { useContext } from 'react'
import { NavigationContext } from '../navigation/useNavigation'
import { pageLabels } from '../types/navigation'

type Props = { onBack?: () => void; disabled?: boolean; className?: string }
export function NavigationBackButton({ onBack, disabled, className = 'back-button contextual-back-button' }: Props) {
  const context = useContext(NavigationContext)
  const previous = context?.navigation.previous()
  if (context && !previous) return null
  const label = previous ? pageLabels[previous.page] : 'Atrás'
  return <button className={className} type="button" disabled={disabled}
    onClick={context ? context.navigation.goBack : onBack} aria-label={`Volver a ${label}`}>
    <span aria-hidden="true">←</span> <span>{label}</span>
  </button>
}
