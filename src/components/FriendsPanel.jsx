import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient.js'

const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY
const TMDB_OPTS = { headers: { accept: 'application/json', Authorization: `Bearer ${TMDB_KEY}` } }

function buildTag(email) {
  const prefix = (email.split('@')[0] || 'user').replace(/[^a-z0-9_]/gi, '').slice(0, 14) || 'user'
  return `${prefix}#${String(Math.floor(1000 + Math.random() * 9000))}`
}

function Poster({ path, alt }) {
  if (!path) return <div className="fp-poster fp-poster-empty" />
  return <img className="fp-poster" src={`https://image.tmdb.org/t/p/w92${path}`} alt={alt} loading="lazy" />
}

export function FriendsPanel({ isOpen, onClose, currentUser }) {
  const [profile, setProfile] = useState(null)
  const [friends, setFriends] = useState([])
  const [incoming, setIncoming] = useState([])
  const [received, setReceived] = useState([])

  const [searchTag, setSearchTag] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [searchMsg, setSearchMsg] = useState('')
  const [isFinding, setIsFinding] = useState(false)

  const [shareTarget, setShareTarget] = useState(null) // friend profile to share to
  const [movieQuery, setMovieQuery] = useState('')
  const [movieResults, setMovieResults] = useState([])
  const [isMovieSearching, setIsMovieSearching] = useState(false)
  const [shareMsg, setShareMsg] = useState('')

  const [copied, setCopied] = useState(false)
  const movieDebounce = useRef(null)
  const panelRef = useRef(null)

  const load = useCallback(async () => {
    if (!currentUser) return

    // ensure profile exists
    let { data: p } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single()
    if (!p) {
      const tag = buildTag(currentUser.email)
      const { data: created } = await supabase.from('profiles').insert({ id: currentUser.id, friend_tag: tag }).select().single()
      p = created
    }
    setProfile(p)

    // accepted friends
    const { data: reqs } = await supabase
      .from('friend_requests')
      .select('id, sender_id, receiver_id, sender:profiles!sender_id(id,friend_tag), receiver:profiles!receiver_id(id,friend_tag)')
      .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
      .eq('status', 'accepted')
    setFriends((reqs || []).map(r => r.sender_id === currentUser.id ? r.receiver : r.sender).filter(Boolean))

    // pending incoming
    const { data: inc } = await supabase
      .from('friend_requests')
      .select('id, sender:profiles!sender_id(id,friend_tag)')
      .eq('receiver_id', currentUser.id)
      .eq('status', 'pending')
    setIncoming(inc || [])

    // received movies not yet seen
    const { data: shrd } = await supabase
      .from('shared_movies')
      .select('id, movie_id, movie_title, movie_poster_path, media_type, created_at, sender:profiles!sender_id(friend_tag)')
      .eq('receiver_id', currentUser.id)
      .is('seen_at', null)
      .order('created_at', { ascending: false })
      .limit(8)
    setReceived(shrd || [])
  }, [currentUser])

  useEffect(() => {
    if (isOpen && currentUser) load()
  }, [isOpen, currentUser, load])

  // close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, onClose])

  async function findFriend() {
    const tag = searchTag.trim()
    if (!tag.includes('#')) { setSearchMsg('Format: username#1234'); return }
    setIsFinding(true); setSearchMsg(''); setSearchResult(null)
    const { data } = await supabase.from('profiles').select('id,friend_tag').eq('friend_tag', tag).neq('id', currentUser.id).single()
    setIsFinding(false)
    if (!data) { setSearchMsg('No user found'); return }
    setSearchResult(data)
  }

  async function sendRequest(toId) {
    const { error } = await supabase.from('friend_requests').insert({ sender_id: currentUser.id, receiver_id: toId })
    if (error?.code === '23505') setSearchMsg('Request already sent')
    else { setSearchMsg('Request sent!'); setSearchTag(''); setSearchResult(null) }
  }

  async function respond(reqId, accept) {
    await supabase.from('friend_requests').update({ status: accept ? 'accepted' : 'rejected' }).eq('id', reqId)
    load()
  }

  async function dismissShared(id) {
    await supabase.from('shared_movies').update({ seen_at: new Date().toISOString() }).eq('id', id)
    setReceived(prev => prev.filter(m => m.id !== id))
  }

  function onMovieQueryChange(val) {
    setMovieQuery(val)
    setMovieResults([])
    clearTimeout(movieDebounce.current)
    if (!val.trim() || val.length < 2) return
    movieDebounce.current = setTimeout(async () => {
      setIsMovieSearching(true)
      const res = await fetch(`https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(val)}&include_adult=false`, TMDB_OPTS)
      const json = await res.json()
      setMovieResults((json.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 5))
      setIsMovieSearching(false)
    }, 350)
  }

  async function shareMovie(movie) {
    if (!shareTarget) return
    setShareMsg('')
    const { error } = await supabase.from('shared_movies').insert({
      sender_id: currentUser.id,
      receiver_id: shareTarget.id,
      movie_id: movie.id,
      movie_title: movie.title || movie.name,
      movie_poster_path: movie.poster_path || null,
      media_type: movie.media_type || 'movie'
    })
    if (error) { setShareMsg('Failed to share'); return }
    setShareMsg(`Shared "${movie.title || movie.name}"!`)
    setMovieQuery(''); setMovieResults([])
    setTimeout(() => { setShareTarget(null); setShareMsg('') }, 2000)
  }

  function copyTag() {
    if (!profile?.friend_tag) return
    navigator.clipboard?.writeText(profile.friend_tag)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isOpen) return null

  return (
    <div className="fp-overlay" ref={panelRef} role="dialog" aria-label="Friends">
      <div className="fp-header">
        <span className="fp-title">Friends</span>
        <button onClick={onClose} className="fp-close" aria-label="Close">×</button>
      </div>

      {profile && (
        <div className="fp-tag-row">
          <span className="fp-tag-label">Your tag</span>
          <span className="fp-tag-value">{profile.friend_tag}</span>
          <button onClick={copyTag} className="fp-tag-copy" title="Copy">
            {copied ? '✓' : '⧉'}
          </button>
        </div>
      )}

      <div className="fp-search-row">
        <input
          className="fp-input"
          value={searchTag}
          onChange={e => { setSearchTag(e.target.value); setSearchMsg(''); setSearchResult(null) }}
          onKeyDown={e => e.key === 'Enter' && findFriend()}
          placeholder="Search tag  (e.g. alex#4821)"
        />
        <button className="fp-search-btn" onClick={findFriend} disabled={isFinding}>
          {isFinding ? '…' : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>
          )}
        </button>
      </div>

      {searchMsg && <p className={`fp-msg ${searchMsg.includes('!') ? 'fp-msg-ok' : 'fp-msg-err'}`}>{searchMsg}</p>}

      {searchResult && (
        <div className="fp-result-row">
          <span className="fp-result-tag">{searchResult.friend_tag}</span>
          <button className="fp-add-btn" onClick={() => sendRequest(searchResult.id)}>Add friend</button>
        </div>
      )}

      {incoming.length > 0 && (
        <div className="fp-section">
          <div className="fp-section-label">Pending requests</div>
          {incoming.map(req => (
            <div key={req.id} className="fp-request-row">
              <span className="fp-request-tag">{req.sender?.friend_tag}</span>
              <div className="fp-request-btns">
                <button className="fp-accept-btn" onClick={() => respond(req.id, true)}>Accept</button>
                <button className="fp-reject-btn" onClick={() => respond(req.id, false)}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {received.length > 0 && (
        <div className="fp-section">
          <div className="fp-section-label">Shared with you</div>
          {received.map(share => (
            <div key={share.id} className="fp-shared-row">
              <Poster path={share.movie_poster_path} alt={share.movie_title} />
              <div className="fp-shared-info">
                <span className="fp-shared-title">{share.movie_title}</span>
                <span className="fp-shared-from">from {share.sender?.friend_tag}</span>
              </div>
              <button className="fp-dismiss" onClick={() => dismissShared(share.id)} title="Dismiss">×</button>
            </div>
          ))}
        </div>
      )}

      <div className="fp-section">
        <div className="fp-section-label">Friends {friends.length > 0 && `· ${friends.length}`}</div>
        {friends.length === 0 ? (
          <p className="fp-empty">No friends yet</p>
        ) : (
          friends.map(friend => (
            <div key={friend.id} className="fp-friend-row">
              <div className="fp-friend-avatar">{(friend.friend_tag || '?')[0].toUpperCase()}</div>
              <span className="fp-friend-tag">{friend.friend_tag}</span>
              <button
                className="fp-share-movie-btn"
                onClick={() => { setShareTarget(shareTarget?.id === friend.id ? null : friend); setMovieQuery(''); setMovieResults([]); setShareMsg('') }}
              >
                {shareTarget?.id === friend.id ? 'Cancel' : 'Share movie'}
              </button>
            </div>
          ))
        )}

        {shareTarget && (
          <div className="fp-share-panel">
            <p className="fp-share-to">Share with <strong>{shareTarget.friend_tag}</strong></p>
            <div className="fp-search-row">
              <input
                className="fp-input"
                value={movieQuery}
                onChange={e => onMovieQueryChange(e.target.value)}
                placeholder="Search a movie or show…"
                autoFocus
              />
              {isMovieSearching && <span className="fp-spinner">…</span>}
            </div>
            {shareMsg && <p className={`fp-msg ${shareMsg.includes('!') ? 'fp-msg-ok' : 'fp-msg-err'}`}>{shareMsg}</p>}
            {movieResults.length > 0 && (
              <div className="fp-movie-results">
                {movieResults.map(m => (
                  <button key={m.id} className="fp-movie-result" onClick={() => shareMovie(m)}>
                    <Poster path={m.poster_path} alt={m.title || m.name} />
                    <span className="fp-movie-result-title">{m.title || m.name}</span>
                    <span className="fp-movie-result-year">{(m.release_date || m.first_air_date || '').slice(0, 4)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
