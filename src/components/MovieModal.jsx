import React, { useEffect } from 'react'
import {
  BookmarkIcon,
  FilmIcon,
  PlayIcon,
  UsersIcon
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
  favoriteMovieIds = [],
  onToggleWatchlist,
  isInWatchlist = false,
  onShare
}) => {
  const mediaLabel = getMediaLabel(movie?.media_type)
  const mediaPluralLabel = getMediaPluralLabel(movie?.media_type)
  const isFavorite = favoriteMovieIds.includes(getMediaItemKey(movie))

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow
    const previousBodyScrollbarGutter = document.body.style.scrollbarGutter
    document.body.style.overflow = 'hidden'
    document.body.style.scrollbarGutter = 'stable'
    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.body.style.scrollbarGutter = previousBodyScrollbarGutter
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!movie) return null

  const releaseYear = movie.release_date ? new Date(movie.release_date).getFullYear() : null
  const backdropImage = imageUrl(movie.backdrop_path, 'w1280')
  const canPlay = Boolean(movie?.id)
  const isTvShow = movie.media_type === 'tv'

  const handlePlayTitle = () => { if (canPlay) onPlayTitle?.(movie) }
  const handleOpenTrailer = () => { if (trailerUrl) window.open(trailerUrl, '_blank', 'noopener,noreferrer') }

  return (
    <div className="cm-backdrop" onClick={onClose}>
      <article className="cm-sheet" onClick={(e) => e.stopPropagation()}>

        {/* ── Hero image ── */}
        <div className="cm-hero">
          <img
            className="cm-hero-image"
            src={backdropImage}
            alt=""
            width="1280"
            height="720"
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
          <div className="cm-hero-fade" />
          <button type="button" className="cm-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="18" height="18" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div
          className="cm-body"
          style={{ '--backdrop-url': `url(${backdropImage})` }}
        >
          <h2 className="cm-title">{movie.title}</h2>

          <div className="cm-meta">
            {releaseYear && <span className="cm-badge">{releaseYear}</span>}
            <span className="cm-badge">HD</span>
            {isTvShow && <span className="cm-badge">S{selectedSeasonNumber || 1}:E{selectedEpisodeNumber || 1}</span>}
            {movie.vote_average ? <span className="cm-badge">★ {movie.vote_average.toFixed(1)}</span> : null}
          </div>

          <div className="cm-actions">
            <button type="button" className="cm-play-btn" onClick={handlePlayTitle} disabled={!canPlay}>
              <PlayIcon className="cm-play-icon" />
              Play
            </button>

            <button
              type="button"
              className={`cm-icon-btn${isFavorite ? ' is-active' : ''}`}
              onClick={() => onToggleFavorite?.(movie)}
              aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              title={isFavorite ? 'Saved to favorites' : 'Add to favorites'}
            >
              <svg viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20" aria-hidden="true"><path d="M20.8 6.1a5.1 5.1 0 0 0-7.2 0L12 7.7l-1.6-1.6a5.1 5.1 0 0 0-7.2 7.2L12 22l8.8-8.7a5.1 5.1 0 0 0 0-7.2z"/></svg>
            </button>

            {onToggleWatchlist && (
              <button
                type="button"
                className={`cm-icon-btn${isInWatchlist ? ' is-active' : ''}`}
                onClick={() => onToggleWatchlist?.(movie)}
                aria-label={isInWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
                title={isInWatchlist ? 'In watchlist' : 'Add to watchlist'}
              >
                <BookmarkIcon className="cm-icon-btn-svg" />
              </button>
            )}

            <button
              type="button"
              className="cm-icon-btn"
              onClick={handleOpenTrailer}
              disabled={!trailerUrl}
              aria-label="Open trailer"
              title="Open trailer"
            >
              <FilmIcon className="cm-icon-btn-svg" />
            </button>

            {onShare && (
              <button
                type="button"
                className="cm-icon-btn"
                onClick={() => onShare(movie)}
                aria-label="Share with friend"
                title="Share with friend"
              >
                <UsersIcon className="cm-icon-btn-svg" />
              </button>
            )}
          </div>

          {movie.overview && (
            <p className="cm-overview">{movie.overview}</p>
          )}

          {isTvShow && seasonOptions.length > 0 && (
            <div className="cm-episode-row">
              <label>
                <span>Season</span>
                <select value={selectedSeasonNumber ?? ''} onChange={(e) => onSeasonChange?.(Number(e.target.value))}>
                  {seasonOptions.map((s) => (
                    <option key={s.season_number} value={s.season_number}>
                      {s.name || `Season ${s.season_number}`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Episode</span>
                <select value={selectedEpisodeNumber ?? ''} onChange={(e) => onEpisodeChange?.(Number(e.target.value))}>
                  {episodeOptions.map((ep) => (
                    <option key={ep.episode_number} value={ep.episode_number}>
                      Episode {ep.episode_number}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {(isSimilarLoading || similarMovies.length > 0) && (
            <section className="cm-similar" aria-labelledby="cm-similar-heading">
              <div className="cm-similar-header">
                <h3 id="cm-similar-heading">More like this</h3>
                <span>{mediaPluralLabel}</span>
              </div>
              {isSimilarLoading ? (
                <p className="cm-similar-empty">Loading…</p>
              ) : (
                <div className="cm-similar-row">
                  {similarMovies.slice(0, 8).map((m) => (
                    <button
                      key={`similar-${m.media_type || 'movie'}-${m.id}`}
                      type="button"
                      className="cm-similar-card"
                      onClick={() => onWatchTrailer?.(m)}
                    >
                      <img
                        src={imageUrl(m.backdrop_path || m.poster_path, m.backdrop_path ? 'w500' : 'w342')}
                        alt=""
                        width="500"
                        height="281"
                        loading="lazy"
                        decoding="async"
                      />
                      <span>{m.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </article>
    </div>
  )
}

export default MovieModal
