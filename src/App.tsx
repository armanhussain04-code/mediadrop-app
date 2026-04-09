import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, Share2, Download, Play, Phone, PhoneOff, 
  Mic, MicOff, Video as VideoIcon, VideoOff, X, ArrowRight, Trash2, ShieldCheck, Users
} from 'lucide-react';

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

  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    socketRef.current = io(BACKEND_URL);

    // Nayi file aane par list update
    socketRef.current.on('new-media', (item) => {
      setMedia(prev => [item, ...prev]);
      setNotification(`${item.sender} ne file share ki!`);
      setTimeout(() => setNotification(''), 3000);
    });

    // Online users ki list update
    socketRef.current.on('room-users', (users: string[]) => {
      setOnlineUsers(users);
    });

    socketRef.current.on('user-joined', (name) => {
      setNotification(`${name} join hua`);
      setTimeout(() => setNotification(''), 3000);
    });

    socketRef.current.on('media-deleted', (id) => {
      setMedia(prev => prev.filter(m => m.id !== id));
    });

    // Video Signaling
    socketRef.current.on('video-offer', (data) => {
      setCallSender(data.sender);
      (window as any).pendingOffer = data.offer;
      setIsReceivingCall(true);
    });

    socketRef.current.on('video-answer', (data) => {
      peerConnectionRef.current?.setRemoteDescription(new RTCSessionDescription(data.answer));
    });

    socketRef.current.on('new-ice-candidate', (data) => {
      peerConnectionRef.current?.addIceCandidate(new RTCIceCandidate(data.candidate));
    });

    socketRef.current.on('end-call', () => {
      setIsCalling(false);
      localStreamRef.current?.getTracks().forEach(t => t.stop());
    });

    return () => { socketRef.current?.disconnect(); };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('roomId', roomId);
    fd.append('senderName', userName || "User");

    try {
      await fetch(`${BACKEND_URL}/api/upload`, { method: 'POST', body: fd });
    } catch (err) {
      alert("Upload failed!");
    } finally {
      setUploading(false);
    }
  };

  const deleteMedia = async (id: string) => {
    await fetch(`${BACKEND_URL}/api/media/${roomId}/${id}`, { method: 'DELETE' });
  };

  const startCall = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    setIsCalling(true);
    setTimeout(() => {
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pc.onicecandidate = (e) => e.candidate && socketRef.current?.emit('new-ice-candidate', { candidate: e.candidate, roomId });
      pc.ontrack = (e) => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0]; };
      pc.createOffer().then(o => { pc.setLocalDescription(o); socketRef.current?.emit('video-offer', { offer: o, roomId, sender: userName }); });
      peerConnectionRef.current = pc;
    }, 500);
  };

  const acceptCall = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    setIsReceivingCall(false);
    setIsCalling(true);
    setTimeout(async () => {
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pc.onicecandidate = (e) => e.candidate && socketRef.current?.emit('new-ice-candidate', { candidate: e.candidate, roomId });
      pc.ontrack = (e) => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0]; };
      await pc.setRemoteDescription(new RTCSessionDescription((window as any).pendingOffer));
      const a = await pc.createAnswer();
      await pc.setLocalDescription(a);
      socketRef.current?.emit('video-answer', { answer: a, roomId });
      peerConnectionRef.current = pc;
    }, 500);
  };

  return (
    <div className="min-h-screen bg-[#08080a] text-white font-sans">
      <AnimatePresence>
        {notification && (
          <motion.div initial={{ y: -50 }} animate={{ y: 20 }} exit={{ y: -50 }} className="fixed top-0 left-1/2 -translate-x-1/2 bg-orange-600 px-6 py-2 rounded-full z-50 shadow-2xl font-bold">
            {notification}
          </motion.div>
        )}
      </AnimatePresence>

      {!joined ? (
        <div className="flex flex-col items-center justify-center h-screen space-y-8">
          <div className="p-8 bg-orange-600 rounded-[2.5rem] shadow-orange-900/20 shadow-2xl rotate-3"><Share2 size={50}/></div>
          <h1 className="text-5xl font-black italic tracking-tighter">MEDIA<span className="text-orange-500">DROP</span></h1>
          <div className="w-full max-w-sm space-y-4 px-6">
            <input placeholder="Enter Name" className="w-full p-5 bg-white/5 border border-white/10 rounded-3xl outline-none focus:border-orange-500" onChange={e => setUserName(e.target.value)} />
            <input placeholder="ROOM CODE" className="w-full p-6 bg-white/5 border border-white/10 rounded-3xl text-center text-3xl font-bold outline-none focus:border-orange-500" onChange={e => setInputRoomId(e.target.value.toUpperCase())} />
            <button onClick={() => { setRoomId(inputRoomId); setJoined(true); socketRef.current?.emit('join-room', { roomId: inputRoomId, userName: userName || 'User' }); }} className="w-full p-5 bg-orange-600 rounded-3xl font-black uppercase tracking-widest shadow-xl shadow-orange-900/40">Initialize</button>
          </div>
        </div>
      ) : (
        <div className="flex h-screen p-4 gap-4 overflow-hidden">
          {/* Sidebar - ONLINE USERS */}
          <aside className="w-72 bg-white/5 border border-white/10 rounded-[2.5rem] p-8 hidden lg:flex flex-col">
            <h3 className="text-xs font-black text-slate-500 tracking-[0.2em] mb-6 flex items-center gap-2 uppercase"><Users size={14}/> Online Nodes</h3>
            <div className="flex-1 space-y-3 overflow-y-auto">
              {onlineUsers.map((user, i) => (
                <div key={i} className="flex items-center gap-4 bg-white/[0.03] p-4 rounded-2xl border border-white/5">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center text-orange-500 font-black">{user[0]}</div>
                  <span className="text-sm font-bold truncate">{user}</span>
                </div>
              ))}
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 flex flex-col gap-4 relative">
            <header className="bg-white/5 border border-white/10 rounded-[2rem] p-6 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-orange-500/10 rounded-2xl"><ShieldCheck className="text-orange-500" /></div>
                <div><h2 className="text-xl font-black">{roomId}</h2><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Secure Vault</p></div>
              </div>
              <div className="flex gap-2">
                <button onClick={startCall} className="p-4 bg-orange-600 rounded-2xl shadow-lg"><Phone/></button>
                <button onClick={() => setJoined(false)} className="p-4 bg-white/5 rounded-2xl"><X/></button>
              </div>
            </header>

            {/* Grid for Media */}
            <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 pb-32 pr-2">
              <AnimatePresence>
                {media.map(item => (
                  <motion.div layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} key={item.id} className="group relative aspect-[4/5] bg-white/5 rounded-[2.5rem] overflow-hidden border border-white/10">
                    {item.type === 'image' ? <img src={item.url} className="w-full h-full object-cover" /> : <video src={item.url} className="w-full h-full object-cover" />}
                    
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent p-8 flex flex-col justify-end">
                      <h4 className="font-bold truncate text-lg">{item.name}</h4>
                      <p className="text-xs text-orange-500 font-black uppercase">Shared by {item.sender}</p>
                    </div>

                    {/* Actions: Download & Delete */}
                    <div className="absolute top-6 right-6 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <a href={item.url} target="_blank" rel="noopener noreferrer" download className="p-4 bg-white/10 backdrop-blur-xl rounded-2xl hover:bg-orange-600 transition-all">
                        <Download size={20} />
                      </a>
                      <button onClick={() => deleteMedia(item.id)} className="p-4 bg-white/10 backdrop-blur-xl rounded-2xl hover:bg-red-600 transition-all">
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Bottom Floating Uploader */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-lg px-6">
              <div className="bg-[#121215]/90 backdrop-blur-3xl border border-white/10 p-4 rounded-[3rem] shadow-2xl flex items-center gap-4">
                <div className="flex-1 px-4">
                  <h4 className="text-sm font-black tracking-tight uppercase">{uploading ? 'Transmitting...' : 'Send Media'}</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{userName} Connected</p>
                </div>
                <input type="file" id="up-file" hidden onChange={handleFileUpload} />
                <label htmlFor="up-file" className="cursor-pointer bg-white text-black p-5 rounded-[2.2rem] hover:bg-orange-500 hover:text-white transition-all active:scale-90">
                  <Upload size={28} />
                </label>
              </div>
            </div>
          </main>
        </div>
      )}

      {/* Video Call UI Overlay */}
      <AnimatePresence>
        {isCalling && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[1000] bg-black">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <video ref={localVideoRef} autoPlay muted playsInline className="absolute top-10 right-10 w-48 aspect-video rounded-3xl border-2 border-orange-500 shadow-2xl" />
            <button onClick={() => { setIsCalling(false); socketRef.current?.emit('end-call', roomId); }} className="absolute bottom-16 left-1/2 -translate-x-1/2 p-8 bg-red-600 rounded-full shadow-2xl shadow-red-900/40"><PhoneOff size={32}/></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
