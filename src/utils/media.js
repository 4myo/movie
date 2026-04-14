export const MEDIA_TYPE_OPTIONS = [
  { id: 'movie', label: 'Movies', description: 'Feature films, blockbusters, and cinema picks.' },
  { id: 'tv', label: 'TV Shows', description: 'TV shows, mini-series, and episodic releases.' }
]

export const getMediaLabel = (mediaType) => {
  switch (mediaType) {
    case 'tv':
      return 'TV Show'
    case 'movie':
      return 'Movie'
    default:
      return 'Title'
  }
}

export const getMediaPluralLabel = (mediaType) => {
  switch (mediaType) {
    case 'tv':
      return 'TV Shows'
    case 'movie':
      return 'Movies'
    default:
      return 'Titles'
  }
}

export const normalizeMediaItem = (item, fallbackMediaType) => {
  const mediaType = item.media_type && item.media_type !== 'person' ? item.media_type : fallbackMediaType

  return {
    ...item,
    media_type: mediaType,
    title: item.title || item.name || 'Untitled',
    release_date: item.release_date || item.first_air_date || '',
    original_title: item.original_title || item.original_name || item.title || item.name || 'Untitled'
  }
}

export const normalizeMediaList = (items = [], fallbackMediaType) =>
  items
    .filter((item) => (item.media_type || fallbackMediaType) !== 'person')
    .map((item) => normalizeMediaItem(item, fallbackMediaType))

export const getDetailPath = (item) => {
  const mediaType = item.media_type || 'movie'
  return `/title/${mediaType}/${item.id}`
}

export const getTrailerEmbedUrl = (videoKey) =>
  videoKey
    ? `https://www.youtube-nocookie.com/embed/${videoKey}?rel=0&modestbranding=1&playsinline=1`
    : ''

export const getStreamingUrl = (item, provider = 'akcloud') => {
  if (!item?.id) return ''

  if ((item.media_type || 'movie') === 'tv') {
    return ''
  }

  if (provider === 'akcloud') {
    return `https://vidsrc.xyz/embed/movie?tmdb=${item.id}`
  }

  return `https://moviesapi.club/movie/${item.id}`
}

export const getTvEpisodeStreamingUrl = (showId, seasonNumber, episodeNumber, provider = 'akcloud') => {
  if (!showId || !seasonNumber || !episodeNumber) return ''

  if (provider === 'akcloud') {
    return `https://vidsrc.xyz/embed/tv?tmdb=${showId}&season=${seasonNumber}&episode=${episodeNumber}`
  }

  return `https://moviesapi.club/tv/${showId}-${seasonNumber}-${episodeNumber}`
}

export const getStreamingProviders = () => [
  {
    id: 'akcloud',
    name: 'AK Cloud',
    movieUrl: (id) => `https://vidsrc.xyz/embed/movie?tmdb=${id}`,
    tvEpisodeUrl: (id, season, episode) => `https://vidsrc.xyz/embed/tv?tmdb=${id}&season=${season}&episode=${episode}`,
    movieEmbed: (id) => `https://vidsrc.xyz/embed/movie?tmdb=${id}`,
    movieDetail: (id) => `https://vidsrc.xyz/embed/movie?tmdb=${id}`
  },
  {
    id: 'megacloud',
    name: 'MEGA Cloud',
    movieUrl: (id) => `https://moviesapi.club/movie/${id}`,
    tvEpisodeUrl: (id, season, episode) => `https://moviesapi.club/tv/${id}-${season}-${episode}`,
    movieEmbed: (id) => `https://moviesapi.club/movie/${id}`,
    movieDetail: (id) => `https://moviesapi.club/movie/${id}`
  }
]

export const getTMDBGenreEndpoint = (mediaType) =>
  mediaType === 'tv' ? 'tv' : 'movie'

export const getTMDBDetailEndpoint = (mediaType) =>
  mediaType === 'tv' ? 'tv' : 'movie'

export const getProviderMovieUrl = (providerId, itemId) => {
  const providers = getStreamingProviders()
  const provider = providers.find(p => p.id === providerId)
  return provider ? provider.movieUrl(itemId) : ''
}

export const getProviderTvEpisodeUrl = (providerId, showId, season, episode) => {
  const providers = getStreamingProviders()
  const provider = providers.find(p => p.id === providerId)
  return provider ? provider.tvEpisodeUrl(showId, season, episode) : ''
}

export const getMovieModalStreamingAlternatives = (itemId) => {
  const providers = getStreamingProviders()
  return providers.map(provider => ({
    ...provider,
    url: provider.movieUrl(itemId)
  }))
}