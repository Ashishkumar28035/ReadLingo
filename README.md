# ReadLingo 📖

ReadLingo is a modern, privacy-focused web application designed to help English learners read books and PDFs seamlessly. Select any unfamiliar word or full sentence in a PDF to view its English definition, Hindi translation, phonetic audio pronunciation, and example usage — with the ability to save words to your personal vocabulary and master them through interactive practice modes with real-time grammar checking.

---

## 🌟 Key Features

### 1. Client-Side PDF Reader & Draggable Lookup
- **Privacy-First PDF Reading**: Read any PDF directly in the browser via PDF.js. PDF documents are processed completely client-side and are **never uploaded or stored** on the server.
- **Draggable Contextual Popup**: Floating meaning popup with a dedicated drag handle so you can easily move it anywhere on the screen without covering underlying text.
- **Instant Word & Sentence Understanding**:
  - Single-word lookup with English definitions, parts of speech, Hindi translations, and phonetic transcription.
  - Sentence understanding popup for multi-word or full sentence selections.
  - Native text-to-speech audio pronunciation with active voice playback indicators.
- **PDF Navigation Controls**: Page navigation, discrete zoom levels (60% to 120%), and responsive layout.

### 2. Personal Vocabulary Library (`/vocabulary`)
- **Save Unfamiliar Words**: Save words directly from the reader popup with clean definitions and Hindi meanings.
- **Library Management**: Search, sort, review, and delete saved words at any time.
- **Strict User Isolation**: Every user's saved vocabulary is strictly isolated and accessible only to their authenticated account.

### 3. Interactive Vocabulary Practice Hub (`/practice`)
Transform saved words into active recall exercises across three distinct training modes:

- **Multiple Choice Quiz (MCQ)**:
  - 4 distinct options per question with distractors selected from the user's other saved vocabulary.
  - Alternates between *English Word $\rightarrow$ Hindi Meaning* and *Hindi Meaning $\rightarrow$ English Word*.
  - Randomized option placement and immediate visual answer feedback.
- **Meaning Recall Flashcards**:
  - Active recall training with a flip-to-reveal card interface.
  - Self-assessment tracking (*"I Knew It"* vs *"Need Practice"*).
  - Full keyboard shortcut support (`Space` to reveal, `[1]` for Need Practice, `[2]` for Known).
- **Sentence Formation with Real-Time Grammar Validation**:
  - **Decoupled Validation**: Checks both target word usage and sentence completeness independently from grammatical correctness.
  - **Word Family & Inflection Support**: Accepts legitimate inflections (e.g. for `sharing`, accepts `share`, `shares`, `shared`, and `sharing`) while keeping distinct grammatical categories separate (e.g. `immediate` vs `immediately`).
  - **Real Grammar Evaluation**: Integrates with LanguageTool on the backend to detect agreement errors, incorrect infinitive forms, missing auxiliaries, and punctuation issues.
  - **Actionable Feedback**: Displays grammar issue notices with specific suggestions (e.g. *“Suggestion: share”*) and provides an in-place *“✏️ Edit Sentence”* button to revise and resubmit.
  - **Contextual Reference Examples**: Automatically displays natural contextual example sentences when saved dictionary examples are missing.
- **Session Results & Targeted Retry**:
  - Comprehensive summary screen calculating accuracy percentage and performance breakdown.
  - One-click *“Practice Missed Words Only”* button to quickly reinforce difficult terms.

### 4. Hardened Security & Architecture
- **Cryptographic JWT Validation**: Startup validation enforcing $\ge 32$-character cryptographically strong secrets in production, blocking known default placeholders.
- **Standard Security Headers**: Powered by Helmet (Frameguard `DENY`, `nosniff`, strict Referrer-Policy, HSTS 180 days, and Cross-Origin Resource Policy).
- **Rate Limiting**: Protects sensitive endpoints with IP-based throttling for authentication and word lookup routes.
- **Zero Injections / XSS Defense**: Zero use of `dangerouslySetInnerHTML`; all inputs and outputs are sanitized and HTML-escaped.
- **Sanitized Error Handling**: Suppresses server stack traces in production and prevents leakage of internal paths or credentials.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, React Router v7, PDF.js (`pdfjs-dist`), Vanilla CSS (custom design system)
- **Backend**: Node.js (ES Modules), Express.js, MongoDB (Mongoose), Helmet, JWT, Bcrypt.js
- **Grammar & Language Services**: LanguageTool Public API, Google Translate API, MyMemory Translation API, Free Dictionary API
- **Tooling & Quality Assurance**: `oxlint` (linter), Node.js native test runner (`node:test`)

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **MongoDB**: Local MongoDB instance (`mongodb://127.0.0.1:27017`) or a MongoDB Atlas connection string

---

### Backend Setup

1. Open a terminal and navigate to the `backend/` directory:
   ```bash
   cd backend
   npm install
   ```

2. Configure environment variables in `backend/.env` (refer to `.env.example`):
   ```env
   PORT=5000
   MONGODB_URI=mongodb://127.0.0.1:27017/readlingo
   JWT_SECRET=your_super_strong_random_jwt_secret_at_least_32_characters_long
   NODE_ENV=development
   CLIENT_URL=http://localhost:5173
   ```

3. Start the backend server:
   ```bash
   npm run dev
   ```
   *The backend will be available at [http://localhost:5000](http://localhost:5000).*

---

### Frontend Setup

1. From the project root directory:
   ```bash
   npm install
   ```

2. Start the Vite development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Testing & Verification

The project includes an extensive automated test suite covering authentication security, vocabulary isolation, practice logic, and grammar checking regression cases:

```bash
# Run all backend unit, integration, and security tests (86 tests)
npm test

# Run frontend linting (oxlint)
npm run lint

# Build client for production
npm run build

# Run security audits
npm audit
npm --prefix backend audit
```

---

## 📁 Project Structure

```text
ReadLingo/
├── backend/
│   ├── src/
│   │   ├── config/          # Database and JWT strength validation
│   │   ├── controllers/     # Auth, Vocabulary, Word Lookup, Grammar controllers
│   │   ├── middlewares/     # Auth protection, Helmet, Rate limiters, Error handling
│   │   ├── models/          # User and Vocabulary Mongoose schemas
│   │   ├── routes/          # Auth, Word, and Vocabulary Express routes
│   │   ├── utils/           # Text and Hindi sanitizers
│   │   ├── app.js           # Express app configuration
│   │   └── server.js        # Server bootstrap and pre-flight checks
│   └── test/                # Automated regression, security, and practice test suites
├── src/
│   ├── components/          # Reusable UI components (ProtectedRoute, etc.)
│   ├── pages/
│   │   ├── Login.jsx        # Login page
│   │   ├── Signup.jsx       # Signup page
│   │   ├── Reader.jsx       # Client-side PDF reader with draggable lookup popup
│   │   ├── Vocabulary.jsx   # Saved vocabulary library management
│   │   └── Practice.jsx     # MCQ, Meaning Recall, and Sentence Formation practice
│   ├── services/            # Client-side API request service
│   ├── utils/
│   │   └── practiceUtils.js # MCQ generator, Word family expansion, Contextual examples
│   ├── App.jsx              # Application routes
│   └── index.css            # Custom CSS design system and responsive styles
└── README.md
```

---

## 📄 License

This project is licensed under the MIT License.
