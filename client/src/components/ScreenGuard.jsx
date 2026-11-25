// Screenshot & copy deterrents for the member and host apps.
// A web app cannot fully stop a phone's screenshot button, so this makes leaks hard and traceable:
//  • the screen blurs whenever the app is in the background or the app switcher
//  • photos and videos can't be long-pressed, dragged, saved or downloaded; no right-click menu
//  • the Print Screen key blanks the screen and clears the clipboard
//  • a faint watermark with the viewer's account ID is drawn over every screen, so any leaked
//    screenshot shows who took it and the account can be banned
import { useEffect, useState } from 'react';

const isField = (el) => el && (el.closest('input, textarea, [contenteditable="true"]'));

export default function ScreenGuard({ user }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const hide = () => setHidden(true);
    const show = () => { if (!document.hidden) setHidden(false); };
    const onVis = () => (document.hidden ? hide() : show());
    const noMenu = (e) => { if (!isField(e.target)) e.preventDefault(); };
    const noDrag = (e) => { if (e.target.closest?.('img, video')) e.preventDefault(); };
    const onKey = (e) => {
      if (e.key === 'PrintScreen') {
        hide();
        try { navigator.clipboard?.writeText(''); } catch { /* not allowed */ }
        setTimeout(show, 1500);
      }
      // block save / print shortcuts
      if ((e.ctrlKey || e.metaKey) && ['s', 'p'].includes(String(e.key).toLowerCase())) e.preventDefault();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', show);
    // any touch / click / key back in the app brings the screen back
    window.addEventListener('pointerdown', show, true);
    window.addEventListener('pageshow', show);
    window.addEventListener('pagehide', hide);
    document.addEventListener('contextmenu', noMenu);
    document.addEventListener('dragstart', noDrag);
    window.addEventListener('keyup', onKey);
    window.addEventListener('keydown', onKey);
    const css = document.documentElement.classList; css.add('guarded');
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', show); window.removeEventListener('pointerdown', show, true); window.removeEventListener('pageshow', show); window.removeEventListener('pagehide', hide);
      document.removeEventListener('contextmenu', noMenu); document.removeEventListener('dragstart', noDrag);
      window.removeEventListener('keyup', onKey); window.removeEventListener('keydown', onKey);
      css.remove('guarded');
    };
  }, []);

  useEffect(() => { document.documentElement.classList.toggle('privacy-hide', hidden); }, [hidden]);

  const mark = user ? `Milo Julo · ID ${user.id}` : '';
  return (<>
    {hidden && <div className="privacy-cover" onPointerDown={() => setHidden(false)}><b>Milo Julo</b><span>Tap to continue</span></div>}
    {user && (
      <div className="wm" aria-hidden="true">
        {Array.from({ length: 24 }, (_, i) => <span key={i}>{mark}</span>)}
      </div>
    )}
  </>);
}
