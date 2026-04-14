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
  videoKey ? `https://www.youtube.com/embed/${videoKey}` : ''

export const getStreamingUrl = (item) => {
  if (!item?.id) return ''

  if ((item.media_type || 'movie') === 'tv') {
    return ''
  }

  return `https://www.2embed.online/embed/movie/${item.id}`
}

export const getTvEpisodeStreamingUrl = (showId, seasonNumber, episodeNumber) => {
  if (!showId || !seasonNumber || !episodeNumber) return ''
  return `https://www.2embed.online/embed/tv/${showId}/${seasonNumber}/${episodeNumber}`
}

export const getTMDBGenreEndpoint = (mediaType) =>
  mediaType === 'tv' ? 'tv' : 'movie'

export const getTMDBDetailEndpoint = (mediaType) =>
  mediaType === 'tv' ? 'tv' : 'movie'
