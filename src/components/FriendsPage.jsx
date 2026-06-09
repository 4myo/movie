import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'

const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY
const TMDB_OPTS = { headers: { accept: 'application/json', Authorization: `Bearer ${TMDB_KEY}` } }

function buildTag(email) {
  const prefix = (email?.split('@')[0] || 'user').replace(/[^a-z0-9_]/gi, '').slice(0, 14) || 'user'
  return `${prefix}#${String(Math.floor(1000 + Math.random() * 9000))}`
}

function formatMsgTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function FriendsPage({ currentUser }) {
  const navigate = useNavigate()

  const [myProfile, setMyProfile] = useState(null)
  const [friends, setFriends] = useState([])
  const [incoming, setIncoming] = useState([])
  const [selectedFriend, setSelectedFriend] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [dbMissing, setDbMissing] = useState(false)

  const [isMoviePicker, setIsMoviePicker] = useState(false)
  const [movieQuery, setMovieQuery] = useState('')
  const [movieResults, setMovieResults] = useState([])
  const [isMovieSearching, setIsMovieSearching] = useState(false)

  const [searchTag, setSearchTag] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [searchMsg, setSearchMsg] = useState('')
  const [isFinding, setIsFinding] = useState(false)

  const [unreadMap, setUnreadMap] = useState({})
  const [copied, setCopied] = useState(false)

  const messagesEndRef = useRef(null)
  const movieDebounce = useRef(null)
  const selectedFriendRef = useRef(null)
  selectedFriendRef.current = selectedFriend

  const loadProfile = useCallback(async () => {
    if (!currentUser) return
    let { data: p } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single()
    if (!p) {
      const tag = buildTag(currentUser.email)
      const { data: created } = await supabase
        .from('profiles').insert({ id: currentUser.id, friend_tag: tag }).select().single()
      p = created
    }
    setMyProfile(p)
  }, [currentUser])

  const loadFriends = useCallback(async () => {
    if (!currentUser) return
    const { data: reqs } = await supabase
      .from('friend_requests')
      .select('id, sender_id, receiver_id, sender:profiles!sender_id(id,friend_tag), receiver:profiles!receiver_id(id,friend_tag)')
      .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
      .eq('status', 'accepted')
    setFriends((reqs || []).map(r => r.sender_id === currentUser.id ? r.receiver : r.sender).filter(Boolean))

    const { data: inc } = await supabase
      .from('friend_requests')
      .select('id, sender:profiles!sender_id(id,friend_tag)')
      .eq('receiver_id', currentUser.id)
      .eq('status', 'pending')
    setIncoming(inc || [])
  }, [currentUser])

  const loadMessages = useCallback(async (friendId) => {
    if (!currentUser || !friendId) return
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${currentUser.id},receiver_id.eq.${friendId}),` +
        `and(sender_id.eq.${friendId},receiver_id.eq.${currentUser.id})`
      )
      .order('created_at', { ascending: true })
      .limit(100)

    if (error) {
      if (error.code === '42P01') { setDbMissing(true); return }
      console.error('Messages load error:', error)
      return
    }
    setDbMissing(false)
    setMessages(data || [])

    const unseen = (data || []).filter(m => m.receiver_id === currentUser.id && !m.seen_at)
    if (unseen.length > 0) {
      await supabase.from('messages').update({ seen_at: new Date().toISOString() }).in('id', unseen.map(m => m.id))
      setUnreadMap(prev => ({ ...prev, [friendId]: 0 }))
    }
  }, [currentUser])

  const loadUnreadCounts = useCallback(async () => {
    if (!currentUser) return
    const { data, error } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('receiver_id', currentUser.id)
      .is('seen_at', null)
    if (error || !data) return
    const counts = {}
    data.forEach(m => { counts[m.sender_id] = (counts[m.sender_id] || 0) + 1 })
    setUnreadMap(counts)
  }, [currentUser])

  useEffect(() => {
    if (!currentUser) return
    loadProfile()
    loadFriends()
    loadUnreadCounts()
  }, [currentUser, loadProfile, loadFriends, loadUnreadCounts])

  useEffect(() => {
    if (!selectedFriend) { setMessages([]); return }
    loadMessages(selectedFriend.id)
  }, [selectedFriend, loadMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!currentUser) return
    const channel = supabase
      .channel(`fc-messages:${currentUser.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${currentUser.id}`
      }, payload => {
        const msg = payload.new
        const friend = selectedFriendRef.current
        if (friend && msg.sender_id === friend.id) {
          setMessages(prev => [...prev, msg])
          supabase.from('messages').update({ seen_at: new Date().toISOString() }).eq('id', msg.id)
        } else {
          setUnreadMap(prev => ({ ...prev, [msg.sender_id]: (prev[msg.sender_id] || 0) + 1 }))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentUser])

  // Real-time: incoming friend requests + accepted requests
  useEffect(() => {
    if (!currentUser) return
    const channel = supabase
      .channel(`fc-friend-requests:${currentUser.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'friend_requests',
        filter: `receiver_id=eq.${currentUser.id}`
      }, () => loadFriends())
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'friend_requests',
        filter: `sender_id=eq.${currentUser.id}`
      }, () => loadFriends())
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'friend_requests',
        filter: `receiver_id=eq.${currentUser.id}`
      }, () => loadFriends())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentUser, loadFriends])

  async function sendMessage(content, type = 'text', movieData = null) {
    if (!currentUser || !selectedFriend) return
    if (type === 'text' && !content?.trim()) return
    setIsSending(true)

    const payload = {
      sender_id: currentUser.id,
      receiver_id: selectedFriend.id,
      content: type === 'text' ? content.trim() : null,
      type,
      movie_data: movieData || null,
    }

    const { data, error } = await supabase.from('messages').insert(payload).select().single()
    if (error) {
      if (error.code === '42P01') setDbMissing(true)
      else console.error('Send error:', error)
    } else {
      setMessages(prev => [...prev, data])
    }

    setNewMessage('')
    setIsSending(false)
    setIsMoviePicker(false)
    setMovieQuery('')
    setMovieResults([])
  }

  async function sendWatchInvite(movie) {
    if (!currentUser || !selectedFriend) return
    const { data: session, error } = await supabase.from('watch_sessions').insert({
      host_id: currentUser.id,
      guest_id: selectedFriend.id,
      movie_id: movie.id,
      movie_title: movie.title || movie.name,
      movie_poster_path: movie.poster_path || null,
      media_type: movie.media_type || 'movie',
      status: 'pending'
    }).select().single()

    if (error) {
      if (error.code === '42P01') setDbMissing(true)
      else console.error('Session create error:', error)
      return
    }

    await sendMessage(null, 'watch_invite', {
      id: movie.id,
      title: movie.title || movie.name,
      poster_path: movie.poster_path,
      media_type: movie.media_type || 'movie',
      session_id: session.id,
      year: (movie.release_date || movie.first_air_date || '').slice(0, 4)
    })
  }

  async function joinWatchSession(movieData) {
    const mediaType = movieData?.media_type || 'movie'
    if (movieData?.session_id) {
      await supabase.from('watch_sessions').update({ status: 'active' }).eq('id', movieData.session_id)
    }
    navigate(`/watch/${mediaType}/${movieData?.id}`)
  }

  async function respondToRequest(reqId, accept) {
    await supabase.from('friend_requests')
      .update({ status: accept ? 'accepted' : 'rejected' }).eq('id', reqId)
    loadFriends()
  }

  async function findFriend() {
    const tag = searchTag.trim()
    if (!tag.includes('#')) { setSearchMsg('Format: username#1234'); return }
    setIsFinding(true); setSearchMsg(''); setSearchResult(null)
    const { data, error } = await supabase.from('profiles').select('id,friend_tag')
      .eq('friend_tag', tag).neq('id', currentUser.id).single()
    setIsFinding(false)
    if (error || !data) { setSearchMsg('No user found with that tag'); return }
    setSearchResult(data)
  }

  async function sendFriendRequest(toId) {
    setSearchMsg('Sending…')
    const { error } = await supabase.from('friend_requests')
      .insert({ sender_id: currentUser.id, receiver_id: toId, status: 'pending' })
    if (error) {
      console.error('[FriendsPage] sendFriendRequest error:', error)
      setSearchMsg(error.code === '23505' ? 'Already sent or already friends' : `Error: ${error.message}`)
    } else {
      setSearchMsg('Friend request sent! ✓')
      setTimeout(() => { setSearchTag(''); setSearchResult(null); setSearchMsg('') }, 2500)
    }
  }

  function copyTag() {
    if (!myProfile?.friend_tag) return
    navigator.clipboard?.writeText(myProfile.friend_tag)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function onMovieQueryChange(val) {
    setMovieQuery(val)
    setMovieResults([])
    clearTimeout(movieDebounce.current)
    if (!val.trim() || val.length < 2) return
    movieDebounce.current = setTimeout(async () => {
      setIsMovieSearching(true)
      const res = await fetch(
        `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(val)}&include_adult=false`,
        TMDB_OPTS
      )
      const json = await res.json()
      setMovieResults((json.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 6))
      setIsMovieSearching(false)
    }, 350)
  }

  const sortedFriends = [...friends].sort((a, b) => (unreadMap[b.id] || 0) - (unreadMap[a.id] || 0))

  return (
    <div className="fc-page">
      <div className="fc-topbar">
        <button className="fc-back" onClick={() => navigate('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Back
        </button>
        <span className="fc-topbar-title">Friends &amp; Chat</span>
        {myProfile && (
          <div className="fc-topbar-tag">
            <span>{myProfile.friend_tag}</span>
            <button className="fc-topbar-copy" onClick={copyTag} title="Copy your friend tag">
              {copied ? '✓' : '⧉'}
            </button>
          </div>
        )}
      </div>

      <div className="fc-layout">
        {/* ── Left sidebar ── */}
        <div className="fc-sidebar">
          <div className="fc-sidebar-inner">

            {incoming.length > 0 && (
              <div className="fc-section">
                <div className="fc-section-label">Requests · {incoming.length}</div>
                {incoming.map(req => (
                  <div key={req.id} className="fc-request-item">
                    <div className="fc-avatar">{(req.sender?.friend_tag || '?')[0].toUpperCase()}</div>
                    <span className="fc-request-name">{req.sender?.friend_tag}</span>
                    <div className="fc-request-btns">
                      <button className="fc-accept-btn" onClick={() => respondToRequest(req.id, true)} title="Accept">✓</button>
                      <button className="fc-reject-btn" onClick={() => respondToRequest(req.id, false)} title="Decline">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="fc-section">
              <div className="fc-section-label">Chats · {friends.length}</div>
              {friends.length === 0
                ? <p className="fc-empty-friends">No friends yet — add one below</p>
                : sortedFriends.map(friend => (
                  <button
                    key={friend.id}
                    className={`fc-friend-item ${selectedFriend?.id === friend.id ? 'is-active' : ''}`}
                    onClick={() => setSelectedFriend(friend)}
                  >
                    <div className="fc-avatar">{(friend.friend_tag || '?')[0].toUpperCase()}</div>
                    <span className="fc-friend-name">{friend.friend_tag}</span>
                    {(unreadMap[friend.id] || 0) > 0 && (
                      <span className="fc-unread">{unreadMap[friend.id]}</span>
                    )}
                  </button>
                ))
              }
            </div>

            <div className="fc-section">
              <div className="fc-section-label">Add Friend</div>
              <div className="fc-add-row">
                <input
                  className="fc-add-input"
                  value={searchTag}
                  onChange={e => { setSearchTag(e.target.value); setSearchMsg(''); setSearchResult(null) }}
                  onKeyDown={e => e.key === 'Enter' && findFriend()}
                  placeholder="username#1234"
                />
                <button className="fc-add-search-btn" onClick={findFriend} disabled={isFinding}>
                  {isFinding ? '…' : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                      <circle cx="11" cy="11" r="7"/>
                      <path d="m21 21-4.35-4.35"/>
                    </svg>
                  )}
                </button>
              </div>
              {searchMsg && (
                <p className={`fc-msg ${searchMsg.includes('!') || searchMsg.includes('sent') ? 'fc-msg-ok' : 'fc-msg-err'}`}>
                  {searchMsg}
                </p>
              )}
              {searchResult && (
                <div className="fc-add-result">
                  <span>{searchResult.friend_tag}</span>
                  <button className="fc-add-confirm" onClick={() => sendFriendRequest(searchResult.id)}>Add</button>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* ── Right chat area ── */}
        <div className="fc-chat-area">
          {!selectedFriend ? (
            <div className="fc-no-chat">
              <div className="fc-no-chat-icon">💬</div>
              <p>Select a friend to start chatting</p>
              {friends.length === 0 && <p className="fc-no-chat-sub">Search a friend tag on the left to connect</p>}
            </div>
          ) : (
            <>
              <div className="fc-chat-header">
                <div className="fc-avatar fc-avatar-lg">{(selectedFriend.friend_tag || '?')[0].toUpperCase()}</div>
                <div className="fc-chat-header-info">
                  <span className="fc-chat-header-name">{selectedFriend.friend_tag}</span>
                </div>
              </div>

              {dbMissing && (
                <div className="fc-db-notice">
                  <strong>Database setup needed</strong>
                  <p>The <code>messages</code> table is missing. Run the SQL setup in your Supabase dashboard to enable chat.</p>
                </div>
              )}

              <div className="fc-messages">
                {!dbMissing && messages.length === 0 && (
                  <div className="fc-messages-empty">Say hi to {selectedFriend.friend_tag}!</div>
                )}

                {messages.map(msg => {
                  const isMine = msg.sender_id === currentUser.id
                  return (
                    <div key={msg.id} className={`fc-bubble ${isMine ? 'is-mine' : ''}`}>
                      {msg.type === 'text' && (
                        <div className="fc-bubble-body">
                          <span className="fc-bubble-text">{msg.content}</span>
                          <span className="fc-bubble-time">{formatMsgTime(msg.created_at)}</span>
                        </div>
                      )}

                      {msg.type === 'movie' && msg.movie_data && (
                        <div className="fc-movie-msg">
                          {msg.movie_data.poster_path && (
                            <img
                              className="fc-movie-msg-poster"
                              src={`https://image.tmdb.org/t/p/w92${msg.movie_data.poster_path}`}
                              alt={msg.movie_data.title}
                              loading="lazy"
                            />
                          )}
                          <div className="fc-movie-msg-info">
                            <span className="fc-movie-msg-tag">Movie Rec</span>
                            <span className="fc-movie-msg-title">{msg.movie_data.title}</span>
                            {msg.movie_data.year && <span className="fc-movie-msg-year">{msg.movie_data.year}</span>}
                          </div>
                          <span className="fc-bubble-time fc-bubble-time-abs">{formatMsgTime(msg.created_at)}</span>
                        </div>
                      )}

                      {msg.type === 'watch_invite' && msg.movie_data && (
                        <div className="fc-watch-msg">
                          <div className="fc-watch-msg-header">
                            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                              <path d="M8 5v14l11-7z"/>
                            </svg>
                            <span>{isMine ? 'Watch Together Invite Sent' : 'Watch Together Invite'}</span>
                          </div>
                          <div className="fc-watch-msg-body">
                            {msg.movie_data.poster_path && (
                              <img
                                className="fc-movie-msg-poster"
                                src={`https://image.tmdb.org/t/p/w92${msg.movie_data.poster_path}`}
                                alt={msg.movie_data.title}
                                loading="lazy"
                              />
                            )}
                            <div className="fc-movie-msg-info">
                              <span className="fc-movie-msg-title">{msg.movie_data.title}</span>
                              {msg.movie_data.year && <span className="fc-movie-msg-year">{msg.movie_data.year}</span>}
                              {!isMine && (
                                <button
                                  className="fc-watch-join-btn"
                                  onClick={() => joinWatchSession(msg.movie_data)}
                                >
                                  Join Session
                                </button>
                              )}
                            </div>
                          </div>
                          <span className="fc-bubble-time fc-bubble-time-abs">{formatMsgTime(msg.created_at)}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {isMoviePicker && (
                <div className="fc-movie-picker">
                  <div className="fc-picker-header">
                    <input
                      className="fc-picker-input"
                      value={movieQuery}
                      onChange={e => onMovieQueryChange(e.target.value)}
                      placeholder="Search a movie or show to share or watch together…"
                      autoFocus
                    />
                    <button className="fc-picker-close" onClick={() => { setIsMoviePicker(false); setMovieQuery(''); setMovieResults([]) }}>✕</button>
                  </div>
                  {isMovieSearching && <div className="fc-picker-loading">Searching…</div>}
                  {movieResults.length > 0 && (
                    <div className="fc-picker-results">
                      {movieResults.map(m => (
                        <div key={m.id} className="fc-picker-result">
                          {m.poster_path
                            ? <img className="fc-picker-poster" src={`https://image.tmdb.org/t/p/w92${m.poster_path}`} alt={m.title || m.name} loading="lazy" />
                            : <div className="fc-picker-poster fc-picker-poster-empty" />
                          }
                          <div className="fc-picker-result-info">
                            <span className="fc-picker-result-title">{m.title || m.name}</span>
                            <span className="fc-picker-result-year">{(m.release_date || m.first_air_date || '').slice(0, 4)}</span>
                          </div>
                          <div className="fc-picker-result-actions">
                            <button
                              className="fc-picker-send-btn"
                              onClick={() => sendMessage(null, 'movie', {
                                id: m.id,
                                title: m.title || m.name,
                                poster_path: m.poster_path,
                                media_type: m.media_type,
                                year: (m.release_date || m.first_air_date || '').slice(0, 4)
                              })}
                            >
                              Share
                            </button>
                            <button
                              className="fc-picker-watch-btn"
                              onClick={() => sendWatchInvite(m)}
                            >
                              Watch Together
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="fc-input-area">
                <button
                  className={`fc-input-action ${isMoviePicker ? 'is-active' : ''}`}
                  onClick={() => setIsMoviePicker(p => !p)}
                  title="Share movie / Watch together"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
                    <rect x="2" y="4" width="20" height="16" rx="3"/>
                    <path d="m10 8 6 4-6 4V8z" fill="currentColor" stroke="none"/>
                  </svg>
                </button>
                <input
                  className="fc-text-input"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage(newMessage)
                    }
                  }}
                  placeholder={`Message ${selectedFriend.friend_tag}…`}
                  disabled={dbMissing}
                />
                <button
                  className="fc-send-btn"
                  onClick={() => sendMessage(newMessage)}
                  disabled={!newMessage.trim() || isSending || dbMissing}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
