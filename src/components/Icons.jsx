import React from 'react'

const SvgIcon = ({ children, className = '', ...props }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    {children}
  </svg>
)

export const HomeIcon = (props) => (
  <SvgIcon {...props}>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5.5 10.5V20h5v-5h3v5h5v-9.5" />
  </SvgIcon>
)

export const ClapperboardIcon = (props) => (
  <SvgIcon {...props}>
    <path d="M4 7h16v13H4z" />
    <path d="M4 7l3-4h4l-3 4" />
    <path d="M11 7l3-4h4l-3 4" />
    <path d="M4 12h16" />
  </SvgIcon>
)

export const VideoCameraIcon = (props) => (
  <SvgIcon {...props}>
    <rect x="3" y="7" width="13" height="10" rx="3" />
    <path d="m16 10 6-3v10l-6-3" />
    <path d="M7.5 11.5h3" />
  </SvgIcon>
)

export const TvIcon = (props) => (
  <SvgIcon {...props}>
    <rect x="3" y="5" width="18" height="12" rx="2" />
    <path d="M8 21h8" />
    <path d="M12 17v4" />
  </SvgIcon>
)

export const SearchIcon = (props) => (
  <SvgIcon {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m16.5 16.5 4 4" />
  </SvgIcon>
)

export const LogInIcon = (props) => (
  <SvgIcon {...props}>
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <path d="m10 17 5-5-5-5" />
    <path d="M15 12H3" />
  </SvgIcon>
)

export const LogOutIcon = (props) => (
  <SvgIcon {...props}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </SvgIcon>
)

export const PlayIcon = (props) => (
  <SvgIcon {...props} fill="currentColor" stroke="none">
    <path d="M8 5v14l11-7z" />
  </SvgIcon>
)

export const HeartIcon = (props) => (
  <SvgIcon {...props}>
    <path d="M20.8 6.1a5.1 5.1 0 0 0-7.2 0L12 7.7l-1.6-1.6a5.1 5.1 0 0 0-7.2 7.2L12 22l8.8-8.7a5.1 5.1 0 0 0 0-7.2z" />
  </SvgIcon>
)

export const HeartFilledIcon = (props) => (
  <SvgIcon {...props} fill="currentColor" stroke="currentColor">
    <path d="M20.8 6.1a5.1 5.1 0 0 0-7.2 0L12 7.7l-1.6-1.6a5.1 5.1 0 0 0-7.2 7.2L12 22l8.8-8.7a5.1 5.1 0 0 0 0-7.2z" />
  </SvgIcon>
)

export const FilmIcon = (props) => (
  <SvgIcon {...props}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7 5v14" />
    <path d="M17 5v14" />
    <path d="M3 9h4" />
    <path d="M17 9h4" />
    <path d="M3 15h4" />
    <path d="M17 15h4" />
  </SvgIcon>
)

export const MonitorPlayIcon = (props) => (
  <SvgIcon {...props}>
    <rect x="3" y="5" width="18" height="12" rx="2" />
    <path d="M10 9.5v3.8l3.3-1.9z" fill="currentColor" stroke="none" />
    <path d="M8 21h8" />
    <path d="M12 17v4" />
  </SvgIcon>
)
