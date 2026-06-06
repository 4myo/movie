import { supabase } from '../supabaseClient.js'
import { LEGAL_DOCUMENT_VERSION } from './legal.js'

const FAVORITES_TABLE = 'favorite_movies'
const RECENTLY_WATCHED_TABLE = 'recently_watched'
const getStoredMediaType = (movie) => (movie?.media_type === 'tv' ? 'tv' : 'movie')
const getStoredMovieId = (movie) => {
  const movieId = Number(movie?.id)

  if (!Number.isSafeInteger(movieId) || movieId <= 0) {
    throw new Error('Invalid title id')
  }

  return movieId
}
const normalizeEmail = (email = '') => email.trim().toLowerCase()
const sanitizeDisplayName = (name = '') => name.trim().replace(/\s+/g, ' ').slice(0, 80)

const requireVerifiedUser = async (expectedUserId) => {
  const { data, error } = await supabase.auth.getUser()

  if (error || !data?.user?.id) {
    throw new Error(error?.message || 'You must be logged in')
  }

  if (expectedUserId && data.user.id !== expectedUserId) {
    throw new Error('Session user mismatch. Please log in again.')
  }

  return data.user
}

const clearLocalSessionArtifacts = () => {
  if (typeof window === 'undefined') return

  try {
    window.sessionStorage.removeItem('movie-browser-auth-v2')
    window.localStorage.removeItem('movie-browser-auth')
    window.localStorage.removeItem('movie-browser-auth-v2')
  } catch {
    // Storage can be unavailable in privacy modes; Supabase signOut still invalidates the session.
  }
}

export const authApi = {
  me: async () => {
    const { data, error } = await supabase.auth.getUser()

    if (error) {
      throw new Error(error.message)
    }

    return { user: data.user }
  },

  signup: async ({ name, email, password, legalAccepted, legalVersion }) => {
    const safeName = sanitizeDisplayName(name)
    const safeEmail = normalizeEmail(email)

    if (!legalAccepted || legalVersion !== LEGAL_DOCUMENT_VERSION) {
      throw new Error('You must accept the current Terms of Service and Privacy Policy.')
    }

    const acceptedAt = new Date().toISOString()
    const { data, error } = await supabase.auth.signUp({
      email: safeEmail,
      password,
      options: {
        data: {
          name: safeName,
          legal_terms_accepted: true,
          legal_terms_accepted_at: acceptedAt,
          legal_terms_version: LEGAL_DOCUMENT_VERSION,
          privacy_policy_accepted: true,
          privacy_policy_accepted_at: acceptedAt,
          privacy_policy_version: LEGAL_DOCUMENT_VERSION,
          app_name: 'Movieslo'
        }
      }
    })

    if (error) {
      throw new Error(error.message)
    }

    return { user: data.user }
  },

  login: async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password
    })

    if (error) {
      throw new Error(error.message)
    }

    const verifiedUser = await requireVerifiedUser(data.user?.id)
    return { user: verifiedUser }
  },

  logout: async () => {
    const { error } = await supabase.auth.signOut()

    if (error) {
      throw new Error(error.message)
    }

    clearLocalSessionArtifacts()
    return { success: true }
  },

  deleteAccount: async () => {
    await requireVerifiedUser()

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
    const verifiedUser = await requireVerifiedUser(userId)
    const { data, error } = await supabase
      .from(FAVORITES_TABLE)
      .select('movie_data')
      .eq('user_id', verifiedUser.id)
      .order('updated_at', { ascending: false })

    if (error) {
      throw new Error(error.message)
    }

    return { favorites: (data || []).map((entry) => entry.movie_data) }
  },

  toggleFavorite: async (userId, movie) => {
    const verifiedUser = await requireVerifiedUser(userId)
    const mediaType = getStoredMediaType(movie)
    const movieId = getStoredMovieId(movie)

    const { data: existing, error: existingError } = await supabase
      .from(FAVORITES_TABLE)
      .select('id')
      .eq('user_id', verifiedUser.id)
      .eq('movie_id', movieId)
      .eq('media_type', mediaType)
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
          user_id: verifiedUser.id,
          movie_id: movieId,
          media_type: mediaType,
          movie_data: movie
        })

    if (error) {
      throw new Error(error.message)
    }

    return { action: 'added' }
  },

  getRecentlyWatched: async (userId) => {
    const verifiedUser = await requireVerifiedUser(userId)
    const { data, error } = await supabase
      .from(RECENTLY_WATCHED_TABLE)
      .select('movie_data, watched_at')
      .eq('user_id', verifiedUser.id)
      .order('watched_at', { ascending: false })
      .limit(12)

    if (error) {
      throw new Error(error.message)
    }

    return {
      items: (data || []).map((entry) => ({
        ...entry.movie_data,
        watched_at: entry.movie_data?.watched_at || entry.watched_at
      }))
    }
  },

  trackRecentlyWatched: async (userId, movie, progress = {}) => {
    const verifiedUser = await requireVerifiedUser(userId)
    const mediaType = getStoredMediaType(movie)
    const movieId = getStoredMovieId(movie)
    const { data: existing, error: existingError } = await supabase
      .from(RECENTLY_WATCHED_TABLE)
      .select('id')
      .eq('user_id', verifiedUser.id)
      .eq('movie_id', movieId)
      .eq('media_type', mediaType)
      .maybeSingle()

    if (existingError) {
      throw new Error(existingError.message)
    }

    const watchedAt = new Date().toISOString()
    const movieData = {
      ...movie,
      ...progress,
      watched_at: watchedAt
    }
    const payload = {
      movie_data: movieData,
      watched_at: watchedAt
    }

    const { error } = existing
      ? await supabase
          .from(RECENTLY_WATCHED_TABLE)
          .update(payload)
          .eq('id', existing.id)
      : await supabase
          .from(RECENTLY_WATCHED_TABLE)
          .insert({
            user_id: verifiedUser.id,
            movie_id: movieId,
            media_type: mediaType,
            ...payload
          })

    if (error) {
      throw new Error(error.message)
    }

    return { success: true }
  },

  removeRecentlyWatched: async (userId, movie) => {
    const verifiedUser = await requireVerifiedUser(userId)
    const mediaType = getStoredMediaType(movie)
    const movieId = getStoredMovieId(movie)
    const { error } = await supabase
      .from(RECENTLY_WATCHED_TABLE)
      .delete()
      .eq('user_id', verifiedUser.id)
      .eq('movie_id', movieId)
      .eq('media_type', mediaType)

    if (error) {
      throw new Error(error.message)
    }

    return { success: true }
  },

  clearRecentlyWatched: async (userId) => {
    const verifiedUser = await requireVerifiedUser(userId)
    const { error } = await supabase
      .from(RECENTLY_WATCHED_TABLE)
      .delete()
      .eq('user_id', verifiedUser.id)

    if (error) {
      throw new Error(error.message)
    }

    return { success: true }
  }
}
