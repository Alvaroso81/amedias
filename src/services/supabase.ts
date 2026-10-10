import { createClient } from '@supabase/supabase-js'
import { capturePasswordRecovery } from '../utils/passwordRecovery'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing Supabase environment variables')
}

export const initialPasswordRecovery = capturePasswordRecovery()

export const supabase = createClient(supabaseUrl, supabasePublishableKey)
