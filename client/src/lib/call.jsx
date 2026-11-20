import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { useAuth } from './auth.jsx';
import { emitAck } from './socket.js';
import { useToast } from './toast.jsx';

const CallCtx = createContext(null);
const IDLE = { phase: 'idle' };

/** Simple two-tone ring made with WebAudio, so we ship no audio files. */
function makeRinger() {
  let ctx, timer;
  return {
    start(kind = 'ring') {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        const beep = () => {
          const t = ctx.currentTime;
          [0, 0.4].forEach((d, i) => {
            const o = ctx.createOscillator(); const g = ctx.createGain();
            o.frequency.value = kind === 'ring' ? (i ? 480 : 440) : 425;
            g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.15, t + d + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.35);
            o.connect(g).connect(ctx.destination); o.start(t + d); o.stop(t + d + 0.36);
          });
        };
        beep(); timer = setInterval(beep, 2000);
      } catch { /* audio blocked */ }
    },
    stop() { clearInterval(timer); ctx?.close().catch(() => {}); ctx = null; },
  };
}

export function CallProvider({ children }) {
  const { user, socket } = useAuth();
  const toast = useToast();
  const [call, setCall] = useState(IDLE);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const pc = useRef(null);
  const local = useRef(null);
  const pending = useRef([]);
  const callRef = useRef(IDLE);
  const ringer = useRef(makeRinger());
  callRef.current = call;

  const getMedia = async (type) => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Calls need HTTPS (or localhost) and a modern browser');
    const s = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: type === 'video' ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false,
    });
    local.current = s;
    setLocalStream(s);
    return s;
  };

  const cleanup = useCallback(() => {
    ringer.current.stop();
    pc.current?.close();
    pc.current = null;
    pending.current = [];
    local.current?.getTracks().forEach((t) => t.stop());
    local.current = null;
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  const signal = (data) => socket?.emit('rtc:signal', { callId: callRef.current.callId, data });

  const createPeer = async () => {
    const { iceServers } = await api('/ice');
    const peer = new RTCPeerConnection({ iceServers });
    pc.current = peer;
    local.current?.getTracks().forEach((t) => peer.addTrack(t, local.current));
    peer.onicecandidate = (e) => e.candidate && signal({ type: 'candidate', candidate: e.candidate });
    peer.ontrack = (e) => setRemoteStream(e.streams[0]);
    peer.onconnectionstatechange = () => {
      const st = peer.connectionState;
      if (st === 'connected') setCall((c) => ({ ...c, media: 'connected' }));
      if (st === 'disconnected') setCall((c) => ({ ...c, media: 'reconnecting' }));
      if (st === 'failed') {
        toast('Could not connect the call. Check your network.', 'error');
        socket?.emit('call:failed', { callId: callRef.current.callId });
      }
    };
    return peer;
  };

  const handleSignal = async (data) => {
    let peer = pc.current;
    if (!peer) { pending.current.push(data); return; }
    try {
      if (data.type === 'offer') {
        await peer.setRemoteDescription(data.sdp);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        signal({ type: 'answer', sdp: peer.localDescription });
        flushCandidates();
      } else if (data.type === 'answer') {
        await peer.setRemoteDescription(data.sdp);
        flushCandidates();
      } else if (data.type === 'candidate') {
        if (peer.remoteDescription) await peer.addIceCandidate(data.candidate);
        else pending.current.push(data);
      }
    } catch (e) { console.warn('signal error', e); }
  };
  const flushCandidates = () => {
    const q = pending.current; pending.current = [];
    q.forEach((d) => handleSignal(d));
  };

  useEffect(() => {
    if (!socket) return;
    const onIncoming = (p) => {
      if (callRef.current.phase !== 'idle') { socket.emit('call:decline', { callId: p.callId }); return; }
      setCall({ phase: 'incoming', callId: p.callId, type: p.type, rate: p.rate, peer: p.from });
      ringer.current.start('ring');
      if (navigator.vibrate) navigator.vibrate([400, 200, 400]);
    };
    const onConnected = async (p) => {
      ringer.current.stop();
      setCall((c) => ({ ...c, phase: 'active', startedAt: Date.now(), media: 'connecting', role: p.role }));
      const peer = await createPeer();
      const queued = pending.current; pending.current = [];
      queued.forEach((d) => handleSignal(d));
      if (p.role === 'caller') {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        signal({ type: 'offer', sdp: peer.localDescription });
      }
    };
    const onTick = (t) => setCall((c) => (c.callId === t.callId ? { ...c, charged: t.charged, minutes: t.minutes, lowBalance: t.lowBalance, earned: t.earned, coins: t.coins } : c));
    const onEnded = (s) => {
      if (callRef.current.callId !== s.callId) return;
      cleanup();
      const msg = {
        declined: 'Call declined', no_answer: 'No answer', balance: 'Call ended — not enough coins',
        disconnected: 'Call dropped', failed: 'Call failed to connect', cancelled: 'Call cancelled',
      }[s.reason];
      setCall((c) => ({ ...c, phase: 'ended', summary: { ...s, message: msg || 'Call ended' } }));
      setTimeout(() => setCall((c) => (c.phase === 'ended' && c.callId === s.callId ? IDLE : c)), 2800);
    };
    const onSignal = ({ callId, data }) => { if (callId === callRef.current.callId) handleSignal(data); };
    socket.on('call:incoming', onIncoming);
    socket.on('call:connected', onConnected);
    socket.on('call:tick', onTick);
    socket.on('call:ended', onEnded);
    socket.on('rtc:signal', onSignal);
    return () => {
      socket.off('call:incoming', onIncoming); socket.off('call:connected', onConnected);
      socket.off('call:tick', onTick); socket.off('call:ended', onEnded); socket.off('rtc:signal', onSignal);
    };
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hang up if the tab closes mid-call so the user is never billed for a dead line.
  useEffect(() => {
    const bye = () => { const c = callRef.current; if (c.callId && c.phase !== 'idle' && c.phase !== 'ended') socket?.emit('call:end', { callId: c.callId }); };
    window.addEventListener('pagehide', bye);
    return () => window.removeEventListener('pagehide', bye);
  }, [socket]);

  const startCall = async (host, type) => {
    if (callRef.current.phase !== 'idle') return;
    setCall({ phase: 'outgoing', type, peer: host, status: 'Getting camera & mic…' });
    try {
      await getMedia(type);
    } catch (e) {
      cleanup(); setCall(IDLE);
      toast(e.name === 'NotAllowedError' ? 'Allow microphone' + (type === 'video' ? ' and camera' : '') + ' to call' : e.message, 'error');
      return;
    }
    const res = await emitAck('call:start', { hostId: host.id, type });
    if (res?.error) {
      cleanup(); setCall(IDLE);
      toast(res.error, 'error');
      return res;
    }
    setCall({ phase: 'outgoing', callId: res.callId, type, rate: res.rate, peer: res.host, status: 'Ringing…' });
    ringer.current.start('back');
    return res;
  };

  const accept = async () => {
    const c = callRef.current;
    ringer.current.stop();
    try {
      await getMedia(c.type);
    } catch {
      toast('Allow microphone/camera to answer', 'error');
      socket.emit('call:decline', { callId: c.callId });
      cleanup(); setCall(IDLE);
      return;
    }
    setCall((x) => ({ ...x, phase: 'connecting' }));
    const res = await emitAck('call:accept', { callId: c.callId });
    if (res?.error) { toast(res.error, 'error'); cleanup(); setCall(IDLE); }
  };
  const decline = () => { socket.emit('call:decline', { callId: callRef.current.callId }); cleanup(); setCall(IDLE); };
  const hangup = () => {
    const c = callRef.current;
    if (c.callId) socket.emit('call:end', { callId: c.callId });
    else { cleanup(); setCall(IDLE); }
  };
  const toggleMute = () => {
    const t = local.current?.getAudioTracks()[0]; if (!t) return;
    t.enabled = !t.enabled; setCall((c) => ({ ...c, muted: !t.enabled }));
  };
  const toggleCam = () => {
    const t = local.current?.getVideoTracks()[0]; if (!t) return;
    t.enabled = !t.enabled; setCall((c) => ({ ...c, camOff: !t.enabled }));
  };
  const flipCam = async () => {
    const t = local.current?.getVideoTracks()[0]; if (!t) return;
    const facing = t.getSettings().facingMode === 'environment' ? 'user' : 'environment';
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
      const nt = s.getVideoTracks()[0];
      pc.current?.getSenders().find((x) => x.track?.kind === 'video')?.replaceTrack(nt);
      local.current.removeTrack(t); t.stop(); local.current.addTrack(nt);
      setLocalStream(new MediaStream(local.current.getTracks()));
    } catch { toast('Could not switch camera', 'error'); }
  };

  return (
    <CallCtx.Provider value={{ call, localStream, remoteStream, startCall, accept, decline, hangup, toggleMute, toggleCam, flipCam, me: user }}>
      {children}
    </CallCtx.Provider>
  );
}

export const useCall = () => useContext(CallCtx);
