# ReadLingo 📖

ReadLingo is a web application designed to help language learners read English books/PDFs seamlessly. Select any unfamiliar word inside a PDF to immediately view its English definition, Hindi translation, phonetic transcription, and an example sentence — with the option to save it to your personal vocabulary.

## Features

- **Authentication:** Signup and Login with JWT authentication and bcrypt password hashing.
- **Client-Side PDF Reader:** Upload and read any PDF document without sending the PDF file to a server.
- **Page Navigation & Zoom:** Fast page flipping, zoom in/out, and reset controls.
- **Interactive Word Selection:** Contextual floating popup appears when selecting any single English word.
- **Dictionary & Translation:** Instant English definition and Hindi meaning via backend APIs.
- **Personal Vocabulary:** Save words explicitly with definitions and review or remove them anytime.

## Tech Stack

- **Frontend:** React 19, Vite, React Router, PDF.js (`pdfjs-dist`), Vanilla CSS
- **Backend:** Node.js, Express.js, MongoDB (Mongoose), JWT, Bcrypt.js

## Getting Started

### Prerequisites
- Node.js (v18+)
- MongoDB running locally or on MongoDB Atlas

### Backend Setup
1. Open terminal in `backend/`:
   ```bash
   cd backend
   npm install
   ```
2. Create `.env` file (refer to `.env.example`):
   ```env
   PORT=5000
   MONGODB_URI=mongodb://127.0.0.1:27017/readlingo
   JWT_SECRET=your_jwt_secret_key
   CLIENT_URL=http://localhost:5173
   ```
3. Start the backend:
   ```bash
   npm run dev
   ```

### Frontend Setup
1. In the root directory:
   ```bash
   npm install
   ```
2. Start the Vite dev server:
   ```bash
   npm run dev
   ```
3. Open [http://localhost:5173](http://localhost:5173) in your browser.
