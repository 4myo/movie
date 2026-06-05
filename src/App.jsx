import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { useLocation, useNavigate } from 'react-router-dom'
import Spinner from './components/Spinner.jsx'
import MovieModal from './components/MovieModal.jsx'
import { AuthPage } from './components/AuthModal.jsx'
import { supabase } from './supabaseClient.js'
import {
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
  'titles:',
  'top-rated:',
  'trending:'
]
const responseCache = new Map()
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
const imageBaseUrl = 'https://image.tmdb.org/t/p/'

const getBackdropUrl = (item, size = 'w1280') => {
  if (item?.backdrop_path) return `${imageBaseUrl}${size}${item.backdrop_path}`
  if (item?.poster_path) return `${imageBaseUrl}w780${item.poster_path}`
  return '/hero-bg.png'
}

const getPosterUrl = (item, size = 'w500') =>
  item?.poster_path ? `${imageBaseUrl}${size}${item.poster_path}` : '/no-movie.png'

const getHeroTrailerEmbedUrl = (videoKey) =>
  videoKey
    ? `https://www.youtube-nocookie.com/embed/${videoKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoKey}&rel=0&modestbranding=1&playsinline=1`
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
        items: normalizeMediaList((data.results || []).slice(0, 14), selectedMediaFilter)
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

const DetailsRoute = ({ mediaType, id, favoriteMovieIds, onToggleFavorite, onOpenTitle, onClose }) => {
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
        <Spinner />
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
      onPlayTitle={(title) => window.open(`/watch/${title.media_type || 'movie'}/${title.id}`, '_blank', 'noopener,noreferrer')}
      onToggleFavorite={onToggleFavorite}
      favoriteMovieIds={favoriteMovieIds}
    />
  )
}

const AppShell = ({ children }) => (
  <main>
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
  <AppShell>
    <div className="wrapper">
      <AuthPage
        mode={mode}
        onModeChange={onModeChange}
        onSubmit={onSubmit}
        isSubmitting={isSubmitting}
        errorMessage={errorMessage}
      />
    </div>
  </AppShell>
)

const WatchRoute = ({ mediaType, id }) => {
  const navigate = useNavigate()
  const [movie, setMovie] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasLoadError, setHasLoadError] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState('111movies')
  const [seasonOptions, setSeasonOptions] = useState([])
  const [episodeOptions, setEpisodeOptions] = useState([])
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState(null)
  const [selectedEpisodeNumber, setSelectedEpisodeNumber] = useState(null)
  const [isServerMenuOpen, setIsServerMenuOpen] = useState(false)
  const providers = useMemo(() => getStreamingProviders(), [])
  const isTvShow = mediaType === 'tv'

  useEffect(() => {
    const loadWatchTitle = async () => {
      setIsLoading(true)
      setHasLoadError(false)
      setMovie(null)
      setSeasonOptions([])
      setEpisodeOptions([])
      setSelectedSeasonNumber(null)
      setSelectedEpisodeNumber(null)

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
  }, [id, isTvShow, mediaType])

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
  const backdropUrl = movie?.backdrop_path
    ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}`
    : '/hero-bg.png'

  if (isLoading) {
    return (
      <AppShell>
        <div className="watch-loader-state">
          <Spinner />
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
        </header>

        <section className="watch-player-shell" aria-label={`${movie.title} player`}>
          {playerUrl ? (
            <iframe
              key={playerUrl}
              src={playerUrl}
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
  const activeDetailMediaType = detailMatch?.[1] || null
  const activeDetailId = detailMatch?.[2] || null
  const activeWatchMediaType = watchMatch?.[1] || null
  const activeWatchId = watchMatch?.[2] || null
  const [searchTerm, setSearchTerm] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [movieList, setMovieList] = useState([])
  const [trendingMovies, setTrendingMovies] = useState([])
  const [topRatedMovies, setTopRatedMovies] = useState([])
  const [genreRows, setGenreRows] = useState([])
  const [heroTitle, setHeroTitle] = useState(null)
  const [heroTrailerUrl, setHeroTrailerUrl] = useState('')
  const [heroIndex, setHeroIndex] = useState(0)
  const [isHeroCollapsed, setIsHeroCollapsed] = useState(false)
  const [favoriteMovies, setFavoriteMovies] = useState([])
  const [recentlyWatchedMovies, setRecentlyWatchedMovies] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [_isTrendingLoading, setIsTrendingLoading] = useState(false)
  const [_isTopRatedLoading, setIsTopRatedLoading] = useState(false)
  const [isGenreRowsLoading, setIsGenreRowsLoading] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [_isFavoritesLoading, setIsFavoritesLoading] = useState(false)
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
  const [deletionNotice, setDeletionNotice] = useState('')
  const moviesSectionRef = useRef(null)
  const browseRowsRef = useRef(null)
  const _trendingRowRef = useRef(null)
  const topRatedRowRef = useRef(null)
  const favoritesRowRef = useRef(null)
  const _recentlyWatchedRowRef = useRef(null)

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

  const isAuthenticated = Boolean(authUser)
  const authMode = authMatch?.[1] === 'signup' ? 'signup' : 'login'
  const isAuthRouteOpen = Boolean(authMatch)

  const enrichMoviesWithRuntime = (movies) => upsertRuntime(movies, movieRuntimeMap)

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
      setTotalPages(Math.min(data.total_pages || 1, 500))
    } catch (error) {
      console.log(`Error fetching titles: ${error}`)
      setErrorMessage('Error fetching titles. Please try again later')
      setMovieList([])
    } finally {
      setIsLoading(false)
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

      const results = normalizeMediaList((data.results || []).slice(0, 16), selectedMediaFilter)

      setTrendingMovies(enrichMoviesWithRuntime(results))
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

      setTopRatedMovies(enrichMoviesWithRuntime(normalizeMediaList((data.results || []).slice(0, 16), selectedMediaFilter)))
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

  const loadRecentlyWatched = async () => {
    if (!isAuthenticated) {
      setRecentlyWatchedMovies([])
      setIsRecentlyWatchedLoading(false)
      return
    }

    setIsRecentlyWatchedLoading(true)

    try {
      const data = await authApi.getRecentlyWatched(authUser.id)
      const items = (data?.items || []).map((entry) => normalizeMediaItem(entry, entry?.media_type || 'movie'))
      setRecentlyWatchedMovies(enrichMoviesWithRuntime(items))
    } catch (error) {
      console.log(`Error loading recently watched titles: ${error}`)
      setRecentlyWatchedMovies([])
    } finally {
      setIsRecentlyWatchedLoading(false)
    }
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

  const openTitleDetails = (movie) => {
    if (isAuthenticated) {
      authApi.trackRecentlyWatched(authUser.id, movie).catch((error) => {
        console.log(`Error tracking recently watched title: ${error}`)
      })

      setRecentlyWatchedMovies((currentMovies) => {
        const normalizedMovie = normalizeMediaItem(movie, movie.media_type || 'movie')
        const normalizedMovieKey = getMediaItemKey(normalizedMovie)
        const withoutMovie = currentMovies.filter((entry) => getMediaItemKey(entry) !== normalizedMovieKey)
        return [normalizedMovie, ...withoutMovie].slice(0, 12)
      })
    }

    navigate(getDetailPath(movie), { state: { backgroundLocation: location } })
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

  const resetToHome = () => {
    setSearchTerm('')
    setSelectedGenreIds([])
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
    loadRecentlyWatched()
  }, [isAuthenticated])

  useEffect(() => {
    fetchGenres(mediaFilter)
    fetchTrendingTitles(mediaFilter)
    fetchTopRatedTitles(selectedGenreIds, mediaFilter)
    topRatedRowRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
  }, [mediaFilter])

  useEffect(() => {
    fetchTopRatedTitles(selectedGenreIds, mediaFilter)
    topRatedRowRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
  }, [selectedGenreIds])

  useEffect(() => {
    fetchGenreRows(mediaFilter, genreList)
  }, [genreList, mediaFilter])

  useEffect(() => {
    const scrollTarget = window.setTimeout(() => {
      if (isHeroCollapsed) {
        browseRowsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }

      document.querySelector('.stream-hero')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, isHeroCollapsed ? 420 : 0)

    return () => {
      window.clearTimeout(scrollTarget)
    }
  }, [isHeroCollapsed])

  useEffect(() => {
    let isActive = true

    const loadHeroTrailer = async () => {
      const heroCandidates = trendingMovies.filter((movie) => movie.backdrop_path || movie.poster_path)

      if (heroCandidates.length === 0) {
        setHeroTitle(null)
        setHeroTrailerUrl('')
        return
      }

      const selectedTitle = heroCandidates[((heroIndex % heroCandidates.length) + heroCandidates.length) % heroCandidates.length]
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
        const video = (data.results || []).find((entry) =>
          entry.site === 'YouTube' && ['Trailer', 'Teaser'].includes(entry.type)
        )

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
  }, [heroIndex, trendingMovies])

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearchTerm, selectedGenreIds, mediaFilter])

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
    fetchMovies(debouncedSearchTerm, selectedGenreIds, currentPage, mediaFilter)
  }, [debouncedSearchTerm, selectedGenreIds, currentPage, mediaFilter])

  useEffect(() => {
    if (movieList.length > 0) fetchMovieRuntimes(movieList)
  }, [movieList])

  useEffect(() => {
    if (trendingMovies.length > 0) fetchMovieRuntimes(trendingMovies)
  }, [trendingMovies])

  useEffect(() => {
    if (topRatedMovies.length > 0) fetchMovieRuntimes(topRatedMovies)
  }, [topRatedMovies])

  useEffect(() => {
    if (favoriteMovies.length > 0) fetchMovieRuntimes(favoriteMovies)
  }, [favoriteMovies])

  useEffect(() => {
    if (recentlyWatchedMovies.length > 0) fetchMovieRuntimes(recentlyWatchedMovies)
  }, [recentlyWatchedMovies])

  const handleAuthSubmit = async (payload) => {
    setIsAuthSubmitting(true)
    setAuthErrorMessage('')

    try {
      const data = authMode === 'signup'
        ? await authApi.signup(payload)
        : await authApi.login(payload)

      setAuthUser(data?.user || null)
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
      setRecentlyWatchedMovies([])
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
        setRecentlyWatchedMovies([])
        setDeletionNotice('Your account, favorites, and recently watched history have been permanently deleted. You have been signed out.')
      })
      .catch((error) => {
        console.log(`Error deleting account: ${error}`)
        setDeletionNotice('We could not complete your account deletion right now. Please try again later.')
      })
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

  const BeltCard = ({ movie, index = 0 }) => (
    <article
      className="belt-card"
      onClick={() => openTitleDetails(movie)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          openTitleDetails(movie)
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${movie.title}`}
      style={{ '--card-index': index }}
    >
      <div className="belt-card-image-shell">
        <img
          className="belt-card-image"
          src={movie.backdrop_path ? getBackdropUrl(movie, 'w780') : getPosterUrl(movie)}
          alt={movie.title}
          loading="lazy"
        />
      </div>
      <h3 className="belt-card-title">{movie.title}</h3>
    </article>
  )

  const ContentBelt = ({ title, items = [], accent = '' }) => {
    const beltRef = useRef(null)

    if (items.length === 0) return null

    const beltItems = items.slice(0, 12)
    const scrollBelt = (direction) => {
      beltRef.current?.scrollBy({
        left: direction === 'left' ? -Math.max(window.innerWidth * 0.72, 280) : Math.max(window.innerWidth * 0.72, 280),
        behavior: 'smooth'
      })
    }

    return (
      <section className="content-belt" aria-labelledby={`belt-${title.replace(/\s+/g, '-').toLowerCase()}`}>
        <div className="content-belt-heading">
          <h2 id={`belt-${title.replace(/\s+/g, '-').toLowerCase()}`}>{title}</h2>
          {accent && <span>{accent}</span>}
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
              />
            ))}
          </div>
        </div>
      </section>
    )
  }

  const heroBackdrop = heroTitle ? getBackdropUrl(heroTitle, 'original') : '/hero-bg.png'
  const heroMediaStyle = heroTrailerUrl ? undefined : { backgroundImage: `url(${heroBackdrop})` }
  const changeHeroTitle = (direction) => {
    const heroCandidates = trendingMovies.filter((movie) => movie.backdrop_path || movie.poster_path)
    if (heroCandidates.length === 0) return

    setIsHeroCollapsed(false)
    setHeroIndex((currentIndex) => (currentIndex + direction + heroCandidates.length) % heroCandidates.length)
    requestAnimationFrame(() => {
      document.querySelector('.stream-hero')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
  const toggleHeroFocus = () => {
    setIsHeroCollapsed((isCollapsed) => !isCollapsed)
  }
  const heroRows = [
    { id: 'trending', title: `Trending ${mediaPluralLabel}`, items: trendingMovies, accent: 'Live from TMDB' },
    { id: 'top-rated', title: `Top Rated ${mediaPluralLabel}`, items: topRatedMovies, accent: 'Highest rated' },
    { id: 'popular', title: `Popular ${mediaPluralLabel}`, items: movieList, accent: 'This week' }
  ]
  const searchResults = debouncedSearchTerm.trim().length >= SEARCH_MIN_LENGTH ? movieList : []

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
    return <WatchRoute mediaType={activeWatchMediaType} id={activeWatchId} />
  }

  return (
    <AppShell>
      <div className={`streaming-home ${isHeroCollapsed ? 'is-browse-focused' : ''}`}>
        <nav className="stream-nav" aria-label="Primary navigation">
          <button type="button" className="stream-nav-item is-active" onClick={resetToHome}>
            Home
          </button>

          <button
            type="button"
            className={`stream-nav-item ${mediaFilter === 'movie' ? 'is-active-soft' : ''}`}
            onClick={() => setMediaFilter('movie')}
          >
            Movies
          </button>

          <button
            type="button"
            className={`stream-nav-item ${mediaFilter === 'tv' ? 'is-active-soft' : ''}`}
            onClick={() => setMediaFilter('tv')}
          >
            TV
          </button>

          <button type="button" className="stream-nav-item is-disabled" disabled>
            Sports
          </button>

          <button
            type="button"
            className="stream-nav-icon"
            onClick={() => setIsSearchOpen((open) => !open)}
            aria-expanded={isSearchOpen}
            aria-label="Search"
          >
            Search
          </button>

          {isAuthenticated ? (
            <button type="button" className="stream-nav-icon" onClick={handleLogout} aria-label="Log out">
              Logout
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
              Login
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
                  placeholder="Search movies or TV shows"
                  aria-label="Search movies or TV shows"
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
                <button type="button" onClick={() => setMovieList(topRatedMovies)}>Rating</button>
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
              ) : isLoading && searchTerm.trim().length >= SEARCH_MIN_LENGTH ? (
                <p className="stream-search-message">Searching...</p>
              ) : searchResults.length > 0 ? (
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
                      <img src={movie.backdrop_path ? getBackdropUrl(movie, 'w500') : getPosterUrl(movie, 'w342')} alt="" />
                      <span>{movie.title}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="stream-search-message">Type at least 3 characters to find something specific.</p>
              )}
            </div>
          </div>
        )}

        <section className="stream-hero" aria-label="Featured trailer">
          <div className="stream-hero-media" style={heroMediaStyle}>
            {heroTrailerUrl && !isHeroCollapsed && (
              <iframe
                className="stream-hero-video"
                src={heroTrailerUrl}
                title={`${heroTitle?.title || 'Featured'} trailer`}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            )}
          </div>

          <div className="stream-hero-shade" />

          <button
            type="button"
            className="stream-hero-cycle is-prev"
            onClick={() => changeHeroTitle(-1)}
            aria-label="Previous trending trailer"
          >
            ‹
          </button>

          <button
            type="button"
            className="stream-hero-cycle is-next"
            onClick={() => changeHeroTitle(1)}
            aria-label="Next trending trailer"
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
            </div>
          </div>

        </section>

        <button
          type="button"
          className="stream-hero-toggle"
          onClick={toggleHeroFocus}
          aria-label={isHeroCollapsed ? 'Show featured trailer' : 'Show browse rows'}
          aria-pressed={isHeroCollapsed}
        >
          <span aria-hidden="true">{isHeroCollapsed ? '⌃' : '⌄'}</span>
        </button>

        <section className="stream-belts" aria-label="Browse rows" ref={browseRowsRef}>
          {heroRows.map((row, index) => (
            <ContentBelt
              key={row.id}
              title={row.title}
              items={row.items}
              accent={row.accent}
              speed={52 + index * 8}
            />
          ))}

          {isGenreRowsLoading && (
            <div className="stream-belt-loading">
              <Spinner />
            </div>
          )}

          {genreRows.map((row) => (
            <ContentBelt
              key={`genre-row-${row.id}`}
              title={`${row.title} ${mediaPluralLabel}`}
              items={row.items}
              accent="Genre"
            />
          ))}
        </section>

        <footer className="stream-footer" aria-label="Site disclaimer and attribution">
          <span>Movie Browser Demo</span>
          <span>Powered by TMDB data for discovery.</span>
          <button type="button" onClick={handleDeletionRequest}>Request data deletion</button>
          {deletionNotice && <span>{deletionNotice}</span>}
        </footer>
      </div>

      {activeDetailMediaType && activeDetailId && (
        <DetailsRoute
          mediaType={activeDetailMediaType}
          id={activeDetailId}
          favoriteMovieIds={favoriteMovieIds}
          onToggleFavorite={toggleFavoriteMovie}
          onOpenTitle={openTitleDetails}
          onClose={closeTitleDetails}
        />
      )}
    </AppShell>
  )

}

const App = () => <BrowsePage />

export default App
