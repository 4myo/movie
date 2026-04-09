import React from 'react'

const MovieCard = ({ movie, onWatchTrailer, onToggleFavorite, isFavorite = false, compact = false }) => {
  const { title, vote_average, poster_path, release_date, original_language, runtime } = movie
  const formattedRuntime = runtime ? `${runtime} min` : 'N/A'

  return (
      <article className={`movie-card ${compact ? 'movie-card-compact' : ''}`}>
       <button
         type="button"
         className={`movie-card-favorite ${isFavorite ? 'is-active' : ''}`}
         onClick={() => onToggleFavorite?.(movie)}
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
        <div className="content">
            <div className="rating">
                <img src ="./star.svg" alt="Star Icon"/>

                <p>{vote_average ? vote_average.toFixed(1) : 'N/A'}</p>
         </div>
         <span> • </span>
          <p className="year">{release_date ? release_date.split('-')[0] : 'N/A'}</p>
            <span> • </span>
            <p className="lang">{original_language ? original_language.toUpperCase() : 'N/A'}</p>
            <span> • </span>
            <p className="runtime">{formattedRuntime}</p>
         </div>
        <button
          onClick={() => onWatchTrailer(movie)}
          className={`inline-flex items-center justify-center rounded-xl border border-white/10 bg-linear-to-r from-[#1c1330] to-[#0f0b1f] font-semibold text-white shadow-lg shadow-black/25 transition hover:border-[#8f6bff]/40 hover:from-[#271947] hover:to-[#151028] ${compact ? 'movie-card-button-compact' : 'mt-2.5 min-h-9 px-3 py-1.5 text-[12px] sm:mt-3 sm:min-h-10 sm:px-3.5 sm:py-2 sm:text-sm lg:mt-4 lg:min-h-11 lg:px-4'}`}
        >
          Watch Trailer
        </button>
       </div>
      </article>
    )
}

export default MovieCard
