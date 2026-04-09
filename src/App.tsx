import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, Image as ImageIcon, Video as VideoIcon, Copy, Check, 
  X, ArrowRight, Share2, Download, Play, Phone, PhoneOff, 
  Mic, MicOff, VideoOff, Users, Bell, Trash2, ShieldCheck
} from 'lucide-react';
import { cn } from './lib/utils';

const BACKEND_URL = "https://mediadrop-app.onrender.com";

export default function App() {
  const [roomId, setRoomId] = useState('');
  const [joined, setJoined] = useState(false);
  const [media, setMedia] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inputRoomId, setInputRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [notification, setNotification] = useState('');

  // Call States
  const [isCalling, setIsCalling] = useState(false);
  const [isReceivingCall, setIsReceivingCall] = useState(false);
  const [callSender, setCallSender] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);

  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    socketRef.current = io(BACKEND_URL);

    socketRef.current.on('new-media', (item) => {
      setMedia(prev => [item, ...prev]);
      triggerNotify(`${item.sender} shared a new file!`);
    });

    socketRef.current.on('room-users', (users: string[]) => setOnlineUsers(users));
    
    socketRef.current.on('user-joined', (name: string) => {
      triggerNotify(`${name} entered the vault`);
    });

    socketRef.current.on('video-offer', async (data) => {
      setCallSender(data.sender);
      (window as any).pendingOffer = data.offer;
      setIsReceivingCall(true);
    });

    socketRef.current.on('video-answer', async (data) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });

    socketRef.current.on('new-ice-candidate', async (data) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });

    socketRef.current.on('end-call', handleEndCallUI);
    socketRef.current.on('media-deleted', (id) => setMedia(prev => prev.filter(m => m.id !== id)));

    return () => { socketRef.current?.disconnect(); };
  }, []);

  const triggerNotify = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 4000);
  };

  // WebRTC
  const setupPeerConnection = (stream: MediaStream) => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.onicecandidate = (e) => {
      if (e.candidate) socketRef.current?.emit('new-ice-candidate', { candidate: e.candidate, roomId });
    };

    pc.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  const startCall = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    setIsCalling(true);
    setTimeout(() => {
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = setupPeerConnection(stream);
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        socketRef.current?.emit('video-offer', { offer, roomId, sender: userName });
      });
    }, 500);
  };

  const acceptCall = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    setIsReceivingCall(false);
    setIsCalling(true);
    setTimeout(async () => {
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = setupPeerConnection(stream);
      await pc.setRemoteDescription(new RTCSessionDescription((window as any).pendingOffer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current?.emit('video-answer', { answer, roomId });
    }, 500);
  };

  const handleEndCallUI = () => {
    peerConnectionRef.current?.close();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    setIsCalling(false);
    setIsReceivingCall(false);
    socketRef.current?.emit('end-call', roomId);
  };

  const joinRoom = () => {
    if (inputRoomId.length < 6) return;
    setRoomId(inputRoomId);
    setJoined(true);
    socketRef.current?.emit('join-room', { roomId: inputRoomId, userName: userName || 'Anon' });
  };

  return (
    <div className="min-h-screen bg-[#08080a] text-slate-100 font-sans selection:bg-orange-500/30">
      {/* Top Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div initial={{ y: -100 }} animate={{ y: 24 }} exit={{ y: -100 }}
            className="fixed top-0 left-1/2 -translate-x-1/2 z-[999] bg-white/10 backdrop-blur-xl border border-white/20 px-6 py-3 rounded-2xl shadow-[0_0_30px_rgba(255,165,0,0.2)] flex items-center gap-3">
            <div className="w-2 h-2 bg-orange-500 rounded-full animate-ping" />
            <span className="text-sm font-semibold tracking-wide">{notification}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {!joined ? (
        <div className="relative flex flex-col items-center justify-center h-screen overflow-hidden">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-600/10 blur-[120px] rounded-full" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
          
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md z-10 px-6">
            <div className="text-center mb-10">
              <div className="w-24 h-24 bg-gradient-to-br from-orange-500 to-orange-700 rounded-[2.5rem] mx-auto flex items-center justify-center shadow-[0_20px_50px_rgba(234,88,12,0.3)] mb-6 transform -rotate-6">
                <Share2 size={44} className="text-white" />
              </div>
              <h1 className="text-5xl font-black italic tracking-tighter mb-2">MEDIA<span className="text-orange-500">DROP</span></h1>
              <p className="text-slate-500 font-medium tracking-widest text-xs uppercase">Encrypted Multi-Share Vault</p>
            </div>

            <div className="space-y-4">
              <input type="text" placeholder="Enter Nickname" value={userName} onChange={e => setUserName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 p-5 rounded-3xl focus:border-orange-500 outline-none transition-all placeholder:text-slate-700" />
              
              <div className="relative">
                <input type="text" placeholder="ROOM CODE" maxLength={6} value={inputRoomId} onChange={e => setInputRoomId(e.target.value.toUpperCase())}
                  className="w-full bg-white/5 border border-white/10 p-6 rounded-3xl text-center text-4xl font-black tracking-[0.3em] text-orange-500 outline-none" />
              </div>

              <button onClick={joinRoom} className="w-full py-5 bg-orange-600 hover:bg-orange-500 rounded-3xl font-black text-lg shadow-2xl shadow-orange-900/40 transition-all active:scale-95 flex items-center justify-center gap-3">
                INITIALIZE <ArrowRight size={22} />
              </button>
            </div>
          </motion.div>
        </div>
      ) : (
        <div className="flex h-screen p-4 gap-4">
          {/* Sidebar - Members */}
          <aside className="w-80 bg-white/5 border border-white/10 rounded-[2.5rem] p-8 hidden xl:flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">Active Nodes</h3>
              <div className="px-2 py-1 bg-green-500/10 rounded-md text-[10px] text-green-500 font-bold tracking-tighter">LIVE</div>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto">
              {onlineUsers.map((user, i) => (
                <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.1 }}
                  key={i} className="flex items-center gap-4 bg-white/[0.03] p-4 rounded-2xl border border-white/5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-500/20 to-orange-500/5 flex items-center justify-center text-orange-500 font-black">
                    {user[0]}
                  </div>
                  <div>
                    <p className="text-sm font-bold">{user}</p>
                    <p className="text-[10px] text-slate-500">{user === userName ? "Authorized" : "Guest"}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </aside>

          {/* Main Dashboard */}
          <main className="flex-1 flex flex-col gap-4">
            <header className="bg-white/5 border border-white/10 rounded-[2rem] p-6 flex justify-between items-center backdrop-blur-md">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-orange-500/10 rounded-2xl">
                  <ShieldCheck className="text-orange-500" />
                </div>
                <div>
                  <h2 className="text-lg font-black tracking-tight">{roomId}</h2>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">End-to-End Tunnel</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={startCall} className="p-4 bg-orange-600 rounded-2xl hover:bg-orange-500 shadow-xl shadow-orange-900/20 transition-all">
                  <Phone size={22} className="text-white" />
                </button>
                <button onClick={() => setJoined(false)} className="p-4 bg-white/5 rounded-2xl hover:bg-red-600/20 hover:text-red-500 transition-all">
                  <X size={22} />
                </button>
              </div>
            </header>

            {/* Grid Area */}
            <div className="flex-1 overflow-y-auto pr-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pb-28">
              <AnimatePresence>
                {media.map((item) => (
                  <motion.div layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                    key={item.id} className="group relative aspect-[4/5] bg-white/5 rounded-[2.5rem] overflow-hidden border border-white/10">
                    {item.type === 'image' ? (
                      <img src={item.url} className="w-full h-full object-cover transition-all duration-700 group-hover:scale-110 group-hover:blur-[2px]" />
                    ) : (
                      <div className="w-full h-full bg-slate-900 flex items-center justify-center relative">
                        <Play size={48} className="text-orange-500 z-10" />
                        <video src={item.url} className="absolute inset-0 w-full h-full object-cover opacity-40" />
                      </div>
                    )}
                    
                    {/* Hover Info */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#08080a] via-[#08080a]/20 to-transparent opacity-100 p-8 flex flex-col justify-end transform transition-all translate-y-2 group-hover:translate-y-0">
                      <p className="text-xs font-black text-orange-500 uppercase tracking-[0.2em] mb-2">{item.type}</p>
                      <h4 className="text-lg font-bold truncate mb-1">{item.name}</h4>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[8px] font-bold">@</div>
                        <p className="text-[11px] text-slate-400 font-medium">Shared by <span className="text-white font-bold">{item.sender}</span></p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="absolute top-6 right-6 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                      <a href={item.url} download className="p-3 bg-white/10 backdrop-blur-xl rounded-2xl hover:bg-orange-600 transition-all">
                        <Download size={18} />
                      </a>
                      <button onClick={() => fetch(`${BACKEND_URL}/api/media/${roomId}/${item.id}`, { method: 'DELETE' })}
                        className="p-3 bg-white/10 backdrop-blur-xl rounded-2xl hover:bg-red-600 transition-all">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Bottom Floating Uploader */}
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-full max-w-xl px-6">
              <div className="bg-[#121215]/80 backdrop-blur-3xl border border-white/10 p-4 rounded-[3rem] shadow-[0_30px_60px_rgba(0,0,0,0.5)] flex items-center gap-4">
                <div className="flex-1 px-4">
                  <h4 className="text-sm font-black tracking-tight">{uploading ? 'UPLOADING...' : 'TRANSMIT FILE'}</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{userName} connected to {roomId}</p>
                </div>
                <input type="file" id="drop-file" hidden onChange={(e) => {
                   const file = e.target.files?.[0];
                   if(!file) return;
                   setUploading(true);
                   const fd = new FormData();
                   fd.append('file', file);
                   fd.append('roomId', roomId);
                   fd.append('senderName', userName);
                   fetch(`${BACKEND_URL}/api/upload`, { method:'POST', body: fd }).finally(()=>setUploading(false));
                }} />
                <label htmlFor="drop-file" className="cursor-pointer bg-white text-black p-5 rounded-[2rem] hover:bg-orange-500 hover:text-white transition-all shadow-xl active:scale-90">
                  <Upload size={28} />
                </label>
              </div>
            </div>
          </main>
        </div>
      )}

      {/* CALL SYSTEM OVERLAY */}
      <AnimatePresence>
        {isCalling && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[1000] bg-black">
            <div className="relative w-full h-full">
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none" />
              
              <motion.div drag dragConstraints={{ top: 20, left: 20, right: 20, bottom: 20 }} className="absolute top-10 right-10 z-10">
                <video ref={localVideoRef} autoPlay muted playsInline className="w-48 md:w-64 aspect-video object-cover rounded-[2rem] border-2 border-orange-500 shadow-2xl" />
                <p className="absolute bottom-4 left-4 text-[10px] font-black bg-orange-500 px-2 py-1 rounded text-white uppercase tracking-widest">Aap (You)</p>
              </motion.div>

              <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-8 bg-white/10 backdrop-blur-3xl p-8 rounded-[3.5rem] border border-white/20">
                <button onClick={() => setMicOn(!micOn)} className={cn("p-5 rounded-3xl transition-all", micOn ? "bg-white/10" : "bg-red-600 shadow-[0_0_20px_rgba(220,38,38,0.5)]")}>
                  {micOn ? <Mic size={24}/> : <MicOff size={24}/>}
                </button>
                <button onClick={handleEndCallUI} className="p-7 bg-red-600 rounded-[2.5rem] hover:scale-110 transition-all shadow-[0_20px_40px_rgba(220,38,38,0.3)]">
                  <PhoneOff size={32} className="text-white" />
                </button>
                <button onClick={() => setCameraOn(!cameraOn)} className={cn("p-5 rounded-3xl transition-all", cameraOn ? "bg-white/10" : "bg-red-600 shadow-[0_0_20px_rgba(220,38,38,0.5)]")}>
                  {cameraOn ? <VideoIcon size={24}/> : <VideoOff size={24}/>}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {isReceivingCall && (
          <motion.div initial={{ y: 200, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 200, opacity: 0 }} 
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[1001] bg-[#121215] p-10 rounded-[3.5rem] border-2 border-orange-500/30 shadow-[0_40px_80px_rgba(0,0,0,0.8)] flex items-center gap-12">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em]">Secure Incoming Call</p>
              </div>
              <h3 className="text-4xl font-black">{callSender}</h3>
            </div>
            <div className="flex gap-4">
              <button onClick={acceptCall} className="p-7 bg-green-600 rounded-[2.2rem] hover:bg-green-500 hover:scale-105 transition-all shadow-xl shadow-green-900/40"><Phone size={28}/></button>
              <button onClick={() => setIsReceivingCall(false)} className="p-7 bg-white/5 rounded-[2.2rem] hover:bg-red-600 transition-all"><X size={28}/></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
