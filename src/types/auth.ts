import type { Session, User } from '@supabase/supabase-js'

export type AuthState = {
  session: Session | null
  user: User | null
  loading: boolean
  error: string | null
}

export type UserProfile = {
  id: string
  displayName: string
}
