import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, Share2, Download, Phone, PhoneOff, 
  X, Trash2, ShieldCheck, Users, Play
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
  
  // Naya state online modal ke liye
  const [showOnlineModal, setShowOnlineModal] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const [isCalling, setIsCalling] = useState(false);
  const [isReceivingCall, setIsReceivingCall] = useState(false);
  const [callSender, setCallSender] = useState('');

  useEffect(() => {
    socketRef.current = io(BACKEND_URL, {
      transports: ['websocket'],
      upgrade: false
    });

    const socket = socketRef.current;

    socket.on('room-users', (users: string[]) => {
      setOnlineUsers(users);
    });

    socket.on('new-media', (item) => {
      setMedia(prev => [item, ...prev]);
      setNotification(`${item.sender} ne file bheji!`);
      setTimeout(() => setNotification(''), 3000);
    });

    socket.on('media-deleted', (id) => {
      setMedia(prev => prev.filter(m => m.id !== id));
    });

    // Video Signaling (Simplified for structure)
    socket.on('video-offer', (data) => {
      setCallSender(data.sender);
      (window as any).pendingOffer = data.offer;
      setIsReceivingCall(true);
    });

    socket.on('video-answer', (data) => {
      peerConnectionRef.current?.setRemoteDescription(new RTCSessionDescription(data.answer));
    });

    socket.on('new-ice-candidate', (data) => {
      peerConnectionRef.current?.addIceCandidate(new RTCIceCandidate(data.candidate));
    });

    socket.on('end-call', () => {
      setIsCalling(false);
      localStreamRef.current?.getTracks().forEach(t => t.stop());
    });

    return () => { socket.disconnect(); };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !roomId) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('roomId', roomId);
    fd.append('senderName', userName || "User");

    try {
      const res = await fetch(`${BACKEND_URL}/api/upload`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error("Upload Failed");
    } catch (err) {
      alert("Error sending file.");
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const deleteMedia = async (id: string) => {
    try {
      await fetch(`${BACKEND_URL}/api/media/${roomId}/${id}`, { method: 'DELETE' });
    } catch (err) { console.error(err); }
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

  const joinRoom = () => {
    if (!inputRoomId) return;
    setRoomId(inputRoomId);
    setJoined(true);
    socketRef.current?.emit('join-room', { roomId: inputRoomId, userName: userName || 'User' });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white font-sans overflow-hidden relative">
      <AnimatePresence>
        {notification && (
          <motion.div initial={{ y: -50 }} animate={{ y: 20 }} exit={{ y: -50 }} className="fixed top-0 left-1/2 -translate-x-1/2 bg-orange-600 px-6 py-2 rounded-full z-[200] shadow-2xl font-bold">
            {notification}
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- ONLINE USERS MODAL BOX --- */}
      <AnimatePresence>
        {showOnlineModal && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowOnlineModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-[#121215] border border-white/10 rounded-[2.5rem] p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Active Nodes</h3>
                <button onClick={() => setShowOnlineModal(false)} className="p-2 hover:bg-white/5 rounded-full"><X size={20} /></button>
              </div>
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2">
                {onlineUsers.map((user, i) => (
                  <div key={i} className="flex items-center gap-4 bg-white/[0.03] p-4 rounded-2xl border border-white/5">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center text-orange-500 font-bold">{user[0].toUpperCase()}</div>
                    <span className="font-bold truncate">{user} {user === userName && "(You)"}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {!joined ? (
        <div className="flex flex-col items-center justify-center h-screen space-y-8 p-6 text-center">
          <div className="p-8 bg-orange-600 rounded-[2.5rem] rotate-3 shadow-2xl shadow-orange-900/20"><Share2 size={50}/></div>
          <div>
            <h1 className="text-5xl font-black italic tracking-tighter mb-2">MEDIA<span className="text-orange-500">DROP</span></h1>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Secure File Transmission</p>
          </div>
          <div className="w-full max-w-sm space-y-4">
            <input placeholder="Aapka Name" className="w-full p-5 bg-white/5 border border-white/10 rounded-3xl outline-none focus:border-orange-500" onChange={e => setUserName(e.target.value)} />
            <input placeholder="ROOM CODE" className="w-full p-6 bg-white/5 border border-white/10 rounded-3xl text-center text-3xl font-bold outline-none focus:border-orange-500" onChange={e => setInputRoomId(e.target.value.toUpperCase())} />
            <button onClick={joinRoom} className="w-full p-5 bg-orange-600 rounded-3xl font-black uppercase tracking-widest hover:bg-orange-500 transition-all">Initialize Vault</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col h-screen p-4 md:p-6">
          <header className="bg-white/5 border border-white/10 rounded-[2rem] p-4 md:p-6 flex justify-between items-center backdrop-blur-xl mb-4">
            <div className="flex items-center gap-4">
              <div className="hidden md:block p-3 bg-orange-500/10 rounded-2xl text-orange-500"><ShieldCheck /></div>
              <div>
                <h2 className="text-base md:text-xl font-black uppercase tracking-tight">{roomId}</h2>
                {/* --- ONLINE CLICKABLE TEXT --- */}
                <button onClick={() => setShowOnlineModal(true)} className="flex items-center gap-2 mt-0.5">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_#22c55e]" />
                  <span className="text-[10px] text-green-500 font-bold uppercase tracking-widest hover:underline">
                    Online ({onlineUsers.length})
                  </span>
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={startCall} className="p-4 bg-orange-600 rounded-2xl shadow-lg hover:scale-105 transition-all"><Phone size={20}/></button>
              <button onClick={() => setJoined(false)} className="p-4 bg-white/5 rounded-2xl hover:bg-white/10 transition-all"><X size={20}/></button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pb-32">
            <AnimatePresence>
              {media.map(item => (
                <motion.div layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} key={item.id} className="group relative aspect-[4/5] bg-white/5 rounded-[2.5rem] overflow-hidden border border-white/10">
                  {item.type === 'image' ? <img src={item.url} className="w-full h-full object-cover" alt="shared" /> : 
                    <div className="relative w-full h-full flex items-center justify-center"><Play className="text-orange-500 z-10" size={40}/><video src={item.url} className="absolute inset-0 w-full h-full object-cover opacity-50" /></div>
                  }
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent p-6 md:p-8 flex flex-col justify-end">
                    <h4 className="font-bold truncate text-sm md:text-base">{item.name}</h4>
                    <p className="text-[10px] text-orange-500 font-black uppercase tracking-widest mt-1">Shared by {item.sender}</p>
                  </div>
                  <div className="absolute top-6 right-6 flex flex-col gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all">
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="p-4 bg-black/40 backdrop-blur-xl rounded-2xl hover:bg-orange-600"><Download size={18}/></a>
                    <button onClick={() => deleteMedia(item.id)} className="p-4 bg-black/40 backdrop-blur-xl rounded-2xl hover:bg-red-600"><Trash2 size={18}/></button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-md px-6 z-[100]">
            <div className="bg-[#121215]/90 backdrop-blur-3xl border border-white/10 p-4 rounded-[3rem] shadow-2xl flex items-center gap-4">
              <div className="flex-1 px-4">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Transmit</h4>
                <p className="text-sm font-bold truncate">{uploading ? 'Transmitting...' : (userName || 'Active Node')}</p>
              </div>
              <input type="file" id="file-up" hidden onChange={handleFileUpload} />
              <label htmlFor="file-up" className="cursor-pointer bg-white text-black p-5 rounded-[2.2rem] hover:bg-orange-500 hover:text-white transition-all shadow-xl active:scale-95">
                <Upload size={28} />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Video Call Overlay */}
      <AnimatePresence>
        {isCalling && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[2000] bg-black">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <video ref={localVideoRef} autoPlay muted playsInline className="absolute top-10 right-10 w-48 aspect-video rounded-3xl border-2 border-orange-500 shadow-2xl" />
            <button onClick={() => { setIsCalling(false); socketRef.current?.emit('end-call', roomId); }} className="absolute bottom-16 left-1/2 -translate-x-1/2 p-8 bg-red-600 rounded-full shadow-2xl shadow-red-900/40"><PhoneOff size={32}/></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
