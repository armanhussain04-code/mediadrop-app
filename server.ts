import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import multer from "multer";
import path from "path";
import fs from "fs";
import cors from "cors";

const app = express();
const httpServer = createServer(app);

app.use(cors({ origin: "*", methods: ["GET", "POST", "DELETE"] }));
app.use(express.json());

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const PORT = process.env.PORT || 3000;

// Upload directory setup
const uploadsDir = path.join(process.cwd(), "public/uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

app.use("/uploads", express.static(uploadsDir));

const roomUsers: { [roomId: string]: { [socketId: string]: string } } = {};

// --- API ROUTES ---

app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });

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

  io.to(roomId).emit("new-media", fileData);
  res.json(fileData);
});

app.delete("/api/media/:roomId/:id", (req, res) => {
  const { roomId, id } = req.params;
  io.to(roomId).emit("media-deleted", id);
  res.json({ success: true });
});

// --- SOCKET LOGIC ---

io.on("connection", (socket) => {
  socket.on("join-room", (data) => {
    const { roomId, userName } = data;
    socket.join(roomId);
    if (!roomUsers[roomId]) roomUsers[roomId] = {};
    roomUsers[roomId][socket.id] = userName;
    
    socket.to(roomId).emit("user-joined", userName);
    io.to(roomId).emit("room-users", Object.values(roomUsers[roomId]));
  });

  socket.on("video-offer", (data) => {
    socket.to(data.roomId).emit("video-offer", { offer: data.offer, sender: data.sender });
  });

  socket.on("video-answer", (data) => {
    socket.to(data.roomId).emit("video-answer", { answer: data.answer });
  });

  socket.on("new-ice-candidate", (data) => {
    socket.to(data.roomId).emit("new-ice-candidate", { candidate: data.candidate });
  });

  socket.on("end-call", (roomId) => io.to(roomId).emit("end-call"));

  socket.on("disconnect", () => {
    for (const roomId in roomUsers) {
      if (roomUsers[roomId][socket.id]) {
        delete roomUsers[roomId][socket.id];
        io.to(roomId).emit("room-users", Object.values(roomUsers[roomId]));
      }
    }
  });
});

// Serving Frontend
const distPath = path.join(process.cwd(), "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
}

httpServer.listen(Number(PORT), "0.0.0.0", () => console.log(`Server live on ${PORT}`));
