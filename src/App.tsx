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
  Maximize2,
  VideoOff,
  Phone,
  PhoneOff,
  Mic,
  MicOff
} from 'lucide-react';
import { cn } from './lib/utils';

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
  
  // Video Call State
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
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

  const configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  useEffect(() => {
    socketRef.current = io();

    socketRef.current.on('new-media', (item: MediaItem) => {
      setMedia(prev => [item, ...prev]);
    });

    socketRef.current.on('media-deleted', (id: string) => {
      setMedia(prev => prev.filter(item => item.id !== id));
    });

    // WebRTC Listeners
    socketRef.current.on('video-offer', async (data) => {
      setCallSender(data.sender);
      setIsReceivingCall(true);
      
      // Store offer to use when user accepts
      (window as any).pendingOffer = data;
    });

    socketRef.current.on('video-answer', async (data) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });

    socketRef.current.on('new-ice-candidate', async (data) => {
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error('Error adding ice candidate', e);
        }
      }
    });

    socketRef.current.on('end-call', () => {
      handleEndCall();
    });

    socketRef.current.on('room-users', (users: string[]) => {
      setOnlineUsers(users);
    });

    return () => {
      socketRef.current?.disconnect();
      handleEndCall();
    };
  }, []);

  const createPeerConnection = () => {
    const pc = new RTCPeerConnection(configuration);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('new-ice-candidate', {
          candidate: event.candidate,
          roomId
        });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      setIsCalling(true);

      const pc = createPeerConnection();
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socketRef.current?.emit('video-offer', {
        offer,
        roomId,
        sender: userName
      });
    } catch (err) {
      console.error('Error starting call:', err);
      alert('Could not access camera/microphone');
    }
  };

  const acceptCall = async () => {
    const data = (window as any).pendingOffer;
    if (!data) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      setIsReceivingCall(false);
      setIsCalling(true);

      const pc = createPeerConnection();
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socketRef.current?.emit('video-answer', {
        answer,
        roomId
      });
    } catch (err) {
      console.error('Error accepting call:', err);
      alert('Could not access camera/microphone');
    }
  };

  const handleEndCall = () => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    
    localStream?.getTracks().forEach(track => track.stop());
    setLocalStream(null);
    setRemoteStream(null);
    setIsCalling(false);
    setIsReceivingCall(false);
    setCallSender('');
    
    socketRef.current?.emit('end-call', roomId);
  };

  const toggleMic = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => track.enabled = !micOn);
      setMicOn(!micOn);
    }
  };

  const toggleCamera = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => track.enabled = !cameraOn);
      setCameraOn(!cameraOn);
    }
  };

  const joinRoom = (id: string) => {
    if (!id || id.length < 6) return;
    const finalName = userName.trim() || 'User_' + Math.floor(Math.random() * 1000);
    setUserName(finalName);
    setRoomId(id);
    setJoined(true);
    socketRef.current?.emit('join-room', { roomId: id, userName: finalName });
  };

  const leaveRoom = () => {
    setJoined(false);
    setRoomId('');
    setMedia([]);
    setInputRoomId('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !roomId) return;

    // User requested 500MB, but proxy usually limits to 25-30MB
    const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
    if (file.size > MAX_FILE_SIZE) {
      alert(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max limit is 500MB.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Warning for proxy limits
    if (file.size > 25 * 1024 * 1024) {
      const proceed = confirm(`Note: Files larger than 25MB might fail due to network limits. Do you want to try anyway?`);
      if (!proceed) {
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }

    setUploading(true);
    const formData = new FormData();
    // Append fields BEFORE the file for better compatibility
    formData.append('roomId', roomId);
    formData.append('senderName', userName);
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      const contentType = response.headers.get("content-type");
      if (!response.ok) {
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Upload failed');
        } else {
          const text = await response.text();
          console.error("Server returned non-JSON error:", text.substring(0, 200));
          throw new Error(`Server error (${response.status}). Please try again.`);
        }
      }
      
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Expected JSON but got:", text.substring(0, 200));
        throw new Error("Invalid server response. Please try again.");
      }

      await response.json();
    } catch (error) {
      console.error('Error uploading:', error);
      alert(error instanceof Error ? error.message : 'Upload failed. Please try a smaller file.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deleteMedia = async (id: string) => {
    try {
      await fetch(`/api/media/${roomId}/${id}`, { method: 'DELETE' });
    } catch (error) {
      console.error('Error deleting:', error);
    }
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Long press logic
  const [longPressTarget, setLongPressTarget] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startPress = (id: string) => {
    timerRef.current = setTimeout(() => {
      setLongPressTarget(id);
    }, 600); // 600ms for long press
  };

  const endPress = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <div className="min-h-screen relative flex flex-col">
      <div className="atmosphere" />
      
      {/* Header */}
      <header className="p-6 flex justify-between items-center z-10">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Share2 className="text-white w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">MediaDrop</h1>
        </div>
        
        {joined && (
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 text-[10px] text-white/30 uppercase tracking-widest">
              <span>Best experience in new tab</span>
              <ArrowRight className="w-3 h-3" />
            </div>
            <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
              <span className="text-xs font-medium text-white/50 uppercase tracking-widest">Code</span>
              <span className="font-mono font-bold text-orange-400">{roomId}</span>
              <button 
                onClick={copyRoomId}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-white/70" />}
              </button>
            </div>
            <button 
              onClick={startCall}
              className="p-2 bg-orange-500 hover:bg-orange-600 rounded-full transition-all shadow-lg shadow-orange-500/20"
              title="Start Video Call"
            >
              <Phone className="w-5 h-5 text-white" />
            </button>
            <button 
              onClick={leaveRoom}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 text-sm font-medium transition-all"
            >
              Back
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 z-10">
        {!joined ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md space-y-8 text-center"
          >
            <div className="space-y-4">
              <h2 className="text-5xl font-bold leading-tight">Enter 6-Digit Code</h2>
              <p className="text-white/60 text-lg">Share this code with others to send/receive media.</p>
            </div>

            <div className="grid gap-6">
              <div className="space-y-2 text-left">
                <label className="text-xs uppercase tracking-widest text-white/40 ml-4">Your Name</label>
                <input 
                  type="text" 
                  placeholder="Enter your name"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                />
              </div>

              <div className="space-y-2 text-left">
                <label className="text-xs uppercase tracking-widest text-white/40 ml-4">6-Digit Code</label>
                <input 
                  type="text" 
                  placeholder="CODE12"
                  value={inputRoomId}
                  onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all font-mono text-center tracking-widest text-3xl"
                  maxLength={6}
                />
              </div>

              <button 
                onClick={() => joinRoom(inputRoomId)}
                disabled={inputRoomId.length < 6}
                className="w-full py-5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-all shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2 group"
              >
                Start Sharing
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </motion.div>
        ) : (
          <div className="w-full max-w-6xl flex flex-col h-[calc(100vh-180px)]">
            <div className="flex-1 overflow-y-auto pr-2 space-y-8 scroll-smooth">
              {/* Online Users List */}
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="text-xs font-bold text-white/30 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  Online:
                </span>
                {onlineUsers.map((user, idx) => (
                  <span key={idx} className="text-xs bg-white/5 px-2 py-1 rounded-md border border-white/10 text-white/70">
                    {user} {user === userName && "(You)"}
                  </span>
                ))}
              </div>

              {media.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-40">
                  <div className="w-24 h-24 rounded-full border-2 border-dashed border-white/30 flex items-center justify-center">
                    <Upload className="w-10 h-10" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xl font-medium">Waiting for media...</p>
                    <p className="text-sm">Anyone with code <span className="text-orange-400 font-mono">{roomId}</span> can send files here.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pb-24">
                  <AnimatePresence mode="popLayout">
                    {media.map((item) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="media-card group relative"
                        onMouseDown={() => startPress(item.id)}
                        onMouseUp={endPress}
                        onMouseLeave={endPress}
                        onTouchStart={() => startPress(item.id)}
                        onTouchEnd={endPress}
                        onClick={() => {
                          if (!longPressTarget) setSelectedMedia(item);
                        }}
                      >
                        <div className="aspect-square relative flex items-center justify-center bg-black/20">
                          {item.type === 'image' ? (
                            <img 
                              src={item.url} 
                              alt={item.name} 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full relative">
                              <video src={item.url} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                <Play className="w-12 h-12 fill-white text-white" />
                              </div>
                            </div>
                          )}
                          
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                            <p className="text-sm font-medium truncate">{item.name}</p>
                            <div className="flex justify-between items-center mt-1">
                              <p className="text-[10px] text-orange-400 font-bold uppercase tracking-wider">
                                Sent by {item.sender}
                              </p>
                              <p className="text-[10px] text-white/50">
                                {new Date(item.timestamp).toLocaleTimeString()}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        {/* Desktop Actions */}
                        <div className="absolute top-3 right-3 hidden sm:flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteMedia(item.id);
                            }}
                            className="p-2 bg-red-500/80 backdrop-blur-md rounded-full hover:bg-red-600 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <a 
                            href={item.url} 
                            download 
                            onClick={(e) => e.stopPropagation()}
                            className="p-2 bg-black/60 backdrop-blur-md rounded-full hover:bg-orange-500 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        </div>

                        {/* Long Press Menu Overlay (Mobile) */}
                        <AnimatePresence>
                          {longPressTarget === item.id && (
                            <motion.div 
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="absolute inset-0 z-20 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLongPressTarget(null);
                              }}
                            >
                              <p className="text-xs font-bold uppercase tracking-widest text-white/60 mb-2">Actions</p>
                              <a 
                                href={item.url} 
                                download 
                                className="w-40 py-3 bg-orange-500 text-white rounded-xl font-bold flex items-center justify-center gap-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Download className="w-5 h-5" />
                                Download
                              </a>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteMedia(item.id);
                                  setLongPressTarget(null);
                                }}
                                className="w-40 py-3 bg-red-500 text-white rounded-xl font-bold flex items-center justify-center gap-2"
                              >
                                <X className="w-5 h-5" />
                                Delete
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLongPressTarget(null);
                                }}
                                className="mt-2 text-sm text-white/40"
                              >
                                Cancel
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Upload Bar */}
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-xl px-6">
              <div className="glass-surface p-4 flex items-center gap-4 shadow-2xl shadow-black/50">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all disabled:opacity-50"
                >
                  <Upload className={cn("w-6 h-6", uploading && "animate-bounce")} />
                </button>
                <div className="flex-1">
                  <p className="text-sm font-medium">{uploading ? 'Uploading...' : 'Drop a file to share'}</p>
                  <p className="text-xs text-white/40">Sharing as <span className="text-orange-400 font-bold">{userName}</span> • Max 500MB</p>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                  accept="image/*,video/*"
                />
                <div className="flex gap-2">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                    <ImageIcon className="w-5 h-5 text-orange-400" />
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                    <Video className="w-5 h-5 text-blue-400" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Incoming Call Modal */}
      <AnimatePresence>
        {isReceivingCall && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
          >
            <div className="glass-surface p-8 max-w-sm w-full text-center space-y-6">
              <div className="w-20 h-20 bg-orange-500 rounded-full mx-auto flex items-center justify-center animate-pulse">
                <Phone className="w-10 h-10 text-white" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold">Incoming Call</h3>
                <p className="text-white/60"><span className="text-orange-400 font-bold">{callSender}</span> is calling you...</p>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => setIsReceivingCall(false)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all"
                >
                  Decline
                </button>
                <button 
                  onClick={acceptCall}
                  className="flex-1 py-3 bg-green-500 hover:bg-green-600 rounded-xl font-bold transition-all"
                >
                  Accept
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Video Call Overlay */}
      <AnimatePresence>
        {isCalling && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black flex flex-col"
          >
            {/* Remote Video (Full Screen) */}
            <div className="flex-1 relative bg-zinc-900 overflow-hidden">
              {remoteStream ? (
                <video 
                  ref={el => { if (el) el.srcObject = remoteStream; }}
                  autoPlay 
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center space-y-4">
                  <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center animate-pulse">
                    <Video className="w-10 h-10 text-white/20" />
                  </div>
                  <p className="text-white/40 animate-pulse">Waiting for connection...</p>
                </div>
              )}

              {/* Local Video (Picture in Picture) */}
              <div className="absolute top-6 right-6 w-32 md:w-48 aspect-[3/4] bg-black rounded-2xl overflow-hidden border-2 border-white/10 shadow-2xl z-10">
                {localStream && (
                  <video 
                    ref={el => { if (el) el.srcObject = localStream; }}
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                )}
              </div>

              {/* Call Controls */}
              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-6 z-20">
                <button 
                  onClick={toggleMic}
                  className={cn(
                    "w-14 h-14 rounded-full flex items-center justify-center transition-all",
                    micOn ? "bg-white/10 hover:bg-white/20" : "bg-red-500"
                  )}
                >
                  {micOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                </button>
                
                <button 
                  onClick={handleEndCall}
                  className="w-16 h-16 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition-all shadow-xl shadow-red-500/40"
                >
                  <PhoneOff className="w-8 h-8 text-white" />
                </button>

                <button 
                  onClick={toggleCamera}
                  className={cn(
                    "w-14 h-14 rounded-full flex items-center justify-center transition-all",
                    cameraOn ? "bg-white/10 hover:bg-white/20" : "bg-red-500"
                  )}
                >
                  {cameraOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lightbox */}
      <AnimatePresence>
        {selectedMedia && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 md:p-12"
            onClick={() => setSelectedMedia(null)}
          >
            <button 
              className="absolute top-8 right-8 p-3 hover:bg-white/10 rounded-full transition-colors"
              onClick={() => setSelectedMedia(null)}
            >
              <X className="w-8 h-8" />
            </button>
            
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-full max-h-full flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              {selectedMedia.type === 'image' ? (
                <img 
                  src={selectedMedia.url} 
                  alt={selectedMedia.name} 
                  className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <video 
                  src={selectedMedia.url} 
                  controls 
                  autoPlay 
                  className="max-w-full max-h-[80vh] rounded-lg shadow-2xl"
                />
              )}
              <div className="mt-6 text-center">
                <h3 className="text-xl font-bold">{selectedMedia.name}</h3>
                <p className="text-orange-400 font-bold uppercase tracking-widest text-sm mt-1">Sent by {selectedMedia.sender}</p>
                <p className="text-white/50 text-xs mt-1">{new Date(selectedMedia.timestamp).toLocaleString()}</p>
                <div className="flex flex-wrap gap-4 justify-center mt-6">
                  <a 
                    href={selectedMedia.url} 
                    download 
                    className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 rounded-full font-bold transition-all"
                  >
                    <Download className="w-5 h-5" />
                    Download
                  </a>
                  <button 
                    onClick={() => window.open(selectedMedia.url, '_blank')}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 rounded-full font-bold transition-all border border-white/10"
                  >
                    <Maximize2 className="w-5 h-5" />
                    Open in New Tab
                  </button>
                  <button 
                    onClick={() => {
                      deleteMedia(selectedMedia.id);
                      setSelectedMedia(null);
                    }}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-red-500/20 hover:bg-red-500/40 text-red-400 border border-red-500/30 rounded-full font-bold transition-all"
                  >
                    <X className="w-5 h-5" />
                    Delete
                  </button>
                </div>
                <p className="text-[10px] text-white/30 mt-4 max-w-xs mx-auto">
                  Note: If download fails, use "Open in New Tab" and then save from there.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
