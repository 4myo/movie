import React, { useEffect } from 'react'
import {
  FilmIcon,
  HeartFilledIcon,
  HeartIcon,
  MonitorPlayIcon,
  PlayIcon
} from './Icons.jsx'
import {
  getMediaLabel,
  getMediaPluralLabel
} from '../utils/media.js'

const getMediaItemKey = (item) => `${item?.media_type || 'movie'}-${item?.id ?? ''}`

const imageUrl = (path, size = 'w1280') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : '/hero-bg.png'

const MovieModal = ({
  movie,
  trailerUrl,
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
  onPlayTitle,
  onToggleFavorite,
  favoriteMovieIds = []
}) => {
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
  const handlePlayTitle = () => {
    if (canPlay) {
      onPlayTitle?.(movie)
    }
  }
  const handleOpenTrailer = () => {
    if (trailerUrl) {
      window.open(trailerUrl, '_blank', 'noopener,noreferrer')
    }
  }

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
            <button type="button" className="cinematic-play-button" onClick={handlePlayTitle} disabled={!canPlay}>
              <PlayIcon className="cinematic-play-icon" />
              <span>Play</span>
            </button>

            <button
              type="button"
              className="cinematic-action-button"
              onClick={() => onToggleFavorite?.(movie)}
              aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <span className="cinematic-round-button" aria-hidden="true">
                {isFavorite ? (
                  <HeartFilledIcon className="cinematic-action-icon" />
                ) : (
                  <HeartIcon className="cinematic-action-icon" />
                )}
              </span>
              <span className="cinematic-action-label">{isFavorite ? 'Saved' : 'Favorite'}</span>
            </button>

            <button
              type="button"
              className="cinematic-action-button"
              onClick={handleOpenTrailer}
              disabled={!trailerUrl}
              aria-label="Open trailer"
              title="Open trailer"
            >
              <span className="cinematic-round-button" aria-hidden="true">
                <FilmIcon className="cinematic-action-icon" />
              </span>
              <span className="cinematic-action-label">Trailer</span>
            </button>

            <button
              type="button"
              className="cinematic-action-button"
              onClick={handlePlayTitle}
              disabled={!canPlay}
              aria-label="Open player"
              title="Open player"
            >
              <span className="cinematic-round-button is-glow" aria-hidden="true">
                <MonitorPlayIcon className="cinematic-action-icon" />
              </span>
              <span className="cinematic-action-label">Player</span>
            </button>
          </div>

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
                      decoding="async"
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
