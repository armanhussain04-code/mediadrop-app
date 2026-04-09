import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, Share2, Download, Play, Phone, PhoneOff, 
  Mic, MicOff, Video as VideoIcon, VideoOff, X, ArrowRight, Trash2, ShieldCheck, Users
} from 'lucide-react';
import { cn } from './lib/utils';

// Replace with your actual Render URL
const BACKEND_URL = "https://mediadrop-app.onrender.com";

export default function App() {
  const [roomId, setRoomId] = useState('');
  const [joined, setJoined] = useState(false);
  const [media, setMedia] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
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
      triggerNotify(`${item.sender} ne ek file share ki!`);
    });

    socketRef.current.on('room-users', (users: string[]) => setOnlineUsers(users));
    
    socketRef.current.on('user-joined', (name: string) => {
      triggerNotify(`${name} room mein enter hua`);
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
  }, [roomId]);

  const triggerNotify = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 4000);
  };

  // Upload Logic
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('roomId', roomId);
    fd.append('senderName', userName || "Anonymous");

    try {
      const response = await fetch(`${BACKEND_URL}/api/upload`, {
        method: 'POST',
        body: fd,
      });
      if (!response.ok) throw new Error("Upload failed");
    } catch (err) {
      triggerNotify("Error: File upload nahi ho saki!");
    } finally {
      setUploading(false);
    }
  };

  // WebRTC Setup
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
    if (inputRoomId.length < 4) {
      triggerNotify("Room Code kam se kam 4 character ka hona chahiye");
      return;
    }
    setRoomId(inputRoomId);
    setJoined(true);
    socketRef.current?.emit('join-room', { roomId: inputRoomId, userName: userName || 'Anon' });
  };

  return (
    <div className="min-h-screen bg-[#08080a] text-slate-100 font-sans selection:bg-orange-500/30">
      <AnimatePresence>
        {notification && (
          <motion.div initial={{ y: -100 }} animate={{ y: 24 }} exit={{ y: -100 }}
            className="fixed top-0 left-1/2 -translate-x-1/2 z-[999] bg-white/10 backdrop-blur-xl border border-white/20 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
            <div className="w-2 h-2 bg-orange-500 rounded-full animate-ping" />
            <span className="text-sm font-semibold">{notification}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {!joined ? (
        <div className="relative flex flex-col items-center justify-center h-screen">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md z-10 px-6">
            <div className="text-center mb-10">
              <div className="w-20 h-20 bg-orange-600 rounded-3xl mx-auto flex items-center justify-center shadow-2xl mb-6 transform -rotate-6">
                <Share2 size={40} className="text-white" />
              </div>
              <h1 className="text-5xl font-black italic tracking-tighter mb-2">MEDIA<span className="text-orange-500">DROP</span></h1>
              <p className="text-slate-500 font-bold text-xs uppercase tracking-widest">Secure Multi-Share Vault</p>
            </div>

            <div className="space-y-4">
              <input type="text" placeholder="Apna Name Likhein" value={userName} onChange={e => setUserName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 p-5 rounded-3xl focus:border-orange-500 outline-none transition-all" />
              
              <input type="text" placeholder="ROOM CODE" value={inputRoomId} onChange={e => setInputRoomId(e.target.value.toUpperCase())}
                className="w-full bg-white/5 border border-white/10 p-6 rounded-3xl text-center text-4xl font-black tracking-widest text-orange-500 outline-none" />

              <button onClick={joinRoom} className="w-full py-5 bg-orange-600 hover:bg-orange-500 rounded-3xl font-black text-lg transition-all active:scale-95 flex items-center justify-center gap-3">
                JOIN VAULT <ArrowRight size={22} />
              </button>
            </div>
          </motion.div>
        </div>
      ) : (
        <div className="flex h-screen p-4 gap-4">
          {/* Sidebar */}
          <aside className="w-72 bg-white/5 border border-white/10 rounded-[2.5rem] p-6 hidden lg:flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest flex items-center gap-2"><Users size={14}/> Online Nodes</h3>
            </div>
            <div className="space-y-3 overflow-y-auto">
              {onlineUsers.map((user, i) => (
                <div key={i} className="flex items-center gap-3 bg-white/5 p-3 rounded-2xl border border-white/5">
                   <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center text-orange-500 font-bold text-xs">{user[0]}</div>
                   <span className="text-sm font-bold truncate">{user}</span>
                </div>
              ))}
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 flex flex-col gap-4 relative">
            <header className="bg-white/5 border border-white/10 rounded-[2rem] p-5 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-orange-500/10 rounded-2xl"><ShieldCheck className="text-orange-500" /></div>
                <div>
                  <h2 className="text-lg font-black">{roomId}</h2>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Encrypted Tunnel</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={startCall} className="p-4 bg-orange-600 rounded-2xl hover:bg-orange-500 transition-all shadow-lg shadow-orange-900/20"><Phone size={20}/></button>
                <button onClick={() => setJoined(false)} className="p-4 bg-white/5 rounded-2xl hover:bg-red-600 transition-all"><X size={20}/></button>
              </div>
            </header>

            {/* Media Grid */}
            <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 pb-28 pr-2">
              <AnimatePresence>
                {media.map((item) => (
                  <motion.div layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                    key={item.id} className="group relative aspect-[4/5] bg-white/5 rounded-[2.5rem] overflow-hidden border border-white/10">
                    {item.type === 'image' ? (
                      <img src={item.url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full bg-slate-900 flex items-center justify-center">
                        <Play size={40} className="text-orange-500 z-10" />
                        <video src={item.url} className="absolute inset-0 w-full h-full object-cover opacity-50" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent p-6 flex flex-col justify-end">
                      <p className="text-xs font-black text-orange-500 uppercase mb-1">{item.type}</p>
                      <h4 className="font-bold truncate text-sm">{item.name}</h4>
                      <p className="text-[10px] text-slate-400 mt-1">Shared by <span className="text-white font-bold">{item.sender}</span></p>
                    </div>
                    <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <a href={item.url} download className="p-3 bg-white/10 backdrop-blur-md rounded-2xl hover:bg-orange-600"><Download size={16} /></a>
                      <button onClick={() => fetch(`${BACKEND_URL}/api/media/${roomId}/${item.id}`, { method: 'DELETE' })}
                        className="p-3 bg-white/10 backdrop-blur-md rounded-2xl hover:bg-red-600"><Trash2 size={16} /></button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Floating Uploader */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-md px-4">
               <div className="bg-[#121215]/90 backdrop-blur-2xl border border-white/10 p-3 rounded-[2.5rem] shadow-2xl flex items-center gap-4">
                  <div className="flex-1 px-4">
                    <p className="text-[10px] font-black text-slate-500 uppercase">Status</p>
                    <h4 className="text-sm font-bold tracking-tight">{uploading ? 'TRANSMITTING...' : 'READY TO SEND'}</h4>
                  </div>
                  <input type="file" id="upload-input" hidden onChange={handleFileUpload} />
                  <label htmlFor="upload-input" className="cursor-pointer bg-white text-black p-4 rounded-3xl hover:bg-orange-500 hover:text-white transition-all shadow-xl">
                    <Upload size={24} />
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
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <motion.div drag className="absolute top-10 right-10 z-10">
              <video ref={localVideoRef} autoPlay muted playsInline className="w-48 aspect-video object-cover rounded-[2rem] border-2 border-orange-500 shadow-2xl" />
            </motion.div>
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-6 bg-white/10 backdrop-blur-3xl p-6 rounded-[3rem] border border-white/20">
              <button onClick={() => setMicOn(!micOn)} className={cn("p-4 rounded-2xl", micOn ? "bg-white/10" : "bg-red-600")}><Mic size={22}/></button>
              <button onClick={handleEndCallUI} className="p-6 bg-red-600 rounded-full shadow-xl"><PhoneOff size={28} /></button>
              <button onClick={() => setCameraOn(!cameraOn)} className={cn("p-4 rounded-2xl", cameraOn ? "bg-white/10" : "bg-red-600")}><VideoIcon size={22}/></button>
            </div>
          </motion.div>
        )}

        {isReceivingCall && (
          <motion.div initial={{ y: 100 }} animate={{ y: 0 }} className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[1001] bg-[#121215] p-8 rounded-[3rem] border border-orange-500 shadow-2xl flex items-center gap-10">
            <div>
              <p className="text-orange-500 text-[10px] font-black uppercase mb-1">Incoming Call</p>
              <h3 className="text-2xl font-black">{callSender}</h3>
            </div>
            <div className="flex gap-3">
              <button onClick={acceptCall} className="p-5 bg-green-600 rounded-2xl shadow-lg shadow-green-900/40"><Phone size={24}/></button>
              <button onClick={() => setIsReceivingCall(false)} className="p-5 bg-white/5 rounded-2xl hover:bg-red-600 transition-all"><X size={24}/></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
