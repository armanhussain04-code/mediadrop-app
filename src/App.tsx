import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, Image as ImageIcon, Video as VideoIcon, Copy, Check, 
  X, ArrowRight, Share2, Download, Play, Phone, PhoneOff, 
  Mic, MicOff, VideoOff, Users, Bell
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

  // Video Call States
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
      showNotification(`${item.sender} shared a ${item.type}`);
    });

    socketRef.current.on('room-users', (users: string[]) => {
      setOnlineUsers(users);
    });

    socketRef.current.on('user-joined', (name: string) => {
      showNotification(`${name} entered the room`);
    });

    // Signaling
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

    return () => { socketRef.current?.disconnect(); };
  }, []);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 4000);
  };

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
    socketRef.current?.emit('join-room', { roomId: inputRoomId, userName: userName || 'User' });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white overflow-hidden font-sans">
      <AnimatePresence>
        {notification && (
          <motion.div initial={{y:-50, opacity:0}} animate={{y:20, opacity:1}} exit={{y:-50, opacity:0}} 
            className="fixed top-0 left-1/2 -translate-x-1/2 z-[100] bg-orange-500 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
            <Bell size={18} /> <span className="font-medium text-sm">{notification}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {!joined ? (
        <div className="flex flex-col items-center justify-center h-screen p-6">
          <motion.div initial={{scale:0.9, opacity:0}} animate={{scale:1, opacity:1}} className="w-full max-w-md space-y-8">
            <div className="text-center space-y-2">
              <div className="w-20 h-20 bg-orange-600 rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-orange-900/20 mb-4">
                <Share2 size={40} />
              </div>
              <h1 className="text-4xl font-black tracking-tight">MediaDrop <span className="text-orange-500">Pro</span></h1>
              <p className="text-slate-500">Secure real-time file sharing & video calls</p>
            </div>
            
            <div className="bg-white/5 p-8 rounded-[2.5rem] border border-white/10 backdrop-blur-xl space-y-6">
              <input type="text" placeholder="Enter Name" value={userName} onChange={e => setUserName(e.target.value)}
                className="w-full bg-black/40 border border-white/10 p-4 rounded-2xl focus:ring-2 ring-orange-500 outline-none transition-all" />
              <input type="text" placeholder="6-Digit Code" maxLength={6} value={inputRoomId} onChange={e => setInputRoomId(e.target.value.toUpperCase())}
                className="w-full bg-black/40 border border-white/10 p-4 rounded-2xl text-center text-3xl font-mono tracking-widest outline-none" />
              <button onClick={joinRoom} className="w-full py-4 bg-orange-600 hover:bg-orange-500 rounded-2xl font-bold transition-all shadow-xl shadow-orange-900/40 flex items-center justify-center gap-2">
                Join Room <ArrowRight size={20} />
              </button>
            </div>
          </motion.div>
        </div>
      ) : (
        <div className="flex h-screen">
          {/* Sidebar */}
          <div className="w-72 bg-white/5 border-r border-white/10 p-6 hidden lg:flex flex-col gap-8">
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Users size={14} /> Online Members
              </h3>
              <div className="space-y-2">
                {onlineUsers.map((user, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                    <div className="w-8 h-8 rounded-full bg-orange-500/20 text-orange-500 flex items-center justify-center font-bold text-xs">
                      {user[0]}
                    </div>
                    <span className="text-sm font-medium">{user} {user === userName && "(You)"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col relative">
            <header className="p-6 flex justify-between items-center border-b border-white/5">
              <div>
                <h2 className="text-xl font-bold">Room: <span className="text-orange-500">{roomId}</span></h2>
                <p className="text-xs text-slate-500">Encryption Active • Peer-to-Peer</p>
              </div>
              <div className="flex gap-4">
                <button onClick={startCall} className="p-3 bg-orange-600 rounded-2xl hover:bg-orange-500 transition-all shadow-lg shadow-orange-900/20">
                  <Phone size={20} />
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 pb-32">
              {media.map((item) => (
                <motion.div layout initial={{scale:0.9, opacity:0}} animate={{scale:1, opacity:1}} key={item.id} className="group relative aspect-square bg-white/5 rounded-[2rem] overflow-hidden border border-white/10">
                  {item.type === 'image' ? (
                    <img src={item.url} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center relative bg-black/40">
                      <Play size={40} className="text-orange-500" />
                      <video src={item.url} className="absolute inset-0 w-full h-full object-cover opacity-30" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent p-6 flex flex-col justify-end">
                    <p className="text-sm font-bold truncate">{item.name}</p>
                    <p className="text-[10px] text-orange-500 font-black uppercase mt-1">Shared by {item.sender}</p>
                  </div>
                  <a href={item.url} download className="absolute top-4 right-4 p-3 bg-white/10 backdrop-blur-md rounded-2xl opacity-0 group-hover:opacity-100 transition-all hover:bg-orange-600">
                    <Download size={18} />
                  </a>
                </motion.div>
              ))}
            </div>

            {/* Bottom Bar */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-2xl px-6">
              <div className="bg-white/10 backdrop-blur-2xl p-4 rounded-[2.5rem] border border-white/10 shadow-2xl flex items-center gap-4">
                <div className="flex-1 px-4">
                  <p className="text-sm font-bold">{uploading ? "Sending..." : "Share new media"}</p>
                  <p className="text-[10px] text-slate-400">Images or Videos up to 500MB</p>
                </div>
                <input type="file" id="file" hidden onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  const fd = new FormData();
                  fd.append('file', file);
                  fd.append('roomId', roomId);
                  fd.append('senderName', userName);
                  fetch(`${BACKEND_URL}/api/upload`, { method: 'POST', body: fd }).finally(() => setUploading(false));
                }} />
                <label htmlFor="file" className="cursor-pointer bg-orange-600 p-4 rounded-3xl hover:bg-orange-500 transition-all shadow-xl shadow-orange-900/20">
                  <Upload size={24} />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Video Call Overlay */}
      <AnimatePresence>
        {isCalling && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[200] bg-black flex flex-col">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <video ref={localVideoRef} autoPlay muted playsInline className="absolute top-8 right-8 w-48 aspect-video object-cover rounded-3xl border-2 border-orange-500 shadow-2xl" />
            
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex gap-6 bg-white/5 backdrop-blur-xl p-6 rounded-[3rem] border border-white/10">
              <button onClick={() => setMicOn(!micOn)} className={cn("p-4 rounded-2xl transition-all", micOn ? "bg-white/10" : "bg-red-600")}>
                {micOn ? <Mic /> : <MicOff />}
              </button>
              <button onClick={handleEndCallUI} className="p-4 bg-red-600 rounded-2xl hover:scale-110 transition-all shadow-xl shadow-red-900/40">
                <PhoneOff />
              </button>
              <button onClick={() => setCameraOn(!cameraOn)} className={cn("p-4 rounded-2xl transition-all", cameraOn ? "bg-white/10" : "bg-red-600")}>
                {cameraOn ? <VideoIcon /> : <VideoOff />}
              </button>
            </div>
          </motion.div>
        )}

        {isReceivingCall && (
          <motion.div initial={{y:100, opacity:0}} animate={{y:0, opacity:1}} exit={{y:100, opacity:0}} 
            className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[300] bg-slate-900/90 backdrop-blur-xl p-8 rounded-[3rem] border border-orange-500/50 shadow-2xl flex items-center gap-10">
            <div>
              <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Incoming Call</p>
              <h3 className="text-2xl font-bold">{callSender}</h3>
            </div>
            <div className="flex gap-4">
              <button onClick={acceptCall} className="p-5 bg-green-600 rounded-3xl hover:bg-green-500 transition-all shadow-lg shadow-green-900/40"><Phone /></button>
              <button onClick={() => setIsReceivingCall(false)} className="p-5 bg-red-600 rounded-3xl hover:bg-red-500 transition-all"><X /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
