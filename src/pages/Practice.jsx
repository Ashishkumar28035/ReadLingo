import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getVocabulary } from "../services/api";

function shuffleArray(arr) {
    const array = [...arr];
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function formatDisplayText(text) {
    if (!text || typeof text !== "string") return "";
    return text
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/\.mw-parser-output[^{}]*\{[^}]*\}/gi, "")
        .replace(/\{[a-zA-Z\-_\s]+:[^}]+\}/gi, "")
        .replace(/\.defdate\s*\{[^}]*\}/gi, "")
        .replace(/\.mw-[a-zA-Z0-9_-]+/gi, "")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function formatDisplayHindi(raw, term = "") {
    if (!raw || typeof raw !== "string") return "";
    let str = formatDisplayText(raw);
    if (/[\u0900-\u097F]/.test(str)) {
        str = str.replace(/([\u0900-\u097F])[a-zA-Z].*$/, "$1");
        str = str.replace(/[a-zA-Z0-9_\-.:#@]+/g, "");
        str = str.replace(/\(\s*\)/g, "").replace(/\[\s*\]/g, "");
        str = str.replace(/^[\s,./|\-–—:]+|[\s,./|\-–—:]+$/g, "").trim();
    }
    if (term && str.toLowerCase() === term.toLowerCase()) return "";
    return str;
}

function Practice() {
    const navigate = useNavigate();
    const [allWords, setAllWords] = useState([]);
    const [sessionWords, setSessionWords] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isRevealed, setIsRevealed] = useState(false);
    const [knownCount, setKnownCount] = useState(0);
    const [needPracticeCount, setNeedPracticeCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login");
    };

    const startNewSession = useCallback((wordsList) => {
        const words = wordsList && wordsList.length > 0 ? wordsList : allWords;
        if (!words || words.length === 0) return;

        const shuffled = shuffleArray(words);
        setSessionWords(shuffled);
        setCurrentIndex(0);
        setIsRevealed(false);
        setKnownCount(0);
        setNeedPracticeCount(0);
    }, [allWords]);

    const handleRetry = async () => {
        try {
            setLoading(true);
            setError("");
            const data = await getVocabulary();
            const list = Array.isArray(data) ? data : [];
            setAllWords(list);
            if (list.length > 0) {
                const shuffled = shuffleArray(list);
                setSessionWords(shuffled);
                setCurrentIndex(0);
                setIsRevealed(false);
                setKnownCount(0);
                setNeedPracticeCount(0);
            }
        } catch (err) {
            setError(err.message || "Failed to load vocabulary for practice");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let isMounted = true;
        const load = async () => {
            try {
                const data = await getVocabulary();
                if (!isMounted) return;
                const list = Array.isArray(data) ? data : [];
                setAllWords(list);
                if (list.length > 0) {
                    const shuffled = shuffleArray(list);
                    setSessionWords(shuffled);
                    setCurrentIndex(0);
                    setIsRevealed(false);
                    setKnownCount(0);
                    setNeedPracticeCount(0);
                }
            } catch (err) {
                if (isMounted) setError(err.message || "Failed to load vocabulary for practice");
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        load();
        return () => {
            isMounted = false;
        };
    }, []);

    const handleShowMeaning = () => {
        setIsRevealed(true);
    };

    const handleNext = (status) => {
        if (status === "know") {
            setKnownCount((prev) => prev + 1);
        } else {
            setNeedPracticeCount((prev) => prev + 1);
        }
        setIsRevealed(false);
        setCurrentIndex((prev) => prev + 1);
    };

    // Keyboard navigation helper
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Ignore if active element is an input
            if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;

            if (sessionWords.length === 0 || currentIndex >= sessionWords.length) return;

            if (e.code === "Space" || e.key === " ") {
                e.preventDefault();
                if (!isRevealed) {
                    setIsRevealed(true);
                }
            } else if (isRevealed) {
                if (e.key === "1" || e.key === "ArrowLeft") {
                    e.preventDefault();
                    handleNext("needPractice");
                } else if (e.key === "2" || e.key === "ArrowRight") {
                    e.preventDefault();
                    handleNext("know");
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isRevealed, sessionWords.length, currentIndex]);

    const isSessionFinished = sessionWords.length > 0 && currentIndex >= sessionWords.length;
    const currentWord = sessionWords[currentIndex];
    const progressPercent = sessionWords.length > 0
        ? Math.min(100, Math.round((currentIndex / sessionWords.length) * 100))
        : 0;

    return (
        <div className="reader-page">
            {/* Header */}
            <header className="reader-header">
                <Link to="/reader" className="reader-brand">
                    <span>📖</span>
                    <span>ReadLingo</span>
                </Link>

                <div className="reader-actions">
                    <Link to="/vocabulary" className="reader-btn-secondary">
                        <span>📚</span>
                        <span>Back to My Words</span>
                    </Link>
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="reader-btn-secondary"
                    >
                        Logout
                    </button>
                </div>
            </header>

            {/* Main Practice Container */}
            <main className="practice-container">
                {/* Error Banner */}
                {error && (
                    <div className="auth-error" role="alert" style={{ marginBottom: "24px" }}>
                        <span className="auth-error-icon">⚠️</span>
                        <span>{error}</span>
                        <button
                            type="button"
                            className="reader-btn-secondary"
                            onClick={handleRetry}
                            style={{ marginLeft: "auto", padding: "4px 10px", fontSize: "12px" }}
                        >
                            Retry
                        </button>
                    </div>
                )}

                {/* Loading State */}
                {loading && (
                    <div className="vocab-loading-state">
                        <div className="btn-spinner large" />
                        <p>Loading your flashcards...</p>
                    </div>
                )}

                {/* Empty State */}
                {!loading && !error && allWords.length === 0 && (
                    <div className="practice-empty-card">
                        <div className="practice-empty-icon">🎯</div>
                        <h2>No saved words yet.</h2>
                        <p className="practice-empty-text">
                            Save unfamiliar words while reading to start practicing them.
                        </p>
                        <Link to="/reader" className="reader-btn-primary" style={{ textDecoration: "none" }}>
                            Open Reader
                        </Link>
                    </div>
                )}

                {/* Active Practice Session */}
                {!loading && !error && sessionWords.length > 0 && !isSessionFinished && currentWord && (
                    <div className="practice-session-wrapper">
                        {/* Progress Header */}
                        <div className="practice-header-bar">
                            <div className="practice-progress-info">
                                <span className="practice-badge">Flashcards</span>
                                <span className="practice-counter">
                                    {currentIndex + 1} / {sessionWords.length}
                                </span>
                            </div>

                            <div className="practice-stats-preview">
                                <span className="practice-stat-pill know" title="Known in this session">
                                    ✓ {knownCount}
                                </span>
                                <span className="practice-stat-pill review" title="Needs practice in this session">
                                    ↺ {needPracticeCount}
                                </span>
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div
                            className="practice-progress-track"
                            role="progressbar"
                            aria-valuenow={progressPercent}
                            aria-valuemin={0}
                            aria-valuemax={100}
                        >
                            <div
                                className="practice-progress-fill"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>

                        {/* Flashcard */}
                        <div className={`practice-card ${isRevealed ? "revealed" : ""}`}>
                            {/* Card Header with Word and Phonetic */}
                            <div className="practice-card-head">
                                <h2 className="practice-card-word">{currentWord.word}</h2>
                                {currentWord.phonetic ? (
                                    <span className="practice-card-phonetic">{currentWord.phonetic}</span>
                                ) : null}
                            </div>

                            {/* Unrevealed Front State */}
                            {!isRevealed ? (
                                <div className="practice-card-front-content">
                                    <p className="practice-card-hint">
                                        Recall the meaning and context, then reveal the details.
                                    </p>
                                    <button
                                        type="button"
                                        className="practice-btn-reveal"
                                        onClick={handleShowMeaning}
                                        autoFocus
                                    >
                                        <span>👁️</span>
                                        <span>Show Meaning</span>
                                    </button>
                                    <span className="practice-keyboard-hint">Tip: Press [Space] to reveal</span>
                                </div>
                            ) : (
                                /* Revealed Back State */
                                <div className="practice-card-revealed-content">
                                    {/* Hindi Meaning */}
                                    {(() => {
                                        const cleanHindi = formatDisplayHindi(currentWord.hindiMeaning, currentWord.word);
                                        return cleanHindi ? (
                                            <div className="practice-meaning-group">
                                                <span className="practice-field-label">Hindi:</span>
                                                <div className="practice-hindi-pill">
                                                    <span>{cleanHindi}</span>
                                                </div>
                                            </div>
                                        ) : null;
                                    })()}

                                    {/* English Definition */}
                                    <div className="practice-meaning-group">
                                        <span className="practice-field-label">Definition:</span>
                                        <p className="practice-definition-text">
                                            {formatDisplayText(currentWord.definition) || "No definition available."}
                                        </p>
                                    </div>

                                    {/* Example Sentence */}
                                    {(() => {
                                        const cleanEx = formatDisplayText(currentWord.exampleSentence);
                                        return cleanEx ? (
                                            <div className="practice-meaning-group">
                                                <span className="practice-field-label">Example:</span>
                                                <p className="practice-example-text">
                                                    “{cleanEx}”
                                                </p>
                                            </div>
                                        ) : null;
                                    })()}

                                    {/* Action Buttons */}
                                    <div className="practice-action-buttons">
                                        <button
                                            type="button"
                                            className="practice-action-btn need-practice"
                                            onClick={() => handleNext("needPractice")}
                                        >
                                            <span className="action-btn-icon">↺</span>
                                            <span>Need Practice</span>
                                            <span className="kbd-shortcut">[1]</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="practice-action-btn know"
                                            onClick={() => handleNext("know")}
                                            autoFocus
                                        >
                                            <span className="action-btn-icon">✓</span>
                                            <span>I Know</span>
                                            <span className="kbd-shortcut">[2]</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Session Complete Screen */}
                {!loading && !error && isSessionFinished && (
                    <div className="practice-complete-card">
                        <div className="practice-complete-celebration">🎉</div>
                        <h2 className="practice-complete-title">Practice Complete 🎉</h2>
                        <p className="practice-complete-subtitle">
                            You reviewed {sessionWords.length} {sessionWords.length === 1 ? "word" : "words"}.
                        </p>

                        <div className="practice-results-grid">
                            <div className="practice-result-stat known">
                                <span className="stat-label">Known</span>
                                <span className="stat-value">{knownCount}</span>
                            </div>
                            <div className="practice-result-stat review">
                                <span className="stat-label">Need Practice</span>
                                <span className="stat-value">{needPracticeCount}</span>
                            </div>
                        </div>

                        {sessionWords.length > 0 && (
                            <div className="practice-mastery-badge">
                                <span>Mastery Score:</span>
                                <strong>
                                    {Math.round((knownCount / sessionWords.length) * 100)}%
                                </strong>
                            </div>
                        )}

                        <div className="practice-complete-actions">
                            <button
                                type="button"
                                className="reader-btn-primary"
                                onClick={() => startNewSession()}
                            >
                                <span>↺</span>
                                <span>Practice Again</span>
                            </button>
                            <Link to="/vocabulary" className="reader-btn-secondary" style={{ textDecoration: "none" }}>
                                <span>📚</span>
                                <span>Back to My Words</span>
                            </Link>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

export default Practice;
