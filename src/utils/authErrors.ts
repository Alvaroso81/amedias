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
