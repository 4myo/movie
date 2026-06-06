import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY
const AUTH_STORAGE_KEY = 'movie-browser-auth-v2'

const localStorageAdapter = {
  getItem: (key) => {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(key)
  },
  setItem: (key, value) => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(key, value)
  },
  removeItem: (key) => {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(key)
  }
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: localStorageAdapter,
    storageKey: AUTH_STORAGE_KEY
  }
})
