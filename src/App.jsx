import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { useLocation, useNavigate } from 'react-router-dom'
import Spinner from './components/Spinner.jsx'
import MovieModal from './components/MovieModal.jsx'
import { AuthPage } from './components/AuthModal.jsx'
import LegalPage from './components/LegalPage.jsx'
import {
  BookmarkIcon,
  HomeIcon,
  LogInIcon,
  LogOutIcon,
  SearchIcon,
  SettingsIcon,
  TvIcon,
  UserIcon,
  VideoCameraIcon
} from './components/Icons.jsx'
import { supabase } from './supabaseClient.js'
import {
  DEFAULT_STREAMING_PROVIDER_ID,
  getDetailPath,
  getMediaPluralLabel,
  getStreamingUrl,
  getStreamingProviders,
  getTrailerEmbedUrl,
  getTvEpisodeStreamingUrl,
  MEDIA_TYPE_OPTIONS,
  normalizeMediaItem,
  normalizeMediaList
} from './utils/media.js'
import {
  PRIVACY_PATH,
  TERMS_PATH
} from './utils/legal.js'
import { authApi } from './utils/auth.js'

const API_BASE_URL = 'https://api.themoviedb.org/3'
const API_KEY = import.meta.env.VITE_TMDB_API_KEY

const API_OPTIONS = {
  method: 'GET',
  headers: {
    accept: 'application/json',
    Authorization: `Bearer ${API_KEY}`
  }
}

const SEARCH_MIN_LENGTH = 3
const CACHE_TTL_MS = 60 * 1000
const PERSISTENT_CACHE_TTL_MS = 12 * 60 * 60 * 1000
const PERSISTENT_CACHE_PREFIX = 'myfirstapp:tmdb-cache:v2:'
const PERSISTENT_CACHE_KEYS = [
  'default-genre-rows:',
  'genre-row:',
  'genres:',
  'people:',
  'person-credits:',
  'title-search:',
  'titles:',
  'top-rated:',
  'trending:'
]
const COOKIE_NOTICE_STORAGE_KEY = 'movieslo-cookie-notice-v1'
const TASTE_PROFILE_STORAGE_PREFIX = 'movieslo:taste-profile:v1:'
const TASTE_QUIZ_DISMISSED_PREFIX = 'movieslo:taste-quiz-dismissed:v1:'
const MAX_IGNORED_TITLE_KEYS = 1000
const INITIAL_RECOMMENDATION_POOL_LIMIT = 120
const RECOMMENDATION_POOL_CLICK_INCREMENT = 80
const MAX_RECOMMENDATION_POOL_LIMIT = 1000
const RECOMMENDATION_PAGE_SCAN_LIMIT = 12
const RECOMMENDATION_FRESH_BATCH_TARGET = 10
const RECOMMENDATION_ROTATION_WINDOW_MS = 5 * 24 * 60 * 60 * 1000
const RECOMMENDATION_ROTATION_REFRESH_MS = 60 * 60 * 1000
const RECOMMENDATION_ROTATION_JITTER = 24
const TASTE_PROFILE_SYNC_DEBOUNCE_MS = 3200
const MAX_PREFERRED_PEOPLE = 12
const responseCache = new Map()
const DEFAULT_TASTE_PROFILE = {
  completed_onboarding: false,
  preferred_genre_ids: [],
  disliked_genre_ids: [],
  preferred_moods: [],
  preferred_media_type: 'both',
  release_preference: 'mixed',
  runtime_preference: 'any',
  ignored_title_keys: [],
  preferred_people: []
}
const TASTE_MOOD_OPTIONS = [
  { id: 'scary', label: 'Scary', genres: ['Horror', 'Mystery', 'Thriller'] },
  { id: 'funny', label: 'Funny', genres: ['Comedy', 'Family', 'Animation'] },
  { id: 'intense', label: 'Intense', genres: ['Action', 'Thriller', 'Crime'] },
  { id: 'emotional', label: 'Emotional', genres: ['Drama', 'Romance'] },
  { id: 'mystery', label: 'Mystery', genres: ['Mystery', 'Crime', 'Thriller'] },
  { id: 'imaginative', label: 'Imaginative', genres: ['Fantasy', 'Science Fiction', 'Sci-Fi & Fantasy', 'Animation'] }
]
const TASTE_MEDIA_OPTIONS = [
  { id: 'both', label: 'Movies + TV' },
  { id: 'movie', label: 'Movies' },
  { id: 'tv', label: 'TV' }
]
const TASTE_RELEASE_OPTIONS = [
  { id: 'mixed', label: 'Mixed' },
  { id: 'new', label: 'Newer' },
  { id: 'classic', label: 'Classics' }
]
const TASTE_RUNTIME_OPTIONS = [
  { id: 'any', label: 'Any length' },
  { id: 'short', label: 'Short' },
  { id: 'standard', label: 'Standard' },
  { id: 'long', label: 'Long' }
]
const TASTE_GENRE_EQUIVALENT_GROUPS = [
  [28, 10759],
  [12, 10759],
  [878, 10765],
  [14, 10765],
  [80],
  [53, 9648],
  [27, 9648],
  [35],
  [18],
  [10749],
  [16],
  [10751, 10762],
  [99],
  [36, 10768],
  [10752, 10768],
  [37]
]
const MOVIE_BELT_GENRES = [
  'Action',
  'Adventure',
  'Animation',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'History',
  'Horror',
  'Music',
  'Mystery',
  'Romance',
  'Science Fiction',
  'Thriller',
  'TV Movie',
  'War',
  'Western'
]
const TV_BELT_GENRES = [
  'Action & Adventure',
  'Animation',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Kids',
  'Mystery',
  'News',
  'Reality',
  'Sci-Fi & Fantasy',
  'Soap',
  'Talk',
  'War & Politics',
  'Western'
]
const MAX_GENRE_ROWS = 32
const INITIAL_BELT_ITEM_COUNT = 12
const BELT_ITEM_BATCH_SIZE = 10
const imageBaseUrl = 'https://image.tmdb.org/t/p/'
const WATCH_HISTORY_STORAGE_PREFIX = 'movie-browser:watch-history:v1:'

const clampNumber = (value, min = 0, max = Number.POSITIVE_INFINITY) =>
  Math.min(Math.max(Number.isFinite(value) ? value : min, min), max)

const getRecommendationRotationWindow = (now = Date.now()) =>
  Math.floor(now / RECOMMENDATION_ROTATION_WINDOW_MS)

const getStableHashValue = (value = '') => {
  let hash = 2166136261
  const normalizedValue = String(value)

  for (let index = 0; index < normalizedValue.length; index += 1) {
    hash ^= normalizedValue.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0) / 4294967295
}

const getRecommendationRotationScore = (seed, itemKey) => {
  if (!seed) return 0

  return (getStableHashValue(`${seed}:${itemKey}`) - 0.5) * RECOMMENDATION_ROTATION_JITTER
}

const getResumeTimeSeconds = (item) => clampNumber(Number(item?.resume_time_seconds || 0))

const getProgressPercent = (item) => clampNumber(Number(item?.progress_percent || 0), 0, 100)

const formatResumeTime = (seconds = 0) => {
  const safeSeconds = Math.floor(clampNumber(Number(seconds || 0)))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainingSeconds = safeSeconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

const getWatchPath = (item, resumeTimeSeconds = 0) => {
  const mediaType = item?.media_type || 'movie'
  const basePath = `/watch/${mediaType}/${item.id}`
  const safeResumeTime = Math.floor(getResumeTimeSeconds({ resume_time_seconds: resumeTimeSeconds }))

  return safeResumeTime > 0 ? `${basePath}?t=${safeResumeTime}` : basePath
}

const appendPlaybackTimestamp = (url, resumeTimeSeconds = 0) => {
  const safeResumeTime = Math.floor(getResumeTimeSeconds({ resume_time_seconds: resumeTimeSeconds }))
  if (!url || safeResumeTime <= 0) return url

  try {
    const playerUrl = new URL(url)
    playerUrl.searchParams.set('t', safeResumeTime.toString())
    playerUrl.searchParams.set('start', safeResumeTime.toString())
    return playerUrl.toString()
  } catch {
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}t=${safeResumeTime}&start=${safeResumeTime}`
  }
}

const appendUniqueMediaItems = (currentItems, incomingItems) => {
  const seenKeys = new Set(currentItems.map((item) => getMediaItemKey(item)))
  const uniqueIncomingItems = incomingItems.filter((item) => {
    const key = getMediaItemKey(item)
    if (seenKeys.has(key)) return false
    seenKeys.add(key)
    return true
  })

  return [...currentItems, ...uniqueIncomingItems]
}

const getWatchedAtTime = (item) => {
  const watchedAt = item?.watched_at || item?.updated_at || item?.created_at
  const watchedAtTime = Date.parse(watchedAt || '')
  return Number.isFinite(watchedAtTime) ? watchedAtTime : 0
}

const sortWatchHistoryItems = (items) =>
  [...items].sort((firstItem, secondItem) => {
    const timeDifference = getWatchedAtTime(secondItem) - getWatchedAtTime(firstItem)
    if (timeDifference !== 0) return timeDifference

    return getMediaItemKey(secondItem).localeCompare(getMediaItemKey(firstItem))
  })

const mergeWatchHistoryItems = (...itemGroups) => {
  const itemMap = new Map()

  itemGroups.flat().forEach((item) => {
    if (!item?.id) return

    const itemKey = getMediaItemKey(item)
    const existingItem = itemMap.get(itemKey)

    if (!existingItem || getWatchedAtTime(item) >= getWatchedAtTime(existingItem)) {
      itemMap.set(itemKey, item)
    }
  })

  return sortWatchHistoryItems([...itemMap.values()])
}

const getLocalWatchHistoryKey = (userId) => `${WATCH_HISTORY_STORAGE_PREFIX}${userId}`

const getLocalWatchHistory = (userId) => {
  if (!userId || typeof window === 'undefined' || !window.localStorage) return []

  try {
    const items = JSON.parse(window.localStorage.getItem(getLocalWatchHistoryKey(userId)) || '[]')
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

const setLocalWatchHistory = (userId, items) => {
  if (!userId || typeof window === 'undefined' || !window.localStorage) return

  try {
    window.localStorage.setItem(getLocalWatchHistoryKey(userId), JSON.stringify(items.slice(0, 12)))
  } catch {
    // Local history is a convenience cache; remote Supabase history remains the source of truth.
  }
}

const upsertLocalWatchHistoryItem = (userId, movie) => {
  if (!userId) return []

  const movieKey = getMediaItemKey(movie)
  const watchHistoryItem = {
    ...movie,
    watched_at: movie?.watched_at || new Date().toISOString()
  }
  const nextItems = [
    watchHistoryItem,
    ...getLocalWatchHistory(userId).filter((entry) => getMediaItemKey(entry) !== movieKey)
  ].slice(0, 12)

  setLocalWatchHistory(userId, nextItems)
  return nextItems
}

const getBackdropUrl = (item, size = 'w1280') => {
  if (item?.backdrop_path) return `${imageBaseUrl}${size}${item.backdrop_path}`
  if (item?.poster_path) return `${imageBaseUrl}w780${item.poster_path}`
  return '/hero-bg.png'
}

const getPosterUrl = (item, size = 'w500') =>
  item?.poster_path ? `${imageBaseUrl}${size}${item.poster_path}` : '/no-movie.png'

const getProfileUrl = (person, size = 'w185') =>
  person?.profile_path ? `${imageBaseUrl}${size}${person.profile_path}` : '/no-movie.png'

const HERO_VIDEO_BLOCKLIST_PATTERN = /\b(shorts?|vertical|portrait|reel|tiktok|phone)\b/i

const getHeroVideoScore = (video) => {
  if (!video || video.site !== 'YouTube' || !['Trailer', 'Teaser'].includes(video.type)) return -Infinity

  const videoName = video.name || ''
  if (HERO_VIDEO_BLOCKLIST_PATTERN.test(videoName)) return -Infinity

  let score = 0
  if (video.type === 'Trailer') score += 100
  if (video.official) score += 55
  if (/official/i.test(videoName)) score += 25
  if (/trailer/i.test(videoName)) score += 20
  if (/teaser/i.test(videoName)) score -= 12
  score += Math.min(Number(video.size || 0) / 120, 12)

  return score
}

const getBestHeroVideo = (videos = []) =>
  videos
    .map((video) => ({ video, score: getHeroVideoScore(video) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((first, second) => second.score - first.score)[0]?.video || null

const getHeroTrailerEmbedUrl = (videoKey) =>
  videoKey
    ? `https://www.youtube-nocookie.com/embed/${videoKey}?autoplay=1&mute=0&controls=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&disablekb=1&fs=0&iv_load_policy=3${
        typeof window === 'undefined' ? '' : `&origin=${encodeURIComponent(window.location.origin)}`
      }`
    : ''

const shouldPersistCacheKey = (key) => PERSISTENT_CACHE_KEYS.some((prefix) => key.startsWith(prefix))

const getPersistentCacheEntry = (key) => {
  if (!shouldPersistCacheKey(key) || typeof window === 'undefined' || !window.localStorage) return null

  try {
    const rawEntry = window.localStorage.getItem(`${PERSISTENT_CACHE_PREFIX}${key}`)
    if (!rawEntry) return null

    const entry = JSON.parse(rawEntry)
    if (!entry?.expiresAt || Date.now() > entry.expiresAt) {
      window.localStorage.removeItem(`${PERSISTENT_CACHE_PREFIX}${key}`)
      return null
    }

    responseCache.set(key, entry)
    return entry.data
  } catch {
    return null
  }
}

const setPersistentCacheEntry = (key, entry) => {
  if (!shouldPersistCacheKey(key) || typeof window === 'undefined' || !window.localStorage) return

  try {
    window.localStorage.setItem(`${PERSISTENT_CACHE_PREFIX}${key}`, JSON.stringify(entry))
  } catch {
    // Browser storage may be full or disabled. Memory cache still works for this session.
  }
}

const removeCacheEntry = (key) => {
  responseCache.delete(key)

  if (!shouldPersistCacheKey(key) || typeof window === 'undefined' || !window.localStorage) return

  try {
    window.localStorage.removeItem(`${PERSISTENT_CACHE_PREFIX}${key}`)
  } catch {
    // Ignore storage errors; cache invalidation is best effort.
  }
}

const getCacheEntry = (key) => {
  const entry = responseCache.get(key)

  if (!entry) return getPersistentCacheEntry(key)

  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key)
    if (shouldPersistCacheKey(key) && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(`${PERSISTENT_CACHE_PREFIX}${key}`)
    }
    return null
  }

  return entry.data
}

const setCacheEntry = (key, data, ttl = CACHE_TTL_MS) => {
  const entry = {
    data,
    expiresAt: Date.now() + ttl
  }

  responseCache.set(key, entry)
  setPersistentCacheEntry(key, entry)
}

const getCacheKey = (prefix, value) => `${prefix}:${value}`

const fetchJson = async (key, request, ttl = CACHE_TTL_MS) => {
  const cached = getCacheEntry(key)
  if (cached) return cached

  const data = await request()
  setCacheEntry(key, data, ttl)
  return data
}

const upsertRuntime = (items, runtimeMap) =>
  items.map((item) => ({
    ...item,
    runtime: runtimeMap[`${item.media_type || 'movie'}-${item.id}`] ?? item.runtime ?? null
  }))

const getRuntimeKey = (item) => `${item.media_type || 'movie'}-${item.id}`
const getMediaItemKey = (item) => `${item.media_type || 'movie'}-${item.id}`

const uniqueStringValues = (values = [], limit = 80) =>
  Array.isArray(values)
    ? [...new Set(values.map((value) => String(value).trim().toLowerCase()).filter(Boolean))].slice(0, limit)
    : []

const uniqueNumberValues = (values = [], limit = 20) =>
  Array.isArray(values)
    ? [...new Set(values.map((value) => Number(value)).filter((value) => Number.isSafeInteger(value) && value > 0))].slice(0, limit)
    : []

const normalizePreferredPeople = (people = []) => {
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

const normalizeTasteProfileForApp = (profile = {}) => ({
  ...DEFAULT_TASTE_PROFILE,
  completed_onboarding: Boolean(profile.completed_onboarding),
  preferred_genre_ids: uniqueNumberValues(profile.preferred_genre_ids),
  disliked_genre_ids: uniqueNumberValues(profile.disliked_genre_ids, 10),
  preferred_moods: uniqueStringValues(profile.preferred_moods, 8),
  preferred_media_type: TASTE_MEDIA_OPTIONS.some((option) => option.id === profile.preferred_media_type)
    ? profile.preferred_media_type
    : DEFAULT_TASTE_PROFILE.preferred_media_type,
  release_preference: TASTE_RELEASE_OPTIONS.some((option) => option.id === profile.release_preference)
    ? profile.release_preference
    : DEFAULT_TASTE_PROFILE.release_preference,
  runtime_preference: TASTE_RUNTIME_OPTIONS.some((option) => option.id === profile.runtime_preference)
    ? profile.runtime_preference
    : DEFAULT_TASTE_PROFILE.runtime_preference,
  ignored_title_keys: uniqueStringValues(profile.ignored_title_keys, MAX_IGNORED_TITLE_KEYS),
  preferred_people: normalizePreferredPeople(profile.preferred_people),
  updated_at: profile.updated_at || null
})

const getLocalTasteProfileKey = (userId) => `${TASTE_PROFILE_STORAGE_PREFIX}${userId}`
const getTasteQuizDismissedKey = (userId) => `${TASTE_QUIZ_DISMISSED_PREFIX}${userId}`

const getLocalTasteProfile = (userId) => {
  if (!userId || typeof window === 'undefined' || !window.localStorage) return null

  try {
    const rawProfile = window.localStorage.getItem(getLocalTasteProfileKey(userId))
    return rawProfile ? normalizeTasteProfileForApp(JSON.parse(rawProfile)) : null
  } catch {
    return null
  }
}

const setLocalTasteProfile = (userId, profile) => {
  if (!userId || typeof window === 'undefined' || !window.localStorage) return

  try {
    window.localStorage.setItem(getLocalTasteProfileKey(userId), JSON.stringify(normalizeTasteProfileForApp(profile)))
  } catch {
    // Local taste is a convenience cache; Supabase auth metadata remains the account source when available.
  }
}

const getHasDismissedTasteQuiz = (userId) => {
  if (!userId || typeof window === 'undefined' || !window.localStorage) return false

  try {
    return window.localStorage.getItem(getTasteQuizDismissedKey(userId)) === 'true'
  } catch {
    return false
  }
}

const setHasDismissedTasteQuiz = (userId) => {
  if (!userId || typeof window === 'undefined' || !window.localStorage) return

  try {
    window.localStorage.setItem(getTasteQuizDismissedKey(userId), 'true')
  } catch {
    // Dismissing the modal can stay session-only if storage is unavailable.
  }
}

const getTasteGenreOptions = (genres = []) => {
  const preferredNames = [
    'Action',
    'Comedy',
    'Drama',
    'Horror',
    'Mystery',
    'Romance',
    'Science Fiction',
    'Thriller',
    'Fantasy',
    'Animation',
    'Crime',
    'Family'
  ]
  const genreByName = new Map(genres.map((genre) => [genre.name.toLowerCase(), genre]))
  const preferredGenres = preferredNames
    .map((name) => genreByName.get(name.toLowerCase()))
    .filter(Boolean)
  const selectedIds = new Set(preferredGenres.map((genre) => genre.id))
  const fallbackGenres = genres
    .filter((genre) => !selectedIds.has(genre.id))
    .sort((firstGenre, secondGenre) => firstGenre.name.localeCompare(secondGenre.name))

  return [...preferredGenres, ...fallbackGenres].slice(0, 14)
}

const getMovieYear = (movie) => {
  const year = Number((movie?.release_date || movie?.first_air_date || '').slice(0, 4))
  return Number.isFinite(year) ? year : null
}

const getRuntimeScore = (runtime, preference) => {
  if (!runtime || preference === 'any') return 0
  if (preference === 'short') return runtime <= 95 ? 18 : runtime > 145 ? -8 : 4
  if (preference === 'long') return runtime >= 135 ? 18 : runtime < 95 ? -8 : 4
  return runtime >= 90 && runtime <= 145 ? 18 : 2
}

const getReleaseScore = (year, preference) => {
  if (!year || preference === 'mixed') return 0
  if (preference === 'new') return year >= 2020 ? 18 : year >= 2014 ? 8 : -6
  return year <= 2005 ? 18 : year <= 2014 ? 8 : -4
}

const expandEquivalentGenreIds = (genreIds = []) => {
  const expandedGenreIds = new Set(genreIds)

  genreIds.forEach((genreId) => {
    TASTE_GENRE_EQUIVALENT_GROUPS
      .filter((group) => group.includes(genreId))
      .forEach((equivalentGroup) => {
        equivalentGroup.forEach((equivalentGenreId) => expandedGenreIds.add(equivalentGenreId))
      })
  })

  return expandedGenreIds
}

const incrementGenreCounts = (genreCounts, genreIds = []) => {
  genreIds.forEach((genreId) => {
    expandEquivalentGenreIds([genreId]).forEach((equivalentGenreId) => {
      genreCounts.set(equivalentGenreId, (genreCounts.get(equivalentGenreId) || 0) + 1)
    })
  })
}

const addGenreIdsByName = (targetSet, genreIdsByName, genreNames = []) => {
  genreNames.forEach((genreName) => {
    const normalizedName = genreName.toLowerCase()
    const genreId = genreIdsByName.get(normalizedName)

    if (genreId) {
      expandEquivalentGenreIds([genreId]).forEach((equivalentGenreId) => targetSet.add(equivalentGenreId))
      return
    }

    genreIdsByName.forEach((candidateGenreId, candidateGenreName) => {
      if (candidateGenreName.includes(normalizedName) || normalizedName.includes(candidateGenreName)) {
        expandEquivalentGenreIds([candidateGenreId]).forEach((equivalentGenreId) => targetSet.add(equivalentGenreId))
      }
    })
  })
}

const getRecommendationDiscoverGenreIds = ({
  genreList = [],
  selectedGenreIds = [],
  tasteProfile = DEFAULT_TASTE_PROFILE
}) => {
  const normalizedProfile = normalizeTasteProfileForApp(tasteProfile)
  const validGenreIds = new Set(genreList.map((genre) => genre.id))
  const genreIdsByName = new Map(genreList.map((genre) => [genre.name.toLowerCase(), genre.id]))
  const profileGenreIds = new Set(normalizedProfile.preferred_genre_ids)

  normalizedProfile.preferred_moods.forEach((moodId) => {
    const mood = TASTE_MOOD_OPTIONS.find((option) => option.id === moodId)
    addGenreIdsByName(profileGenreIds, genreIdsByName, mood?.genres || [])
  })

  const sourceGenreIds = selectedGenreIds.length > 0 ? selectedGenreIds : Array.from(profileGenreIds)
  return Array.from(expandEquivalentGenreIds(sourceGenreIds))
    .filter((genreId) => validGenreIds.has(genreId))
    .slice(0, 8)
}

const buildRecommendations = ({
  movieList = [],
  trendingMovies = [],
  topRatedMovies = [],
  recommendationPoolMovies = [],
  favoriteMovies = [],
  recentlyWatchedMovies = [],
  genreRows = [],
  genreList = [],
  selectedGenreIds = [],
  tasteProfile = DEFAULT_TASTE_PROFILE,
  runtimeMap = {},
  recommendationLimit = INITIAL_RECOMMENDATION_POOL_LIMIT,
  recommendationRotationSeed = ''
}) => {
  const normalizedProfile = normalizeTasteProfileForApp(tasteProfile)
  const sourceMap = new Map()
  const addSourceItems = (items, sourceWeight) => {
    items.forEach((item) => {
      if (!item?.id) return

      const normalizedItem = {
        ...item,
        runtime: runtimeMap[getRuntimeKey(item)] ?? item.runtime ?? null
      }
      const key = getMediaItemKey(normalizedItem)
      const existing = sourceMap.get(key)

      if (!existing || sourceWeight > existing.sourceWeight) {
        sourceMap.set(key, { item: normalizedItem, sourceWeight })
      }
    })
  }

  addSourceItems(recommendationPoolMovies, 30)
  addSourceItems(topRatedMovies, 28)
  addSourceItems(trendingMovies, 24)
  addSourceItems(movieList, 18)
  genreRows.forEach((row) => addSourceItems(row.items || [], 16))
  addSourceItems(favoriteMovies, 8)

  const genreNameById = new Map(genreList.map((genre) => [genre.id, genre.name]))
  const genreIdsByName = new Map(genreList.map((genre) => [genre.name.toLowerCase(), genre.id]))
  const watchedKeys = new Set(recentlyWatchedMovies.map((movie) => getMediaItemKey(movie)))
  const ignoredKeys = new Set(normalizedProfile.ignored_title_keys)
  const favoriteKeys = new Set(favoriteMovies.map((movie) => getMediaItemKey(movie)))
  const preferenceGenreIds = expandEquivalentGenreIds(normalizedProfile.preferred_genre_ids)
  const dislikedGenreIds = expandEquivalentGenreIds(normalizedProfile.disliked_genre_ids)
  const selectedGenreSet = expandEquivalentGenreIds(selectedGenreIds)
  const favoriteGenreCounts = new Map()
  const watchedGenreCounts = new Map()
  const moodGenreIds = new Set()

  favoriteMovies.forEach((movie) => {
    incrementGenreCounts(favoriteGenreCounts, movie.genre_ids || [])
  })

  recentlyWatchedMovies.forEach((movie) => {
    incrementGenreCounts(watchedGenreCounts, movie.genre_ids || [])
  })

  normalizedProfile.preferred_moods.forEach((moodId) => {
    const mood = TASTE_MOOD_OPTIONS.find((option) => option.id === moodId)
    addGenreIdsByName(moodGenreIds, genreIdsByName, mood?.genres || [])
  })
  const hasExplicitTaste =
    preferenceGenreIds.size > 0 ||
    moodGenreIds.size > 0 ||
    selectedGenreSet.size > 0

  return Array.from(sourceMap.values())
    .map(({ item, sourceWeight }) => {
      const key = getMediaItemKey(item)
      if (watchedKeys.has(key) || ignoredKeys.has(key)) return null

      const itemGenreIds = item.genre_ids || []
      const matchingPreferredGenres = itemGenreIds.filter((genreId) => preferenceGenreIds.has(genreId)).length
      const matchingMoodGenres = itemGenreIds.filter((genreId) => moodGenreIds.has(genreId)).length
      const matchingSelectedGenres = itemGenreIds.filter((genreId) => selectedGenreSet.has(genreId)).length
      const explicitTasteMatches = matchingPreferredGenres + matchingMoodGenres + matchingSelectedGenres
      const dislikedMatches = itemGenreIds.filter((genreId) => dislikedGenreIds.has(genreId)).length
      const favoriteGenreScore = itemGenreIds.reduce((score, genreId) => score + Math.min(favoriteGenreCounts.get(genreId) || 0, 3) * 12, 0)
      const watchedGenreScore = itemGenreIds.reduce((score, genreId) => score + Math.min(watchedGenreCounts.get(genreId) || 0, 3) * 8, 0)
      const mediaType = item.media_type || 'movie'
      const mediaScore = normalizedProfile.preferred_media_type === 'both'
        ? 0
        : mediaType === normalizedProfile.preferred_media_type ? 16 : -18
      const ratingScore = clampNumber(Number(item.vote_average || 0), 0, 10) * 3
      const popularityScore = Math.min(Math.log1p(Number(item.popularity || 0)) * 3, 18)
      const releaseScore = getReleaseScore(getMovieYear(item), normalizedProfile.release_preference)
      const runtimeScore = getRuntimeScore(item.runtime, normalizedProfile.runtime_preference)
      const favoritePenalty = favoriteKeys.has(key) ? -16 : 0
      const explicitMismatchPenalty = hasExplicitTaste && explicitTasteMatches === 0 ? -95 : 0
      const weakMatchPenalty = hasExplicitTaste && explicitTasteMatches === 1 ? -10 : 0
      const recommendationScore =
        sourceWeight +
        matchingPreferredGenres * 78 +
        matchingMoodGenres * 34 +
        matchingSelectedGenres * 42 +
        favoriteGenreScore +
        watchedGenreScore +
        mediaScore +
        ratingScore +
        popularityScore +
        releaseScore +
        runtimeScore +
        favoritePenalty -
        dislikedMatches * 100 +
        explicitMismatchPenalty +
        weakMatchPenalty
      const recommendationRotationScore = getRecommendationRotationScore(recommendationRotationSeed, key)

      return {
        ...item,
        recommendation_score: recommendationScore,
        recommendation_rotation_score: recommendationRotationScore,
        recommendation_rank_score: recommendationScore + recommendationRotationScore,
        recommendation_genres: itemGenreIds.map((genreId) => genreNameById.get(genreId)).filter(Boolean).slice(0, 3)
      }
    })
    .filter(Boolean)
    .sort((firstItem, secondItem) => {
      const rankDifference = secondItem.recommendation_rank_score - firstItem.recommendation_rank_score
      if (Math.abs(rankDifference) > 0.0001) return rankDifference
      return getMediaItemKey(firstItem).localeCompare(getMediaItemKey(secondItem))
    })
    .slice(0, clampNumber(recommendationLimit, INITIAL_RECOMMENDATION_POOL_LIMIT, MAX_RECOMMENDATION_POOL_LIMIT))
}

const orderGenresForRows = (availableGenres = [], selectedMediaFilter = 'movie') => {
  const preferredGenreNames = selectedMediaFilter === 'tv' ? TV_BELT_GENRES : MOVIE_BELT_GENRES
  const genreByName = new Map(availableGenres.map((genre) => [genre.name.toLowerCase(), genre]))
  const orderedGenres = preferredGenreNames
    .map((name) => genreByName.get(name.toLowerCase()))
    .filter(Boolean)
  const orderedGenreIds = new Set(orderedGenres.map((genre) => genre.id))
  const remainingGenres = availableGenres
    .filter((genre) => !orderedGenreIds.has(genre.id))
    .sort((a, b) => a.name.localeCompare(b.name))

  return [...orderedGenres, ...remainingGenres].slice(0, MAX_GENRE_ROWS)
}

const fetchGenreRowBatch = async (rowsToLoad, selectedMediaFilter, startIndex, batchSize) => {
  const rowBatch = rowsToLoad.slice(startIndex, startIndex + batchSize)
  const rowSettledResults = await Promise.allSettled(
    rowBatch.map(async (genre) => {
      const params = new URLSearchParams({
        sort_by: 'popularity.desc',
        with_genres: genre.id.toString(),
        include_adult: 'false',
        language: 'en-US',
        page: '1'
      })
      const cacheKey = getCacheKey('genre-row', `${selectedMediaFilter}:${genre.id}:${params.toString()}`)
      const data = await fetchJson(
        cacheKey,
        async () => {
          const response = await fetch(`${API_BASE_URL}/discover/${selectedMediaFilter}?${params.toString()}`, API_OPTIONS)
          if (!response.ok) throw new Error(`Request failed: ${response.status}`)
          return response.json()
        },
        PERSISTENT_CACHE_TTL_MS
      )

      return {
        id: genre.id,
        title: genre.name,
        items: normalizeMediaList((data.results || []).slice(0, 20), selectedMediaFilter),
        nextPage: 2,
        totalPages: Math.min(data.total_pages || 1, 500)
      }
    })
  )

  return rowSettledResults
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter((row) => row.items.length > 0)
}

const getSectionMediaTypes = (mediaFilter) => {
  if (mediaFilter === 'movie') return ['movie']
  return ['tv']
}

const DetailsRoute = ({ mediaType, id, favoriteMovieIds, onToggleFavorite, onOpenTitle, onPlayTitle, onClose }) => {
  const [movie, setMovie] = useState(null)
  const [trailerUrl, setTrailerUrl] = useState('')
  const [streamingUrl, setStreamingUrl] = useState('')
  const [similarMovies, setSimilarMovies] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSimilarLoading, setIsSimilarLoading] = useState(false)
  const [hasLoadError, setHasLoadError] = useState(false)
  const [seasonOptions, setSeasonOptions] = useState([])
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState(null)
  const [episodeOptions, setEpisodeOptions] = useState([])
  const [selectedEpisodeNumber, setSelectedEpisodeNumber] = useState(null)

  useEffect(() => {
    const loadDetails = async () => {
      setIsLoading(true)
      setMovie(null)
      setTrailerUrl('')
      setSimilarMovies([])
      setStreamingUrl('')
      setHasLoadError(false)
      setSeasonOptions([])
      setSelectedSeasonNumber(null)
      setEpisodeOptions([])
      setSelectedEpisodeNumber(null)

      try {
        const normalizedMediaType = mediaType === 'tv' ? 'tv' : 'movie'
        const detailEndpoint = normalizedMediaType === 'tv' ? 'tv' : 'movie'

        const [detailData, videoData] = await Promise.all([
          fetchJson(
            `detail:${normalizedMediaType}:${id}`,
            async () => {
              const response = await fetch(`${API_BASE_URL}/${detailEndpoint}/${id}`, API_OPTIONS)
              if (!response.ok) throw new Error(`Request failed: ${response.status}`)
              return response.json()
            }
          ),
          fetchJson(
            `videos:${normalizedMediaType}:${id}`,
            async () => {
              const response = await fetch(`${API_BASE_URL}/${detailEndpoint}/${id}/videos`, API_OPTIONS)
              if (!response.ok) throw new Error(`Request failed: ${response.status}`)
              return response.json()
            }
          )
        ])

        const normalizedItem = normalizeMediaItem(detailData, normalizedMediaType)
        const trailer = (videoData.results || []).find((video) => video.type === 'Trailer' && video.site === 'YouTube')
        const validSeasons = normalizedMediaType === 'tv'
          ? (detailData.seasons || []).filter((season) => season.season_number > 0)
          : []
        const defaultSeasonNumber = validSeasons[0]?.season_number || null

        setMovie(normalizedItem)
        setTrailerUrl(getTrailerEmbedUrl(trailer?.key))
        setSeasonOptions(validSeasons)
        setSelectedSeasonNumber(defaultSeasonNumber)
        setStreamingUrl(
          normalizedMediaType === 'tv'
            ? ''
            : getStreamingUrl(normalizedItem)
        )
      } catch (error) {
        console.log(`Error fetching title details: ${error}`)
        setMovie(null)
        setHasLoadError(true)
      } finally {
        setIsLoading(false)
      }
    }

    loadDetails()
  }, [id, mediaType])

  useEffect(() => {
    const loadEpisodes = async () => {
      if (movie?.media_type !== 'tv' || !movie.id || !selectedSeasonNumber) {
        setEpisodeOptions([])
        setSelectedEpisodeNumber(null)
        setStreamingUrl(movie?.media_type === 'movie' ? getStreamingUrl(movie) : '')
        return
      }

      try {
        const data = await fetchJson(
          `season:${movie.id}:${selectedSeasonNumber}`,
          async () => {
            const response = await fetch(`${API_BASE_URL}/tv/${movie.id}/season/${selectedSeasonNumber}`, API_OPTIONS)
            if (!response.ok) throw new Error(`Request failed: ${response.status}`)
            return response.json()
          }
        )
        const validEpisodes = (data.episodes || []).filter((episode) => episode.episode_number > 0)
        const defaultEpisodeNumber = validEpisodes[0]?.episode_number || null

        setEpisodeOptions(validEpisodes)
        setSelectedEpisodeNumber(defaultEpisodeNumber)
      } catch (error) {
        console.log(`Error fetching episodes: ${error}`)
        setEpisodeOptions([])
        setSelectedEpisodeNumber(null)
        setStreamingUrl('')
      }
    }

    loadEpisodes()
  }, [movie, selectedSeasonNumber])

  useEffect(() => {
    if (!movie?.id) {
      setStreamingUrl('')
      return
    }

    if (movie.media_type === 'tv') {
      setStreamingUrl(getTvEpisodeStreamingUrl(movie.id, selectedSeasonNumber, selectedEpisodeNumber))
      return
    }

    setStreamingUrl(getStreamingUrl(movie))
  }, [movie, selectedSeasonNumber, selectedEpisodeNumber])

  useEffect(() => {
    const loadSimilar = async () => {
      if (!movie?.id) return

      setIsSimilarLoading(true)

      try {
        const detailEndpoint = movie.media_type === 'tv' ? 'tv' : 'movie'
        const data = await fetchJson(
          `similar:${movie.media_type}:${movie.id}`,
          async () => {
            const response = await fetch(`${API_BASE_URL}/${detailEndpoint}/${movie.id}/similar`, API_OPTIONS)
            if (!response.ok) throw new Error(`Request failed: ${response.status}`)
            return response.json()
          }
        )
        setSimilarMovies(normalizeMediaList((data.results || []).slice(0, 8), movie.media_type))
      } catch (error) {
        console.log(`Error fetching similar titles: ${error}`)
        setSimilarMovies([])
      } finally {
        setIsSimilarLoading(false)
      }
    }

    loadSimilar()
  }, [movie])

  if (isLoading) {
    return (
      <div className="details-loading-shell">
        <Spinner label="Loading title" />
      </div>
    )
  }

  if (!movie) {
    return (
      <div className="details-loading-shell">
        <div className="details-error-card">
          <h2>Title unavailable</h2>
          <p>
            {hasLoadError
              ? 'This title could not be loaded from TMDB right now.'
              : 'This title is not available.'}
          </p>
          <button type="button" className="movie-modal-close" onClick={onClose}>
            Back to home
          </button>
        </div>
      </div>
    )
  }

  return (
    <MovieModal
      movie={movie}
      trailerUrl={trailerUrl}
      streamingUrl={streamingUrl}
      seasonOptions={seasonOptions}
      selectedSeasonNumber={selectedSeasonNumber}
      selectedEpisodeNumber={selectedEpisodeNumber}
      episodeOptions={episodeOptions}
      onSeasonChange={setSelectedSeasonNumber}
      onEpisodeChange={setSelectedEpisodeNumber}
      onClose={onClose}
      similarMovies={similarMovies}
      isSimilarLoading={isSimilarLoading}
      onWatchTrailer={onOpenTitle}
      onPlayTitle={onPlayTitle}
      onToggleFavorite={onToggleFavorite}
      favoriteMovieIds={favoriteMovieIds}
    />
  )
}

const AppShell = ({ children, className = '' }) => (
  <main className={className}>
    <div className="cosmic-background" aria-hidden="true">
      <div className="cosmic-glow cosmic-glow-left" />
      <div className="cosmic-glow cosmic-glow-right" />
      <div className="starfield starfield-primary" />
      <div className="starfield starfield-secondary" />
    </div>

    {children}
  </main>
)

const AccountAccessRoute = ({ mode, onModeChange, onSubmit, isSubmitting, errorMessage }) => (
  <main className="auth-main">
    <AuthPage
      mode={mode}
      onModeChange={onModeChange}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      errorMessage={errorMessage}
    />
  </main>
)

const BeltCard = React.memo(function BeltCard({
  movie,
  index = 0,
  onOpenTitle,
  onDismiss,
  onToggleWatchlist,
  isInWatchlist = false
}) {
  return (
    <article
      className="belt-card"
      onClick={() => onOpenTitle(movie)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpenTitle(movie)
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${movie.title}`}
      style={{ '--card-index': index }}
    >
      {onDismiss && (
        <button
          type="button"
          className="belt-card-dismiss"
          onClick={(event) => {
            event.stopPropagation()
            onDismiss(movie)
          }}
          aria-label={`Hide ${movie.title} from recommendations`}
        >
          ×
        </button>
      )}
      {onToggleWatchlist && (
        <button
          type="button"
          className={`belt-card-watchlist ${isInWatchlist ? 'is-active' : ''}`}
          onClick={(event) => {
            event.stopPropagation()
            onToggleWatchlist(movie)
          }}
          aria-label={`${isInWatchlist ? 'Remove' : 'Add'} ${movie.title} ${isInWatchlist ? 'from' : 'to'} watchlist`}
          aria-pressed={isInWatchlist}
        >
          {isInWatchlist ? '✓' : '+'}
        </button>
      )}
      <div className="belt-card-image-shell">
        <img
          className="belt-card-image"
          src={movie.backdrop_path ? getBackdropUrl(movie, 'w780') : getPosterUrl(movie)}
          alt={movie.title}
          loading={index < 4 ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={index < 4 ? 'high' : 'auto'}
        />
      </div>
      <h3 className="belt-card-title">{movie.title}</h3>
    </article>
  )
})

const ContentBelt = React.memo(function ContentBelt({
  title,
  items = [],
  accent = '',
  headingAction = null,
  onLoadMore,
  beltKey,
  onOpenTitle,
  onDismissTitle,
  onToggleWatchlist,
  watchlistMovieIds = [],
  beltVisibleCounts,
  setBeltVisibleCounts,
  loadingMoreBeltKeys,
  setLoadingMoreBeltKeys,
  exhaustedBeltKeys,
  setExhaustedBeltKeys
}) {
  const beltRef = useRef(null)
  const resolvedBeltKey = beltKey || title
  const visibleCount = beltVisibleCounts[resolvedBeltKey] || INITIAL_BELT_ITEM_COUNT
  const isLoadingMore = loadingMoreBeltKeys.includes(resolvedBeltKey)
  const isExhausted = exhaustedBeltKeys.includes(resolvedBeltKey)
  const canKeepLoading = Boolean(onLoadMore) && (!isExhausted || resolvedBeltKey === 'recommendations')
  const watchlistIdSet = useMemo(() => new Set(watchlistMovieIds), [watchlistMovieIds])

  if (items.length === 0) return null

  const beltItems = items.slice(0, visibleCount)
  const hasMoreItems = visibleCount < items.length || canKeepLoading
  const scrollBelt = (direction) => {
    beltRef.current?.scrollBy({
      left: direction === 'left' ? -Math.max(window.innerWidth * 0.72, 280) : Math.max(window.innerWidth * 0.72, 280),
      behavior: 'smooth'
    })
  }
  const loadMoreItems = async () => {
    if (isLoadingMore) return

    const targetCount = visibleCount + BELT_ITEM_BATCH_SIZE
    const previousScrollLeft = beltRef.current?.scrollLeft ?? 0
    const restoreThenAdvance = () => {
      window.requestAnimationFrame(() => {
        if (beltRef.current) {
          beltRef.current.scrollLeft = previousScrollLeft
        }

        window.requestAnimationFrame(() => scrollBelt('right'))
      })
    }

    if (targetCount > items.length && onLoadMore) {
      setLoadingMoreBeltKeys((currentKeys) => [...new Set([...currentKeys, resolvedBeltKey])])
      const didLoadMore = await onLoadMore()
      setLoadingMoreBeltKeys((currentKeys) => currentKeys.filter((key) => key !== resolvedBeltKey))

      if (!didLoadMore) {
        if (resolvedBeltKey !== 'recommendations') {
          setExhaustedBeltKeys((currentKeys) => [...new Set([...currentKeys, resolvedBeltKey])])
        }
        setBeltVisibleCounts((currentCounts) => ({
          ...currentCounts,
          [resolvedBeltKey]: items.length
        }))
        restoreThenAdvance()
        return
      }
    }

    setBeltVisibleCounts((currentCounts) => ({
      ...currentCounts,
      [resolvedBeltKey]: targetCount
    }))
    restoreThenAdvance()
  }

  return (
    <section className="content-belt" aria-labelledby={`belt-${title.replace(/\s+/g, '-').toLowerCase()}`}>
      <div className="content-belt-heading">
        <h2 id={`belt-${title.replace(/\s+/g, '-').toLowerCase()}`}>{title}</h2>
        {accent && <span>{accent}</span>}
        {headingAction}
        <div className="content-belt-controls">
          <button type="button" onClick={() => scrollBelt('left')} aria-label={`Scroll ${title} left`}>‹</button>
          <button type="button" onClick={() => scrollBelt('right')} aria-label={`Scroll ${title} right`}>›</button>
        </div>
      </div>

      <div className="content-belt-viewport" ref={beltRef}>
        <div className="content-belt-track">
          {beltItems.map((movie, index) => (
            <BeltCard
              key={`${title}-${movie.media_type}-${movie.id}`}
              movie={movie}
              index={index}
              onOpenTitle={onOpenTitle}
              onDismiss={onDismissTitle}
              onToggleWatchlist={onToggleWatchlist}
              isInWatchlist={watchlistIdSet.has(getMediaItemKey(movie))}
            />
          ))}
          {hasMoreItems && (
            <button
              type="button"
              className="content-belt-load-more"
              onClick={loadMoreItems}
              disabled={isLoadingMore}
              aria-label={`Load more ${title}`}
            >
              <span>{isLoadingMore ? 'Loading...' : 'Load more'}</span>
            </button>
          )}
        </div>
      </div>
    </section>
  )
})

const toggleArrayValue = (values = [], value, limit = Number.POSITIVE_INFINITY) => {
  const normalizedValue = typeof value === 'number' ? value : String(value).toLowerCase()
  const hasValue = values.includes(normalizedValue)

  if (hasValue) return values.filter((item) => item !== normalizedValue)
  return [...values, normalizedValue].slice(0, limit)
}

const TasteQuizModal = ({
  profile,
  genreOptions,
  onSave,
  onDismiss,
  isSaving = false
}) => {
  const [draftProfile, setDraftProfile] = useState(() => normalizeTasteProfileForApp(profile))

  const updateDraft = (updates) => {
    setDraftProfile((currentProfile) => normalizeTasteProfileForApp({
      ...currentProfile,
      ...updates
    }))
  }

  return (
    <div className="taste-modal-backdrop" role="presentation">
      <section className="taste-modal" role="dialog" aria-modal="true" aria-labelledby="taste-modal-title">
        <div className="taste-modal-header">
          <div>
            <p>Movieslo profile</p>
            <h2 id="taste-modal-title">Pick Your Taste</h2>
          </div>
          <button type="button" onClick={onDismiss} aria-label="Close taste quiz">
            ×
          </button>
        </div>

        <div className="taste-modal-scroll custom-scrollbar">
          <div className="taste-question">
            <h3>Genres</h3>
            <div className="taste-chip-grid">
              {genreOptions.map((genre) => (
                <button
                  key={`taste-genre-${genre.id}`}
                  type="button"
                  className={draftProfile.preferred_genre_ids.includes(genre.id) ? 'is-active' : ''}
                  onClick={() => updateDraft({
                    preferred_genre_ids: toggleArrayValue(draftProfile.preferred_genre_ids, genre.id, 8)
                  })}
                >
                  {genre.name}
                </button>
              ))}
            </div>
          </div>

          <div className="taste-question">
            <h3>Mood</h3>
            <div className="taste-chip-grid">
              {TASTE_MOOD_OPTIONS.map((mood) => (
                <button
                  key={`taste-mood-${mood.id}`}
                  type="button"
                  className={draftProfile.preferred_moods.includes(mood.id) ? 'is-active' : ''}
                  onClick={() => updateDraft({
                    preferred_moods: toggleArrayValue(draftProfile.preferred_moods, mood.id, 4)
                  })}
                >
                  {mood.label}
                </button>
              ))}
            </div>
          </div>

          <div className="taste-question-grid">
            <div className="taste-question">
              <h3>Format</h3>
              <div className="taste-segmented">
                {TASTE_MEDIA_OPTIONS.map((option) => (
                  <button
                    key={`taste-media-${option.id}`}
                    type="button"
                    className={draftProfile.preferred_media_type === option.id ? 'is-active' : ''}
                    onClick={() => updateDraft({ preferred_media_type: option.id })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="taste-question">
              <h3>Era</h3>
              <div className="taste-segmented">
                {TASTE_RELEASE_OPTIONS.map((option) => (
                  <button
                    key={`taste-release-${option.id}`}
                    type="button"
                    className={draftProfile.release_preference === option.id ? 'is-active' : ''}
                    onClick={() => updateDraft({ release_preference: option.id })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="taste-question">
              <h3>Length</h3>
              <div className="taste-segmented">
                {TASTE_RUNTIME_OPTIONS.map((option) => (
                  <button
                    key={`taste-runtime-${option.id}`}
                    type="button"
                    className={draftProfile.runtime_preference === option.id ? 'is-active' : ''}
                    onClick={() => updateDraft({ runtime_preference: option.id })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="taste-modal-actions">
          <button type="button" className="taste-secondary-action" onClick={onDismiss}>
            Later
          </button>
          <button
            type="button"
            className="taste-primary-action"
            onClick={() => onSave(draftProfile)}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save taste'}
          </button>
        </div>
      </section>
    </div>
  )
}

const ProfilePanel = ({
  isOpen,
  user,
  profile,
  genreList,
  favoriteCount = 0,
  watchlistCount = 0,
  historyCount = 0,
  recommendationCount = 0,
  recommendationPoolTarget = INITIAL_RECOMMENDATION_POOL_LIMIT,
  hiddenPickCount = 0,
  isTrustedDevice = false,
  isPasswordResetSending = false,
  statusMessage = '',
  onClose,
  onOpenTasteQuiz,
  onClearHiddenPicks,
  onClearWatchHistory,
  onRequestPasswordReset,
  onRequestDataDeletion,
  onLogout
}) => {
  if (!isOpen) return null

  const normalizedProfile = normalizeTasteProfileForApp(profile)
  const genreNameById = new Map(genreList.map((genre) => [genre.id, genre.name]))
  const selectedGenreNames = normalizedProfile.preferred_genre_ids
    .map((genreId) => genreNameById.get(genreId))
    .filter(Boolean)
  const moodLabels = normalizedProfile.preferred_moods
    .map((moodId) => TASTE_MOOD_OPTIONS.find((option) => option.id === moodId)?.label)
    .filter(Boolean)
  const mediaLabel = TASTE_MEDIA_OPTIONS.find((option) => option.id === normalizedProfile.preferred_media_type)?.label || 'Movies + TV'
  const releaseLabel = TASTE_RELEASE_OPTIONS.find((option) => option.id === normalizedProfile.release_preference)?.label || 'Mixed'
  const runtimeLabel = TASTE_RUNTIME_OPTIONS.find((option) => option.id === normalizedProfile.runtime_preference)?.label || 'Any length'
  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Profile'
  const joinedAt = user?.created_at
    ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(user.created_at))
    : 'Account active'

  return (
    <div className="profile-panel-backdrop" role="presentation">
      <section className="profile-panel" role="dialog" aria-modal="true" aria-labelledby="profile-panel-title">
        <div className="profile-panel-header">
          <div className="profile-avatar" aria-hidden="true">
            <UserIcon />
          </div>
          <div>
            <p>Account settings</p>
            <h2 id="profile-panel-title">Settings</h2>
            <span>{displayName}{user?.email ? ` - ${user.email}` : ''}</span>
          </div>
          <button type="button" className="profile-panel-close" onClick={onClose} aria-label="Close profile">
            ×
          </button>
        </div>

        <div className="account-settings-scroll custom-scrollbar">
          <div className="profile-settings-block">
            <div className="profile-block-heading">
              <UserIcon />
              <h3>Account</h3>
            </div>

            <div className="settings-row-list">
              <div className="settings-row">
                <div>
                  <span>Name</span>
                  <strong>{displayName}</strong>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <span>Email</span>
                  <strong>{user?.email || 'Signed in account'}</strong>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <span>Session</span>
                  <strong>{isTrustedDevice ? 'Trusted for this device' : 'Current browser session'}</strong>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <span>Created</span>
                  <strong>{joinedAt}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="profile-settings-block">
            <div className="profile-block-heading">
              <SettingsIcon />
              <h3>Taste Preferences</h3>
            </div>

            <div className="profile-taste-tags">
              {[...selectedGenreNames, ...moodLabels, mediaLabel, releaseLabel, runtimeLabel].slice(0, 12).map((label) => (
                <span key={`profile-tag-${label}`}>{label}</span>
              ))}
              {selectedGenreNames.length === 0 && moodLabels.length === 0 && (
                <span>Not tuned yet</span>
              )}
            </div>

            <div className="settings-row-list settings-row-list-spaced">
              <div className="settings-row">
                <div>
                  <span>Taste profile</span>
                  <strong>{selectedGenreNames.length > 0 || moodLabels.length > 0 ? 'Personalized' : 'Not tuned yet'}</strong>
                </div>
                <button type="button" className="settings-row-action" onClick={onOpenTasteQuiz}>
                  Edit
                </button>
              </div>
              <div className="settings-row">
                <div>
                  <span>Hidden picks</span>
                  <strong>{hiddenPickCount}</strong>
                </div>
                <button type="button" className="settings-row-action" onClick={onClearHiddenPicks} disabled={hiddenPickCount === 0}>
                  Clear
                </button>
              </div>
            </div>
          </div>

          <div className="profile-settings-block">
            <div className="profile-block-heading">
              <VideoCameraIcon />
              <h3>Library</h3>
            </div>

            <div className="settings-row-list">
              <div className="settings-row">
                <div>
                  <span>Favorites</span>
                  <strong>{favoriteCount}</strong>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <span>Watchlist</span>
                  <strong>{watchlistCount}</strong>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <span>Watch history</span>
                  <strong>{historyCount}</strong>
                </div>
                <button type="button" className="settings-row-action" onClick={onClearWatchHistory} disabled={historyCount === 0}>
                  Clear
                </button>
              </div>
              <div className="settings-row">
                <div>
                  <span>Recommendation pool</span>
                  <strong>{recommendationCount} / {recommendationPoolTarget} target</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="profile-settings-block">
            <div className="profile-block-heading">
              <LogOutIcon />
              <h3>Security</h3>
            </div>

            <div className="settings-row-list">
              <div className="settings-row">
                <div>
                  <span>Password</span>
                  <strong>Reset by email</strong>
                </div>
                <button
                  type="button"
                  className="settings-row-action"
                  onClick={onRequestPasswordReset}
                  disabled={isPasswordResetSending}
                >
                  {isPasswordResetSending ? 'Sending...' : 'Send reset'}
                </button>
              </div>
              <div className="settings-row settings-row-danger">
                <div>
                  <span>Account data</span>
                  <strong>Permanent deletion</strong>
                </div>
                <button type="button" className="settings-row-action settings-row-danger-action" onClick={onRequestDataDeletion}>
                  Request data deletion
                </button>
              </div>
            </div>
          </div>
        </div>

        {statusMessage && <p className="profile-status-message">{statusMessage}</p>}

        <div className="profile-actions">
          <button type="button" className="profile-logout-action" onClick={onLogout}>
            Log out
          </button>
          <button type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </section>
    </div>
  )
}

const WatchRoute = ({ mediaType, id, authUser, onWatchProgress }) => {
  const navigate = useNavigate()
  const watchLocation = useLocation()
  const [movie, setMovie] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasLoadError, setHasLoadError] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState(DEFAULT_STREAMING_PROVIDER_ID)
  const [seasonOptions, setSeasonOptions] = useState([])
  const [episodeOptions, setEpisodeOptions] = useState([])
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState(null)
  const [selectedEpisodeNumber, setSelectedEpisodeNumber] = useState(null)
  const [isServerMenuOpen, setIsServerMenuOpen] = useState(false)
  const [watchedSeconds, setWatchedSeconds] = useState(0)
  const watchStartedAtRef = useRef(Date.now())
  const latestProgressRef = useRef(null)
  const lastRemoteProgressSaveRef = useRef(0)
  const providers = useMemo(() => getStreamingProviders(), [])
  const isTvShow = mediaType === 'tv'
  const initialResumeTimeSeconds = useMemo(() => {
    const params = new URLSearchParams(watchLocation.search)
    return getResumeTimeSeconds({ resume_time_seconds: params.get('t') || params.get('start') })
  }, [watchLocation.search])

  useEffect(() => {
    const loadWatchTitle = async () => {
      setIsLoading(true)
      setHasLoadError(false)
      setMovie(null)
      setSeasonOptions([])
      setEpisodeOptions([])
      setSelectedSeasonNumber(null)
      setSelectedEpisodeNumber(null)
      setWatchedSeconds(initialResumeTimeSeconds)
      watchStartedAtRef.current = Date.now()
      lastRemoteProgressSaveRef.current = 0

      try {
        const detailEndpoint = isTvShow ? 'tv' : 'movie'
        const detailData = await fetchJson(
          `watch-detail:${mediaType}:${id}`,
          async () => {
            const response = await fetch(`${API_BASE_URL}/${detailEndpoint}/${id}`, API_OPTIONS)
            if (!response.ok) throw new Error(`Request failed: ${response.status}`)
            return response.json()
          },
          5 * CACHE_TTL_MS
        )
        const normalizedItem = normalizeMediaItem(detailData, mediaType)
        const validSeasons = isTvShow
          ? (detailData.seasons || []).filter((season) => season.season_number > 0)
          : []

        setMovie(normalizedItem)
        setSeasonOptions(validSeasons)
        setSelectedSeasonNumber(validSeasons[0]?.season_number || null)
      } catch (error) {
        console.log(`Error loading watch title: ${error}`)
        setHasLoadError(true)
      } finally {
        setIsLoading(false)
      }
    }

    loadWatchTitle()
  }, [id, initialResumeTimeSeconds, isTvShow, mediaType])

  useEffect(() => {
    const loadEpisodes = async () => {
      if (!isTvShow || !selectedSeasonNumber) {
        setEpisodeOptions([])
        setSelectedEpisodeNumber(null)
        return
      }

      try {
        const data = await fetchJson(
          `watch-season:${id}:${selectedSeasonNumber}`,
          async () => {
            const response = await fetch(`${API_BASE_URL}/tv/${id}/season/${selectedSeasonNumber}`, API_OPTIONS)
            if (!response.ok) throw new Error(`Request failed: ${response.status}`)
            return response.json()
          },
          5 * CACHE_TTL_MS
        )
        const validEpisodes = (data.episodes || []).filter((episode) => episode.episode_number > 0)

        setEpisodeOptions(validEpisodes)
        setSelectedEpisodeNumber(validEpisodes[0]?.episode_number || null)
      } catch (error) {
        console.log(`Error loading watch episodes: ${error}`)
        setEpisodeOptions([])
        setSelectedEpisodeNumber(null)
      }
    }

    loadEpisodes()
  }, [id, isTvShow, selectedSeasonNumber])

  const selectedProviderDetails = providers.find((provider) => provider.id === selectedProvider) || providers[0]
  const playerUrl = useMemo(() => {
    if (!movie?.id || !selectedProviderDetails) return ''

    if (isTvShow) {
      if (!selectedSeasonNumber || !selectedEpisodeNumber) return ''
      return selectedProviderDetails.tvEpisodeUrl(movie.id, selectedSeasonNumber, selectedEpisodeNumber)
    }

    return selectedProviderDetails.movieUrl(movie.id)
  }, [
    isTvShow,
    movie?.id,
    selectedEpisodeNumber,
    selectedProviderDetails,
    selectedSeasonNumber
  ])
  const playerUrlWithResume = useMemo(
    () => appendPlaybackTimestamp(playerUrl, initialResumeTimeSeconds),
    [initialResumeTimeSeconds, playerUrl]
  )
  const selectedEpisodeDetails = isTvShow
    ? episodeOptions.find((episode) => episode.episode_number === selectedEpisodeNumber)
    : null
  const durationSeconds = Math.max(
    Number(selectedEpisodeDetails?.runtime || 0) * 60,
    Number(movie?.runtime || 0) * 60,
    1
  )
  const backdropUrl = movie?.backdrop_path
    ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}`
    : '/hero-bg.png'

  useEffect(() => {
    if (!authUser?.id || !movie?.id) return undefined

    const getProgressMovie = ({ updateTimer = true } = {}) => {
      const elapsedSeconds = Math.floor((Date.now() - watchStartedAtRef.current) / 1000)
      const resumeTimeSeconds = initialResumeTimeSeconds + Math.max(elapsedSeconds, 0)
      const progressPercent = durationSeconds > 1
        ? clampNumber(Math.round((resumeTimeSeconds / durationSeconds) * 100), 0, 99)
        : 0
      const progressMovie = {
        ...movie,
        resume_time_seconds: resumeTimeSeconds,
        progress_percent: progressPercent,
        watch_duration_seconds: durationSeconds
      }

      latestProgressRef.current = progressMovie
      if (updateTimer) {
        setWatchedSeconds(resumeTimeSeconds)
      }
      upsertLocalWatchHistoryItem(authUser.id, progressMovie)
      onWatchProgress?.(progressMovie)
      return progressMovie
    }

    const writeProgress = ({ forceRemote = false, updateTimer = true } = {}) => {
      const progressMovie = getProgressMovie({ updateTimer })
      const now = Date.now()

      if (!forceRemote && now - lastRemoteProgressSaveRef.current < 10000) return

      lastRemoteProgressSaveRef.current = now

      authApi.trackRecentlyWatched(authUser.id, progressMovie, {
        resume_time_seconds: progressMovie.resume_time_seconds,
        progress_percent: progressMovie.progress_percent,
        watch_duration_seconds: progressMovie.watch_duration_seconds
      }).catch((error) => {
        console.log(`Error saving watch progress: ${error}`)
      })
    }

    writeProgress({ forceRemote: true })
    const tickId = window.setInterval(getProgressMovie, 1000)
    const saveId = window.setInterval(writeProgress, 5000)
    const writeFinalProgress = () => writeProgress({ forceRemote: true, updateTimer: false })
    window.addEventListener('pagehide', writeFinalProgress)
    window.addEventListener('beforeunload', writeFinalProgress)

    return () => {
      window.clearInterval(tickId)
      window.clearInterval(saveId)
      window.removeEventListener('pagehide', writeFinalProgress)
      window.removeEventListener('beforeunload', writeFinalProgress)
      writeFinalProgress()
    }
  }, [
    authUser?.id,
    durationSeconds,
    initialResumeTimeSeconds,
    movie,
    onWatchProgress
  ])

  if (isLoading) {
    return (
      <AppShell>
        <div className="watch-loader-state">
          <Spinner label="Loading player" />
        </div>
      </AppShell>
    )
  }

  const leaveWatchPage = () => {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }

    navigate('/')
  }

  if (!movie || hasLoadError) {
    return (
      <AppShell>
        <div className="watch-loader-state">
          <div className="watch-error-card">
            <h1>Title unavailable</h1>
            <button type="button" onClick={leaveWatchPage}>Back home</button>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="watch-page" style={{ backgroundImage: `url(${backdropUrl})` }}>
        <div className="watch-page-shade" />

        <header className="watch-header">
          <button type="button" className="watch-back-button" onClick={leaveWatchPage}>
            Back
          </button>
          <div>
            <p>Now playing</p>
            <h1>{movie.title}</h1>
          </div>
          {authUser?.id && (
            <div className="watch-progress-pill" aria-label={`Watched ${formatResumeTime(watchedSeconds)}`}>
              <span>Watched</span>
              <strong>{formatResumeTime(watchedSeconds)}</strong>
            </div>
          )}
        </header>

        <section className="watch-player-shell" aria-label={`${movie.title} player`}>
          {playerUrlWithResume ? (
            <iframe
              key={playerUrlWithResume}
              src={playerUrlWithResume}
              title={`${movie.title} player`}
              className="watch-player-frame"
              loading="eager"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="autoplay *; encrypted-media *; picture-in-picture *; web-share *"
              allowFullScreen
            />
          ) : (
            <div className="watch-player-empty">Select a server, season, and episode to begin playback.</div>
          )}
        </section>

        <aside className="watch-server-panel">
          <div className="watch-server-heading">
            <span>Playback server</span>
            <button type="button" onClick={() => setIsServerMenuOpen((open) => !open)}>
              {isServerMenuOpen ? 'Close' : 'Change'}
            </button>
          </div>

          <label className="watch-server-select-label">
            <span className="sr-only">Streaming server</span>
            <button
              type="button"
              className="watch-server-current"
              onClick={() => setIsServerMenuOpen((open) => !open)}
              aria-expanded={isServerMenuOpen}
            >
              <span>{selectedProviderDetails?.label || selectedProviderDetails?.name}</span>
              <span aria-hidden="true">⌄</span>
            </button>
          </label>

          {isServerMenuOpen && (
            <div className="watch-server-options" role="listbox" aria-label="Streaming servers">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  className={selectedProvider === provider.id ? 'is-active' : ''}
                  onClick={() => {
                    setSelectedProvider(provider.id)
                    setIsServerMenuOpen(false)
                  }}
                  role="option"
                  aria-selected={selectedProvider === provider.id}
                >
                  {provider.label || provider.name}
                </button>
              ))}
            </div>
          )}

          {isTvShow && (
            <div className="watch-episode-grid">
              <label>
                <span>Season</span>
                <select value={selectedSeasonNumber ?? ''} onChange={(event) => setSelectedSeasonNumber(Number(event.target.value))}>
                  {seasonOptions.map((season) => (
                    <option key={season.season_number} value={season.season_number}>
                      {season.name || `Season ${season.season_number}`}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Episode</span>
                <select value={selectedEpisodeNumber ?? ''} onChange={(event) => setSelectedEpisodeNumber(Number(event.target.value))}>
                  {episodeOptions.map((episode) => (
                    <option key={episode.episode_number} value={episode.episode_number}>
                      Episode {episode.episode_number}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </aside>
      </div>
    </AppShell>
  )
}

const BrowsePage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const detailMatch = location.pathname.match(/^\/title\/(movie|tv)\/(\d+)$/)
  const watchMatch = location.pathname.match(/^\/watch\/(movie|tv)\/(\d+)$/)
  const authMatch = location.pathname.match(/^\/account\/(login|signup)$/)
  const legalDocumentType = location.pathname === TERMS_PATH
    ? 'terms'
    : location.pathname === PRIVACY_PATH
      ? 'privacy'
      : null
  const activeDetailMediaType = detailMatch?.[1] || null
  const activeDetailId = detailMatch?.[2] || null
  const activeWatchMediaType = watchMatch?.[1] || null
  const activeWatchId = watchMatch?.[2] || null
  const [searchTerm, setSearchTerm] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [movieList, setMovieList] = useState([])
  const [trendingMovies, setTrendingMovies] = useState([])
  const [topRatedMovies, setTopRatedMovies] = useState([])
  const [recommendationPoolMovies, setRecommendationPoolMovies] = useState([])
  const [recommendationPoolLimit, setRecommendationPoolLimit] = useState(INITIAL_RECOMMENDATION_POOL_LIMIT)
  const [recommendationRotationWindow, setRecommendationRotationWindow] = useState(() => getRecommendationRotationWindow())
  const [genreRows, setGenreRows] = useState([])
  const [beltPages, setBeltPages] = useState({ popular: 1, topRated: 1, trending: 1, recommendations: 1 })
  const [beltVisibleCounts, setBeltVisibleCounts] = useState({})
  const [loadingMoreBeltKeys, setLoadingMoreBeltKeys] = useState([])
  const [exhaustedBeltKeys, setExhaustedBeltKeys] = useState([])
  const [heroTitle, setHeroTitle] = useState(null)
  const [heroTrailerUrl, setHeroTrailerUrl] = useState('')
  const [heroIndex, setHeroIndex] = useState(0)
  const [heroQueueMode, setHeroQueueMode] = useState('trending')
  const [isHeroCollapsed, setIsHeroCollapsed] = useState(false)
  const [heroVolume, setHeroVolume] = useState(0.25)
  const [isHeroMuted, setIsHeroMuted] = useState(false)
  const [favoriteMovies, setFavoriteMovies] = useState([])
  const [watchlistMovies, setWatchlistMovies] = useState([])
  const [recentlyWatchedMovies, setRecentlyWatchedMovies] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchTitleResults, setSearchTitleResults] = useState([])
  const [personResults, setPersonResults] = useState([])
  const [selectedPersonResult, setSelectedPersonResult] = useState(null)
  const [isPersonSearchLoading, setIsPersonSearchLoading] = useState(false)
  const [isPersonTitlesLoading, setIsPersonTitlesLoading] = useState(false)
  const [_isTrendingLoading, setIsTrendingLoading] = useState(false)
  const [_isTopRatedLoading, setIsTopRatedLoading] = useState(false)
  const [isGenreRowsLoading, setIsGenreRowsLoading] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isWatchlistFocused, setIsWatchlistFocused] = useState(false)
  const [_isFavoritesLoading, setIsFavoritesLoading] = useState(false)
  const [_isWatchlistLoading, setIsWatchlistLoading] = useState(false)
  const [_isRecentlyWatchedLoading, setIsRecentlyWatchedLoading] = useState(false)
  const [debouncedSearchTerm] = useDebounce(searchTerm, 500)
  const [mediaFilter, setMediaFilter] = useState('movie')
  const [genreList, setGenreList] = useState([])
  const [selectedGenreIds, setSelectedGenreIds] = useState([])
  const [_isGenrePanelOpen, setIsGenrePanelOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [movieRuntimeMap, setMovieRuntimeMap] = useState({})
  const [authUser, setAuthUser] = useState(null)
  const [_isAuthLoading, setIsAuthLoading] = useState(true)
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false)
  const [authErrorMessage, setAuthErrorMessage] = useState('')
  const [tasteProfile, setTasteProfile] = useState(DEFAULT_TASTE_PROFILE)
  const [isTasteQuizOpen, setIsTasteQuizOpen] = useState(false)
  const [isSavingTasteProfile, setIsSavingTasteProfile] = useState(false)
  const [isPasswordResetSending, setIsPasswordResetSending] = useState(false)
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(false)
  const [hasDismissedTasteQuizThisSession, setHasDismissedTasteQuizThisSession] = useState(false)
  const [profileStatusMessage, setProfileStatusMessage] = useState('')
  const [deletionNotice, setDeletionNotice] = useState('')
  const [hasAcceptedCookieNotice, setHasAcceptedCookieNotice] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem(COOKIE_NOTICE_STORAGE_KEY) === 'accepted'
  })
  const moviesSectionRef = useRef(null)
  const browseRowsRef = useRef(null)
  const _trendingRowRef = useRef(null)
  const topRatedRowRef = useRef(null)
  const favoritesRowRef = useRef(null)
  const _recentlyWatchedRowRef = useRef(null)
  const heroVideoRef = useRef(null)
  const tasteProfileRef = useRef(DEFAULT_TASTE_PROFILE)
  const tasteProfileSyncTimeoutRef = useRef(null)
  const skipNextTitleFetchRef = useRef(false)

  const selectedGenreSet = useMemo(() => new Set(selectedGenreIds), [selectedGenreIds])
  const mediaPluralLabel = useMemo(() => getMediaPluralLabel(mediaFilter), [mediaFilter])

  const _selectedGenreName = useMemo(() => {
    if (selectedGenreIds.length !== 1) return 'All genres'

    return genreList.find((genre) => genre.id === selectedGenreIds[0])?.name || 'All genres'
  }, [genreList, selectedGenreIds])

  const _filteredFavoriteMovies = useMemo(() => {
    if (selectedGenreIds.length === 0) {
      return favoriteMovies
    }

    return favoriteMovies.filter((movie) =>
      movie.genre_ids?.some((genreId) => selectedGenreSet.has(genreId))
    )
  }, [favoriteMovies, selectedGenreIds, selectedGenreSet])

  const _filteredRecentlyWatchedMovies = useMemo(() => {
    if (selectedGenreIds.length === 0) {
      return recentlyWatchedMovies
    }

    return recentlyWatchedMovies.filter((movie) =>
      movie.genre_ids?.some((genreId) => selectedGenreSet.has(genreId))
    )
  }, [recentlyWatchedMovies, selectedGenreIds, selectedGenreSet])

  const favoriteMovieIds = useMemo(
    () => favoriteMovies.map((movie) => getMediaItemKey(movie)),
    [favoriteMovies]
  )
  const watchlistMovieIds = useMemo(
    () => watchlistMovies.map((movie) => getMediaItemKey(movie)),
    [watchlistMovies]
  )

  const isAuthenticated = Boolean(authUser)
  const authMode = authMatch?.[1] === 'signup' ? 'signup' : 'login'
  const isAuthRouteOpen = Boolean(authMatch)
  const heroEffectiveVolume = isHeroMuted ? 0 : heroVolume

  const sendHeroVideoCommand = useCallback((command, args = []) => {
    heroVideoRef.current?.contentWindow?.postMessage(
      JSON.stringify({
        event: 'command',
        func: command,
        args
      }),
      '*'
    )
  }, [])

  const syncHeroAudio = useCallback(() => {
    if (!heroTrailerUrl || !heroVideoRef.current) return

    sendHeroVideoCommand('setVolume', [Math.round(heroVolume * 100)])
    sendHeroVideoCommand(isHeroMuted || heroVolume <= 0 ? 'mute' : 'unMute')
    sendHeroVideoCommand('playVideo')
  }, [heroTrailerUrl, heroVolume, isHeroMuted, sendHeroVideoCommand])

  const toggleHeroAudio = () => {
    setIsHeroMuted((currentlyMuted) => {
      const nextMuted = !currentlyMuted
      sendHeroVideoCommand(nextMuted ? 'mute' : 'unMute')
      sendHeroVideoCommand('setVolume', [Math.round(heroVolume * 100)])
      sendHeroVideoCommand('playVideo')
      return nextMuted
    })
  }

  const changeHeroVolume = (event) => {
    const nextVolume = clampNumber(Number(event.target.value), 0, 1)
    setHeroVolume(nextVolume)
    setIsHeroMuted(nextVolume <= 0)

    sendHeroVideoCommand('setVolume', [Math.round(nextVolume * 100)])
    sendHeroVideoCommand(nextVolume <= 0 ? 'mute' : 'unMute')
    sendHeroVideoCommand('playVideo')
  }

  const enrichMoviesWithRuntime = (movies) => upsertRuntime(movies, movieRuntimeMap)
  const activeTasteProfile = useMemo(() => normalizeTasteProfileForApp(tasteProfile), [tasteProfile])
  const tasteGenreOptions = useMemo(() => getTasteGenreOptions(genreList), [genreList])
  const recommendationRotationSeed = useMemo(() => [
    authUser?.id || 'guest',
    mediaFilter,
    selectedGenreIds.join(',') || 'all',
    recommendationRotationWindow
  ].join(':'), [authUser?.id, mediaFilter, recommendationRotationWindow, selectedGenreIds])
  const preferredPeopleSignature = useMemo(
    () => activeTasteProfile.preferred_people.map((person) => `${person.id}:${person.searched_at}`).join('|'),
    [activeTasteProfile.preferred_people]
  )

  useEffect(() => {
    tasteProfileRef.current = activeTasteProfile
  }, [activeTasteProfile])

  useEffect(() => {
    const rotationInterval = window.setInterval(() => {
      setRecommendationRotationWindow(getRecommendationRotationWindow())
    }, RECOMMENDATION_ROTATION_REFRESH_MS)

    return () => {
      window.clearInterval(rotationInterval)
    }
  }, [])

  useEffect(() => () => {
    if (tasteProfileSyncTimeoutRef.current) {
      window.clearTimeout(tasteProfileSyncTimeoutRef.current)
    }
  }, [])

  const recommendationItems = useMemo(() => buildRecommendations({
    movieList,
    trendingMovies,
    topRatedMovies,
    recommendationPoolMovies,
    favoriteMovies,
    recentlyWatchedMovies,
    genreRows,
    genreList,
    selectedGenreIds,
    tasteProfile: activeTasteProfile,
    runtimeMap: movieRuntimeMap,
    recommendationLimit: recommendationPoolLimit,
    recommendationRotationSeed
  }), [
    activeTasteProfile,
    favoriteMovies,
    genreList,
    genreRows,
    movieList,
    movieRuntimeMap,
    recommendationPoolMovies,
    recommendationPoolLimit,
    recommendationRotationSeed,
    recentlyWatchedMovies,
    selectedGenreIds,
    topRatedMovies,
    trendingMovies
  ])
  const personalizedSearchResults = useMemo(() => {
    if (debouncedSearchTerm.trim().length < SEARCH_MIN_LENGTH) return []

    const rankedResults = buildRecommendations({
      movieList: searchTitleResults,
      trendingMovies: [],
      topRatedMovies: [],
      favoriteMovies,
      recentlyWatchedMovies: [],
      genreRows: [],
      genreList,
      selectedGenreIds,
      tasteProfile: activeTasteProfile,
      runtimeMap: movieRuntimeMap
    })
    const rankedKeys = new Set(rankedResults.map((movie) => getMediaItemKey(movie)))
    const remainingResults = searchTitleResults.filter((movie) => !rankedKeys.has(getMediaItemKey(movie)))

    return [...rankedResults, ...remainingResults]
  }, [
    activeTasteProfile,
    debouncedSearchTerm,
    favoriteMovies,
    genreList,
    movieRuntimeMap,
    searchTitleResults,
    selectedGenreIds
  ])
  const recommendationAccent = isAuthenticated
    ? activeTasteProfile.completed_onboarding ? '5-day mix' : 'Tune your taste'
    : 'Log in for personal picks'
  const heroQueueItems = useMemo(() => {
    const queueByMode = {
      trending: trendingMovies,
      popular: movieList,
      recommended: recommendationItems
    }
    const selectedQueue = queueByMode[heroQueueMode] || trendingMovies
    const fallbackQueue = selectedQueue.length > 0 ? selectedQueue : trendingMovies

    return fallbackQueue.filter((movie) => movie.backdrop_path || movie.poster_path)
  }, [heroQueueMode, movieList, recommendationItems, trendingMovies])

  const fetchGenres = async (selectedMediaFilter) => {
    try {
        const mediaTypes = getSectionMediaTypes(selectedMediaFilter)
        const genreResponses = await Promise.all(
          mediaTypes.map(async (mediaType) => {
            const endpoint = mediaType === 'tv' ? 'tv' : 'movie'
            const data = await fetchJson(
              `genres:${endpoint}`,
              async () => {
                const response = await fetch(`${API_BASE_URL}/genre/${endpoint}/list`, API_OPTIONS)
                if (!response.ok) throw new Error(`Request failed: ${response.status}`)
                return response.json()
              },
              PERSISTENT_CACHE_TTL_MS
            )
            return data.genres || []
          })
        )

      const mergedGenres = genreResponses
        .flat()
        .reduce((genreMap, genre) => genreMap.set(genre.id, genre), new Map())

      setGenreList(Array.from(mergedGenres.values()).sort((a, b) => a.name.localeCompare(b.name)))
    } catch (error) {
      console.log(`Error fetching genres: ${error}`)
      setGenreList([])
    }
  }

  const fetchMovies = async (query = '', genreIds = [], page = 1, selectedMediaFilter = 'movie') => {
    setIsLoading(true)
    setErrorMessage('')
    setSelectedPersonResult(null)

    try {
      const normalizedQuery = query.trim()

      if (normalizedQuery.length > 0 && normalizedQuery.length < SEARCH_MIN_LENGTH) {
        setMovieList([])
        setTotalPages(1)
        setErrorMessage(`Enter at least ${SEARCH_MIN_LENGTH} characters to search`)
        return
      }

      const params = new URLSearchParams({
        page: page.toString(),
        include_adult: 'false',
        language: 'en-US'
      })

      const detailEndpoint = selectedMediaFilter === 'tv' ? 'tv' : 'movie'
      let endpoint = `${API_BASE_URL}/discover/${detailEndpoint}`

      if (normalizedQuery) {
        params.set('query', normalizedQuery)
        endpoint = `${API_BASE_URL}/search/${detailEndpoint}`
      } else {
        params.set('sort_by', 'popularity.desc')
      }

      if (genreIds.length > 0) {
        params.set('with_genres', genreIds.join(','))
      }

      const requestUrl = `${selectedMediaFilter}:${normalizedQuery}:${genreIds.join(',')}:${page}:${params.toString()}`
      const cacheKey = getCacheKey('titles', requestUrl)
      const data = getCacheEntry(cacheKey) || await fetchJson(
        cacheKey,
        async () => {
          const response = await fetch(`${endpoint}?${params.toString()}`, API_OPTIONS)
          if (!response.ok) throw new Error(`Request failed: ${response.status}`)
          return response.json()
        },
        PERSISTENT_CACHE_TTL_MS
      )

      if (!getCacheEntry(cacheKey)) {
        setCacheEntry(cacheKey, data)
      }

      const normalizedResults = normalizeMediaList(data.results || [], selectedMediaFilter)

      setMovieList(enrichMoviesWithRuntime(normalizedResults))
      setBeltPages((currentPages) => ({ ...currentPages, popular: page }))
      setTotalPages(Math.min(data.total_pages || 1, 500))
    } catch (error) {
      console.log(`Error fetching titles: ${error}`)
      setErrorMessage('Error fetching titles. Please try again later')
      setMovieList([])
    } finally {
      setIsLoading(false)
    }
  }

  const fetchSearchTitles = async (query = '', selectedMediaFilter = 'movie') => {
    const normalizedQuery = query.trim()

    if (normalizedQuery.length < SEARCH_MIN_LENGTH) {
      setSearchTitleResults([])
      return
    }

    try {
      const detailEndpoint = selectedMediaFilter === 'tv' ? 'tv' : 'movie'
      const params = new URLSearchParams({
        query: normalizedQuery,
        page: '1',
        include_adult: 'false',
        language: 'en-US'
      })
      const requestUrl = `${selectedMediaFilter}:${normalizedQuery}:${params.toString()}`
      const cacheKey = getCacheKey('title-search', requestUrl)
      const data = await fetchJson(
        cacheKey,
        async () => {
          const response = await fetch(`${API_BASE_URL}/search/${detailEndpoint}?${params.toString()}`, API_OPTIONS)
          if (!response.ok) throw new Error(`Request failed: ${response.status}`)
          return response.json()
        },
        PERSISTENT_CACHE_TTL_MS
      )

      setSearchTitleResults(enrichMoviesWithRuntime(normalizeMediaList(data.results || [], selectedMediaFilter)))
    } catch (error) {
      console.log(`Error fetching search titles: ${error}`)
      setSearchTitleResults([])
    }
  }

  const fetchPeople = async (query = '') => {
    const normalizedQuery = query.trim()

    if (normalizedQuery.length < SEARCH_MIN_LENGTH) {
      setPersonResults([])
      setSelectedPersonResult(null)
      setIsPersonSearchLoading(false)
      return
    }

    setIsPersonSearchLoading(true)

    try {
      const params = new URLSearchParams({
        query: normalizedQuery,
        include_adult: 'false',
        language: 'en-US',
        page: '1'
      })
      const cacheKey = getCacheKey('people', params.toString())
      const data = await fetchJson(
        cacheKey,
        async () => {
          const response = await fetch(`${API_BASE_URL}/search/person?${params.toString()}`, API_OPTIONS)
          if (!response.ok) throw new Error(`Request failed: ${response.status}`)
          return response.json()
        },
        PERSISTENT_CACHE_TTL_MS
      )
      const people = (data.results || [])
        .filter((person) => person?.id && person.name)
        .sort((firstPerson, secondPerson) => Number(secondPerson.popularity || 0) - Number(firstPerson.popularity || 0))
        .slice(0, 6)

      setPersonResults(people)
    } catch (error) {
      console.log(`Error fetching people: ${error}`)
      setPersonResults([])
    } finally {
      setIsPersonSearchLoading(false)
    }
  }

  const learnFromPersonSearch = (person, credits = []) => {
    if (!person?.id) return

    const currentProfile = tasteProfileRef.current
    const learnedPerson = normalizePreferredPeople([{
      id: person.id,
      name: person.name,
      profile_path: person.profile_path,
      known_for_department: person.known_for_department,
      searched_at: new Date().toISOString()
    }])[0]

    if (!learnedPerson) return

    const nextProfile = normalizeTasteProfileForApp({
      ...currentProfile,
      completed_onboarding: currentProfile.completed_onboarding,
      preferred_people: [
        learnedPerson,
        ...currentProfile.preferred_people.filter((entry) => entry.id !== learnedPerson.id)
      ]
    })

    saveTasteProfile(nextProfile, { syncAccount: false })
    queueTasteProfileSync(nextProfile)

    if (credits.length > 0) {
      setRecommendationPoolMovies((currentMovies) =>
        appendUniqueMediaItems(currentMovies, enrichMoviesWithRuntime(credits.slice(0, 36)))
      )
      setExhaustedBeltKeys((currentKeys) => currentKeys.filter((key) => key !== 'recommendations'))
    }
  }

  const loadPersonTitles = async (person) => {
    if (!person?.id) return

    setSelectedPersonResult(person)
    setIsWatchlistFocused(false)
    setIsPersonTitlesLoading(true)
    setErrorMessage('')

    try {
      const data = await fetchJson(
        getCacheKey('person-credits', `${person.id}:combined`),
        async () => {
          const response = await fetch(`${API_BASE_URL}/person/${person.id}/combined_credits?language=en-US`, API_OPTIONS)
          if (!response.ok) throw new Error(`Request failed: ${response.status}`)
          return response.json()
        },
        PERSISTENT_CACHE_TTL_MS
      )
      const normalizedCredits = normalizeMediaList([...(data.cast || []), ...(data.crew || [])], mediaFilter)
        .filter((item) => (mediaFilter === 'tv' ? item.media_type === 'tv' : item.media_type === 'movie'))
        .filter((item) => item.poster_path || item.backdrop_path)
        .sort((firstItem, secondItem) => {
          const firstDate = Date.parse(firstItem.release_date || '') || 0
          const secondDate = Date.parse(secondItem.release_date || '') || 0
          if (secondDate !== firstDate) return secondDate - firstDate
          return Number(secondItem.popularity || 0) - Number(firstItem.popularity || 0)
        })

      learnFromPersonSearch(person, normalizedCredits)
      setMovieList(enrichMoviesWithRuntime(appendUniqueMediaItems([], normalizedCredits)))
      skipNextTitleFetchRef.current = true
      setCurrentPage(1)
      setTotalPages(1)
      setIsHeroCollapsed(true)
      setIsSearchOpen(false)
    } catch (error) {
      console.log(`Error loading person titles: ${error}`)
      setErrorMessage(`Could not load titles for ${person.name}. Please try again later.`)
    } finally {
      setIsPersonTitlesLoading(false)
    }
  }

  const loadPreferredPeopleRecommendations = async (people = []) => {
    const preferredPeople = normalizePreferredPeople(people).slice(0, 3)
    if (preferredPeople.length === 0) return

    try {
      const settledCredits = await Promise.allSettled(
        preferredPeople.map(async (person) => {
          const data = await fetchJson(
            getCacheKey('person-credits', `${person.id}:combined`),
            async () => {
              const response = await fetch(`${API_BASE_URL}/person/${person.id}/combined_credits?language=en-US`, API_OPTIONS)
              if (!response.ok) throw new Error(`Request failed: ${response.status}`)
              return response.json()
            },
            PERSISTENT_CACHE_TTL_MS
          )

          return normalizeMediaList([...(data.cast || []), ...(data.crew || [])], mediaFilter)
            .filter((item) => (mediaFilter === 'tv' ? item.media_type === 'tv' : item.media_type === 'movie'))
            .filter((item) => item.poster_path || item.backdrop_path)
            .sort((firstItem, secondItem) => Number(secondItem.popularity || 0) - Number(firstItem.popularity || 0))
            .slice(0, 18)
        })
      )
      const learnedTitles = settledCredits
        .filter((result) => result.status === 'fulfilled')
        .flatMap((result) => result.value)

      if (learnedTitles.length === 0) return

      setRecommendationPoolMovies((currentMovies) =>
        appendUniqueMediaItems(currentMovies, enrichMoviesWithRuntime(learnedTitles))
      )
      setExhaustedBeltKeys((currentKeys) => currentKeys.filter((key) => key !== 'recommendations'))
    } catch (error) {
      console.log(`Error loading preferred people recommendations: ${error}`)
    }
  }

  const fetchTrendingTitles = async (selectedMediaFilter = 'movie') => {
    setIsTrendingLoading(true)

    try {
      const requestUrl = `${selectedMediaFilter}:week`
      const cacheKey = getCacheKey('trending', requestUrl)
      const data = getCacheEntry(cacheKey) || await fetchJson(
        cacheKey,
        async () => {
          const response = await fetch(`${API_BASE_URL}/trending/${selectedMediaFilter}/week`, API_OPTIONS)
          if (!response.ok) throw new Error(`Request failed: ${response.status}`)
          return response.json()
        },
        PERSISTENT_CACHE_TTL_MS
      )

      if (!getCacheEntry(cacheKey)) {
        setCacheEntry(cacheKey, data)
      }

      const results = normalizeMediaList((data.results || []).slice(0, 20), selectedMediaFilter)

      setTrendingMovies(enrichMoviesWithRuntime(results))
      setBeltPages((currentPages) => ({ ...currentPages, trending: 1 }))
    } catch (error) {
      console.log(`Error fetching trending titles: ${error}`)
      setTrendingMovies([])
    } finally {
      setIsTrendingLoading(false)
    }
  }

  const fetchTopRatedTitles = async (genreIds = [], selectedMediaFilter = 'movie') => {
    setIsTopRatedLoading(true)

    try {
      const params = new URLSearchParams({
        sort_by: 'vote_average.desc',
        'vote_count.gte': '200',
        include_adult: 'false',
        page: '1',
        language: 'en-US'
      })

      if (genreIds.length > 0) {
        params.set('with_genres', genreIds.join(','))
      }

      const requestUrl = `${selectedMediaFilter}:top-rated:${params.toString()}`
      const cacheKey = getCacheKey('top-rated', requestUrl)
      const data = getCacheEntry(cacheKey) || await fetchJson(
        cacheKey,
        async () => {
          const response = await fetch(`${API_BASE_URL}/discover/${selectedMediaFilter}?${params.toString()}`, API_OPTIONS)
          if (!response.ok) throw new Error(`Request failed: ${response.status}`)
          return response.json()
        },
        PERSISTENT_CACHE_TTL_MS
      )

      if (!getCacheEntry(cacheKey)) {
        setCacheEntry(cacheKey, data)
      }

      setTopRatedMovies(enrichMoviesWithRuntime(normalizeMediaList((data.results || []).slice(0, 20), selectedMediaFilter)))
      setBeltPages((currentPages) => ({ ...currentPages, topRated: 1 }))
    } catch (error) {
      console.log(`Error fetching top rated titles: ${error}`)
      setTopRatedMovies([])
    } finally {
      setIsTopRatedLoading(false)
    }
  }

  const fetchGenreRows = async (selectedMediaFilter = 'movie', availableGenres = []) => {
    if (availableGenres.length === 0) {
      setGenreRows([])
      return
    }

    setIsGenreRowsLoading(true)

    try {
      const rowsToLoad = orderGenresForRows(availableGenres, selectedMediaFilter)
      const rowsCacheKey = getCacheKey(
        'default-genre-rows',
        `${selectedMediaFilter}:${rowsToLoad.map((genre) => genre.id).join(',')}`
      )
      const cachedRows = getCacheEntry(rowsCacheKey)

      if (Array.isArray(cachedRows) && cachedRows.length > 0) {
        setGenreRows(cachedRows)
        return
      }

      if (Array.isArray(cachedRows) && cachedRows.length === 0) {
        removeCacheEntry(rowsCacheKey)
      }

      const populatedRows = []
      const rowBatchSize = 4

      for (let index = 0; index < rowsToLoad.length; index += rowBatchSize) {
        const rowBatch = await fetchGenreRowBatch(rowsToLoad, selectedMediaFilter, index, rowBatchSize)
        populatedRows.push(...rowBatch)

        if (populatedRows.length > 0) {
          setGenreRows([...populatedRows])
        }
      }

      if (populatedRows.length > 0) {
        setCacheEntry(rowsCacheKey, populatedRows, PERSISTENT_CACHE_TTL_MS)
      }

      setGenreRows(populatedRows)
    } catch (error) {
      console.log(`Error fetching genre rows: ${error}`)
      setGenreRows((currentRows) => currentRows)
    } finally {
      setIsGenreRowsLoading(false)
    }
  }

  const fetchTitlePage = async ({
    page,
    query = '',
    genreIds = [],
    selectedMediaFilter = 'movie',
    sortBy = 'popularity.desc',
    genreSeparator = ',',
    extraParams = {}
  }) => {
    const normalizedQuery = query.trim()
    const detailEndpoint = selectedMediaFilter === 'tv' ? 'tv' : 'movie'
    const params = new URLSearchParams({
      page: page.toString(),
      include_adult: 'false',
      language: 'en-US'
    })
    let endpoint = `${API_BASE_URL}/discover/${detailEndpoint}`

    if (normalizedQuery) {
      params.set('query', normalizedQuery)
      endpoint = `${API_BASE_URL}/search/${detailEndpoint}`
    } else {
      params.set('sort_by', sortBy)
    }

    Object.entries(extraParams).forEach(([key, value]) => {
      params.set(key, value)
    })

    if (genreIds.length > 0 && !normalizedQuery) {
      params.set('with_genres', genreIds.join(genreSeparator))
    }

    const cacheKey = getCacheKey(
      'titles',
      `load-more:${selectedMediaFilter}:${normalizedQuery}:${genreIds.join(genreSeparator)}:${sortBy}:${page}:${params.toString()}`
    )
    const data = await fetchJson(
      cacheKey,
      async () => {
        const response = await fetch(`${endpoint}?${params.toString()}`, API_OPTIONS)
        if (!response.ok) throw new Error(`Request failed: ${response.status}`)
        return response.json()
      },
      PERSISTENT_CACHE_TTL_MS
    )

    return {
      items: normalizeMediaList(data.results || [], selectedMediaFilter),
      totalPages: Math.min(data.total_pages || 1, 500)
    }
  }

  const loadMoreRecommendedTitles = async () => {
    const startPage = (beltPages.recommendations || 1) + 1
    setRecommendationPoolLimit((currentLimit) =>
      Math.min(currentLimit + RECOMMENDATION_POOL_CLICK_INCREMENT, MAX_RECOMMENDATION_POOL_LIMIT)
    )
    const recommendationGenreIds = getRecommendationDiscoverGenreIds({
      genreList,
      selectedGenreIds,
      tasteProfile: tasteProfileRef.current
    })
    const ignoredKeys = new Set(tasteProfileRef.current.ignored_title_keys)
    const knownKeys = new Set([
      ...recommendationPoolMovies,
      ...recommendationItems
    ].map((movie) => getMediaItemKey(movie)))
    const loadedItems = []
    let lastCheckedPage = startPage - 1
    let reachedEnd = false

    try {
      const scanRecommendationPages = async ({
        genreIds = recommendationGenreIds,
        pageStart = startPage,
        voteCountMinimum = '20'
      } = {}) => {
        let lastPage = pageStart - 1
        let didReachEnd = false

        for (let pageOffset = 0; pageOffset < RECOMMENDATION_PAGE_SCAN_LIMIT; pageOffset += 1) {
          const page = pageStart + pageOffset
          const { items, totalPages: nextTotalPages } = await fetchTitlePage({
            page,
            genreIds,
            selectedMediaFilter: mediaFilter,
            sortBy: 'popularity.desc',
            genreSeparator: '|',
            extraParams: { 'vote_count.gte': voteCountMinimum }
          })

          lastPage = page

          if (page >= nextTotalPages) {
            didReachEnd = true
          }

          items.forEach((item) => {
            const itemKey = getMediaItemKey(item)
            if (ignoredKeys.has(itemKey) || knownKeys.has(itemKey)) return

            knownKeys.add(itemKey)
            loadedItems.push(item)
          })

          if (loadedItems.length >= RECOMMENDATION_FRESH_BATCH_TARGET || didReachEnd) break
        }

        return { lastPage, didReachEnd }
      }

      const tasteScan = await scanRecommendationPages()
      lastCheckedPage = tasteScan.lastPage
      reachedEnd = tasteScan.didReachEnd

      if (loadedItems.length < RECOMMENDATION_FRESH_BATCH_TARGET && recommendationGenreIds.length > 0) {
        const fallbackScan = await scanRecommendationPages({
          genreIds: [],
          pageStart: startPage,
          voteCountMinimum: '80'
        })

        lastCheckedPage = Math.max(lastCheckedPage, fallbackScan.lastPage)
        reachedEnd = reachedEnd && fallbackScan.didReachEnd
      }

      if (lastCheckedPage >= startPage) {
        setBeltPages((currentPages) => ({ ...currentPages, recommendations: lastCheckedPage }))
      }

      if (loadedItems.length === 0) return !reachedEnd

      setRecommendationPoolMovies((currentMovies) =>
        appendUniqueMediaItems(currentMovies, enrichMoviesWithRuntime(loadedItems))
      )
      return true
    } catch (error) {
      console.log(`Error loading more recommended titles: ${error}`)
      return false
    }
  }

  const loadMorePopularTitles = async () => {
    const nextPage = (beltPages.popular || 1) + 1
    if (nextPage > totalPages) return false

    try {
      const { items } = await fetchTitlePage({
        page: nextPage,
        query: '',
        genreIds: selectedGenreIds,
        selectedMediaFilter: mediaFilter
      })

      if (items.length === 0) return false

      setMovieList((currentMovies) => appendUniqueMediaItems(currentMovies, enrichMoviesWithRuntime(items)))
      setBeltPages((currentPages) => ({ ...currentPages, popular: nextPage }))
      return true
    } catch (error) {
      console.log(`Error loading more popular titles: ${error}`)
      return false
    }
  }

  const loadMoreTopRatedTitles = async () => {
    const nextPage = (beltPages.topRated || 1) + 1

    try {
      const { items, totalPages: nextTotalPages } = await fetchTitlePage({
        page: nextPage,
        genreIds: selectedGenreIds,
        selectedMediaFilter: mediaFilter,
        sortBy: 'vote_average.desc',
        extraParams: { 'vote_count.gte': '200' }
      })

      if (items.length === 0 || nextPage > nextTotalPages) return false

      setTopRatedMovies((currentMovies) => appendUniqueMediaItems(currentMovies, enrichMoviesWithRuntime(items)))
      setBeltPages((currentPages) => ({ ...currentPages, topRated: nextPage }))
      return true
    } catch (error) {
      console.log(`Error loading more top rated titles: ${error}`)
      return false
    }
  }

  const loadMoreTrendingTitles = async () => {
    const nextPage = (beltPages.trending || 1) + 1

    try {
      const cacheKey = getCacheKey('trending', `${mediaFilter}:week:${nextPage}`)
      const data = await fetchJson(
        cacheKey,
        async () => {
          const response = await fetch(`${API_BASE_URL}/trending/${mediaFilter}/week?page=${nextPage}`, API_OPTIONS)
          if (!response.ok) throw new Error(`Request failed: ${response.status}`)
          return response.json()
        },
        PERSISTENT_CACHE_TTL_MS
      )
      const items = normalizeMediaList(data.results || [], mediaFilter)
      const matchingItems = selectedGenreIds.length > 0
        ? items.filter((item) => item.genre_ids?.some((genreId) => selectedGenreIds.includes(genreId)))
        : items

      if (matchingItems.length === 0 || nextPage > Math.min(data.total_pages || 1, 500)) return false

      setTrendingMovies((currentMovies) => appendUniqueMediaItems(currentMovies, enrichMoviesWithRuntime(matchingItems)))
      setBeltPages((currentPages) => ({ ...currentPages, trending: nextPage }))
      return true
    } catch (error) {
      console.log(`Error loading more trending titles: ${error}`)
      return false
    }
  }

  const loadMoreGenreRow = async (rowId) => {
    const row = genreRows.find((genreRow) => genreRow.id === rowId)
    const nextPage = row?.nextPage || 2

    if (!row || nextPage > (row.totalPages || 500)) return false

    try {
      const params = new URLSearchParams({
        sort_by: 'popularity.desc',
        with_genres: row.id.toString(),
        include_adult: 'false',
        language: 'en-US',
        page: nextPage.toString()
      })
      const cacheKey = getCacheKey('genre-row', `${mediaFilter}:${row.id}:${params.toString()}`)
      const data = await fetchJson(
        cacheKey,
        async () => {
          const response = await fetch(`${API_BASE_URL}/discover/${mediaFilter}?${params.toString()}`, API_OPTIONS)
          if (!response.ok) throw new Error(`Request failed: ${response.status}`)
          return response.json()
        },
        PERSISTENT_CACHE_TTL_MS
      )
      const nextItems = enrichMoviesWithRuntime(normalizeMediaList(data.results || [], mediaFilter))

      if (nextItems.length === 0) return false

      setGenreRows((currentRows) =>
        currentRows.map((currentRow) => {
          if (currentRow.id !== row.id) return currentRow

          return {
            ...currentRow,
            items: appendUniqueMediaItems(currentRow.items, nextItems),
            nextPage: nextPage + 1,
            totalPages: Math.min(data.total_pages || currentRow.totalPages || 1, 500)
          }
        })
      )
      return true
    } catch (error) {
      console.log(`Error loading more ${row.title} titles: ${error}`)
      return false
    }
  }

  const loadFavoriteMovies = async () => {
    if (!isAuthenticated) {
      setFavoriteMovies([])
      setIsFavoritesLoading(false)
      return
    }

    setIsFavoritesLoading(true)

    try {
      const data = await authApi.getFavorites(authUser.id)
      const favorites = (data?.favorites || []).map((entry) => normalizeMediaItem(entry, entry?.media_type || 'movie'))
      setFavoriteMovies(enrichMoviesWithRuntime(favorites))
    } catch (error) {
      console.log(`Error loading favorites: ${error}`)
      setFavoriteMovies([])
    } finally {
      setIsFavoritesLoading(false)
    }
  }

  const loadWatchlistMovies = async () => {
    if (!isAuthenticated) {
      setWatchlistMovies([])
      setIsWatchlistLoading(false)
      return
    }

    setIsWatchlistLoading(true)

    try {
      const data = await authApi.getWatchlist(authUser.id)
      const watchlist = (data?.items || []).map((entry) => normalizeMediaItem(entry, entry?.media_type || 'movie'))
      setWatchlistMovies(enrichMoviesWithRuntime(watchlist))
    } catch (error) {
      console.log(`Error loading watchlist: ${error}`)
      setWatchlistMovies([])
    } finally {
      setIsWatchlistLoading(false)
    }
  }

  const loadRecentlyWatched = async () => {
    if (!isAuthenticated) {
      setRecentlyWatchedMovies([])
      setIsRecentlyWatchedLoading(false)
      return
    }

    setIsRecentlyWatchedLoading(true)

    try {
      const data = await authApi.getRecentlyWatched(authUser.id)
      const remoteItems = (data?.items || []).map((entry) => normalizeMediaItem(entry, entry?.media_type || 'movie'))
      const localItems = getLocalWatchHistory(authUser.id).map((entry) => normalizeMediaItem(entry, entry?.media_type || 'movie'))
      const mergedItems = mergeWatchHistoryItems(remoteItems, localItems)

      setLocalWatchHistory(authUser.id, mergedItems)
      setRecentlyWatchedMovies(enrichMoviesWithRuntime(mergedItems.slice(0, 12)))
    } catch (error) {
      console.log(`Error loading recently watched titles: ${error}`)
      const localItems = getLocalWatchHistory(authUser.id).map((entry) => normalizeMediaItem(entry, entry?.media_type || 'movie'))
      setRecentlyWatchedMovies(enrichMoviesWithRuntime(sortWatchHistoryItems(localItems)))
    } finally {
      setIsRecentlyWatchedLoading(false)
    }
  }

  const loadTasteProfile = async () => {
    if (!isAuthenticated || !authUser?.id) {
      setTasteProfile(DEFAULT_TASTE_PROFILE)
      setHasDismissedTasteQuizThisSession(false)
      setProfileStatusMessage('')
      return
    }

    const metadataProfile = authUser.user_metadata?.taste_profile
    const localProfile = getLocalTasteProfile(authUser.id)
    const initialProfile = normalizeTasteProfileForApp(metadataProfile || localProfile || DEFAULT_TASTE_PROFILE)

    setTasteProfile(initialProfile)
    setHasDismissedTasteQuizThisSession(getHasDismissedTasteQuiz(authUser.id))

    try {
      const data = await authApi.getTasteProfile(authUser.id)
      const remoteProfile = data?.profile

      if (remoteProfile) {
        const normalizedRemoteProfile = normalizeTasteProfileForApp(remoteProfile)
        setTasteProfile(normalizedRemoteProfile)
        setLocalTasteProfile(authUser.id, normalizedRemoteProfile)
      }
    } catch (error) {
      console.log(`Error loading taste profile: ${error}`)
    }
  }

  const saveTasteProfile = async (profile, { closeQuiz = false, syncAccount = true } = {}) => {
    const nextProfile = normalizeTasteProfileForApp({
      ...profile,
      completed_onboarding: true,
      updated_at: new Date().toISOString()
    })

    setTasteProfile(nextProfile)
    setProfileStatusMessage('')

    if (syncAccount && tasteProfileSyncTimeoutRef.current) {
      window.clearTimeout(tasteProfileSyncTimeoutRef.current)
      tasteProfileSyncTimeoutRef.current = null
    }

    if (authUser?.id) {
      setLocalTasteProfile(authUser.id, nextProfile)
    }

    if (closeQuiz) {
      setRecommendationPoolMovies([])
      setRecommendationPoolLimit(INITIAL_RECOMMENDATION_POOL_LIMIT)
      setBeltPages((currentPages) => ({ ...currentPages, recommendations: 1 }))
      setBeltVisibleCounts((currentCounts) => ({ ...currentCounts, recommendations: INITIAL_BELT_ITEM_COUNT }))
      setExhaustedBeltKeys((currentKeys) => currentKeys.filter((key) => key !== 'recommendations'))
    }

    if (!syncAccount || !isAuthenticated || !authUser?.id) {
      if (closeQuiz) setIsTasteQuizOpen(false)
      return true
    }

    setIsSavingTasteProfile(true)

    try {
      const data = await authApi.saveTasteProfile(authUser.id, nextProfile)
      const savedProfile = normalizeTasteProfileForApp(data.profile)

      setTasteProfile(savedProfile)
      setLocalTasteProfile(authUser.id, savedProfile)
      if (data.user) setAuthUser(data.user)
      setProfileStatusMessage('Taste profile saved.')
      if (closeQuiz) setIsTasteQuizOpen(false)
      return true
    } catch (error) {
      console.log(`Error saving taste profile: ${error}`)
      setProfileStatusMessage('Saved on this device. Account sync can retry later.')
      if (closeQuiz) setIsTasteQuizOpen(false)
      return false
    } finally {
      setIsSavingTasteProfile(false)
    }
  }

  const queueTasteProfileSync = (profile) => {
    if (!isAuthenticated || !authUser?.id) return

    if (tasteProfileSyncTimeoutRef.current) {
      window.clearTimeout(tasteProfileSyncTimeoutRef.current)
    }

    const profileToSync = normalizeTasteProfileForApp(profile)
    tasteProfileSyncTimeoutRef.current = window.setTimeout(() => {
      tasteProfileSyncTimeoutRef.current = null
      saveTasteProfile(profileToSync)
    }, TASTE_PROFILE_SYNC_DEBOUNCE_MS)
  }

  const dismissTasteQuiz = () => {
    if (authUser?.id) {
      setHasDismissedTasteQuiz(authUser.id)
    }

    setHasDismissedTasteQuizThisSession(true)
    setIsTasteQuizOpen(false)
  }

  const openTasteQuizFromProfile = () => {
    setProfileStatusMessage('')
    setIsProfilePanelOpen(false)
    setIsTasteQuizOpen(true)
  }

  const hideRecommendationTitle = (movie) => {
    const currentVisibleCount = beltVisibleCounts.recommendations || INITIAL_BELT_ITEM_COUNT
    const currentProfile = tasteProfileRef.current
    const nextIgnoredKeys = [...new Set([
      ...currentProfile.ignored_title_keys,
      getMediaItemKey(movie)
    ])]
    const nextProfile = {
      ...currentProfile,
      ignored_title_keys: nextIgnoredKeys
    }

    setBeltVisibleCounts((currentCounts) => ({
      ...currentCounts,
      recommendations: Math.min(Math.max(currentVisibleCount, INITIAL_BELT_ITEM_COUNT), Math.max(recommendationItems.length - 1, INITIAL_BELT_ITEM_COUNT))
    }))
    saveTasteProfile(nextProfile, { syncAccount: false })
    queueTasteProfileSync(nextProfile)
    setProfileStatusMessage('Hidden from recommendations.')
  }

  const clearHiddenRecommendationTitles = () => {
    saveTasteProfile({
      ...activeTasteProfile,
      ignored_title_keys: []
    })
    setExhaustedBeltKeys((currentKeys) => currentKeys.filter((key) => key !== 'recommendations'))
    setProfileStatusMessage('Hidden picks cleared.')
  }

  const toggleFavoriteMovie = async (movie) => {
    if (!isAuthenticated) {
      setAuthErrorMessage('')
      navigate('/account/login')
      return
    }

    const movieKey = getMediaItemKey(movie)
    const isFavorite = favoriteMovieIds.includes(movieKey)
    const movieData = {
      ...movie,
      runtime: movie.runtime ?? movieRuntimeMap[getRuntimeKey(movie)] ?? null
    }

    if (isFavorite) {
      setFavoriteMovies((currentMovies) => currentMovies.filter((entry) => getMediaItemKey(entry) !== movieKey))
    } else {
      setFavoriteMovies((currentMovies) => {
        const withoutMovie = currentMovies.filter((entry) => getMediaItemKey(entry) !== movieKey)
        return [movieData, ...withoutMovie]
      })

      favoritesRowRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
    }

    try {
      await authApi.toggleFavorite(authUser.id, movieData)
    } catch (error) {
      console.log(`Error toggling favorite title: ${error}`)

      setFavoriteMovies((currentMovies) => {
        if (isFavorite) {
          const withoutMovie = currentMovies.filter((entry) => getMediaItemKey(entry) !== movieKey)
          return [movieData, ...withoutMovie]
        }

        return currentMovies.filter((entry) => getMediaItemKey(entry) !== movieKey)
      })
    }
  }

  const toggleWatchlistMovie = async (movie) => {
    if (!isAuthenticated) {
      setAuthErrorMessage('')
      navigate('/account/login')
      return
    }

    const movieKey = getMediaItemKey(movie)
    const isSaved = watchlistMovieIds.includes(movieKey)
    const movieData = {
      ...movie,
      runtime: movie.runtime ?? movieRuntimeMap[getRuntimeKey(movie)] ?? null
    }

    setWatchlistMovies((currentMovies) => {
      if (isSaved) {
        return currentMovies.filter((entry) => getMediaItemKey(entry) !== movieKey)
      }

      const withoutMovie = currentMovies.filter((entry) => getMediaItemKey(entry) !== movieKey)
      return [movieData, ...withoutMovie]
    })

    try {
      await authApi.toggleWatchlist(authUser.id, movieData)
    } catch (error) {
      console.log(`Error toggling watchlist title: ${error}`)
      setWatchlistMovies((currentMovies) => {
        if (isSaved) {
          return [movieData, ...currentMovies.filter((entry) => getMediaItemKey(entry) !== movieKey)]
        }

        return currentMovies.filter((entry) => getMediaItemKey(entry) !== movieKey)
      })
    }
  }

  const openTitleDetails = useCallback((movie) => {
    if (isAuthenticated) {
      authApi.trackRecentlyWatched(authUser.id, movie).catch((error) => {
        console.log(`Error tracking recently watched title: ${error}`)
      })

      setRecentlyWatchedMovies((currentMovies) => {
        const normalizedMovie = normalizeMediaItem({
          ...movie,
          watched_at: new Date().toISOString()
        }, movie.media_type || 'movie')
        const normalizedMovieKey = getMediaItemKey(normalizedMovie)
        const withoutMovie = currentMovies.filter((entry) => getMediaItemKey(entry) !== normalizedMovieKey)
        return [normalizedMovie, ...withoutMovie].slice(0, 12)
      })
    }

    navigate(getDetailPath(movie), { state: { backgroundLocation: location } })
  }, [authUser?.id, isAuthenticated, location, navigate])

  const handleWatchProgress = useCallback((movie) => {
    const normalizedMovie = normalizeMediaItem(movie, movie.media_type || 'movie')
    const normalizedMovieKey = getMediaItemKey(normalizedMovie)

    setRecentlyWatchedMovies((currentMovies) => {
      const withoutMovie = currentMovies.filter((entry) => getMediaItemKey(entry) !== normalizedMovieKey)
      return sortWatchHistoryItems([normalizedMovie, ...withoutMovie]).slice(0, 12)
    })
  }, [])

  const playTitle = useCallback((movie, resumeTimeSeconds = 0) => {
    if (!movie?.id) return
    navigate(getWatchPath(movie, resumeTimeSeconds))
  }, [navigate])

  const playHistoryItem = useCallback((movie) => {
    playTitle(movie, getResumeTimeSeconds(movie))
  }, [playTitle])

  const removeHistoryItem = async (movie) => {
    if (!isAuthenticated) {
      setAuthErrorMessage('')
      navigate('/account/login')
      return
    }

    setRecentlyWatchedMovies((currentMovies) =>
      currentMovies.filter((entry) => getMediaItemKey(entry) !== getMediaItemKey(movie))
    )
    setLocalWatchHistory(
      authUser.id,
      getLocalWatchHistory(authUser.id).filter((entry) => getMediaItemKey(entry) !== getMediaItemKey(movie))
    )

    try {
      await authApi.removeRecentlyWatched(authUser.id, movie)
    } catch (error) {
      console.log(`Error removing watch history item: ${error}`)
      loadRecentlyWatched()
    }
  }

  const clearWatchHistory = async () => {
    if (!isAuthenticated) {
      setAuthErrorMessage('')
      navigate('/account/login')
      return
    }

    const previousItems = recentlyWatchedMovies
    setRecentlyWatchedMovies([])
    setLocalWatchHistory(authUser.id, [])

    try {
      await authApi.clearRecentlyWatched(authUser.id)
    } catch (error) {
      console.log(`Error clearing watch history: ${error}`)
      setRecentlyWatchedMovies(previousItems)
    }
  }

  const clearWatchHistoryFromSettings = async () => {
    await clearWatchHistory()
    setProfileStatusMessage('Watch history cleared.')
  }

  const requestPasswordResetFromSettings = async () => {
    if (!authUser?.email) {
      setProfileStatusMessage('No account email is available for password reset.')
      return
    }

    setIsPasswordResetSending(true)
    setProfileStatusMessage('')

    try {
      await authApi.requestPasswordReset(authUser.email)
      setProfileStatusMessage('Password reset email sent. Check your inbox.')
    } catch (error) {
      console.log(`Error requesting password reset: ${error}`)
      setProfileStatusMessage('Could not send reset email right now. Please try again shortly.')
    } finally {
      setIsPasswordResetSending(false)
    }
  }

  const closeTitleDetails = () => {
    if (location.state?.backgroundLocation) {
      navigate(-1)
      return
    }

    navigate('/')
  }

  const _toggleGenre = (genreId) => {
    setSelectedGenreIds((currentGenres) =>
      currentGenres.includes(genreId)
        ? currentGenres.filter((id) => id !== genreId)
        : [...currentGenres, genreId]
    )
  }

  const clearGenres = () => {
    setSelectedGenreIds([])
  }

  const clearPersonFilter = () => {
    setSelectedPersonResult(null)
    setPersonResults([])
    setSearchTerm('')
    setCurrentPage(1)
    setIsHeroCollapsed(false)
  }

  const resetToHome = () => {
    setSearchTerm('')
    setSelectedGenreIds([])
    setSelectedPersonResult(null)
    setPersonResults([])
    setIsWatchlistFocused(false)
    setMediaFilter('movie')
    setIsGenrePanelOpen(false)
    setIsHeroCollapsed(false)
    setCurrentPage(1)

    requestAnimationFrame(() => {
      document.querySelector('main')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const goToPage = (page, position = 'top') => {
    setCurrentPage(page)

    if (position === 'bottom') {
      requestAnimationFrame(() => {
        moviesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      })
    }
  }

  const _scrollRow = (rowRef, direction) => {
    const row = rowRef.current

    if (!row) {
      return
    }

    const scrollAmount = Math.max(row.clientWidth * 0.8, 220)

    row.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    })
  }

  const toggleGenre = (genreId) => {
    setSelectedGenreIds((currentGenres) =>
      currentGenres.includes(genreId)
        ? currentGenres.filter((id) => id !== genreId)
        : [...currentGenres, genreId]
    )
  }

  const fetchMovieRuntimes = async (movies) => {
    const missingMovies = movies.filter((movie) => movieRuntimeMap[getRuntimeKey(movie)] === undefined)

    if (missingMovies.length === 0) {
      return
    }

    try {
      const runtimeEntries = await Promise.all(
        missingMovies.map(async (movie) => {
          const requestUrl = `${movie.media_type}:${movie.id}`
          const cachedDetail = getCacheEntry(getCacheKey('detail', requestUrl))

          if (cachedDetail) {
            return [getRuntimeKey(movie), cachedDetail.runtime || cachedDetail.episode_run_time?.[0] || null]
          }

          const detailEndpoint = movie.media_type === 'tv' ? 'tv' : 'movie'
          const response = await fetch(`${API_BASE_URL}/${detailEndpoint}/${movie.id}`, API_OPTIONS)

          if (!response.ok) {
            return [getRuntimeKey(movie), null]
          }

          const data = await response.json()
          setCacheEntry(getCacheKey('detail', requestUrl), data)
          const runtimeValue = data.runtime || data.episode_run_time?.[0] || null
          return [getRuntimeKey(movie), runtimeValue]
        })
      )

      const runtimeMap = Object.fromEntries(runtimeEntries)

      setMovieRuntimeMap((currentMap) => ({
        ...currentMap,
        ...runtimeMap
      }))

      setMovieList((currentMovies) => upsertRuntime(currentMovies, runtimeMap))
      setTrendingMovies((currentMovies) => upsertRuntime(currentMovies, runtimeMap))
      setTopRatedMovies((currentMovies) => upsertRuntime(currentMovies, runtimeMap))
      setFavoriteMovies((currentMovies) => upsertRuntime(currentMovies, runtimeMap))
      setRecentlyWatchedMovies((currentMovies) => upsertRuntime(currentMovies, runtimeMap))
    } catch (error) {
      console.log(`Error fetching runtimes: ${error}`)
    }
  }

  const _renderShowcaseSkeletons = (count = 6) =>
    Array.from({ length: count }, (_, index) => (
      <div key={`showcase-skeleton-${index}`} className="movie-card-skeleton movie-card-skeleton-compact" aria-hidden="true">
        <div className="movie-card-skeleton-poster" />
        <div className="movie-card-skeleton-line movie-card-skeleton-line-title" />
        <div className="movie-card-skeleton-line movie-card-skeleton-line-meta" />
        <div className="movie-card-skeleton-line movie-card-skeleton-line-button" />
      </div>
    ))

  const _renderGridSkeletons = (count = 12) =>
    Array.from({ length: count }, (_, index) => (
      <div key={`grid-skeleton-${index}`} className="movie-card-skeleton" aria-hidden="true">
        <div className="movie-card-skeleton-poster" />
        <div className="movie-card-skeleton-line movie-card-skeleton-line-title" />
        <div className="movie-card-skeleton-line movie-card-skeleton-line-meta" />
        <div className="movie-card-skeleton-line movie-card-skeleton-line-button" />
      </div>
    ))

  useEffect(() => {
    const bootstrapAuth = async () => {
      setIsAuthLoading(true)

      try {
        const data = await authApi.me()
        setAuthUser(data?.user || null)
      } catch {
        setAuthUser(null)
      } finally {
        setIsAuthLoading(false)
      }
    }

    bootstrapAuth()

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user || null)
      setIsAuthLoading(false)
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    loadFavoriteMovies()
    loadWatchlistMovies()
    loadRecentlyWatched()
    loadTasteProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, authUser?.id])

  useEffect(() => {
    if (
      !isAuthenticated ||
      !authUser?.id ||
      isAuthRouteOpen ||
      activeTasteProfile.completed_onboarding ||
      isTasteQuizOpen ||
      hasDismissedTasteQuizThisSession ||
      getHasDismissedTasteQuiz(authUser.id)
    ) {
      return undefined
    }

    const quizTimer = window.setTimeout(() => {
      setIsTasteQuizOpen(true)
    }, 10000)

    return () => {
      window.clearTimeout(quizTimer)
    }
  }, [
    activeTasteProfile.completed_onboarding,
    authUser?.id,
    hasDismissedTasteQuizThisSession,
    isAuthRouteOpen,
    isAuthenticated,
    isTasteQuizOpen
  ])

  useEffect(() => {
    setBeltVisibleCounts({})
    setLoadingMoreBeltKeys([])
    setExhaustedBeltKeys([])
  }, [debouncedSearchTerm, mediaFilter, selectedGenreIds])

  useEffect(() => {
    setRecommendationPoolMovies([])
    setRecommendationPoolLimit(INITIAL_RECOMMENDATION_POOL_LIMIT)
    setBeltPages((currentPages) => ({ ...currentPages, recommendations: 1 }))
  }, [mediaFilter, selectedGenreIds])

  useEffect(() => {
    fetchGenres(mediaFilter)
    fetchTrendingTitles(mediaFilter)
    fetchTopRatedTitles(selectedGenreIds, mediaFilter)
    topRatedRowRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaFilter])

  useEffect(() => {
    fetchTopRatedTitles(selectedGenreIds, mediaFilter)
    topRatedRowRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGenreIds])

  useEffect(() => {
    fetchGenreRows(mediaFilter, genreList)
  }, [genreList, mediaFilter])

  useEffect(() => {
    const scrollTarget = window.setTimeout(() => {
      const scrollBehavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'

      if (isHeroCollapsed) {
        browseRowsRef.current?.scrollIntoView({ behavior: scrollBehavior, block: 'start' })
        return
      }

      document.querySelector('.stream-hero')?.scrollIntoView({ behavior: scrollBehavior, block: 'start' })
    }, isHeroCollapsed ? 420 : 0)

    return () => {
      window.clearTimeout(scrollTarget)
    }
  }, [isHeroCollapsed])

  useEffect(() => {
    setHeroIndex(0)
  }, [heroQueueMode, mediaFilter])

  useEffect(() => {
    if (heroQueueMode !== 'recommended') return

    setHeroIndex((currentIndex) => {
      if (recommendationItems.length === 0) return 0
      return Math.min(currentIndex, recommendationItems.length - 1)
    })
  }, [heroQueueMode, recommendationItems.length])

  useEffect(() => {
    let isActive = true

    const loadHeroTrailer = async () => {
      if (heroQueueItems.length === 0) {
        setHeroTitle(null)
        setHeroTrailerUrl('')
        return
      }

      const selectedTitle = heroQueueItems[((heroIndex % heroQueueItems.length) + heroQueueItems.length) % heroQueueItems.length]
      setHeroTitle(selectedTitle)
      setHeroTrailerUrl('')

      try {
        const detailEndpoint = selectedTitle.media_type === 'tv' ? 'tv' : 'movie'
        const data = await fetchJson(
          `hero-videos:${selectedTitle.media_type}:${selectedTitle.id}`,
          async () => {
            const response = await fetch(`${API_BASE_URL}/${detailEndpoint}/${selectedTitle.id}/videos`, API_OPTIONS)
            if (!response.ok) throw new Error(`Request failed: ${response.status}`)
            return response.json()
          },
          5 * CACHE_TTL_MS
        )
        const video = getBestHeroVideo(data.results || [])

        if (isActive) {
          setHeroTrailerUrl(getHeroTrailerEmbedUrl(video?.key))
        }
      } catch (error) {
        console.log(`Error fetching hero trailer: ${error}`)
        if (isActive) {
          setHeroTrailerUrl('')
        }
      }
    }

    loadHeroTrailer()

    return () => {
      isActive = false
    }
  }, [heroIndex, heroQueueItems])

  useEffect(() => {
    if (!heroTrailerUrl || isHeroCollapsed) return undefined

    const syncTimeouts = [80, 450, 1200].map((delay) =>
      window.setTimeout(syncHeroAudio, delay)
    )

    return () => {
      syncTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId))
    }
  }, [heroTrailerUrl, isHeroCollapsed, syncHeroAudio])

  useEffect(() => {
    setCurrentPage(1)
  }, [selectedGenreIds, mediaFilter])

  useEffect(() => {
    fetchPeople(debouncedSearchTerm)
    fetchSearchTitles(debouncedSearchTerm, mediaFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchTerm, mediaFilter])

  useEffect(() => {
    const syncDesktopGenreState = () => {
      if (window.innerWidth >= 1280) {
        setIsGenrePanelOpen(true)
      }
    }

    syncDesktopGenreState()
    window.addEventListener('resize', syncDesktopGenreState)

    return () => {
      window.removeEventListener('resize', syncDesktopGenreState)
    }
  }, [])

  useEffect(() => {
    if (skipNextTitleFetchRef.current) {
      skipNextTitleFetchRef.current = false
      return
    }

    fetchMovies('', selectedGenreIds, currentPage, mediaFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGenreIds, currentPage, mediaFilter])

  useEffect(() => {
    if (movieList.length > 0) fetchMovieRuntimes(movieList)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movieList])

  useEffect(() => {
    if (trendingMovies.length > 0) fetchMovieRuntimes(trendingMovies)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendingMovies])

  useEffect(() => {
    if (topRatedMovies.length > 0) fetchMovieRuntimes(topRatedMovies)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topRatedMovies])

  useEffect(() => {
    if (recommendationPoolMovies.length > 0) fetchMovieRuntimes(recommendationPoolMovies)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendationPoolMovies])

  useEffect(() => {
    if (!preferredPeopleSignature) return

    loadPreferredPeopleRecommendations(activeTasteProfile.preferred_people)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredPeopleSignature, mediaFilter])

  useEffect(() => {
    if (favoriteMovies.length > 0) fetchMovieRuntimes(favoriteMovies)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favoriteMovies])

  useEffect(() => {
    if (watchlistMovies.length > 0) fetchMovieRuntimes(watchlistMovies)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlistMovies])

  useEffect(() => {
    if (recentlyWatchedMovies.length > 0) fetchMovieRuntimes(recentlyWatchedMovies)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentlyWatchedMovies])

  const handleAuthSubmit = async (payload) => {
    setIsAuthSubmitting(true)
    setAuthErrorMessage('')

    try {
      const data = authMode === 'signup'
        ? await authApi.signup(payload)
        : await authApi.login(payload)

      setAuthUser(data?.user || null)
      setHasDismissedTasteQuizThisSession(false)
      setProfileStatusMessage('')
      navigate('/')
      return true
    } catch (error) {
      setAuthErrorMessage(error.message)
      return false
    } finally {
      setIsAuthSubmitting(false)
    }
  }

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch (error) {
      console.log(`Error logging out: ${error}`)
    } finally {
      setAuthUser(null)
      setFavoriteMovies([])
      setWatchlistMovies([])
      setRecentlyWatchedMovies([])
      setTasteProfile(DEFAULT_TASTE_PROFILE)
      setIsTasteQuizOpen(false)
      setIsProfilePanelOpen(false)
      setIsWatchlistFocused(false)
      setProfileStatusMessage('')
      setHasDismissedTasteQuizThisSession(false)
    }
  }

  const handleDeletionRequest = () => {
    if (!isAuthenticated) {
      setAuthErrorMessage('Please log in to request account data deletion.')
      navigate('/account/login')
      return
    }

    const confirmed = window.confirm(
      'This will permanently delete your account together with your favorites and recently watched history. Once completed, you will lose access to this account and this action cannot be undone. Continue?'
    )

    if (!confirmed) {
      return
    }

    authApi.deleteAccount()
      .then(async () => {
        await authApi.logout()
        setAuthUser(null)
        setFavoriteMovies([])
        setWatchlistMovies([])
        setRecentlyWatchedMovies([])
        setTasteProfile(DEFAULT_TASTE_PROFILE)
        setIsTasteQuizOpen(false)
        setIsProfilePanelOpen(false)
        setIsWatchlistFocused(false)
        setDeletionNotice('Your account, favorites, and recently watched history have been permanently deleted. You have been signed out.')
      })
      .catch((error) => {
        console.log(`Error deleting account: ${error}`)
        setDeletionNotice('We could not complete your account deletion right now. Please try again later.')
      })
  }

  const acceptCookieNotice = () => {
    try {
      window.localStorage.setItem(COOKIE_NOTICE_STORAGE_KEY, 'accepted')
    } catch {
      // The notice can still be dismissed if storage is unavailable.
    }

    setHasAcceptedCookieNotice(true)
  }

  const LockedCollectionState = ({ title, message }) => (
    <div className="locked-collection-state">
      <p className="locked-collection-icon">🔒</p>
      <h3 className="locked-collection-title">{title}</h3>
      <p className="locked-collection-copy">{message}</p>
      <button
        type="button"
        className="locked-collection-action"
        onClick={() => {
          setAuthErrorMessage('')
          navigate('/account/login')
        }}
      >
        Log in to unlock
      </button>
    </div>
  )

  const PaginationControls = ({ position }) => (
    <div className={`pagination-bar ${position === 'bottom' ? 'is-bottom' : 'is-top'}`}>
      <button
        type="button"
        className="pagination-button"
        onClick={() => goToPage(currentPage - 1, position)}
        disabled={currentPage === 1 || isLoading}
      >
        Back
      </button>

      <p className="pagination-counter">
        Page <span>{currentPage}</span> of <span>{totalPages}</span>
      </p>

      <button
        type="button"
        className="pagination-button pagination-home-button"
        onClick={resetToHome}
        disabled={isLoading || (currentPage === 1 && selectedGenreIds.length === 0 && searchTerm.trim() === '' && mediaFilter === 'movie')}
      >
        Home
      </button>

      <button
        type="button"
        className="pagination-button"
        onClick={() => goToPage(currentPage + 1, position)}
        disabled={currentPage === totalPages || isLoading}
      >
        Next
      </button>
    </div>
  )

  const ContinueWatchingSection = () => {
    const localTime = new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date())

    if (!isAuthenticated) {
      return (
        <section className="continue-watching-section" aria-labelledby="continue-watching-title">
          <div className="continue-watching-heading">
            <h2 id="continue-watching-title">Continue Watching</h2>
          </div>
          <div className="continue-watching-info">
            <span aria-hidden="true">i</span>
            <p>Log in to save watch history, resume timestamps, and progress across your account.</p>
            <button
              type="button"
              onClick={() => {
                setAuthErrorMessage('')
                navigate('/account/login')
              }}
            >
              Log in
            </button>
          </div>
        </section>
      )
    }

    if (recentlyWatchedMovies.length === 0) {
      return (
        <section className="continue-watching-section" aria-labelledby="continue-watching-title">
          <div className="continue-watching-heading">
            <h2 id="continue-watching-title">Continue Watching</h2>
            <span>Local: {localTime}</span>
          </div>
          <div className="continue-watching-empty">
            Start a movie or TV episode and your account history will appear here.
          </div>
        </section>
      )
    }

    return (
      <section className="continue-watching-section" aria-labelledby="continue-watching-title">
        <div className="continue-watching-heading">
          <h2 id="continue-watching-title">Continue Watching</h2>
          <button type="button" className="continue-clear-button" onClick={clearWatchHistory}>
            Clear All History
          </button>
          <span>Local: {localTime}</span>
        </div>

        <div className="continue-watching-row">
          {recentlyWatchedMovies.slice(0, 12).map((movie) => {
            const resumeTimeSeconds = getResumeTimeSeconds(movie)
            const progressPercent = getProgressPercent(movie)

            return (
              <article
                key={`continue-${getMediaItemKey(movie)}`}
                className="continue-card"
                style={{ '--continue-image': `url(${movie.backdrop_path ? getBackdropUrl(movie, 'w780') : getPosterUrl(movie)})` }}
              >
                <div className="continue-card-shade" />
                <span className="continue-card-type">{movie.media_type === 'tv' ? 'TV' : 'Movie'}</span>
                <button
                  type="button"
                  className="continue-card-remove"
                  onClick={() => removeHistoryItem(movie)}
                  aria-label={`Remove ${movie.title} from watch history`}
                >
                  ×
                </button>
                <button
                  type="button"
                  className="continue-card-play"
                  onClick={() => playHistoryItem(movie)}
                  aria-label={`Continue ${movie.title}`}
                >
                  ▶
                </button>
                <div className="continue-card-copy">
                  <h3>{movie.title}</h3>
                  <p>{resumeTimeSeconds > 0 ? `Resume at ${formatResumeTime(resumeTimeSeconds)}` : 'Continue from where you left off'}</p>
                  <div className="continue-progress-track" aria-hidden="true">
                    <span style={{ width: `${progressPercent}%` }} />
                  </div>
                  <div className="continue-progress-meta">
                    <span>{progressPercent}% completed</span>
                    <span>{resumeTimeSeconds > 0 ? formatResumeTime(resumeTimeSeconds) : 'Just started'}</span>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    )
  }

  const heroBackdrop = heroTitle ? getBackdropUrl(heroTitle, 'original') : '/hero-bg.png'
  const heroMediaStyle = { backgroundImage: `url(${heroBackdrop})` }
  const changeHeroTitle = (direction) => {
    if (heroQueueItems.length === 0) return

    setIsHeroCollapsed(false)
    setHeroIndex((currentIndex) => (currentIndex + direction + heroQueueItems.length) % heroQueueItems.length)
    requestAnimationFrame(() => {
      document.querySelector('.stream-hero')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
  const toggleHeroFocus = useCallback(() => {
    setIsHeroCollapsed((isCollapsed) => !isCollapsed)
  }, [])
  const filteredTrendingMovies = selectedGenreIds.length > 0
    ? trendingMovies.filter((movie) => movie.genre_ids?.some((genreId) => selectedGenreIds.includes(genreId)))
    : trendingMovies
  const heroRows = [
    {
      id: 'trending',
      title: `Trending ${mediaPluralLabel}`,
      items: filteredTrendingMovies,
      accent: 'Live from TMDB',
      onLoadMore: loadMoreTrendingTitles
    },
    {
      id: 'top-rated',
      title: `Top Rated ${mediaPluralLabel}`,
      items: topRatedMovies,
      accent: 'Highest rated',
      onLoadMore: loadMoreTopRatedTitles
    },
    {
      id: 'popular',
      title: `Popular ${mediaPluralLabel}`,
      items: movieList,
      accent: 'This week',
      onLoadMore: loadMorePopularTitles
    }
  ]
  const searchResults = debouncedSearchTerm.trim().length >= SEARCH_MIN_LENGTH ? personalizedSearchResults : []

  if (legalDocumentType) {
    return (
      <AppShell>
        <LegalPage type={legalDocumentType} onBackHome={() => navigate('/')} />
      </AppShell>
    )
  }

  if (isAuthRouteOpen) {
    return (
      <AccountAccessRoute
        mode={authMode}
        onModeChange={(nextMode) => {
          setAuthErrorMessage('')
          navigate(`/account/${nextMode}`, { replace: true })
        }}
        onSubmit={handleAuthSubmit}
        isSubmitting={isAuthSubmitting}
        errorMessage={authErrorMessage}
      />
    )
  }

  if (activeWatchMediaType && activeWatchId) {
    return (
      <WatchRoute
        mediaType={activeWatchMediaType}
        id={activeWatchId}
        authUser={authUser}
        onWatchProgress={handleWatchProgress}
      />
    )
  }

  return (
    <AppShell>
      <div className={`streaming-home ${isHeroCollapsed ? 'is-browse-focused' : ''}`}>
        <nav className="stream-nav" aria-label="Primary navigation">
          <button type="button" className="stream-nav-item is-active" onClick={resetToHome}>
            <HomeIcon className="stream-nav-svg" />
            <span className="stream-nav-label">Home</span>
          </button>

          <button
            type="button"
            className={`stream-nav-item ${mediaFilter === 'movie' ? 'is-active-soft' : ''}`}
            onClick={() => {
              setIsWatchlistFocused(false)
              setSelectedPersonResult(null)
              setMediaFilter('movie')
            }}
          >
            <VideoCameraIcon className="stream-nav-svg" />
            <span className="stream-nav-label">Movies</span>
          </button>

          <button
            type="button"
            className={`stream-nav-item ${mediaFilter === 'tv' ? 'is-active-soft' : ''}`}
            onClick={() => {
              setIsWatchlistFocused(false)
              setSelectedPersonResult(null)
              setMediaFilter('tv')
            }}
          >
            <TvIcon className="stream-nav-svg" />
            <span className="stream-nav-label">TV</span>
          </button>

          <button
            type="button"
            className={`stream-nav-icon ${isWatchlistFocused ? 'is-active-soft' : ''}`}
            onClick={() => {
              if (!isAuthenticated) {
                setAuthErrorMessage('')
                navigate('/account/login')
                return
              }

              setSelectedPersonResult(null)
              setIsWatchlistFocused(true)
              setIsHeroCollapsed(true)
            }}
            aria-label="Open watchlist"
            aria-pressed={isWatchlistFocused}
          >
            <BookmarkIcon className="stream-nav-svg" />
            <span className="stream-nav-label">Watchlist</span>
          </button>

          <button
            type="button"
            className="stream-nav-icon"
            onClick={() => setIsSearchOpen((open) => !open)}
            aria-expanded={isSearchOpen}
            aria-label="Search"
          >
            <SearchIcon className="stream-nav-svg" />
            <span className="stream-nav-label">Search</span>
          </button>

          {isAuthenticated ? (
            <button type="button" className="stream-nav-icon" onClick={() => setIsProfilePanelOpen(true)} aria-label="Open profile">
              <UserIcon className="stream-nav-svg" />
              <span className="stream-nav-label">Profile</span>
            </button>
          ) : (
            <button
              type="button"
              className="stream-nav-icon stream-login-button"
              onClick={() => {
                setAuthErrorMessage('')
                navigate('/account/login')
              }}
              aria-label="Log in"
            >
              <LogInIcon className="stream-nav-svg" />
              <span className="stream-nav-label">Login</span>
            </button>
          )}
        </nav>

        {isSearchOpen && (
          <div className="stream-search-layer">
            <div className="stream-search-panel" role="search">
              <div className="stream-search-row">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search movies, TV shows, actors, or directors"
                  aria-label="Search movies, TV shows, actors, or directors"
                  autoFocus
                />
                <button type="button" onClick={() => setIsSearchOpen(false)}>
                  Close
                </button>
              </div>

              <div className="stream-search-filters" aria-label="Search filters">
                <button type="button" className={selectedGenreIds.length === 0 ? 'is-active' : ''} onClick={clearGenres}>All genres</button>
                <button type="button" className={mediaFilter === 'movie' ? 'is-active' : ''} onClick={() => setMediaFilter('movie')}>Movies</button>
                <button type="button" className={mediaFilter === 'tv' ? 'is-active' : ''} onClick={() => setMediaFilter('tv')}>TV</button>
                <button type="button" onClick={() => setSearchTerm('')}>Popular</button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSearchOpen(false)
                    setIsHeroCollapsed(true)
                  }}
                >
                  Rating
                </button>
                <button type="button" onClick={() => setCurrentPage(1)}>Newest</button>
              </div>

              {genreList.length > 0 && (
                <div className="stream-search-genres" aria-label={`${mediaPluralLabel} genres`}>
                  {genreList.map((genre) => (
                    <button
                      key={genre.id}
                      type="button"
                      className={selectedGenreIds.includes(genre.id) ? 'is-active' : ''}
                      onClick={() => toggleGenre(genre.id)}
                      aria-pressed={selectedGenreIds.includes(genre.id)}
                    >
                      {genre.name}
                    </button>
                  ))}
                </div>
              )}

              {errorMessage && searchTerm.trim().length > 0 ? (
                <p className="stream-search-message">{errorMessage}</p>
              ) : (isLoading || isPersonSearchLoading || isPersonTitlesLoading) && searchTerm.trim().length >= SEARCH_MIN_LENGTH ? (
                <p className="stream-search-message">Searching...</p>
              ) : searchResults.length > 0 || personResults.length > 0 ? (
                <>
                  {personResults.length > 0 && (
                    <div className="stream-person-results" aria-label="People results">
                      {personResults.map((person) => {
                        const knownFor = normalizeMediaList(person.known_for || [], mediaFilter)
                          .slice(0, 2)
                          .map((item) => item.title)
                          .join(', ')

                        return (
                          <button
                            key={`person-${person.id}`}
                            type="button"
                            className="stream-person-result"
                            onClick={() => loadPersonTitles(person)}
                          >
                            <img
                              src={getProfileUrl(person)}
                              alt=""
                              loading="lazy"
                              decoding="async"
                            />
                            <span>
                              <strong>{person.name}</strong>
                              <small>{person.known_for_department || 'Person'}{knownFor ? ` - ${knownFor}` : ''}</small>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {searchResults.length > 0 && (
                    <div className="stream-search-results">
                      {searchResults.slice(0, 8).map((movie) => (
                        <button
                          key={`search-${movie.media_type}-${movie.id}`}
                          type="button"
                          className="stream-search-result"
                          onClick={() => {
                            setIsSearchOpen(false)
                            openTitleDetails(movie)
                          }}
                        >
                          <img
                            src={movie.backdrop_path ? getBackdropUrl(movie, 'w500') : getPosterUrl(movie, 'w342')}
                            alt=""
                            loading="lazy"
                            decoding="async"
                          />
                          <span>{movie.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="stream-search-message">Type at least 3 characters to find titles or people.</p>
              )}
            </div>
          </div>
        )}

        <section className="stream-hero" aria-label="Featured trailer">
          <div className="stream-hero-media" style={heroMediaStyle}>
            {heroTrailerUrl && !isHeroCollapsed && (
              <iframe
                ref={heroVideoRef}
                className="stream-hero-video"
                src={heroTrailerUrl}
                title={`${heroTitle?.title || 'Featured'} trailer`}
                loading="eager"
                fetchPriority="high"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="autoplay *; encrypted-media *; picture-in-picture *"
                onLoad={syncHeroAudio}
                allowFullScreen
              />
            )}
          </div>

          <div className="stream-hero-shade" />

          <div className="stream-hero-queue-switch" aria-label="Hero movie queue">
            <button
              type="button"
              className={heroQueueMode === 'trending' ? 'is-active' : ''}
              onClick={() => setHeroQueueMode('trending')}
              aria-pressed={heroQueueMode === 'trending'}
            >
              Trending
            </button>
            <button
              type="button"
              className={heroQueueMode === 'popular' ? 'is-active' : ''}
              onClick={() => setHeroQueueMode('popular')}
              aria-pressed={heroQueueMode === 'popular'}
            >
              Popular
            </button>
            <button
              type="button"
              className={heroQueueMode === 'recommended' ? 'is-active' : ''}
              onClick={() => setHeroQueueMode('recommended')}
              aria-pressed={heroQueueMode === 'recommended'}
            >
              For You
            </button>
          </div>

          <button
            type="button"
            className="stream-hero-cycle is-prev"
            onClick={() => changeHeroTitle(-1)}
            aria-label="Previous featured trailer"
          >
            ‹
          </button>

          <button
            type="button"
            className="stream-hero-cycle is-next"
            onClick={() => changeHeroTitle(1)}
            aria-label="Next featured trailer"
          >
            ›
          </button>

          <div className="stream-hero-content">
            <p className="stream-hero-kicker">Now rolling</p>
            <h1>{heroTitle?.title || 'Find your next watch'}</h1>
            <p className="stream-hero-copy">
              {heroTitle?.overview || 'Browse cinematic rows of movies and TV shows with a quieter, glassy interface built for discovery.'}
            </p>

            <div className="stream-hero-actions">
              <button type="button" className="stream-action-primary" onClick={() => heroTitle && openTitleDetails(heroTitle)}>
                ▶ Play
              </button>
              <button type="button" className="stream-action-secondary" onClick={() => heroTitle && openTitleDetails(heroTitle)}>
                ● Info
              </button>
              <div className="stream-hero-volume" aria-label="Featured trailer volume">
                <button
                  type="button"
                  className={`stream-hero-volume-button ${isHeroMuted || heroVolume <= 0 ? 'is-muted' : ''}`}
                  onClick={toggleHeroAudio}
                  aria-label={isHeroMuted || heroVolume <= 0 ? 'Unmute featured trailer' : 'Mute featured trailer'}
                  aria-pressed={isHeroMuted || heroVolume <= 0}
                >
                  {isHeroMuted || heroVolume <= 0 ? 'Mute' : 'Audio'}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={heroEffectiveVolume}
                  onChange={changeHeroVolume}
                  aria-label="Featured trailer volume"
                />
              </div>
            </div>
          </div>

        </section>

        <button
          type="button"
          className={`stream-hero-toggle ${isHeroCollapsed ? 'is-expanded' : 'is-collapsed'}`}
          onClick={toggleHeroFocus}
          aria-label={isHeroCollapsed ? 'Show featured trailer' : 'Show browse rows'}
          aria-pressed={isHeroCollapsed}
        >
          <span className="stream-hero-toggle-icon" aria-hidden="true" />
        </button>

        <section className="stream-belts" aria-label="Browse rows" ref={browseRowsRef}>
          {isWatchlistFocused ? (
            watchlistMovies.length > 0 ? (
              <ContentBelt
                title="Your Watchlist"
                items={watchlistMovies}
                accent={`${watchlistMovies.length} saved`}
                headingAction={(
                  <button
                    type="button"
                    className="content-belt-heading-action"
                    onClick={resetToHome}
                  >
                    Clear view
                  </button>
                )}
                beltKey="watchlist"
                onOpenTitle={openTitleDetails}
                onToggleWatchlist={toggleWatchlistMovie}
                watchlistMovieIds={watchlistMovieIds}
                beltVisibleCounts={beltVisibleCounts}
                setBeltVisibleCounts={setBeltVisibleCounts}
                loadingMoreBeltKeys={loadingMoreBeltKeys}
                setLoadingMoreBeltKeys={setLoadingMoreBeltKeys}
                exhaustedBeltKeys={exhaustedBeltKeys}
                setExhaustedBeltKeys={setExhaustedBeltKeys}
              />
            ) : (
              <section className="watchlist-empty-state" aria-labelledby="watchlist-empty-title">
                <BookmarkIcon />
                <h2 id="watchlist-empty-title">Your Watchlist</h2>
                <p>Tap the small plus button on any title card to save it here.</p>
                <button type="button" onClick={resetToHome}>
                  Browse titles
                </button>
              </section>
            )
          ) : selectedPersonResult ? (
            <ContentBelt
              title={`${selectedPersonResult.name} ${mediaPluralLabel}`}
              items={movieList}
              accent={selectedPersonResult.known_for_department || 'Person search'}
              headingAction={(
                <button
                  type="button"
                  className="content-belt-heading-action"
                  onClick={clearPersonFilter}
                >
                  Clear filter
                </button>
              )}
              beltKey={`person-${selectedPersonResult.id}`}
              onOpenTitle={openTitleDetails}
              onToggleWatchlist={toggleWatchlistMovie}
              watchlistMovieIds={watchlistMovieIds}
              beltVisibleCounts={beltVisibleCounts}
              setBeltVisibleCounts={setBeltVisibleCounts}
              loadingMoreBeltKeys={loadingMoreBeltKeys}
              setLoadingMoreBeltKeys={setLoadingMoreBeltKeys}
              exhaustedBeltKeys={exhaustedBeltKeys}
              setExhaustedBeltKeys={setExhaustedBeltKeys}
            />
          ) : (
            <>
              <ContentBelt
                title="Recommended For You"
                items={recommendationItems}
                accent={recommendationAccent}
                headingAction={(
                  <button
                    type="button"
                    className="content-belt-heading-action"
                    onClick={() => {
                      if (!isAuthenticated) {
                        setAuthErrorMessage('')
                        navigate('/account/login')
                        return
                      }

                      setIsTasteQuizOpen(true)
                    }}
                  >
                    {isAuthenticated ? 'Tune Taste' : 'Log in'}
                  </button>
                )}
                beltKey="recommendations"
                onOpenTitle={openTitleDetails}
                onDismissTitle={isAuthenticated ? hideRecommendationTitle : undefined}
                onToggleWatchlist={toggleWatchlistMovie}
                watchlistMovieIds={watchlistMovieIds}
                onLoadMore={loadMoreRecommendedTitles}
                beltVisibleCounts={beltVisibleCounts}
                setBeltVisibleCounts={setBeltVisibleCounts}
                loadingMoreBeltKeys={loadingMoreBeltKeys}
                setLoadingMoreBeltKeys={setLoadingMoreBeltKeys}
                exhaustedBeltKeys={exhaustedBeltKeys}
                setExhaustedBeltKeys={setExhaustedBeltKeys}
              />

              <ContinueWatchingSection />

              {heroRows.map((row) => (
                <ContentBelt
                  key={row.id}
                  title={row.title}
                  items={row.items}
                  accent={row.accent}
                  onLoadMore={row.onLoadMore}
                  beltKey={row.id}
                  onOpenTitle={openTitleDetails}
                  onToggleWatchlist={toggleWatchlistMovie}
                  watchlistMovieIds={watchlistMovieIds}
                  beltVisibleCounts={beltVisibleCounts}
                  setBeltVisibleCounts={setBeltVisibleCounts}
                  loadingMoreBeltKeys={loadingMoreBeltKeys}
                  setLoadingMoreBeltKeys={setLoadingMoreBeltKeys}
                  exhaustedBeltKeys={exhaustedBeltKeys}
                  setExhaustedBeltKeys={setExhaustedBeltKeys}
                />
              ))}

              {isGenreRowsLoading && (
                <div className="stream-belt-loading">
                  <Spinner label="Loading genres" />
                </div>
              )}

              {genreRows.map((row) => (
                <ContentBelt
                  key={`genre-row-${row.id}`}
                  title={`${row.title} ${mediaPluralLabel}`}
                  items={row.items}
                  accent="Genre"
                  onLoadMore={() => loadMoreGenreRow(row.id)}
                  beltKey={`genre-${row.id}`}
                  onOpenTitle={openTitleDetails}
                  onToggleWatchlist={toggleWatchlistMovie}
                  watchlistMovieIds={watchlistMovieIds}
                  beltVisibleCounts={beltVisibleCounts}
                  setBeltVisibleCounts={setBeltVisibleCounts}
                  loadingMoreBeltKeys={loadingMoreBeltKeys}
                  setLoadingMoreBeltKeys={setLoadingMoreBeltKeys}
                  exhaustedBeltKeys={exhaustedBeltKeys}
                  setExhaustedBeltKeys={setExhaustedBeltKeys}
                />
              ))}
            </>
          )}
        </section>

        <footer className="stream-footer" aria-label="Site disclaimer and attribution">
          <span>Movie Browser Demo</span>
          <span>Powered by TMDB data for discovery.</span>
          <a href={TERMS_PATH}>Terms</a>
          <a href={PRIVACY_PATH}>Privacy</a>
          <button type="button" onClick={handleDeletionRequest}>Request data deletion</button>
          {deletionNotice && <span>{deletionNotice}</span>}
        </footer>

        {!hasAcceptedCookieNotice && (
          <div className="cookie-notice" role="region" aria-label="Cookie and local storage notice">
            <p>
              Movieslo uses cookies and local storage for login sessions, preferences, cache, and account features.
              Read the <a href={PRIVACY_PATH}>Privacy Policy</a>.
            </p>
            <button type="button" onClick={acceptCookieNotice}>Accept</button>
          </div>
        )}
      </div>

      {activeDetailMediaType && activeDetailId && (
        <DetailsRoute
          mediaType={activeDetailMediaType}
          id={activeDetailId}
          favoriteMovieIds={favoriteMovieIds}
          onToggleFavorite={toggleFavoriteMovie}
          onOpenTitle={openTitleDetails}
          onPlayTitle={playTitle}
          onClose={closeTitleDetails}
        />
      )}

      {isTasteQuizOpen && (
        <TasteQuizModal
          profile={activeTasteProfile}
          genreOptions={tasteGenreOptions}
          onSave={(profile) => saveTasteProfile(profile, { closeQuiz: true })}
          onDismiss={dismissTasteQuiz}
          isSaving={isSavingTasteProfile}
        />
      )}

      <ProfilePanel
        isOpen={isProfilePanelOpen}
        user={authUser}
        profile={activeTasteProfile}
        genreList={genreList}
        favoriteCount={favoriteMovies.length}
        watchlistCount={watchlistMovies.length}
        historyCount={recentlyWatchedMovies.length}
        recommendationCount={recommendationItems.length}
        recommendationPoolTarget={recommendationPoolLimit}
        hiddenPickCount={activeTasteProfile.ignored_title_keys.length}
        isTrustedDevice={Boolean(authUser?.id && authApi.isTrustedDeviceSessionActive(authUser.id))}
        isPasswordResetSending={isPasswordResetSending}
        statusMessage={profileStatusMessage}
        onClose={() => setIsProfilePanelOpen(false)}
        onOpenTasteQuiz={openTasteQuizFromProfile}
        onClearHiddenPicks={clearHiddenRecommendationTitles}
        onClearWatchHistory={clearWatchHistoryFromSettings}
        onRequestPasswordReset={requestPasswordResetFromSettings}
        onRequestDataDeletion={handleDeletionRequest}
        onLogout={handleLogout}
      />
    </AppShell>
  )

}

const App = () => <BrowsePage />

export default App
