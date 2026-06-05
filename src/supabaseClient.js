import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY
const AUTH_STORAGE_KEY = 'movie-browser-auth-v2'

const sessionStorageAdapter = {
  getItem: (key) => {
    if (typeof window === 'undefined') return null
    return window.sessionStorage.getItem(key)
  },
  setItem: (key, value) => {
    if (typeof window === 'undefined') return
    window.sessionStorage.setItem(key, value)
  },
  removeItem: (key) => {
    if (typeof window === 'undefined') return
    window.sessionStorage.removeItem(key)
  }
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: sessionStorageAdapter,
    storageKey: AUTH_STORAGE_KEY
  }
})
