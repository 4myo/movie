import React, { useEffect, useState } from 'react';

const MovieModal = ({ movie, trailerUrl, streamingUrl, onClose }) => {
  const [viewMode, setViewMode] = useState('trailer'); // 'trailer' or 'stream'

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  if (!movie) return null;

  return (
    <div className="movie-modal-backdrop" onClick={onClose}>
      <div className="movie-modal-panel custom-scrollbar" onClick={(event) => event.stopPropagation()}>
        <div className="movie-modal-inner">
          <div className="movie-modal-header">
            <h2 className="movie-modal-title">{movie.title}</h2>
            <button
              onClick={onClose}
              className="movie-modal-close"
            >
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
                  ></iframe>
                  </div>
                )}

                {viewMode === 'stream' && streamingUrl && (
                  <div className="movie-modal-player-frame">
                  <iframe
                    src={streamingUrl}
                    title={`${movie.title} Stream`}
                    className="movie-modal-iframe"
                    allowFullScreen
                  ></iframe>
                  </div>
                )}

                {viewMode === 'trailer' && !trailerUrl && (
                  <p className="movie-modal-empty-state">Trailer is not available for this title.</p>
                )}

                {viewMode === 'stream' && !streamingUrl && (
                  <p className="movie-modal-empty-state">Stream is not available for this title.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MovieModal;
