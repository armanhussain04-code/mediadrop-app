# MediaDrop - Live Video Call & File Sharing

MediaDrop ek modern web application hai jisme aap 6-digit code ke zariye rooms join kar sakte hain, badi files (500MB tak) share kar sakte hain aur live video calls kar sakte hain.

## Features
- **Live Video Call**: WebRTC ke zariye high-quality video aur audio calls.
- **File Sharing**: Photos aur Videos share karein (Max 500MB).
- **Real-time Sync**: Socket.io ke zariye bina refresh kiye data receive karein.
- **Online Users**: Room mein kaun-kaun maujood hai, ye live dekhein.
- **Secure**: 6-digit unique room codes.
- **Responsive**: Mobile aur Desktop dono par perfect chalta hai.

## Tech Stack
- **Frontend**: React.js, Tailwind CSS, Lucide Icons, Framer Motion.
- **Backend**: Node.js, Express, Socket.io (Signaling).
- **Media Handling**: Multer (File Uploads).
- **Real-time**: WebRTC (P2P Video/Audio).

## How to Run Locally
1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000` in your browser.

## Deployment Note
Is app ko host karne ke liye aapko ek Node.js environment chahiye hoga (jaise Render, Heroku, ya VPS). GitHub Pages sirf static HTML support karta hai, isliye wahan video calls aur uploads kaam nahi karenge.
