import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { useLocation, useNavigate } from 'react-router-dom'
import Search from './components/Search.jsx'
import Spinner from './components/Spinner.jsx'
import MovieCard from './components/MovieCard.jsx'
import MovieModal from './components/MovieModal.jsx'
import { supabase } from './supabaseClient.js'
import {
  getDetailPath,
  getMediaPluralLabel,
  getStreamingUrl,
  getTMDBDetailEndpoint,
  getTMDBGenreEndpoint,
  getTvEpisodeStreamingUrl,
  MEDIA_TYPE_OPTIONS,
  normalizeMediaItem,
  normalizeMediaList
} from './utils/media.js'

const API_BASE_URL = 'https://api.themoviedb.org/3'
const API_KEY = import.meta.env.VITE_TMDB_API_KEY

const API_OPTIONS = {
  method: 'GET',
  headers: {
    accept: 'application/json',
    Authorization: `Bearer ${API_KEY}`
  }
}

const FAVORITES_USER_ID = 'default'

const fetchJson = async (url) => {
  const response = await fetch(url, API_OPTIONS)

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  return response.json()
}

const upsertRuntime = (items, runtimeMap) =>
  items.map((item) => ({
    ...item,
    runtime: runtimeMap[`${item.media_type || 'movie'}-${item.id}`] ?? item.runtime ?? null
  }))

const getRuntimeKey = (item) => `${item.media_type || 'movie'}-${item.id}`

const getSectionMediaTypes = (mediaFilter) => {
  if (mediaFilter === 'movie') return ['movie']
  return ['tv']
}

const DetailsRoute = ({ mediaType, id, favoriteMovieIds, onToggleFavorite, onOpenTitle }) => {
  const navigate = useNavigate()
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
        const detailEndpoint = getTMDBDetailEndpoint(normalizedMediaType)

        const [detailData, videoData] = await Promise.all([
          fetchJson(`${API_BASE_URL}/${detailEndpoint}/${id}`),
          fetchJson(`${API_BASE_URL}/${detailEndpoint}/${id}/videos`)
        ])

        const normalizedItem = normalizeMediaItem(detailData, normalizedMediaType)
        const trailer = (videoData.results || []).find((video) => video.type === 'Trailer' && video.site === 'YouTube')
        const validSeasons = normalizedMediaType === 'tv'
          ? (detailData.seasons || []).filter((season) => season.season_number > 0)
          : []
        const defaultSeasonNumber = validSeasons[0]?.season_number || null

        setMovie(normalizedItem)
        setTrailerUrl(trailer ? `https://www.youtube.com/embed/${trailer.key}` : '')
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
        const data = await fetchJson(`${API_BASE_URL}/tv/${movie.id}/season/${selectedSeasonNumber}`)
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
        const detailEndpoint = getTMDBDetailEndpoint(movie.media_type)
        const data = await fetchJson(`${API_BASE_URL}/${detailEndpoint}/${movie.id}/similar`)
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
          <button type="button" className="movie-modal-close" onClick={() => navigate('/')}>
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
      onClose={() => navigate('/')}
      similarMovies={similarMovies}
      isSimilarLoading={isSimilarLoading}
      onWatchTrailer={onOpenTitle}
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

const BrowsePage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const detailMatch = location.pathname.match(/^\/title\/(movie|tv)\/(\d+)$/)
  const activeDetailMediaType = detailMatch?.[1] || null
  const activeDetailId = detailMatch?.[2] || null
  const [searchTerm, setSearchTerm] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [movieList, setMovieList] = useState([])
  const [trendingMovies, setTrendingMovies] = useState([])
  const [topRatedMovies, setTopRatedMovies] = useState([])
  const [favoriteMovies, setFavoriteMovies] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [isTrendingLoading, setIsTrendingLoading] = useState(false)
  const [isTopRatedLoading, setIsTopRatedLoading] = useState(false)
  const [isFavoritesLoading, setIsFavoritesLoading] = useState(false)
  const [debouncedSearchTerm] = useDebounce(searchTerm, 500)
  const [mediaFilter, setMediaFilter] = useState('movie')
  const [genreList, setGenreList] = useState([])
  const [selectedGenreIds, setSelectedGenreIds] = useState([])
  const [isGenrePanelOpen, setIsGenrePanelOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [movieRuntimeMap, setMovieRuntimeMap] = useState({})
  const moviesSectionRef = useRef(null)
  const trendingRowRef = useRef(null)
  const topRatedRowRef = useRef(null)
  const favoritesRowRef = useRef(null)

  const selectedGenreSet = useMemo(() => new Set(selectedGenreIds), [selectedGenreIds])
  const mediaPluralLabel = useMemo(() => getMediaPluralLabel(mediaFilter), [mediaFilter])

  const selectedGenreName = useMemo(() => {
    if (selectedGenreIds.length !== 1) return 'All genres'

    return genreList.find((genre) => genre.id === selectedGenreIds[0])?.name || 'All genres'
  }, [genreList, selectedGenreIds])

  const filteredFavoriteMovies = useMemo(() => {
    const typeFilteredFavorites = favoriteMovies.filter((movie) => movie.media_type === mediaFilter)

    if (selectedGenreIds.length === 0) {
      return typeFilteredFavorites
    }

    return typeFilteredFavorites.filter((movie) =>
      movie.genre_ids?.some((genreId) => selectedGenreSet.has(genreId))
    )
  }, [favoriteMovies, mediaFilter, selectedGenreIds, selectedGenreSet])

  const favoriteMovieIds = useMemo(
    () => favoriteMovies.map((movie) => movie.id),
    [favoriteMovies]
  )

  const enrichMoviesWithRuntime = (movies) => upsertRuntime(movies, movieRuntimeMap)

  const fetchGenres = async (selectedMediaFilter) => {
    try {
      const mediaTypes = getSectionMediaTypes(selectedMediaFilter)
      const genreResponses = await Promise.all(
        mediaTypes.map(async (mediaType) => {
          const endpoint = getTMDBGenreEndpoint(mediaType)
          const data = await fetchJson(`${API_BASE_URL}/genre/${endpoint}/list`)
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
      const detailEndpoint = getTMDBDetailEndpoint(selectedMediaFilter)
      const params = new URLSearchParams({
        page: page.toString(),
        include_adult: 'false',
        language: 'en-US'
      })

      let endpoint = `${API_BASE_URL}/discover/${detailEndpoint}`

      if (query) {
        endpoint = `${API_BASE_URL}/search/${detailEndpoint}`
        params.set('query', query)
      } else {
        params.set('sort_by', 'popularity.desc')
      }

      if (genreIds.length > 0) {
        params.set('with_genres', genreIds.join(','))
      }

      const data = await fetchJson(`${endpoint}?${params.toString()}`)
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
      const data = await fetchJson(`${API_BASE_URL}/trending/${selectedMediaFilter}/week`)
      const results = normalizeMediaList((data.results || []).slice(0, 8), selectedMediaFilter)

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

      const data = await fetchJson(`${API_BASE_URL}/discover/${selectedMediaFilter}?${params.toString()}`)

      setTopRatedMovies(enrichMoviesWithRuntime(normalizeMediaList((data.results || []).slice(0, 8), selectedMediaFilter)))
    } catch (error) {
      console.log(`Error fetching top rated titles: ${error}`)
      setTopRatedMovies([])
    } finally {
      setIsTopRatedLoading(false)
    }
  }

  const loadFavoriteMovies = async () => {
    setIsFavoritesLoading(true)

    try {
      const { data: tableSample, error: tableSampleError } = await supabase
        .from('favorite_movies')
        .select('movie_data')
        .limit(1)

      if (tableSampleError) {
        throw tableSampleError
      }

      if (!tableSample) {
        setFavoriteMovies([])
        return
      }

      const { data, error } = await supabase
        .from('favorite_movies')
        .select('movie_data')
        .eq('user_id', FAVORITES_USER_ID)
        .order('created_at', { ascending: false })

      if (error) {
        throw error
      }

      const favorites = (data || [])
        .map((entry) => normalizeMediaItem(entry.movie_data, entry.movie_data?.media_type || 'movie'))
        .filter(Boolean)

      setFavoriteMovies(enrichMoviesWithRuntime(favorites))
    } catch (error) {
      console.log(`Error loading favorites: ${error}`)
      setFavoriteMovies([])
    } finally {
      setIsFavoritesLoading(false)
    }
  }

  const toggleFavoriteMovie = async (movie) => {
    const isFavorite = favoriteMovieIds.includes(movie.id)
    const movieData = {
      ...movie,
      runtime: movie.runtime ?? movieRuntimeMap[getRuntimeKey(movie)] ?? null
    }

    if (isFavorite) {
      setFavoriteMovies((currentMovies) => currentMovies.filter((entry) => entry.id !== movie.id))
    } else {
      setFavoriteMovies((currentMovies) => {
        const withoutMovie = currentMovies.filter((entry) => entry.id !== movie.id)
        return [movieData, ...withoutMovie]
      })

      favoritesRowRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
    }

    try {
      const { error: tableCheckError } = await supabase
        .from('favorite_movies')
        .select('movie_id')
        .limit(1)

      if (tableCheckError) {
        throw tableCheckError
      }

      if (isFavorite) {
        const { error } = await supabase
          .from('favorite_movies')
          .delete()
          .eq('user_id', FAVORITES_USER_ID)
          .eq('movie_id', movie.id)

        if (error) {
          throw error
        }

        return
      }

      const { error } = await supabase
        .from('favorite_movies')
        .upsert({
          user_id: FAVORITES_USER_ID,
          movie_id: movie.id,
          movie_data: movieData
        }, { onConflict: 'user_id,movie_id' })

      if (error) {
        throw error
      }
    } catch (error) {
      console.log(`Error toggling favorite title: ${error}`)

      setFavoriteMovies((currentMovies) => {
        if (isFavorite) {
          const withoutMovie = currentMovies.filter((entry) => entry.id !== movie.id)
          return [movieData, ...withoutMovie]
        }

        return currentMovies.filter((entry) => entry.id !== movie.id)
      })
    }
  }

  const openTitleDetails = (movie) => {
    navigate(getDetailPath(movie), { state: { backgroundLocation: location } })
  }

  const toggleGenre = (genreId) => {
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

  const scrollRow = (rowRef, direction) => {
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

  const fetchMovieRuntimes = async (movies) => {
    const missingMovies = movies.filter((movie) => movieRuntimeMap[getRuntimeKey(movie)] === undefined)

    if (missingMovies.length === 0) {
      return
    }

    try {
      const runtimeEntries = await Promise.all(
        missingMovies.map(async (movie) => {
          const detailEndpoint = getTMDBDetailEndpoint(movie.media_type)
          const response = await fetch(`${API_BASE_URL}/${detailEndpoint}/${movie.id}`, API_OPTIONS)

          if (!response.ok) {
            return [getRuntimeKey(movie), null]
          }

          const data = await response.json()
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

  const renderShowcaseSkeletons = (count = 6) =>
    Array.from({ length: count }, (_, index) => (
      <div key={`showcase-skeleton-${index}`} className="movie-card-skeleton movie-card-skeleton-compact" aria-hidden="true">
        <div className="movie-card-skeleton-poster" />
        <div className="movie-card-skeleton-line movie-card-skeleton-line-title" />
        <div className="movie-card-skeleton-line movie-card-skeleton-line-meta" />
        <div className="movie-card-skeleton-line movie-card-skeleton-line-button" />
      </div>
    ))

  const renderGridSkeletons = (count = 12) =>
    Array.from({ length: count }, (_, index) => (
      <div key={`grid-skeleton-${index}`} className="movie-card-skeleton" aria-hidden="true">
        <div className="movie-card-skeleton-poster" />
        <div className="movie-card-skeleton-line movie-card-skeleton-line-title" />
        <div className="movie-card-skeleton-line movie-card-skeleton-line-meta" />
        <div className="movie-card-skeleton-line movie-card-skeleton-line-button" />
      </div>
    ))

  useEffect(() => {
    loadFavoriteMovies()
  }, [])

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

  return (
    <AppShell>
      <div className="wrapper">
        <div className="desktop-shell">
          <aside className="desktop-sidebar desktop-sidebar-left">
            <div className="desktop-sidebar-stack">
              <section className="media-switcher" aria-labelledby="media-switcher-heading">
                <div className="media-switcher-copy">
                  <p className="media-switcher-label">Choose your lane</p>
                  <h2 id="media-switcher-heading" className="media-switcher-title">Pick movies or TV shows</h2>
                  <p className="media-switcher-text">Switch the feed between films and episodic picks.</p>
                </div>

                <div className="media-switcher-grid">
                  {MEDIA_TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`media-switcher-card ${mediaFilter === option.id ? 'is-active' : ''}`}
                      onClick={() => setMediaFilter(option.id)}
                    >
                      <span className="media-switcher-card-title">{option.label}</span>
                      <span className="media-switcher-card-copy">{option.description}</span>
                    </button>
                  ))}
                </div>
              </section>

              <div className="genre-filter-shell desktop-genre-filter">
                <div className="genre-filter-header">
                  <div>
                    <p className="genre-filter-label">Browse by genre</p>
                    <p className="genre-filter-value">{selectedGenreName}</p>
                  </div>

                  <button
                    type="button"
                    className="genre-filter-toggle"
                    onClick={() => setIsGenrePanelOpen((open) => !open)}
                    aria-expanded={isGenrePanelOpen}
                    aria-controls="genre-filter-panel"
                  >
                    {isGenrePanelOpen ? 'Close genres' : 'Open genres'}
                  </button>
                </div>

                <div id="genre-filter-panel" className={`genre-filter-panel ${isGenrePanelOpen ? 'is-open' : ''}`}>
                  <div className="genre-filter-actions">
                    <span>{selectedGenreIds.length} selected</span>
                    <button
                      type="button"
                      className="genre-clear-button"
                      onClick={clearGenres}
                      disabled={selectedGenreIds.length === 0}
                    >
                      Clear filter
                    </button>
                  </div>

                  <div className="genre-chip-grid">
                    {genreList.map((genre) => {
                      const isSelected = selectedGenreIds.includes(genre.id)

                      return (
                        <button
                          key={genre.id}
                          type="button"
                          className={`genre-chip ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => toggleGenre(genre.id)}
                        >
                          {genre.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <div className="desktop-main-column">
            <header>
              <h1>Find <span className="text-gradient">movies, shows, and series</span> you want to watch</h1>

              <section className="media-switcher mobile-only-panel" aria-labelledby="mobile-media-switcher-heading">
                <div className="media-switcher-copy">
                  <p className="media-switcher-label">Choose your lane</p>
                  <h2 id="mobile-media-switcher-heading" className="media-switcher-title">Pick movies or TV shows</h2>
                  <p className="media-switcher-text">Switch the feed between films and episodic picks.</p>
                </div>

                <div className="media-switcher-grid">
                  {MEDIA_TYPE_OPTIONS.map((option) => (
                    <button
                      key={`mobile-${option.id}`}
                      type="button"
                      className={`media-switcher-card ${mediaFilter === option.id ? 'is-active' : ''}`}
                      onClick={() => setMediaFilter(option.id)}
                    >
                      <span className="media-switcher-card-title">{option.label}</span>
                      <span className="media-switcher-card-copy">{option.description}</span>
                    </button>
                  ))}
                </div>
              </section>

              <div className="genre-filter-shell desktop-hidden-panel">
                <div className="genre-filter-header">
                  <div>
                    <p className="genre-filter-label">Browse by genre</p>
                    <p className="genre-filter-value">{selectedGenreName}</p>
                  </div>

                  <button
                    type="button"
                    className="genre-filter-toggle"
                    onClick={() => setIsGenrePanelOpen((open) => !open)}
                    aria-expanded={isGenrePanelOpen}
                    aria-controls="mobile-genre-filter-panel"
                  >
                    {isGenrePanelOpen ? 'Close genres' : 'Open genres'}
                  </button>
                </div>

                <div id="mobile-genre-filter-panel" className={`genre-filter-panel ${isGenrePanelOpen ? 'is-open' : ''}`}>
                  <div className="genre-filter-actions">
                    <span>{selectedGenreIds.length} selected</span>
                    <button
                      type="button"
                      className="genre-clear-button"
                      onClick={clearGenres}
                      disabled={selectedGenreIds.length === 0}
                    >
                      Clear filter
                    </button>
                  </div>

                  <div className="genre-chip-grid">
                    {genreList.map((genre) => {
                      const isSelected = selectedGenreIds.includes(genre.id)

                      return (
                        <button
                          key={`mobile-${genre.id}`}
                          type="button"
                          className={`genre-chip ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => toggleGenre(genre.id)}
                        >
                          {genre.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <Search searchTerm={searchTerm} setSearchTerm={setSearchTerm} />

              <section className="trending-showcase" aria-labelledby="trending-movies-heading">
                <div className="trending-showcase-header">
                  <div>
                    <p className="trending-showcase-label">Live from TMDB</p>
                    <h2 id="trending-movies-heading" className="trending-showcase-title">Trending {mediaPluralLabel} 🔥</h2>
                  </div>

                  <div className="trending-showcase-meta">
                    <p className="trending-showcase-copy">A quick look at what people are watching right now.</p>
                    <div className="trending-showcase-controls" aria-label="Scroll trending titles">
                      <button type="button" className="trending-scroll-button" onClick={() => scrollRow(trendingRowRef, 'left')}>
                        ←
                      </button>
                      <button type="button" className="trending-scroll-button" onClick={() => scrollRow(trendingRowRef, 'right')}>
                        →
                      </button>
                    </div>
                  </div>
                </div>

                {isTrendingLoading ? (
                  <div className="trending-showcase-row skeleton-showcase-row">
                    {renderShowcaseSkeletons()}
                  </div>
                ) : trendingMovies.length > 0 ? (
                  <div className="trending-showcase-row" ref={trendingRowRef}>
                    {trendingMovies.map((movie) => (
                      <MovieCard
                        key={`trending-${movie.media_type}-${movie.id}`}
                        movie={movie}
                        onWatchTrailer={openTitleDetails}
                        onToggleFavorite={toggleFavoriteMovie}
                        isFavorite={favoriteMovieIds.includes(movie.id)}
                        compact
                      />
                    ))}
                  </div>
                ) : (
                  <p className="trending-showcase-empty">Trending titles are unavailable right now.</p>
                )}
              </section>

              <section className="trending-showcase top-rated-showcase" aria-labelledby="top-rated-movies-heading">
                <div className="trending-showcase-header">
                  <div>
                    <p className="trending-showcase-label">Curated from TMDB</p>
                    <h2 id="top-rated-movies-heading" className="trending-showcase-title">Top Rated {mediaPluralLabel}</h2>
                  </div>

                  <div className="trending-showcase-meta">
                    <p className="trending-showcase-copy">
                      {selectedGenreIds.length > 0
                        ? 'Highest rated picks for the genres you selected.'
                        : `Highest rated ${mediaPluralLabel.toLowerCase()} people keep coming back to.`}
                    </p>
                    <div className="trending-showcase-controls" aria-label="Scroll top rated titles">
                      <button type="button" className="trending-scroll-button" onClick={() => scrollRow(topRatedRowRef, 'left')}>
                        ←
                      </button>
                      <button type="button" className="trending-scroll-button" onClick={() => scrollRow(topRatedRowRef, 'right')}>
                        →
                      </button>
                    </div>
                  </div>
                </div>

                {topRatedMovies.length > 0 ? (
                  <div className="showcase-row-shell">
                    <div className={`trending-showcase-row ${isTopRatedLoading ? 'is-updating' : ''}`} ref={topRatedRowRef}>
                      {topRatedMovies.map((movie) => (
                        <MovieCard
                          key={`top-rated-${movie.media_type}-${movie.id}`}
                          movie={movie}
                          onWatchTrailer={openTitleDetails}
                          onToggleFavorite={toggleFavoriteMovie}
                          isFavorite={favoriteMovieIds.includes(movie.id)}
                          compact
                        />
                      ))}
                    </div>

                    {isTopRatedLoading && (
                      <div className="showcase-row-overlay" aria-hidden="true">
                        <Spinner />
                      </div>
                    )}
                  </div>
                ) : isTopRatedLoading ? (
                  <div className="trending-showcase-row skeleton-showcase-row">
                    {renderShowcaseSkeletons()}
                  </div>
                ) : (
                  <p className="trending-showcase-empty">No top rated titles match the current filters.</p>
                )}
              </section>

              <section className="trending-showcase favorites-showcase desktop-hidden-panel" aria-labelledby="mobile-favorites-movies-heading">
                <div className="trending-showcase-header">
                  <div>
                    <p className="trending-showcase-label">Your collection</p>
                    <h2 id="mobile-favorites-movies-heading" className="trending-showcase-title">Favorites & Watchlist</h2>
                  </div>

                  <div className="trending-showcase-meta">
                    <p className="trending-showcase-copy">
                      {selectedGenreIds.length > 0
                        ? 'Saved titles filtered by your selected genres.'
                        : 'Keep your go-to picks close for later.'}
                    </p>
                    <div className="trending-showcase-controls" aria-label="Scroll favorite titles">
                      <button type="button" className="trending-scroll-button" onClick={() => scrollRow(favoritesRowRef, 'left')}>
                        ←
                      </button>
                      <button type="button" className="trending-scroll-button" onClick={() => scrollRow(favoritesRowRef, 'right')}>
                        →
                      </button>
                    </div>
                  </div>
                </div>

                {isFavoritesLoading ? (
                  <div className="trending-showcase-row skeleton-showcase-row">
                    {renderShowcaseSkeletons(5)}
                  </div>
                ) : filteredFavoriteMovies.length > 0 ? (
                  <div className="trending-showcase-row" ref={favoritesRowRef}>
                    {filteredFavoriteMovies.map((movie) => (
                      <MovieCard
                        key={`mobile-favorite-${movie.media_type}-${movie.id}`}
                        movie={movie}
                        onWatchTrailer={openTitleDetails}
                        onToggleFavorite={toggleFavoriteMovie}
                        isFavorite
                        compact
                      />
                    ))}
                  </div>
                ) : (
                  <p className="trending-showcase-empty">
                    {selectedGenreIds.length > 0
                      ? 'No saved titles match the current genre filter.'
                      : 'Save titles with the heart button to build your own watchlist.'}
                  </p>
                )}
              </section>
            </header>

            <section className="all-movies" ref={moviesSectionRef}>
              <div className="movies-section-heading">
                <h2 className="mt-[40px]">All {mediaPluralLabel}</h2>
                {selectedGenreIds.length > 0 && (
                  <p className="genre-results-copy">Showing {mediaPluralLabel.toLowerCase()} matching your selected genres</p>
                )}
              </div>

              <PaginationControls position="top" />

              {errorMessage ? (
                <p className="text-red-500">{errorMessage}</p>
              ) : isLoading && movieList.length === 0 ? (
                <div className="movie-grid-shell">
                  <div className="movie-grid movie-grid-skeleton">
                    {renderGridSkeletons()}
                  </div>
                </div>
              ) : movieList.length === 0 ? (
                <p className="genre-results-copy">No titles found for the current search and genre filters.</p>
              ) : (
                <div className="movie-grid-shell">
                  {isLoading && (
                    <div className="movie-grid-loading">
                      <Spinner />
                    </div>
                  )}

                  <ul className={isLoading ? 'movie-grid is-loading' : 'movie-grid'}>
                    {movieList.map((movie) => (
                      <MovieCard
                        key={`${movie.media_type}-${movie.id}`}
                        movie={movie}
                        onWatchTrailer={openTitleDetails}
                        onToggleFavorite={toggleFavoriteMovie}
                        isFavorite={favoriteMovieIds.includes(movie.id)}
                      />
                    ))}
                  </ul>
                </div>
              )}

              {!errorMessage && movieList.length > 0 && <PaginationControls position="bottom" />}
            </section>
          </div>

          <aside className="desktop-sidebar desktop-sidebar-right">
            <section className="trending-showcase favorites-showcase desktop-favorites-panel" aria-labelledby="favorites-movies-heading">
              <div className="trending-showcase-header desktop-favorites-header">
                <div>
                  <p className="trending-showcase-label">Your collection</p>
                  <h2 id="favorites-movies-heading" className="trending-showcase-title">Favorites & Watchlist</h2>
                </div>

                <p className="trending-showcase-copy">
                  {selectedGenreIds.length > 0
                    ? 'Saved titles filtered by your selected genres.'
                    : 'Keep your go-to picks close for later.'}
                </p>
              </div>

              {isFavoritesLoading ? (
                <div className="desktop-favorites-list">
                  {renderShowcaseSkeletons(5)}
                </div>
              ) : filteredFavoriteMovies.length > 0 ? (
                <div className="desktop-favorites-list custom-scrollbar" ref={favoritesRowRef}>
                  {filteredFavoriteMovies.map((movie) => (
                    <MovieCard
                      key={`favorite-${movie.media_type}-${movie.id}`}
                      movie={movie}
                      onWatchTrailer={openTitleDetails}
                      onToggleFavorite={toggleFavoriteMovie}
                      isFavorite
                      compact
                    />
                  ))}
                </div>
              ) : (
                <p className="trending-showcase-empty desktop-favorites-empty">
                  {selectedGenreIds.length > 0
                    ? 'No saved titles match the current genre filter.'
                    : 'Save titles with the heart button to build your own watchlist.'}
                </p>
              )}
            </section>
          </aside>
        </div>

        <footer className="site-footer" aria-label="Site disclaimer and attribution">
          <div className="site-footer-inner">
            <p className="site-footer-brand">Movie Browser Demo</p>
            <p className="site-footer-copy">
              This website is provided for demonstration and non-production use only. Content, metadata, and imagery are powered by the TMDB API.
            </p>
            <p className="site-footer-copy site-footer-copy-muted">
              TMDB data is used for browsing and discovery. This project is an independent demo experience and is not endorsed by or certified by TMDB.
            </p>
          </div>
        </footer>
      </div>

      {activeDetailMediaType && activeDetailId && (
        <DetailsRoute
          mediaType={activeDetailMediaType}
          id={activeDetailId}
          favoriteMovieIds={favoriteMovieIds}
          onToggleFavorite={toggleFavoriteMovie}
          onOpenTitle={openTitleDetails}
        />
      )}
    </AppShell>
  )
}

const App = () => <BrowsePage />

export default App
