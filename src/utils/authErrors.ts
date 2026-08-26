import type { AuthError } from '@supabase/supabase-js'

export function getAuthErrorMessage(error: AuthError) {
  const message = error.message.toLowerCase()

  if (message.includes('invalid login credentials')) {
    return 'El correo o la contraseña no son correctos.'
  }

  if (message.includes('email not confirmed')) {
    return 'Confirma tu correo antes de iniciar sesión.'
  }

  if (message.includes('user already registered')) {
    return 'Ya existe una cuenta con este correo.'
  }

  if (message.includes('password') && (message.includes('characters') || message.includes('weak'))) {
    return 'La contraseña no cumple los requisitos de seguridad.'
  }

  if (message.includes('rate limit') || error.status === 429) {
    return 'Has realizado demasiados intentos. Espera un momento y vuelve a probar.'
  }

  if (message.includes('network') || message.includes('fetch')) {
    return 'No hemos podido conectar. Comprueba tu conexión e inténtalo de nuevo.'
  }

  return 'No hemos podido completar la operación. Inténtalo de nuevo.'
}

export function getPasswordChangeErrorMessage(error: AuthError) {
  const message = error.message.toLowerCase()

  if (
    error.code === 'invalid_credentials' ||
    error.code === 'reauthentication_not_valid' ||
    (message.includes('current password') &&
      (message.includes('invalid') ||
        message.includes('incorrect') ||
        message.includes('not correct')))
  ) {
    return 'La contraseña actual no es correcta.'
  }

  if (
    error.code === 'weak_password' ||
    (message.includes('password') &&
      (message.includes('characters') ||
        message.includes('weak') ||
        message.includes('security')))
  ) {
    return 'La nueva contraseña no cumple los requisitos de seguridad.'
  }

  if (error.code === 'same_password') {
    return 'La nueva contraseña debe ser diferente de la actual.'
  }

  if (error.code === 'reauthentication_needed') {
    return 'Por seguridad, vuelve a iniciar sesión antes de cambiar la contraseña.'
  }

  if (message.includes('rate limit') || error.status === 429) {
    return 'Has realizado demasiados intentos. Espera un momento y vuelve a probar.'
  }

  if (message.includes('network') || message.includes('fetch')) {
    return 'No hemos podido conectar. Comprueba tu conexión e inténtalo de nuevo.'
  }

  return 'No hemos podido cambiar la contraseña. Inténtalo de nuevo.'
}
