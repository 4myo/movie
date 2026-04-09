import React from 'react'

const Search = ({ searchTerm, setSearchTerm }) => {
  return (
    <section className="search-panel" aria-labelledby="movie-search-heading">
      <div className="search-panel-copy">
        <p className="search-panel-label">Find something specific</p>
        <h2 id="movie-search-heading" className="search-panel-title">Search a movie</h2>
      </div>

      <div className="search">
          <div>
              <img src="./search.svg" alt="search"/>

              <input
              type = "text"
              placeholder='Search through thousands of movies'
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              />
              
          </div>
      </div>
    </section>
  )
}

export default Search
