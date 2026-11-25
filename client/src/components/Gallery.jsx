// Host photos & videos. `editable` (host's own Account page) adds upload and delete; otherwise members just view.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { preparePhoto } from '../lib/image.js';
import { useToast } from '../lib/toast.jsx';
import Icon from './Icon.jsx';

export default function Gallery({ hostId, editable = false }) {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState('');
  const fileRef = useRef(null);
  useEffect(() => {
    api(editable ? '/host/media' : `/hosts/${hostId}/media`).then(setItems).catch(() => setItems([]));
  }, [hostId, editable]);

  const add = async (e) => {
    const files = [...(e.target.files || [])]; e.target.value = '';
    for (const file of files) {
      const isVideo = file.type.startsWith('video/');
      if (isVideo && file.size > 30 * 1024 * 1024) { toast('Video must be under 30 MB (about 1 minute)', 'error'); continue; }
      setBusy(isVideo ? 'Uploading video…' : 'Uploading photo…');
      try {
        const fd = new FormData();
        if (isVideo) fd.append('file', file, file.name || 'video.mp4');
        else { const b = await preparePhoto(file); fd.append('file', b, b.type === 'image/webp' ? 'photo.webp' : 'photo.jpg'); }
        setItems(await api('/host/media', { method: 'POST', form: fd }));
        toast(isVideo ? 'Video added' : 'Photo added', 'success');
      } catch (err) { toast(err.message, 'error'); }
    }
    setBusy('');
  };
  const remove = async (m) => {
    if (!confirm(`Delete this ${m.kind}?`)) return;
    try { setItems(await api(`/host/media/${m.id}`, { method: 'DELETE' })); setOpen(null); } catch (err) { toast(err.message, 'error'); }
  };

  if (!items) return null;
  if (!editable && items.length === 0) return null;
  return (
    <>
      <div className="p-label">Photos & videos</div>
      <div className="gal">
        {items.map((m) => (
          <button key={m.id} className="gal-item press" onClick={() => setOpen(m)} aria-label={`Open ${m.kind}`}>
            {m.kind === 'video'
              ? <><video src={`${m.url}#t=0.1`} muted playsInline preload="metadata" /><span className="gal-play"><Icon name="play" size={18} fill /></span></>
              : <img src={m.url} alt="" loading="lazy" />}
          </button>
        ))}
        {editable && (
          <button className="gal-item gal-add press" onClick={() => fileRef.current?.click()} disabled={!!busy} aria-label="Add photo or video">
            {busy ? <span className="faint" style={{ fontSize: 12, padding: 6 }}>{busy}</span> : <><Icon name="plus" size={24} /><span>Photo / video</span></>}
          </button>
        )}
      </div>
      {editable && <p className="faint" style={{ marginTop: 6, fontSize: 12 }}>Up to 8 photos and 3 short videos (under 30 MB). Members see these on your profile. No phone numbers or social handles.</p>}
      <input ref={fileRef} type="file" accept="image/*,video/mp4,video/quicktime,video/webm" multiple hidden onChange={add} />
      {open && (
        <div className="gal-view" role="dialog" aria-label="Photo or video" onClick={() => setOpen(null)}>
          <div onClick={(e) => e.stopPropagation()} className="gal-view-in">
            {open.kind === 'video' ? <video src={open.url} controls autoPlay playsInline controlsList="nodownload noremoteplayback" disablePictureInPicture /> : <img src={open.url} alt="" />}
            <div className="row" style={{ gap: 8, marginTop: 10, justifyContent: 'center' }}>
              {editable && <button className="btn btn-outline btn-sm" onClick={() => remove(open)}><Icon name="trash" size={16} />Delete</button>}
              <button className="btn btn-primary btn-sm" onClick={() => setOpen(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
