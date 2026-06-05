import React, { useEffect, useState } from 'react'
import { getMediaLabel, getMediaPluralLabel, getStreamingProviders } from '../utils/media.js'

const getMediaItemKey = (item) => `${item?.media_type || 'movie'}-${item?.id ?? ''}`

const imageUrl = (path, size = 'w1280') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : '/hero-bg.png'

const MovieModal = ({
  movie,
  trailerUrl,
  streamingUrl,
  seasonOptions = [],
  selectedSeasonNumber,
  selectedEpisodeNumber,
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
  const providers = getStreamingProviders()
  const [selectedProvider, setSelectedProvider] = useState(providers[0]?.id || '')
  const [isPlayerOpen, setIsPlayerOpen] = useState(false)
  const mediaLabel = getMediaLabel(movie?.media_type)
  const mediaPluralLabel = getMediaPluralLabel(movie?.media_type)
  const isFavorite = favoriteMovieIds.includes(getMediaItemKey(movie))

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
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  if (!movie) return null

  const releaseYear = movie.release_date ? new Date(movie.release_date).getFullYear() : 'N/A'
  const heroImage = imageUrl(movie.backdrop_path || movie.poster_path, movie.backdrop_path ? 'original' : 'w780')
  const canPlay = Boolean(movie?.id)
  const isTvShow = movie.media_type === 'tv'
  const selectedProviderDetails = providers.find((provider) => provider.id === selectedProvider) || providers[0]
  const playerUrl = !movie?.id || !selectedProviderDetails
    ? ''
    : isTvShow
      ? selectedSeasonNumber && selectedEpisodeNumber
        ? selectedProviderDetails.tvEpisodeUrl(movie.id, selectedSeasonNumber, selectedEpisodeNumber)
        : ''
      : selectedProviderDetails.movieUrl(movie.id)

  return (
    <div className="movie-modal-backdrop cinematic-modal-backdrop" onClick={onClose}>
      <article className="cinematic-title-sheet" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="cinematic-close-button" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="cinematic-title-hero" style={{ backgroundImage: `url(${heroImage})` }}>
          <div className="cinematic-title-hero-fade" />
          <h2 className="cinematic-title-logo">{movie.title}</h2>
        </div>

        <div className="cinematic-title-body">
          <div className="cinematic-title-facts">
            <span>{releaseYear}</span>
            <span>HD</span>
            <span>{isTvShow ? `S${selectedSeasonNumber || 1}:E${selectedEpisodeNumber || 1}` : mediaLabel}</span>
            {movie.vote_average ? <span>{movie.vote_average.toFixed(1)} rating</span> : null}
          </div>

          <div className="cinematic-title-actions">
            <button type="button" className="cinematic-play-button" onClick={() => setIsPlayerOpen(true)} disabled={!canPlay}>
              ▶ Play
            </button>
            <button type="button" className="cinematic-round-button" onClick={() => onToggleFavorite?.(movie)} aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}>
              {isFavorite ? '✓' : '+'}
            </button>
            <button type="button" className="cinematic-round-button" onClick={() => trailerUrl && window.open(trailerUrl, '_blank', 'noopener,noreferrer')} disabled={!trailerUrl} aria-label="Open trailer">
              ⛶
            </button>
            <button type="button" className="cinematic-round-button is-glow" onClick={() => setIsPlayerOpen(true)} disabled={!streamingUrl && !canPlay} aria-label="Open player servers">
              ▣
            </button>
          </div>

          {isPlayerOpen && (
            <section className="cinematic-player-section" aria-label={`${movie.title} player`}>
              <div className="cinematic-player-toolbar">
                <div>
                  <span>Now playing</span>
                  <strong>{movie.title}</strong>
                </div>
                <button type="button" onClick={() => setIsPlayerOpen(false)}>Close player</button>
              </div>

              <div className="cinematic-player-frame">
                {playerUrl ? (
                  <iframe
                    key={playerUrl}
                    src={playerUrl}
                    title={`${movie.title} player`}
                    loading="eager"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allow="autoplay *; encrypted-media *; picture-in-picture *; web-share *"
                    allowFullScreen
                  />
                ) : (
                  <div className="cinematic-player-empty">Select a season and episode to begin playback.</div>
                )}
              </div>

              <div className="cinematic-server-grid" aria-label="Streaming servers">
                {providers.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    className={selectedProvider === provider.id ? 'is-active' : ''}
                    onClick={() => setSelectedProvider(provider.id)}
                    aria-pressed={selectedProvider === provider.id}
                  >
                    {provider.name}
                  </button>
                ))}
              </div>
            </section>
          )}

          {isTvShow && seasonOptions.length > 0 && (
            <div className="cinematic-episode-controls">
              <label>
                <span>Season</span>
                <select value={selectedSeasonNumber ?? ''} onChange={(event) => onSeasonChange?.(Number(event.target.value))}>
                  {seasonOptions.map((season) => (
                    <option key={season.season_number} value={season.season_number}>
                      {season.name || `Season ${season.season_number}`}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Episode</span>
                <select value={selectedEpisodeNumber ?? ''} onChange={(event) => onEpisodeChange?.(Number(event.target.value))}>
                  {episodeOptions.map((episode) => (
                    <option key={episode.episode_number} value={episode.episode_number}>
                      Episode {episode.episode_number}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {movie.overview && <p className="cinematic-title-overview">{movie.overview}</p>}

          <section className="cinematic-similar-section" aria-labelledby="cinematic-similar-title">
            <div className="cinematic-similar-header">
              <h3 id="cinematic-similar-title">More like this</h3>
              <span>{mediaPluralLabel}</span>
            </div>

            {isSimilarLoading ? (
              <p className="cinematic-similar-empty">Loading suggestions...</p>
            ) : similarMovies.length > 0 ? (
              <div className="cinematic-similar-row">
                {similarMovies.slice(0, 8).map((similarMovie) => (
                  <button
                    key={`similar-${similarMovie.media_type || 'movie'}-${similarMovie.id}`}
                    type="button"
                    className="cinematic-similar-card"
                    onClick={() => onWatchTrailer?.(similarMovie)}
                  >
                    <img
                      src={imageUrl(similarMovie.backdrop_path || similarMovie.poster_path, similarMovie.backdrop_path ? 'w780' : 'w500')}
                      alt=""
                      loading="lazy"
                    />
                    <span>{similarMovie.title}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="cinematic-similar-empty">No similar titles are available right now.</p>
            )}
          </section>
        </div>
      </article>
    </div>
  )
}

export default MovieModal
