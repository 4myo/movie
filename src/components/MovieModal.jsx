import React, { useEffect, useState } from 'react'
import MovieCard from './MovieCard.jsx'

const MovieModal = ({
  movie,
  trailerUrl,
  streamingUrl,
  onClose,
  similarMovies = [],
  isSimilarLoading = false,
  onWatchTrailer,
  onToggleFavorite,
  favoriteMovieIds = []
}) => {
  const [viewMode, setViewMode] = useState('trailer')

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
  }, [movie?.id])

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
              <img
                src={movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : '/no-movie.png'}
                alt={movie.title}
                className="movie-modal-poster"
              />

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
                  Stream Movie
                </button>
              </div>
            </div>

            <div className="movie-modal-info-column">
              <div className="movie-modal-metadata-grid">
                <p className="movie-modal-meta-item">
                  <strong>Release Date</strong>
                  <span>{movie.release_date ? new Date(movie.release_date).toLocaleDateString() : 'N/A'}</span>
                </p>
                <p className="movie-modal-meta-item">
                  <strong>Rating</strong>
                  <span>{movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A'} / 10</span>
                </p>
                <p className="movie-modal-meta-item">
                  <strong>Language</strong>
                  <span>{movie.original_language ? movie.original_language.toUpperCase() : 'N/A'}</span>
                </p>
                <p className="movie-modal-meta-item">
                  <strong>Runtime</strong>
                  <span>{movie.runtime ? `${movie.runtime} min` : 'N/A'}</span>
                </p>
              </div>

              {movie.overview && (
                <p className="movie-modal-overview">{movie.overview}</p>
              )}

              <div className="movie-modal-player-block">
                <h3 className="movie-modal-player-heading">
                  {viewMode === 'trailer' ? 'Trailer' : 'Stream Full Movie'}
                </h3>

                {viewMode === 'trailer' && trailerUrl && (
                  <div className="movie-modal-player-frame">
                    <iframe
                      src={trailerUrl}
                      title={`${movie.title} Trailer`}
                      className="movie-modal-iframe"
                      allowFullScreen
                    />
                  </div>
                )}

                {viewMode === 'stream' && streamingUrl && (
                  <div className="movie-modal-player-frame">
                    <iframe
                      src={streamingUrl}
                      title={`${movie.title} Stream`}
                      className="movie-modal-iframe"
                      allowFullScreen
                    />
                  </div>
                )}

                {viewMode === 'trailer' && !trailerUrl && (
                  <p className="movie-modal-empty-state">Trailer is not available for this title.</p>
                )}

                {viewMode === 'stream' && !streamingUrl && (
                  <p className="movie-modal-empty-state">Stream is not available for this title.</p>
                )}
              </div>

              <div className="movie-modal-similar-block">
                <div className="movie-modal-similar-header">
                  <h3 className="movie-modal-player-heading">Similar Movies</h3>
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
