import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import multer from "multer";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const app = express();
const httpServer = createServer(app);

// 1. CORS Update: Sabhi origins ko allow kiya taaki Netlify se connection na ruke
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
});

// 2. PORT Update: Render apna port process.env.PORT se deta hai
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
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

app.use(express.json());
app.use("/uploads", express.static(path.join(process.cwd(), "public/uploads")));

// Track users in rooms
const roomUsers: { [roomId: string]: { [socketId: string]: string } } = {};

// API Routes
app.post("/api/upload", (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      return res.status(err instanceof multer.MulterError ? 400 : 500).json({ 
        error: err instanceof multer.MulterError ? `Upload error: ${err.message}` : "Server error during upload" 
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const roomId = req.body.roomId;
    const senderName = req.body.senderName || "Anonymous";

    const fileData = {
      id: Date.now().toString(),
      // 3. Absolute URL Update: Backend ka poora URL use karna hoga
      url: `/uploads/${req.file.filename}`, 
      type: req.file.mimetype.startsWith("image") ? "image" : "video",
      name: req.file.originalname,
      sender: senderName,
      timestamp: new Date().toISOString(),
    };

    io.to(roomId).emit("new-media", fileData);
    res.json(fileData);
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", mode: process.env.NODE_ENV || "development", port: PORT });
});

app.delete("/api/media/:roomId/:id", (req, res) => {
  const { roomId, id } = req.params;
  io.to(roomId).emit("media-deleted", id);
  res.json({ success: true });
});

// Socket logic
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", (data: any) => {
    const roomId = typeof data === 'string' ? data : data.roomId;
    const userName = typeof data === 'string' ? 'Anonymous' : data.userName;
    
    socket.join(roomId);
    
    if (!roomUsers[roomId]) roomUsers[roomId] = {};
    roomUsers[roomId][socket.id] = userName;
    
    io.to(roomId).emit("room-users", Object.values(roomUsers[roomId]));
  });

  socket.on("video-offer", (data) => {
    socket.to(data.roomId).emit("video-offer", {
      offer: data.offer,
      sender: data.sender,
      socketId: socket.id
    });
  });

  socket.on("video-answer", (data) => {
    socket.to(data.roomId).emit("video-answer", {
      answer: data.answer,
      socketId: socket.id
    });
  });

  socket.on("new-ice-candidate", (data) => {
    socket.to(data.roomId).emit("new-ice-candidate", {
      candidate: data.candidate,
      socketId: socket.id
    });
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

async function startServer() {
  // 4. Production Check: Render par hamesha production mode use karein
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
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  // 5. Hostname Update: Render ke liye '0.0.0.0' zaroori hai
  httpServer.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
