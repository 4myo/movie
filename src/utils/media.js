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
    return `https://vsembed.ru/embed/movie?tmdb=${item.id}`
  }

  return `https://moviesapi.to/movie/${item.id}`
}

export const getTvEpisodeStreamingUrl = (showId, seasonNumber, episodeNumber, provider = 'akcloud') => {
  if (!showId || !seasonNumber || !episodeNumber) return ''

  if (provider === 'akcloud') {
    return `https://vsembed.ru/embed/tv?tmdb=${showId}&season=${seasonNumber}&episode=${episodeNumber}`
  }

  return `https://moviesapi.to/tv/${showId}-${seasonNumber}-${episodeNumber}`
}

export const getStreamingProviders = () => [
  {
    id: '111movies',
    name: '111movies',
    label: '111movies — Default • Ads free',
    movieUrl: (id) => `https://111movies.com/movie/${id}`,
    tvEpisodeUrl: (id, season, episode) => `https://111movies.com/tv/${id}/${season}/${episode}`,
    movieEmbed: (id) => `https://111movies.com/movie/${id}`,
    movieDetail: (id) => `https://111movies.com/movie/${id}`
  },
  {
    id: 'vidup',
    name: 'Vidup',
    label: 'Vidup',
    movieUrl: (id) => `https://vidup.me/embed/movie/${id}`,
    tvEpisodeUrl: (id, season, episode) => `https://vidup.me/embed/tv/${id}/${season}/${episode}`,
    movieEmbed: (id) => `https://vidup.me/embed/movie/${id}`,
    movieDetail: (id) => `https://vidup.me/embed/movie/${id}`
  },
  {
    id: 'cinezo',
    name: 'cinezo',
    label: 'cinezo — Ads free',
    movieUrl: (id) => `https://player.cinezo.live/embed/movie/${id}?autoplay=true&poster=false&servericon=true&setting=true&pip=true&primarycolor=67d9ff&secondarycolor=111827&iconcolor=ffffff`,
    tvEpisodeUrl: (id, season, episode) => `https://player.cinezo.live/embed/tv/${id}/${season}/${episode}?autoplay=true&poster=false&servericon=true&setting=true&pip=true&primarycolor=67d9ff&secondarycolor=111827&iconcolor=ffffff`,
    movieEmbed: (id) => `https://player.cinezo.live/embed/movie/${id}`,
    movieDetail: (id) => `https://player.cinezo.live/embed/movie/${id}`
  },
  {
    id: 'vidlink',
    name: 'Vidlink Pro',
    label: 'Vidlink Pro',
    movieUrl: (id) => `https://vidlink.pro/movie/${id}?autoplay=true&poster=false&title=true&icons=default`,
    tvEpisodeUrl: (id, season, episode) => `https://vidlink.pro/tv/${id}/${season}/${episode}?autoplay=true&poster=false&title=true&icons=default`,
    movieEmbed: (id) => `https://vidlink.pro/movie/${id}`,
    movieDetail: (id) => `https://vidlink.pro/movie/${id}`
  },
  {
    id: 'videasy',
    name: 'Videasy',
    label: 'Videasy',
    movieUrl: (id) => `https://player.videasy.net/movie/${id}?autoplayNextEpisode=true&episodeSelector=true&overlay=true&color=67d9ff`,
    tvEpisodeUrl: (id, season, episode) => `https://player.videasy.net/tv/${id}/${season}/${episode}?autoplayNextEpisode=true&episodeSelector=true&overlay=true&color=67d9ff`,
    movieEmbed: (id) => `https://player.videasy.net/movie/${id}`,
    movieDetail: (id) => `https://player.videasy.net/movie/${id}`
  },
  {
    id: 'vidsrcxyz',
    name: 'Vidsrc XYZ',
    label: 'Vidsrc XYZ',
    movieUrl: (id) => `https://vidsrc.wiki/embed/movie/${id}?autoplay=1&color=67d9ff`,
    tvEpisodeUrl: (id, season, episode) => `https://vidsrc.wiki/embed/tv/${id}/${season}/${episode}?autoplay=1&color=67d9ff`,
    movieEmbed: (id) => `https://vidsrc.wiki/embed/movie/${id}`,
    movieDetail: (id) => `https://vidsrc.wiki/embed/movie/${id}`
  },
  {
    id: 'akcloud',
    name: 'AK Cloud',
    label: 'AK Cloud',
    movieUrl: (id) => `https://vsembed.ru/embed/movie?tmdb=${id}`,
    tvEpisodeUrl: (id, season, episode) => `https://vsembed.ru/embed/tv?tmdb=${id}&season=${season}&episode=${episode}`,
    movieEmbed: (id) => `https://vsembed.ru/embed/movie?tmdb=${id}`,
    movieDetail: (id) => `https://vsembed.ru/embed/movie?tmdb=${id}`
  },
  {
    id: 'megacloud',
    name: 'MEGA Cloud',
    label: 'MEGA Cloud',
    movieUrl: (id) => `https://moviesapi.to/movie/${id}`,
    tvEpisodeUrl: (id, season, episode) => `https://moviesapi.to/tv/${id}-${season}-${episode}`,
    movieEmbed: (id) => `https://moviesapi.to/movie/${id}`,
    movieDetail: (id) => `https://moviesapi.to/movie/${id}`
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
