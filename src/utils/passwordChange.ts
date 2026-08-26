export type PasswordChangeField =
  | 'currentPassword'
  | 'newPassword'
  | 'passwordConfirmation'

export type PasswordChangeErrors = Partial<Record<PasswordChangeField, string>>

type PasswordChangeValues = {
  currentPassword: string
  newPassword: string
  passwordConfirmation: string
}

export function validatePasswordChange({
  currentPassword,
  newPassword,
  passwordConfirmation,
}: PasswordChangeValues) {
  const errors: PasswordChangeErrors = {}

  if (!currentPassword) {
    errors.currentPassword = 'Introduce tu contraseña actual'
  }

  if (!newPassword) {
    errors.newPassword = 'Introduce una nueva contraseña'
  } else if (newPassword.length < 6) {
    errors.newPassword = 'La nueva contraseña debe tener al menos 6 caracteres'
  } else if (currentPassword && newPassword === currentPassword) {
    errors.newPassword = 'La nueva contraseña debe ser diferente de la actual'
  }

  if (!passwordConfirmation) {
    errors.passwordConfirmation = 'Repite la nueva contraseña'
  } else if (passwordConfirmation !== newPassword) {
    errors.passwordConfirmation = 'Las nuevas contraseñas no coinciden'
  }

  return errors
}
