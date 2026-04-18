import React, { useEffect, useMemo, useState } from 'react'
import MovieCard from './MovieCard.jsx'
import { getMediaLabel, getMediaPluralLabel, getStreamingProviders } from '../utils/media.js'

const MovieModal = ({
  movie,
  trailerUrl,
  seasonOptions = [],
  selectedSeasonNumber = null,
  selectedEpisodeNumber = null,
  episodeOptions = [],
  onSeasonChange,
  onEpisodeChange,
  onClose,
  similarMovies = [],
  isSimilarLoading = false,
  onWatchTrailer,
  onToggleFavorite,
  favoriteMovieIds = []
}) => {
  const [viewMode, setViewMode] = useState('trailer')
  const [selectedProvider, setSelectedProvider] = useState('akcloud')

  const mediaLabel = getMediaLabel(movie?.media_type)
  const mediaPluralLabel = getMediaPluralLabel(movie?.media_type)
  const isTvShow = movie?.media_type === 'tv'
  const providers = useMemo(() => getStreamingProviders(), [])

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow

    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  useEffect(() => {
    setViewMode('trailer')
    setSelectedProvider('akcloud')
  }, [movie?.id])

  const currentStreamUrl = useMemo(() => {
    if (!movie?.id || viewMode !== 'stream') return ''

    const provider = providers.find((item) => item.id === selectedProvider)
    if (!provider) return ''

    if (isTvShow) {
      if (!selectedSeasonNumber || !selectedEpisodeNumber) return ''
      return provider.tvEpisodeUrl(movie.id, selectedSeasonNumber, selectedEpisodeNumber)
    }

    return provider.movieUrl(movie.id)
  }, [
    isTvShow,
    movie?.id,
    providers,
    selectedEpisodeNumber,
    selectedProvider,
    selectedSeasonNumber,
    viewMode
  ])

  if (!movie) return null

  return (
    <div className="movie-modal-backdrop" onClick={onClose}>
      <div className="movie-modal-panel custom-scrollbar" onClick={(event) => event.stopPropagation()}>
        <div className="movie-modal-inner">
          <div className="movie-modal-header">
            <h2 className="movie-modal-title">{movie.title}</h2>
            <button onClick={onClose} className="movie-modal-close">
              close
            </button>
          </div>

          <div className="movie-modal-layout">
            <div className="movie-modal-poster-column">
              <div className="movie-modal-poster-shell">
                <img
                  src={movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : '/no-movie.png'}
                  alt={movie.title}
                  className="movie-modal-poster"
                />
              </div>
            </div>

            <div className="movie-modal-info-column">
              <div className="movie-modal-summary-card">
                <div className="movie-modal-title-block">
                  <p className="movie-modal-kicker">{mediaLabel}</p>
                  <h3 className="movie-modal-heading-main">{movie.title}</h3>
                </div>

                <div className="movie-modal-facts-inline">
                  <span className="movie-modal-fact-pill">
                    {movie.release_date ? new Date(movie.release_date).getFullYear() : 'N/A'}
                  </span>
                  <span className="movie-modal-fact-pill">
                    {movie.vote_average ? `${movie.vote_average.toFixed(1)} / 10` : 'No rating'}
                  </span>
                  <span className="movie-modal-fact-pill">
                    {movie.runtime ? `${movie.runtime} min` : 'Runtime N/A'}
                  </span>
                  <span className="movie-modal-fact-pill">
                    {movie.original_language ? movie.original_language.toUpperCase() : 'N/A'}
                  </span>
                </div>

                {movie.overview && (
                  <p className="movie-modal-overview movie-modal-overview-compact">{movie.overview}</p>
                )}

              </div>

              <div className="movie-modal-player-block movie-modal-media-section">
                <div className="movie-modal-switches">
                  <button
                    onClick={() => setViewMode('trailer')}
                    className={`movie-modal-tab ${viewMode === 'trailer' ? 'is-active' : ''}`}
                  >
                    Trailer
                  </button>
                  <button
                    onClick={() => setViewMode('stream')}
                    className={`movie-modal-tab ${viewMode === 'stream' ? 'is-active' : ''}`}
                  >
                    Stream {mediaLabel}
                  </button>
                </div>

                <h3 className="movie-modal-player-heading">
                  {viewMode === 'trailer' ? 'Trailer' : `Stream Full ${mediaLabel}`}
                </h3>

                {viewMode === 'stream' && isTvShow && (
                  <div className="episode-selector-panel">
                    <div className="episode-selector-field">
                      <label htmlFor="season-select" className="episode-selector-label">Season</label>
                      <select
                        id="season-select"
                        className="episode-selector-input"
                        value={selectedSeasonNumber ?? ''}
                        onChange={(event) => onSeasonChange?.(Number(event.target.value))}
                      >
                        {seasonOptions.map((season) => (
                          <option key={season.season_number} value={season.season_number}>
                            {season.name || `Season ${season.season_number}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="episode-selector-field">
                      <label htmlFor="episode-select" className="episode-selector-label">Episode</label>
                      <select
                        id="episode-select"
                        className="episode-selector-input"
                        value={selectedEpisodeNumber ?? ''}
                        onChange={(event) => onEpisodeChange?.(Number(event.target.value))}
                      >
                        {episodeOptions.map((episode) => (
                          <option key={episode.episode_number} value={episode.episode_number}>
                            Episode {episode.episode_number}: {episode.name || 'Untitled'}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {viewMode === 'trailer' && trailerUrl && (
                  <div className="movie-modal-player-frame">
                    <iframe
                      src={trailerUrl}
                      title={`${movie.title} Trailer`}
                      className="movie-modal-iframe"
                      loading="lazy"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allow="accelerometer *; autoplay *; clipboard-write *; encrypted-media *; gyroscope *; picture-in-picture *; web-share *; fullscreen *"
                      allowFullScreen
                    />
                  </div>
                )}

                {viewMode === 'stream' && currentStreamUrl && (
                  <div className="movie-modal-player-frame">
                    <iframe
                      src={currentStreamUrl}
                      title={`${movie.title} Stream`}
                      className="movie-modal-iframe"
                      loading="lazy"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allow="autoplay *; encrypted-media *; picture-in-picture *; web-share *; fullscreen *"
                      allowFullScreen
                    />
                  </div>
                )}

                {viewMode === 'stream' && (
                  <div className="movie-modal-streaming-providers">
                    <h4 className="movie-modal-streaming-title">Select Streaming Server</h4>
                    <div className="movie-modal-streaming-buttons">
                      {providers.map((provider) => (
                        <button
                          key={provider.id}
                          type="button"
                          className={`movie-modal-streaming-button ${selectedProvider === provider.id ? 'is-active' : ''}`}
                          onClick={() => setSelectedProvider(provider.id)}
                        >
                          <span className="movie-modal-streaming-button-label">Server</span>
                          <span className="movie-modal-streaming-button-name">{provider.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {viewMode === 'trailer' && !trailerUrl && (
                  <p className="movie-modal-empty-state">Trailer is not available for this title.</p>
                )}

                {viewMode === 'stream' && !currentStreamUrl && (
                  <p className="movie-modal-empty-state">
                    {isTvShow
                      ? 'Select a season and episode to load the stream.'
                      : 'Select a streaming server to watch.'}
                  </p>
                )}
              </div>

              <div className="movie-modal-similar-block">
                <div className="movie-modal-similar-header">
                  <h3 className="movie-modal-player-heading">Similar {mediaPluralLabel}</h3>
                  <p className="movie-modal-similar-copy">Keep browsing titles related to this pick.</p>
                </div>

                {isSimilarLoading ? (
                  <div className="movie-modal-similar-loading">
                    <div className="movie-card-skeleton movie-card-skeleton-compact" aria-hidden="true">
                      <div className="movie-card-skeleton-poster" />
                      <div className="movie-card-skeleton-line movie-card-skeleton-line-title" />
                      <div className="movie-card-skeleton-line movie-card-skeleton-line-meta" />
                      <div className="movie-card-skeleton-line movie-card-skeleton-line-button" />
                    </div>
                    <div className="movie-card-skeleton movie-card-skeleton-compact" aria-hidden="true">
                      <div className="movie-card-skeleton-poster" />
                      <div className="movie-card-skeleton-line movie-card-skeleton-line-title" />
                      <div className="movie-card-skeleton-line movie-card-skeleton-line-meta" />
                      <div className="movie-card-skeleton-line movie-card-skeleton-line-button" />
                    </div>
                    <div className="movie-card-skeleton movie-card-skeleton-compact" aria-hidden="true">
                      <div className="movie-card-skeleton-poster" />
                      <div className="movie-card-skeleton-line movie-card-skeleton-line-title" />
                      <div className="movie-card-skeleton-line movie-card-skeleton-line-meta" />
                      <div className="movie-card-skeleton-line movie-card-skeleton-line-button" />
                    </div>
                  </div>
                ) : similarMovies.length > 0 ? (
                  <div className="movie-modal-similar-row">
                    {similarMovies.map((similarMovie) => (
                      <MovieCard
                        key={`similar-${similarMovie.id}`}
                        movie={similarMovie}
                        onWatchTrailer={onWatchTrailer}
                        onToggleFavorite={onToggleFavorite}
                        isFavorite={favoriteMovieIds.includes(similarMovie.id)}
                        compact
                      />
                    ))}
                  </div>
                ) : (
                  <p className="movie-modal-empty-state">No similar titles are available right now.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MovieModal
