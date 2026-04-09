import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import multer from "multer";
import path from "path";
import fs from "fs";
import cors from "cors";
import { createServer as createViteServer } from "vite";

const app = express();
const httpServer = createServer(app);

// 1. CORS Setup
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "DELETE"]
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

// Multer config
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
  limits: { fileSize: 500 * 1024 * 1024 } 
});

app.use(express.json());
// Files ko access karne ke liye static path
app.use("/uploads", express.static(uploadsDir));

const roomUsers: { [roomId: string]: { [socketId: string]: string } } = {};

// --- API Routes (Photo/Video Upload) ---
app.post("/api/upload", (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(500).json({ error: "Upload failed" });
    if (!req.file) return res.status(400).json({ error: "No file" });

    const roomId = req.body.roomId;
    const senderName = req.body.senderName || "Anonymous";

    // Hostname detection for Render
    const host = req.get('host');
    const protocol = req.headers['x-forwarded-proto'] || 'http';

    const fileData = {
      id: Date.now().toString(),
      url: `${protocol}://${host}/uploads/${req.file.filename}`, 
      type: req.file.mimetype.startsWith("image") ? "image" : "video",
      name: req.file.originalname,
      sender: senderName,
      timestamp: new Date().toISOString(),
    };

    io.to(roomId).emit("new-media", fileData);
    res.json(fileData);
  });
});

app.delete("/api/media/:roomId/:id", (req, res) => {
  const { roomId, id } = req.params;
  io.to(roomId).emit("media-deleted", id);
  res.json({ success: true });
});

// --- Socket Logic (Video Call + Real-time) ---
io.on("connection", (socket) => {
  socket.on("join-room", (data: any) => {
    const roomId = typeof data === 'string' ? data : data.roomId;
    const userName = typeof data === 'string' ? 'Anonymous' : data.userName;
    socket.join(roomId);
    if (!roomUsers[roomId]) roomUsers[roomId] = {};
    roomUsers[roomId][socket.id] = userName;
    io.to(roomId).emit("room-users", Object.values(roomUsers[roomId]));
  });

  // Video Call Signaling
  socket.on("video-offer", (data) => {
    socket.to(data.roomId).emit("video-offer", { offer: data.offer, sender: data.sender });
  });

  socket.on("video-answer", (data) => {
    socket.to(data.roomId).emit("video-answer", { answer: data.answer });
  });

  socket.on("new-ice-candidate", (data) => {
    socket.to(data.roomId).emit("new-ice-candidate", { candidate: data.candidate });
  });

  socket.on("end-call", (roomId) => {
    socket.to(roomId).emit("end-call");
  });

  socket.on("disconnect", () => {
    for (const roomId in roomUsers) {
      if (roomUsers[roomId][socket.id]) {
        delete roomUsers[roomId][socket.id];
        io.to(roomId).emit("room-users", Object.values(roomUsers[roomId]));
      }
    }
  });
});

// --- Vite / Production Setup ---
async function startServer() {
  if (process.env.NODE_ENV !== "production" && !process.env.RENDER) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
    }
  }

  httpServer.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
