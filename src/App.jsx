
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useDebounce } from 'use-debounce';
import Search from './components/Search.jsx'
import Spinner from './components/Spinner.jsx';
import MovieCard from './components/MovieCard.jsx';
import MovieModal from './components/MovieModal.jsx';
import { supabase } from './supabaseClient.js';

  const API_BASE_URL = 'https://api.themoviedb.org/3';
  const API_KEY = import.meta.env.VITE_TMDB_API_KEY;

  const API_OPTIONS = {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${API_KEY}`
    }
  }

  const saveMovieState = async (movie, trailerUrl, streamingUrl) => {
    const { error } = await supabase
      .from('user_state')
      .upsert({ user_id: 'default', movie_data: { movie, trailerUrl, streamingUrl } })
    if (error) console.log('Error saving state:', error)
  }

  const loadMovieState = async () => {
    const { data, error } = await supabase
      .from('user_state')
      .select('movie_data')
      .eq('user_id', 'default')
      .single()
    if (error && error.code !== 'PGRST116') console.log('Error loading state:', error)
    return data?.movie_data
  }

  const clearMovieState = async () => {
    const { error } = await supabase
      .from('user_state')
      .delete()
      .eq('user_id', 'default')
    if (error) console.log('Error clearing state:', error)
  }

const App = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [movieList, setMovieList] = useState([]);
  const [trendingMovies, setTrendingMovies] = useState([]);
  const [topRatedMovies, setTopRatedMovies] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTrendingLoading, setIsTrendingLoading] = useState(false);
  const [isTopRatedLoading, setIsTopRatedLoading] = useState(false);
  const [debouncedSearchTerm] = useDebounce(searchTerm, 500);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [trailerUrl, setTrailerUrl] = useState('');
  const [streamingUrl, setStreamingUrl] = useState('');
  const [genreList, setGenreList] = useState([]);
  const [selectedGenreIds, setSelectedGenreIds] = useState([]);
  const [isGenrePanelOpen, setIsGenrePanelOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [movieRuntimeMap, setMovieRuntimeMap] = useState({});
  const moviesSectionRef = useRef(null);
  const trendingRowRef = useRef(null);
  const topRatedRowRef = useRef(null);

  const selectedGenreName = useMemo(() => {
    if (selectedGenreIds.length !== 1) return 'All genres';

    return genreList.find((genre) => genre.id === selectedGenreIds[0])?.name || 'All genres';
  }, [genreList, selectedGenreIds]);

  const fetchGenres = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/genre/movie/list`, API_OPTIONS);

      if (!response.ok) {
        throw new Error('Failed to fetch genres');
      }

      const data = await response.json();
      setGenreList(data.genres || []);
    } catch (error) {
      console.log(`Error fetching genres: ${error}`);
    }
  }

  const fetchMovies = async (query = '', genreIds = [], page = 1) => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const params = new URLSearchParams();

      let endpoint = `${API_BASE_URL}/discover/movie`;

      if (query) {
        endpoint = `${API_BASE_URL}/search/movie`;
        params.set('query', query);
      } else {
        params.set('sort_by', 'popularity.desc');
      }

      if (genreIds.length > 0) {
        params.set('with_genres', genreIds.join(','));
      }

      params.set('page', page.toString());

      const endpointWithParams = `${endpoint}?${params.toString()}`;
      console.log('Fetching from endpoint:', endpoint);
      const response = await fetch(endpointWithParams, API_OPTIONS);

      if (!response.ok) {
        throw new Error('Failed to fetch movies');
      }

      const data = await response.json();
      console.log('API response:', data);

      setMovieList(enrichMoviesWithRuntime(data.results || []));
      setTotalPages(Math.min(data.total_pages || 1, 500));
    } catch (error){
      console.log(`Error fetching movies : ${error}`);
      setErrorMessage('Error fetching movies. Please try again later');
      setMovieList([]);
    } finally {
      setIsLoading(false);
    }
  }

  const fetchTrendingMovies = async () => {
    setIsTrendingLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/trending/movie/week`, API_OPTIONS);

      if (!response.ok) {
        throw new Error('Failed to fetch trending movies');
      }

      const data = await response.json();
      setTrendingMovies(enrichMoviesWithRuntime((data.results || []).slice(0, 8)));
    } catch (error) {
      console.log(`Error fetching trending movies: ${error}`);
      setTrendingMovies([]);
    } finally {
      setIsTrendingLoading(false);
    }
  }

  const fetchTopRatedMovies = async (genreIds = []) => {
    setIsTopRatedLoading(true);

    try {
      const params = new URLSearchParams({
        sort_by: 'vote_average.desc',
        'vote_count.gte': '200',
        include_adult: 'false',
        page: '1'
      });

      if (genreIds.length > 0) {
        params.set('with_genres', genreIds.join(','));
      }

      const response = await fetch(`${API_BASE_URL}/discover/movie?${params.toString()}`, API_OPTIONS);

      if (!response.ok) {
        throw new Error('Failed to fetch top rated movies');
      }

      const data = await response.json();
      setTopRatedMovies(enrichMoviesWithRuntime((data.results || []).slice(0, 8)));
    } catch (error) {
      console.log(`Error fetching top rated movies: ${error}`);
      setTopRatedMovies([]);
    } finally {
      setIsTopRatedLoading(false);
    }
  }

  const fetchMovieVideos = async (movieId) => {
    try {
      const endpoint = `${API_BASE_URL}/movie/${movieId}/videos`;
      const response = await fetch(endpoint, API_OPTIONS);

      if (!response.ok) {
        throw new Error('Failed to fetch movie videos');
      }

      const data = await response.json();
      const trailer = data.results.find(video => video.type === 'Trailer' && video.site === 'YouTube');
      if (trailer) {
        setTrailerUrl(`https://www.youtube.com/embed/${trailer.key}`);
      } else {
        setTrailerUrl('');
      }
    } catch (error) {
      console.log(`Error fetching movie videos: ${error}`);
      setTrailerUrl('');
    }
  }

  const handleWatchTrailer = async (movie) => {
    setSelectedMovie(movie);
    setShowModal(true);
    setStreamingUrl(`https://www.2embed.cc/embed/${movie.id}`);
    await fetchMovieVideos(movie.id);
    await saveMovieState(movie, trailerUrl, streamingUrl);
  }

  const closeModal = async () => {
    setShowModal(false);
    setSelectedMovie(null);
    setTrailerUrl('');
    setStreamingUrl('');
    await clearMovieState();
  }

  const toggleGenre = (genreId) => {
    setSelectedGenreIds((currentGenres) =>
      currentGenres.includes(genreId)
        ? currentGenres.filter((id) => id !== genreId)
        : [...currentGenres, genreId]
    );
  }

  const clearGenres = () => {
    setSelectedGenreIds([]);
  }

  const resetToHome = () => {
    setSearchTerm('');
    setSelectedGenreIds([]);
    setIsGenrePanelOpen(false);
    setCurrentPage(1);

    requestAnimationFrame(() => {
      document.querySelector('main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  const goToPage = (page, position = 'top') => {
    setCurrentPage(page);

    if (position === 'bottom') {
      requestAnimationFrame(() => {
        moviesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
    }
  }

  const scrollTrendingRow = (direction) => {
    const row = trendingRowRef.current;

    if (!row) {
      return;
    }

    const scrollAmount = Math.max(row.clientWidth * 0.8, 220);

    row.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  }

  const scrollTopRatedRow = (direction) => {
    const row = topRatedRowRef.current;

    if (!row) {
      return;
    }

    const scrollAmount = Math.max(row.clientWidth * 0.8, 220);

    row.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  }

  const fetchMovieRuntimes = async (movies) => {
    const missingMovieIds = movies
      .map((movie) => movie.id)
      .filter((id) => movieRuntimeMap[id] === undefined);

    if (missingMovieIds.length === 0) {
      return;
    }

    try {
      const runtimeMap = {};

      const runtimeEntries = await Promise.all(
        missingMovieIds.map(async (movieId) => {
          const response = await fetch(`${API_BASE_URL}/movie/${movieId}`, API_OPTIONS);

          if (!response.ok) {
            return [movieId, null];
          }

          const data = await response.json();
          return [movieId, data.runtime || null];
        })
      );

      runtimeEntries.forEach(([movieId, runtime]) => {
        runtimeMap[movieId] = runtime;
      });

      setMovieRuntimeMap((currentMap) => ({
        ...currentMap,
        ...runtimeMap
      }));

      setMovieList((currentMovies) =>
        currentMovies.map((movie) => ({
          ...movie,
          runtime: runtimeMap[movie.id] ?? movie.runtime ?? null
        }))
      );
    } catch (error) {
      console.log(`Error fetching movie runtimes: ${error}`);
    }
  }

  const enrichMoviesWithRuntime = (movies) =>
    movies.map((movie) => ({
      ...movie,
      runtime: movieRuntimeMap[movie.id] ?? null
    }))

  useEffect(() => {
    fetchGenres();
    fetchTrendingMovies();
  }, [])

  useEffect(() => {
    fetchTopRatedMovies(selectedGenreIds);
    topRatedRowRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
  }, [selectedGenreIds])

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, selectedGenreIds])

  useEffect(() => {
    fetchMovies(debouncedSearchTerm, selectedGenreIds, currentPage);
  }, [debouncedSearchTerm, selectedGenreIds, currentPage])

  useEffect(() => {
    if (movieList.length > 0) {
      fetchMovieRuntimes(movieList);
    }
  }, [movieList])

  useEffect(() => {
    const loadState = async () => {
      const state = await loadMovieState()
      if (state) {
        setSelectedMovie(state.movie)
        setTrailerUrl(state.trailerUrl)
        setStreamingUrl(state.streamingUrl)
        setShowModal(true)
      }
    }
    loadState()
  }, [])

  const PaginationControls = ({ position }) => (
    <div className={`pagination-bar ${position === 'bottom' ? 'is-bottom' : 'is-top'}`}>
      <button
        type="button"
        className="pagination-button"
        onClick={() => goToPage(currentPage - 1, position)}
        disabled={currentPage === 1 || isLoading}
      >
        Back
      </button>

      <p className="pagination-counter">
        Page <span>{currentPage}</span> of <span>{totalPages}</span>
      </p>

      <button
        type="button"
        className="pagination-button pagination-home-button"
        onClick={resetToHome}
        disabled={isLoading || (currentPage === 1 && selectedGenreIds.length === 0 && searchTerm.trim() === '')}
      >
        Home
      </button>

      <button
        type="button"
        className="pagination-button"
        onClick={() => goToPage(currentPage + 1, position)}
        disabled={currentPage === totalPages || isLoading}
      >
        Next
      </button>
    </div>
  )

  return (
    <main>
    <div className="cosmic-background" aria-hidden="true">
      <div className="cosmic-glow cosmic-glow-left" />
      <div className="cosmic-glow cosmic-glow-right" />
      <div className="starfield starfield-primary" />
      <div className="starfield starfield-secondary" />
    </div>
    <div className="wrapper">
      <header>
         <h1>Find <span className='text-gradient'>movies</span> you want to watch</h1>

        <section className="trending-showcase" aria-labelledby="trending-movies-heading">
          <div className="trending-showcase-header">
            <div>
              <p className="trending-showcase-label">Live from TMDB</p>
              <h2 id="trending-movies-heading" className="trending-showcase-title">Trending Movies 🔥</h2>
            </div>
            <div className="trending-showcase-meta">
              <p className="trending-showcase-copy">A quick look at what people are watching right now.</p>
              <div className="trending-showcase-controls" aria-label="Scroll trending movies">
                <button
                  type="button"
                  className="trending-scroll-button"
                  onClick={() => scrollTrendingRow('left')}
                >
                  ←
                </button>
                <button
                  type="button"
                  className="trending-scroll-button"
                  onClick={() => scrollTrendingRow('right')}
                >
                  →
                </button>
              </div>
            </div>
          </div>

          {isTrendingLoading ? (
            <div className="trending-showcase-loading">
              <Spinner />
            </div>
          ) : trendingMovies.length > 0 ? (
            <div className="trending-showcase-row" ref={trendingRowRef}>
              {trendingMovies.map((movie) => (
                <MovieCard key={`trending-${movie.id}`} movie={movie} onWatchTrailer={handleWatchTrailer} compact />
              ))}
            </div>
          ) : (
            <p className="trending-showcase-empty">Trending titles are unavailable right now.</p>
          )}
        </section>

        <section className="trending-showcase top-rated-showcase" aria-labelledby="top-rated-movies-heading">
          <div className="trending-showcase-header">
            <div>
              <p className="trending-showcase-label">Curated from TMDB</p>
              <h2 id="top-rated-movies-heading" className="trending-showcase-title">Top Rated Movies</h2>
            </div>
            <div className="trending-showcase-meta">
              <p className="trending-showcase-copy">
                {selectedGenreIds.length > 0
                  ? 'Highest rated picks for the genres you selected.'
                  : 'Highest rated movies people keep coming back to.'}
              </p>
              <div className="trending-showcase-controls" aria-label="Scroll top rated movies">
                <button
                  type="button"
                  className="trending-scroll-button"
                  onClick={() => scrollTopRatedRow('left')}
                >
                  ←
                </button>
                <button
                  type="button"
                  className="trending-scroll-button"
                  onClick={() => scrollTopRatedRow('right')}
                >
                  →
                </button>
              </div>
            </div>
          </div>

          {topRatedMovies.length > 0 ? (
            <div className="showcase-row-shell">
              <div className={`trending-showcase-row ${isTopRatedLoading ? 'is-updating' : ''}`} ref={topRatedRowRef}>
                {topRatedMovies.map((movie) => (
                  <MovieCard key={`top-rated-${movie.id}`} movie={movie} onWatchTrailer={handleWatchTrailer} compact />
                ))}
              </div>

              {isTopRatedLoading && (
                <div className="showcase-row-overlay" aria-hidden="true">
                  <Spinner />
                </div>
              )}
            </div>
          ) : isTopRatedLoading ? (
            <div className="trending-showcase-loading">
              <Spinner />
            </div>
          ) : (
            <p className="trending-showcase-empty">No top rated titles match the current genre filter.</p>
          )}
        </section>

        <Search searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
 
        <div className="genre-filter-shell">
          <div className="genre-filter-header">
            <div>
              <p className="genre-filter-label">Browse by genre</p>
              <p className="genre-filter-value">{selectedGenreName}</p>
            </div>

            <button
              type="button"
              className="genre-filter-toggle"
              onClick={() => setIsGenrePanelOpen((open) => !open)}
              aria-expanded={isGenrePanelOpen}
              aria-controls="genre-filter-panel"
            >
              {isGenrePanelOpen ? 'Close genres' : 'Open genres'}
            </button>
          </div>

          <div
            id="genre-filter-panel"
            className={`genre-filter-panel ${isGenrePanelOpen ? 'is-open' : ''}`}
          >
            <div className="genre-filter-actions">
              <span>{selectedGenreIds.length} selected</span>
              <button
                type="button"
                className="genre-clear-button"
                onClick={clearGenres}
                disabled={selectedGenreIds.length === 0}
              >
                Clear filter
              </button>
            </div>

            <div className="genre-chip-grid">
              {genreList.map((genre) => {
                const isSelected = selectedGenreIds.includes(genre.id);

                return (
                  <button
                    key={genre.id}
                    type="button"
                    className={`genre-chip ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => toggleGenre(genre.id)}
                  >
                    {genre.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

    <section className="all-movies" ref={moviesSectionRef}>
      <div className='movies-section-heading'>
        <h2 className='mt-[40px]'>All Movies</h2>
        {selectedGenreIds.length > 0 && (
          <p className='genre-results-copy'>Showing movies matching your selected genres</p>
        )}
      </div>

      <PaginationControls position="top" />

      {errorMessage ? (
        <p className='text-red-500'>{errorMessage}</p>
      ) : movieList.length === 0 ? (
        <p className='genre-results-copy'>No movies found for the current search and genre filters.</p>
      ) : ( 
        <div className='movie-grid-shell'>
          {isLoading && (
            <div className='movie-grid-loading'>
              <Spinner/>
            </div>
          )}

        <ul className={isLoading ? 'movie-grid is-loading' : 'movie-grid'}>
           {movieList.map((movie) => (
              <MovieCard key={movie.id} movie={movie} onWatchTrailer={handleWatchTrailer} />
              ))}
          </ul>
        </div>
      )}

      {!errorMessage && movieList.length > 0 && <PaginationControls position="bottom" />}
    </section>
    </div>

    {showModal && (
      <MovieModal
        movie={selectedMovie}
        trailerUrl={trailerUrl}
        streamingUrl={streamingUrl}
        onClose={closeModal}
      />
    )}
    </main>

  )
}

export default App
