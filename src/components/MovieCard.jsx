import React from 'react'
import { getMediaLabel } from '../utils/media.js'

const MovieCard = ({ movie, onWatchTrailer, onToggleFavorite, isFavorite = false, compact = false }) => {
  const { title, vote_average, poster_path, release_date, original_language, runtime, media_type } = movie
  const formattedRuntime = runtime ? `${runtime} min` : 'N/A'
  const mediaLabel = getMediaLabel(media_type)

  const handleFavoriteClick = (event) => {
    event.stopPropagation()
    onToggleFavorite?.(movie)
  }

  const handleCardKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onWatchTrailer(movie)
    }
  }

  return (
      <article
        className={`movie-card ${compact ? 'movie-card-compact' : ''}`}
        onClick={() => onWatchTrailer(movie)}
        onKeyDown={handleCardKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`Open ${title}`}
      >
        <button
          type="button"
          className={`movie-card-favorite ${isFavorite ? 'is-active' : ''}`}
          onClick={handleFavoriteClick}
          aria-label={isFavorite ? `Remove ${title} from favorites` : `Save ${title} to favorites`}
        >
          {isFavorite ? '♥' : '♡'}
       </button>

       <img src={poster_path ?
        `https://image.tmdb.org/t/p/w500${poster_path}` : '/no-movie.png'}
        alt={title}
        />
       <div className={compact ? 'movie-card-body movie-card-body-compact' : 'movie-card-body'}>
         <h3>{title}</h3>
         <p className="media-pill">{mediaLabel}</p>
         <div className="content">
             <div className="rating">
                 <img src="/star.svg" alt="Star Icon" />

                <p>{vote_average ? vote_average.toFixed(1) : 'N/A'}</p>
         </div>
         <span> • </span>
          <p className="year">{release_date ? release_date.split('-')[0] : 'N/A'}</p>
            <span> • </span>
            <p className="lang">{original_language ? original_language.toUpperCase() : 'N/A'}</p>
            <span> • </span>
             <p className="runtime">{formattedRuntime}</p>
          </div>
        </div>
      </article>
    )
}

export default MovieCard
