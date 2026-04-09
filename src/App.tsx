import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Send, 
  Image as ImageIcon, 
  Video, 
  Copy, 
  Check, 
  X, 
  ArrowRight,
  Share2,
  Download,
  Play,
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff
} from 'lucide-react';
import { cn } from './lib/utils';

// Backend URL - Update if different
const BACKEND_URL = "https://mediadrop-app.onrender.com";

interface MediaItem {
  id: string;
  url: string;
  type: 'image' | 'video';
  name: string;
  sender: string;
  timestamp: string;
}

export default function App() {
  const [roomId, setRoomId] = useState<string>('');
  const [joined, setJoined] = useState(false);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inputRoomId, setInputRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  
  // Video Call States
  const [isCalling, setIsCalling] = useState(false);
  const [isReceivingCall, setIsReceivingCall] = useState(false);
  const [callSender, setCallSender] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  
  const socketRef = useRef<Socket | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  };

  useEffect(() => {
    socketRef.current = io(BACKEND_URL);

    socketRef.current.on('new-media', (item: MediaItem) => {
      setMedia(prev => [item, ...prev]);
    });

    // WebRTC Signaling Listeners
    socketRef.current.on('video-offer', async (data) => {
      setCallSender(data.sender);
      setIsReceivingCall(true);
      (window as any).pendingOffer = data.offer;
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

    socketRef.current.on('end-call', () => handleEndCallUI());

    socketRef.current.on('room-users', (users: string[]) => setOnlineUsers(users));

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  // WebRTC Logic
  const setupPeerConnection = (stream: MediaStream) => {
    const pc = new RTCPeerConnection(configuration);
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('new-ice-candidate', { candidate: event.candidate, roomId });
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      
      setIsCalling(true);
      const pc = setupPeerConnection(stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socketRef.current?.emit('video-offer', { offer, roomId, sender: userName });
    } catch (err) {
      alert("Camera/Mic access denied!");
    }
  };

  const acceptCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setIsReceivingCall(false);
      setIsCalling(true);

      // Wait for UI to render video elements
      setTimeout(async () => {
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        const pc = setupPeerConnection(stream);
        await pc.setRemoteDescription(new RTCSessionDescription((window as any).pendingOffer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketRef.current?.emit('video-answer', { answer, roomId });
      }, 500);
    } catch (err) {
      alert("Error accepting call");
    }
  };

  const handleEndCallUI = () => {
    peerConnectionRef.current?.close();
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    setIsCalling(false);
    setIsReceivingCall(false);
    socketRef.current?.emit('end-call', roomId);
  };

  const joinRoom = (id: string) => {
    if (id.length < 6) return;
    const name = userName || 'User_' + Math.floor(Math.random() * 100);
    setUserName(name);
    setRoomId(id);
    setJoined(true);
    socketRef.current?.emit('join-room', { roomId: id, userName: name });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('roomId', roomId);
    formData.append('senderName', userName);

    try {
      await fetch(`${BACKEND_URL}/api/upload`, { method: 'POST', body: formData });
    } catch (err) {
      alert("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans p-4">
      {!joined ? (
        <div className="max-w-md mx-auto mt-20 space-y-6">
          <h1 className="text-3xl font-bold text-center">MediaDrop</h1>
          <input 
            className="w-full p-4 rounded-xl bg-slate-900 border border-slate-800"
            placeholder="Your Name" value={userName} onChange={e => setUserName(e.target.value)}
          />
          <input 
            className="w-full p-4 rounded-xl bg-slate-900 border border-slate-800 text-center text-2xl font-mono"
            placeholder="6-DIGIT CODE" maxLength={6} value={inputRoomId} onChange={e => setInputRoomId(e.target.value.toUpperCase())}
          />
          <button onClick={() => joinRoom(inputRoomId)} className="w-full p-4 bg-orange-600 rounded-xl font-bold">Join Room</button>
        </div>
      ) : (
        <div className="max-w-5xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-xl font-bold">Room: {roomId}</h2>
              <p className="text-sm text-slate-400">{onlineUsers.length} online</p>
            </div>
            <div className="flex gap-3">
              <button onClick={startCall} className="p-3 bg-green-600 rounded-full"><Phone size={20}/></button>
              <button onClick={() => setJoined(false)} className="px-4 py-2 bg-slate-800 rounded-lg">Leave</button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {media.map(item => (
              <div key={item.id} className="aspect-square bg-slate-900 rounded-xl overflow-hidden relative group">
                {item.type === 'image' ? <img src={item.url} className="w-full h-full object-cover" /> : <video src={item.url} className="w-full h-full object-cover" />}
                <div className="absolute bottom-0 p-2 bg-black/60 w-full text-xs">
                  {item.name} <br/> <span className="text-orange-400">by {item.sender}</span>
                </div>
                <a href={item.url} download className="absolute top-2 right-2 p-2 bg-orange-600 rounded-full opacity-0 group-hover:opacity-100 transition"><Download size={14}/></a>
              </div>
            ))}
          </div>

          <div className="fixed bottom-6 left-1/2 -translate-x-1/2">
            <input type="file" ref={fileInputRef} hidden onChange={handleFileUpload} />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="px-8 py-4 bg-orange-600 rounded-full font-bold shadow-xl flex items-center gap-2"
            >
              {uploading ? "Uploading..." : <><Upload size={20}/> Send Media</>}
            </button>
          </div>
        </div>
      )}

      {/* CALL UI */}
      <AnimatePresence>
        {isCalling && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
            <div className="relative w-full h-full">
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <video ref={localVideoRef} autoPlay muted playsInline className="absolute top-4 right-4 w-32 md:w-48 aspect-video object-cover rounded-lg border-2 border-orange-500" />
              
              <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-6">
                <button onClick={() => setMicOn(!micOn)} className={cn("p-4 rounded-full", micOn ? "bg-slate-800" : "bg-red-600")}>
                  {micOn ? <Mic /> : <MicOff />}
                </button>
                <button onClick={handleEndCallUI} className="p-4 bg-red-600 rounded-full"><PhoneOff /></button>
                <button onClick={() => setCameraOn(!cameraOn)} className={cn("p-4 rounded-full", cameraOn ? "bg-slate-800" : "bg-red-600")}>
                  {cameraOn ? <VideoIcon /> : <VideoOff />}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {isReceivingCall && (
          <motion.div initial={{y:100}} animate={{y:0}} className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-slate-900 p-6 rounded-2xl border border-orange-500 shadow-2xl flex items-center gap-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-orange-500 font-bold">Incoming Call</p>
              <p className="text-xl font-bold">{callSender} is calling...</p>
            </div>
            <div className="flex gap-3">
              <button onClick={acceptCall} className="p-4 bg-green-600 rounded-full"><Phone /></button>
              <button onClick={() => setIsReceivingCall(false)} className="p-4 bg-red-600 rounded-full"><X /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
