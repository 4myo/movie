import { supabase } from '../supabaseClient.js'
import { LEGAL_DOCUMENT_VERSION } from './legal.js'

const FAVORITES_TABLE = 'favorite_movies'
const RECENTLY_WATCHED_TABLE = 'recently_watched'
const WATCHLIST_TABLE = 'watchlist_movies'
const TRUSTED_DEVICE_STORAGE_KEY = 'movieslo-trusted-device-v1'
const TRUSTED_DEVICE_DURATION_MS = 30 * 24 * 60 * 60 * 1000
const TASTE_PROFILE_METADATA_KEY = 'taste_profile'
const TASTE_PROFILE_UPDATED_AT_KEY = 'taste_profile_updated_at'
const MAX_IGNORED_TITLE_KEYS = 1000
const MAX_PREFERRED_PEOPLE = 12
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
const sanitizeStringArray = (values = [], limit = 12) =>
  Array.isArray(values)
    ? [...new Set(values.map((value) => String(value).trim().toLowerCase()).filter(Boolean))].slice(0, limit)
    : []
const sanitizeNumberArray = (values = [], limit = 16) =>
  Array.isArray(values)
    ? [...new Set(values.map((value) => Number(value)).filter((value) => Number.isSafeInteger(value) && value > 0))].slice(0, limit)
    : []
const sanitizePreferredPeople = (people = []) => {
  if (!Array.isArray(people)) return []

  const seenPersonIds = new Set()
  return people
    .map((person) => ({
      id: Number(person?.id),
      name: String(person?.name || '').trim().slice(0, 80),
      profile_path: person?.profile_path ? String(person.profile_path).slice(0, 120) : '',
      known_for_department: String(person?.known_for_department || '').trim().slice(0, 40),
      searched_at: person?.searched_at || new Date().toISOString()
    }))
    .filter((person) => {
      if (!Number.isSafeInteger(person.id) || person.id <= 0 || !person.name || seenPersonIds.has(person.id)) return false
      seenPersonIds.add(person.id)
      return true
    })
    .slice(0, MAX_PREFERRED_PEOPLE)
}
const normalizeTasteProfile = (profile = {}) => {
  const preferredMediaTypes = ['movie', 'tv', 'both']
  const releasePreferences = ['new', 'classic', 'mixed']
  const runtimePreferences = ['short', 'standard', 'long', 'any']

  return {
    completed_onboarding: Boolean(profile.completed_onboarding),
    preferred_genre_ids: sanitizeNumberArray(profile.preferred_genre_ids),
    disliked_genre_ids: sanitizeNumberArray(profile.disliked_genre_ids, 10),
    preferred_moods: sanitizeStringArray(profile.preferred_moods, 8),
    preferred_media_type: preferredMediaTypes.includes(profile.preferred_media_type) ? profile.preferred_media_type : 'both',
    release_preference: releasePreferences.includes(profile.release_preference) ? profile.release_preference : 'mixed',
    runtime_preference: runtimePreferences.includes(profile.runtime_preference) ? profile.runtime_preference : 'any',
    ignored_title_keys: sanitizeStringArray(profile.ignored_title_keys, MAX_IGNORED_TITLE_KEYS),
    preferred_people: sanitizePreferredPeople(profile.preferred_people),
    updated_at: profile.updated_at || new Date().toISOString()
  }
}
const getStoredTasteProfile = (user) => {
  const storedProfile = user?.user_metadata?.[TASTE_PROFILE_METADATA_KEY]
  return storedProfile && typeof storedProfile === 'object' ? normalizeTasteProfile(storedProfile) : null
}
const getDeviceType = () => {
  if (typeof window === 'undefined') return 'unknown'

  const userAgent = window.navigator.userAgent || ''
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(userAgent)) return 'mobile'
  return 'desktop'
}

const getTrustedDeviceRecord = () => {
  if (typeof window === 'undefined') return null

  try {
    const rawRecord = window.localStorage.getItem(TRUSTED_DEVICE_STORAGE_KEY)
    return rawRecord ? JSON.parse(rawRecord) : null
  } catch {
    return null
  }
}

const createDeviceToken = () => {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const rememberTrustedDevice = (userId) => {
  if (typeof window === 'undefined' || !userId) return

  const now = Date.now()
  const deviceToken = createDeviceToken()
  const record = {
    user_id: userId,
    device_token: deviceToken,
    device_type: getDeviceType(),
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + TRUSTED_DEVICE_DURATION_MS).toISOString()
  }

  try {
    window.localStorage.setItem(TRUSTED_DEVICE_STORAGE_KEY, JSON.stringify(record))
  } catch {
    // Supabase still owns the real session; this only controls the local 30-day trust window.
  }
}

const clearTrustedDevice = () => {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(TRUSTED_DEVICE_STORAGE_KEY)
  } catch {
    // Ignore unavailable storage.
  }
}

const isTrustedDeviceSessionValid = (userId) => {
  const record = getTrustedDeviceRecord()
  if (!record?.user_id || record.user_id !== userId) return false
  if (record.device_type !== getDeviceType()) return false

  const expiresAt = Date.parse(record.expires_at || '')
  return Number.isFinite(expiresAt) && expiresAt > Date.now()
}

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

  clearTrustedDevice()
}

export const authApi = {
  isTrustedDeviceSessionActive: (userId) => isTrustedDeviceSessionValid(userId),

  rememberCurrentDevice: (userId) => {
    rememberTrustedDevice(userId)
    return { success: true }
  },

  me: async () => {
    const { data, error } = await supabase.auth.getUser()

    if (error) {
      throw new Error(error.message)
    }

    if (data.user?.id && !isTrustedDeviceSessionValid(data.user.id)) {
      await supabase.auth.signOut()
      clearLocalSessionArtifacts()
      throw new Error('Session expired. Please log in again.')
    }

    return { user: data.user }
  },

  signup: async ({ name, email, password, legalAccepted, legalVersion, trustDevice = true }) => {
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

    if (data.user?.id && trustDevice) {
      rememberTrustedDevice(data.user.id)
    }

    return { user: data.user }
  },

  login: async ({ email, password, trustDevice = true }) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password
    })

    if (error) {
      throw new Error(error.message)
    }

    if (!data?.session?.access_token || !data?.user?.id) {
      throw new Error('Could not create a login session. Please try again.')
    }

    if (trustDevice) {
      rememberTrustedDevice(data.user.id)
    } else {
      clearTrustedDevice()
    }

    return { user: data.user }
  },

  requestPasswordReset: async (email) => {
    const safeEmail = normalizeEmail(email)

    if (!safeEmail) {
      throw new Error('Account email is missing.')
    }

    const { error } = await supabase.auth.resetPasswordForEmail(safeEmail, {
      redirectTo: typeof window === 'undefined' ? undefined : `${window.location.origin}/account/login`
    })

    if (error) {
      throw new Error(error.message)
    }

    return { success: true }
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

  getWatchlist: async (userId) => {
    const verifiedUser = await requireVerifiedUser(userId)
    const { data, error } = await supabase
      .from(WATCHLIST_TABLE)
      .select('movie_data')
      .eq('user_id', verifiedUser.id)
      .order('updated_at', { ascending: false })

    if (error) {
      throw new Error(error.message)
    }

    return { items: (data || []).map((entry) => entry.movie_data) }
  },

  toggleWatchlist: async (userId, movie) => {
    const verifiedUser = await requireVerifiedUser(userId)
    const mediaType = getStoredMediaType(movie)
    const movieId = getStoredMovieId(movie)

    const { data: existing, error: existingError } = await supabase
      .from(WATCHLIST_TABLE)
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
        .from(WATCHLIST_TABLE)
        .delete()
        .eq('id', existing.id)

      if (error) {
        throw new Error(error.message)
      }

      return { action: 'removed' }
    }

    const { error } = await supabase
      .from(WATCHLIST_TABLE)
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
      .select('id, movie_data, watched_at, updated_at')
      .eq('user_id', verifiedUser.id)
      .order('watched_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(12)

    if (error) {
      throw new Error(error.message)
    }

    return {
      items: (data || []).map((entry) => ({
        ...entry.movie_data,
        recently_watched_id: entry.id,
        watched_at: entry.movie_data?.watched_at || entry.watched_at,
        updated_at: entry.movie_data?.updated_at || entry.updated_at
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
  },

  getTasteProfile: async (userId) => {
    const verifiedUser = await requireVerifiedUser(userId)

    return {
      profile: getStoredTasteProfile(verifiedUser)
    }
  },

  saveTasteProfile: async (userId, profile) => {
    await requireVerifiedUser(userId)

    const nextProfile = normalizeTasteProfile({
      ...profile,
      completed_onboarding: true,
      updated_at: new Date().toISOString()
    })

    const { data, error } = await supabase.auth.updateUser({
      data: {
        [TASTE_PROFILE_METADATA_KEY]: nextProfile,
        [TASTE_PROFILE_UPDATED_AT_KEY]: nextProfile.updated_at
      }
    })

    if (error) {
      throw new Error(error.message)
    }

    return {
      profile: nextProfile,
      user: data.user
    }
  }
}
