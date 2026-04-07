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
       <div className="mt-4">    
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
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-linear-to-r from-[#1c1330] to-[#0f0b1f] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-black/25 transition hover:border-[#8f6bff]/40 hover:from-[#271947] hover:to-[#151028]"
        >
          Watch Trailer
        </button>
       </div>
      </div>
    )
}

export default MovieCard
