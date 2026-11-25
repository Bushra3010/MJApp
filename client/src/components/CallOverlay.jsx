import { useEffect, useRef, useState } from 'react';
import { useCall } from '../lib/call.jsx';
import { mmss } from '../lib/api.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import Coins from './Coins.jsx';
import CallSummary from './CallSummary.jsx';

function Video({ stream, className, muted }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && stream) ref.current.srcObject = stream; }, [stream]);
  return <video ref={ref} className={className} autoPlay playsInline muted={muted} />;
}
function Audio({ stream }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && stream) ref.current.srcObject = stream; }, [stream]);
  return <audio ref={ref} autoPlay />;
}

function useElapsed(startedAt) {
  const [, force] = useState(0);
  useEffect(() => { if (!startedAt) return; const t = setInterval(() => force((x) => x + 1), 1000); return () => clearInterval(t); }, [startedAt]);
  return startedAt ? (Date.now() - startedAt) / 1000 : 0;
}

export default function CallOverlay() {
  const { call, localStream, remoteStream, accept, decline, hangup, toggleMute, toggleCam, flipCam, requestVideo, answerVideo, me } = useCall();
  const elapsed = useElapsed(call.phase === 'active' ? call.startedAt : null);
  if (call.phase === 'idle') return null;
  if (call.phase === 'ended' && me?.role === 'user') return <CallSummary />;
  const freeLeft = call.phase === 'active' && call.freeUntil ? Math.max(0, (call.freeUntil - Date.now()) / 1000) : 0;

  const peer = call.peer || {};
  const isVideo = call.type === 'video';
  const isHost = me?.role === 'host';
  const showRemoteVideo = isVideo && call.phase === 'active' && remoteStream;

  let status = '';
  if (call.phase === 'outgoing') status = call.status || 'Calling…';
  if (call.phase === 'incoming') status = `Incoming ${isVideo ? 'video' : 'audio'} call`;
  if (call.phase === 'connecting') status = 'Connecting…';
  if (call.phase === 'active') status = call.media === 'connected' ? mmss(elapsed) : call.media === 'reconnecting' ? 'Reconnecting…' : 'Connecting…';
  if (call.phase === 'ended') status = call.summary?.message;

  return (
    <div className="call" role="dialog" aria-label={`${isVideo ? 'Video' : 'Audio'} call with ${peer.name}`}>
      {!showRemoteVideo && <div className="bg" style={peer.avatar ? { backgroundImage: `url(${peer.avatar})` } : { background: 'radial-gradient(circle at 50% 30%, #ec1c7c, #14060e 70%)' }} />}
      {showRemoteVideo && <Video stream={remoteStream} className="remote" />}
      {!isVideo && remoteStream && <Audio stream={remoteStream} />}
      {isVideo && localStream?.getVideoTracks().length > 0 && call.phase !== 'ended' && !call.camOff && <Video stream={localStream} className="local" muted />}
      {isHost && call.upgradeRequest && call.phase === 'active' && (
        <div className="upgrade-ask" role="alertdialog" aria-label="Video request">
          <Icon name="video" size={22} />
          <div><b>{peer.name} wants to switch to video</b><span>The call stays connected · {call.upgradeRequest.rate} coins/min for them</span></div>
          <button className="btn btn-sm btn-outline" style={{ width: 'auto' }} onClick={() => answerVideo(false)}>Not now</button>
          <button className="btn btn-sm btn-green" onClick={() => answerVideo(true)}><Icon name="video" size={16} />Turn on video</button>
        </div>
      )}

      <div className="top">
        <span className="pill">{isVideo ? <Icon name="video" size={16} /> : <Icon name="phone" size={16} />} {isVideo ? 'Video' : 'Audio'} · {call.rate} coins/min</span>
        {call.phase === 'active' && (freeLeft > 0
          ? <span className="pill free">Free · {mmss(freeLeft)}</span>
          : isHost
            ? <span className="pill">Earned <Coins value={call.earned || 0} /></span>
            : <span className={`pill ${call.lowBalance ? 'warn' : ''}`}>Spent <Coins value={call.charged || 0} /></span>
        )}
        {(call.phase === 'outgoing' || call.phase === 'incoming') && call.freeTrialMs > 0 && (
          <span className="pill free">{isHost ? 'Free trial call' : `First ${Math.round(call.freeTrialMs / 1000)}s free`}</span>
        )}
      </div>

      <div className="center">
        {!showRemoteVideo && (
          <div className={call.phase === 'outgoing' || call.phase === 'incoming' ? 'ring' : ''}>
            <Avatar src={peer.avatar} name={peer.name} size={140} />
          </div>
        )}
        {!showRemoteVideo && <h2>{peer.name}</h2>}
        <div className="sub" style={showRemoteVideo ? { position: 'absolute', top: 70, left: 20 } : {}}>
          {showRemoteVideo ? <span className="pill">{peer.name} · {status}</span> : status}
        </div>
        {call.phase === 'active' && freeLeft > 0 && (
          <span className="pill free">{isHost ? "Free trial — earnings start after it ends" : `Free trial · billing starts in ${Math.ceil(freeLeft)}s`}</span>
        )}
        {call.phase === 'active' && call.upgrade === 'waiting' && <span className="pill">Asking {peer.name} to switch to video…</span>}
        {call.phase === 'active' && call.lowBalance && !isHost && freeLeft <= 0 && (
          <span className="pill warn">Low balance — call ends at the next minute. Recharge in Wallet.</span>
        )}
        {call.phase === 'ended' && call.summary?.status === 'ended' && (
          <span className="pill">{mmss(call.summary.seconds)} · {isHost ? <>earned <Coins value={call.summary.earned || 0} /></> : <>spent <Coins value={call.summary.charged} /></>}</span>
        )}
      </div>

      {call.phase === 'incoming' && (
        <div className="controls" style={{ gap: 64 }}>
          <div><button className="cbtn end" onClick={decline} aria-label={isHost ? 'Reject' : 'Decline'}><Icon name="end" size={28} fill /></button><div className="cbtn-label">{isHost ? 'Reject' : 'Decline'}</div></div>
          <div><button className="cbtn accept" onClick={accept} aria-label="Accept"><Icon name={isVideo ? 'video' : 'phone'} size={28} /></button><div className="cbtn-label">Accept</div></div>
        </div>
      )}
      {(call.phase === 'outgoing' || call.phase === 'connecting' || call.phase === 'active') && (
        <div className="controls">
          <div><button className={`cbtn ${call.muted ? 'off' : ''}`} onClick={toggleMute} aria-label="Mute"><Icon name={call.muted ? 'micOff' : 'mic'} /></button><div className="cbtn-label">{call.muted ? 'Unmute' : 'Mute'}</div></div>
          {!isVideo && !isHost && call.phase === 'active' && <div><button className={`cbtn upgrade ${call.upgrade ? 'off' : ''}`} onClick={requestVideo} disabled={!!call.upgrade} aria-label="Switch to video call"><Icon name="video" /></button><div className="cbtn-label">Video</div></div>}
          {isVideo && <div><button className={`cbtn ${call.camOff ? 'off' : ''}`} onClick={toggleCam} aria-label="Camera"><Icon name={call.camOff ? 'camOff' : 'video'} /></button><div className="cbtn-label">Camera</div></div>}
          {isVideo && <div><button className="cbtn" onClick={flipCam} aria-label="Flip camera"><Icon name="flip" /></button><div className="cbtn-label">Flip</div></div>}
          <div><button className="cbtn end" onClick={hangup} aria-label="End call"><Icon name="end" size={28} fill /></button><div className="cbtn-label">End</div></div>
        </div>
      )}
      {call.phase === 'ended' && <div className="controls" />}
    </div>
  );
}
