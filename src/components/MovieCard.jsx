import React from 'react'

const MovieCard = ({ movie, onWatchTrailer }) => {
  const { title, vote_average, poster_path, release_date, original_language, runtime } = movie;
  const formattedRuntime = runtime ? `${runtime} min` : 'N/A';

  return (
      <div className="movie-card">
      <img src={poster_path ?
       `https://image.tmdb.org/t/p/w500${poster_path}` : '/no-movie.png'} 
       alt={title}
       />
       <div className="mt-2.5 sm:mt-3 lg:mt-4">    
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
          className="mt-2.5 inline-flex min-h-9 items-center justify-center rounded-xl border border-white/10 bg-linear-to-r from-[#1c1330] to-[#0f0b1f] px-3 py-1.5 text-[12px] font-semibold text-white shadow-lg shadow-black/25 transition hover:border-[#8f6bff]/40 hover:from-[#271947] hover:to-[#151028] sm:mt-3 sm:min-h-10 sm:px-3.5 sm:py-2 sm:text-sm lg:mt-4 lg:min-h-11 lg:px-4"
        >
          Watch Trailer
        </button>
       </div>
      </div>
    )
}

export default MovieCard
