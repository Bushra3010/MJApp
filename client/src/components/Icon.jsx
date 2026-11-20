const paths = {
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="M9 5l7 7-7 7" />,
  gift: <><rect x="3" y="8" width="18" height="5" rx="1.5" /><path d="M5 13v7h14v-7M12 8v12M12 8c-1.5-3-5-3.5-5-1.2C7 8 9 8 12 8zM12 8c1.5-3 5-3.5 5-1.2C17 8 15 8 12 8z" /></>,
  shield: <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" />,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" /><circle cx="12" cy="13.5" r="3.5" /></>,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />,
  heart: <path d="M12 20s-7.5-4.6-9.2-9.3C1.6 7.3 4 4 7.4 4c2 0 3.4 1.1 4.6 2.6C13.2 5.1 14.6 4 16.6 4 20 4 22.4 7.3 21.2 10.7 19.5 15.4 12 20 12 20z" />,
  coin: <><circle cx="12" cy="12" r="9" /><path d="M9 9.5c.5-1 1.6-1.5 3-1.5 1.7 0 3 .9 3 2.2 0 2.8-6 1.6-6 4.4 0 1.3 1.3 2.4 3 2.4 1.4 0 2.6-.6 3-1.6M12 6v2M12 16v2" /></>,
  video: <><rect x="2" y="6" width="14" height="12" rx="3" /><path d="M16 10l6-3v10l-6-3z" /></>,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" />,
  chat: <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />,
  home: <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M16 13h2M3 10h18" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>,
  send: <path d="M4 12l16-8-6 16-2-7z" />,
  back: <path d="M15 5l-7 7 7 7" />,
  more: <><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></>,
  micOff: <><path d="M3 3l18 18" /><path d="M9 9v2a3 3 0 005 2.2M15 9.3V6a3 3 0 00-5.7-1.3M5 11a7 7 0 0011.5 5.4M19 11a7 7 0 01-.4 2.3M12 18v3" /></>,
  camOff: <><path d="M3 3l18 18" /><path d="M16 16H4a2 2 0 01-2-2V8a2 2 0 012-2h2M10 6h4a2 2 0 012 2v4l6-3v10" /></>,
  flip: <><path d="M20 7h-3l-2-3H9L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" /><path d="M9 13a3 3 0 015-2l1 1M15 13a3 3 0 01-5 2l-1-1" /></>,
  end: <path d="M3 15c5-5 13-5 18 0l-2.5 2.5-3.5-1.5v-3a12 12 0 00-6 0v3l-3.5 1.5z" />,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20a7 7 0 0114 0M16 4.5a3.5 3.5 0 010 7M22 20a7 7 0 00-4-6.3" /></>,
  star: <path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z" />,
  flag: <path d="M5 21V4h11l-2 4 2 4H5" />,
  cash: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003 15H3a2 2 0 010-4h.1a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 0010 3.1V3a2 2 0 014 0v.1a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 001.2 2.9H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" /></>,
  logout: <><path d="M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4M10 17l5-5-5-5M15 12H3" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  history: <><path d="M3 12a9 9 0 103-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 3" /></>,
};
export default function Icon({ name, size = 22, fill = false, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {paths[name]}
    </svg>
  );
}
