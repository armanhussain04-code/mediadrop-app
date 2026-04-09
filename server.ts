import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import multer from "multer";
import path from "path";
import fs from "fs";
import cors from "cors";

const app = express();
const httpServer = createServer(app);

// 1. CORS Setup - Sabhi origins allow kiye taaki Netlify/Frontend se connection na tute
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "DELETE"],
  credentials: true
}));

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
});

const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), "public/uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer config for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/uploads");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ 
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

app.use(express.json());
app.use("/uploads", express.static(uploadsDir));

// Online users tracking
const roomUsers: { [roomId: string]: { [socketId: string]: string } } = {};

// --- API ROUTES ---

// Photo/Video Upload API
app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const { roomId, senderName } = req.body;
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.get('host');

  const fileData = {
    id: Date.now().toString(),
    url: `${protocol}://${host}/uploads/${req.file.filename}`, 
    type: req.file.mimetype.startsWith("image") ? "image" : "video",
    name: req.file.originalname,
    sender: senderName || "Anonymous",
    timestamp: new Date().toISOString(),
  };

  // Sabhi ko batana ki nayi file aayi hai
  io.to(roomId).emit("new-media", fileData);
  res.json(fileData);
});

// Delete Media API
app.delete("/api/media/:roomId/:id", (req, res) => {
  const { roomId, id } = req.params;
  io.to(roomId).emit("media-deleted", id);
  res.json({ success: true });
});

// Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "running", port: PORT });
});

// --- SOCKET.IO LOGIC ---

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("join-room", (data) => {
    const { roomId, userName } = data;
    socket.join(roomId);

    // Room members update
    if (!roomUsers[roomId]) roomUsers[roomId] = {};
    roomUsers[roomId][socket.id] = userName;

    // 1. Notification: Sabko batana ki naya banda aaya hai
    socket.to(roomId).emit("user-joined", userName);

    // 2. Update Online List: Sabko nayi list bhejna
    io.to(roomId).emit("room-users", Object.values(roomUsers[roomId]));
    
    console.log(`${userName} joined ${roomId}`);
  });

  // --- VIDEO CALL SIGNALLING ---

  socket.on("video-offer", (data) => {
    // Caller se Receiver ko data bhejna
    socket.to(data.roomId).emit("video-offer", {
      offer: data.offer,
      sender: data.sender
    });
  });

  socket.on("video-answer", (data) => {
    // Receiver se Caller ko response bhejna
    socket.to(data.roomId).emit("video-answer", {
      answer: data.answer
    });
  });

  socket.on("new-ice-candidate", (data) => {
    // Network path connection setup karna
    socket.to(data.roomId).emit("new-ice-candidate", {
      candidate: data.candidate
    });
  });

  socket.on("end-call", (roomId) => {
    io.to(roomId).emit("end-call");
  });

  // Disconnect handle karna
  socket.on("disconnect", () => {
    for (const roomId in roomUsers) {
      if (roomUsers[roomId][socket.id]) {
        const name = roomUsers[roomId][socket.id];
        delete roomUsers[roomId][socket.id];
        
        // List update karna aur notification dena (optional)
        io.to(roomId).emit("room-users", Object.values(roomUsers[roomId]));
        console.log(`${name} left`);
      }
    }
  });
});

// 5. Start Server
httpServer.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`Server is live on port ${PORT}`);
});
