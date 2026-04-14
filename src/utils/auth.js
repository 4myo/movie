import { supabase } from '../supabaseClient.js'

const FAVORITES_TABLE = 'favorite_movies'
const RECENTLY_WATCHED_TABLE = 'recently_watched'

export const authApi = {
  me: async () => {
    const { data, error } = await supabase.auth.getUser()

    if (error) {
      throw new Error(error.message)
    }

    return { user: data.user }
  },

  signup: async ({ name, email, password }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name
        }
      }
    })

    if (error) {
      throw new Error(error.message)
    }

    return { user: data.user }
  },

  login: async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      throw new Error(error.message)
    }

    return { user: data.user }
  },

  logout: async () => {
    const { error } = await supabase.auth.signOut()

    if (error) {
      throw new Error(error.message)
    }

    return { success: true }
  },

  deleteAccount: async () => {
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession()

    if (sessionError) {
      throw new Error(sessionError.message)
    }

    if (!session?.access_token) {
      throw new Error('You must be logged in to delete your account')
    }

    const { error } = await supabase.functions.invoke('delete-account', {
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    })

    if (error) {
      throw new Error(error.message)
    }

    return { success: true }
  },

  getFavorites: async (userId) => {
    const { data, error } = await supabase
      .from(FAVORITES_TABLE)
      .select('movie_data')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    if (error) {
      throw new Error(error.message)
    }

    return { favorites: (data || []).map((entry) => entry.movie_data) }
  },

  toggleFavorite: async (userId, movie) => {
    const { data: existing, error: existingError } = await supabase
      .from(FAVORITES_TABLE)
      .select('id')
      .eq('user_id', userId)
      .eq('movie_id', movie.id)
      .maybeSingle()

    if (existingError) {
      throw new Error(existingError.message)
    }

    if (existing) {
      const { error } = await supabase
        .from(FAVORITES_TABLE)
        .delete()
        .eq('id', existing.id)

      if (error) {
        throw new Error(error.message)
      }

      return { action: 'removed' }
    }

    const { error } = await supabase
      .from(FAVORITES_TABLE)
      .insert({
        user_id: userId,
        movie_id: movie.id,
        media_type: movie.media_type || 'movie',
        movie_data: movie
      })

    if (error) {
      throw new Error(error.message)
    }

    return { action: 'added' }
  },

  getRecentlyWatched: async (userId) => {
    const { data, error } = await supabase
      .from(RECENTLY_WATCHED_TABLE)
      .select('movie_data')
      .eq('user_id', userId)
      .order('watched_at', { ascending: false })
      .limit(12)

    if (error) {
      throw new Error(error.message)
    }

    return { items: (data || []).map((entry) => entry.movie_data) }
  },

  trackRecentlyWatched: async (userId, movie) => {
    const { error } = await supabase
      .from(RECENTLY_WATCHED_TABLE)
      .upsert({
        user_id: userId,
        movie_id: movie.id,
        media_type: movie.media_type || 'movie',
        movie_data: movie,
        watched_at: new Date().toISOString()
      }, { onConflict: 'user_id,movie_id' })

    if (error) {
      throw new Error(error.message)
    }

    return { success: true }
  }
}
