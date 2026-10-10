import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getVocabulary, getMe, checkSentenceGrammar } from "../services/api";
import {
    shuffleArray,
    formatDisplayText,
    formatDisplayHindi,
    validateSentenceWordUsage,
    getWordFamily,
    getContextualExample,
    calculateAccuracy,
    generateMcqQuestions,
    getEligibleMcqCount,
} from "../utils/practiceUtils";

function Practice() {
    const navigate = useNavigate();

    // User authentication state
    const [currentUser, setCurrentUser] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem("user")) || null;
        } catch {
            return null;
        }
    });

    // Vocabulary data state
    const [allWords, setAllWords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Setup configuration state
    // viewState: 'setup' | 'session' | 'results'
    const [viewState, setViewState] = useState("setup");
    // practiceMode in setup: 'mcq' | 'recall' | 'sentence'
    const [practiceMode, setPracticeMode] = useState("mcq");
    // active session mode (isolated from setup mode changes)
    const [sessionMode, setSessionMode] = useState("mcq");
    // questionCountSelection: 5 | 10 | 20 | 'all'
    const [questionCountSelection, setQuestionCountSelection] = useState(10);

    // Active session state
    const [sessionItems, setSessionItems] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    // MCQ specific state
    const [selectedMcqOption, setSelectedMcqOption] = useState(null);
    const [isMcqSubmitted, setIsMcqSubmitted] = useState(false);
    const [mcqCorrectCount, setMcqCorrectCount] = useState(0);
    const [mcqIncorrectList, setMcqIncorrectList] = useState([]);

    // Meaning Recall specific state
    const [isRecallRevealed, setIsRecallRevealed] = useState(false);
    const [recallKnownCount, setRecallKnownCount] = useState(0);
    const [recallReviewList, setRecallReviewList] = useState([]);

    // Sentence Formation specific state
    const [sentenceInput, setSentenceInput] = useState("");
    const [sentenceValidation, setSentenceValidation] = useState(null);
    const [sentenceSuccessCount, setSentenceSuccessCount] = useState(0);
    const [sentenceReviewList, setSentenceReviewList] = useState([]);

    // Action lock ref to prevent rapid double-clicks from skipping questions or double counting
    const isActionLockedRef = useRef(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const headerRef = useRef(null);

    // Logout handler
    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setCurrentUser(null);
        navigate("/login", { replace: true });
    };

    // Close mobile navigation menu on outside click or tap
    useEffect(() => {
        if (!mobileMenuOpen) return;
        const handleOutsideClick = (e) => {
            if (headerRef.current && !headerRef.current.contains(e.target)) {
                setMobileMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleOutsideClick);
        document.addEventListener("touchstart", handleOutsideClick);
        return () => {
            document.removeEventListener("mousedown", handleOutsideClick);
            document.removeEventListener("touchstart", handleOutsideClick);
        };
    }, [mobileMenuOpen]);

    // Load user and saved vocabulary on mount
    const loadVocabulary = useCallback(async () => {
        try {
            setLoading(true);
            setError("");

            const [userData, vocabData] = await Promise.all([
                getMe().catch(() => null),
                getVocabulary(),
            ]);

            if (userData && (userData.email || userData.name)) {
                setCurrentUser(userData);
            }

            const list = Array.isArray(vocabData) ? vocabData : [];
            setAllWords(list);
        } catch (err) {
            setError(err.message || "Failed to load saved vocabulary.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let isMounted = true;
        const init = async () => {
            try {
                const [userData, vocabData] = await Promise.all([
                    getMe().catch(() => null),
                    getVocabulary(),
                ]);

                if (!isMounted) return;

                if (userData && (userData.email || userData.name)) {
                    setCurrentUser(userData);
                }

                const list = Array.isArray(vocabData) ? vocabData : [];
                setAllWords(list);
            } catch (err) {
                if (isMounted) {
                    setError(err.message || "Failed to load saved vocabulary.");
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        init();

        return () => {
            isMounted = false;
        };
    }, []);

    // Calculate eligible counts for each mode
    const eligibleMcqCount = useMemo(() => {
        return getEligibleMcqCount(allWords);
    }, [allWords]);

    const canPlayMcq = eligibleMcqCount >= 4;

    const eligibleCountForSelectedMode = useMemo(() => {
        if (practiceMode === "mcq") {
            return eligibleMcqCount;
        }
        return allWords.length;
    }, [allWords.length, practiceMode, eligibleMcqCount]);

    // Available question count options based on vocabulary size
    const availableCountOptions = useMemo(() => {
        const total = eligibleCountForSelectedMode;
        if (total === 0) return [5];
        const options = [];
        if (total >= 5) options.push(5);
        if (total >= 10) options.push(10);
        if (total >= 20) options.push(20);
        options.push("all");
        return options;
    }, [eligibleCountForSelectedMode]);

    // Resolve actual question limit
    const getResolvedCount = useCallback(
        (selection, totalAvailable) => {
            if (selection === "all") return Math.max(1, totalAvailable);
            return Math.min(Number(selection), Math.max(1, totalAvailable));
        },
        []
    );

    // Reset all session state variables cleanly
    const resetSessionState = useCallback(() => {
        setCurrentIndex(0);
        setSelectedMcqOption(null);
        setIsMcqSubmitted(false);
        setMcqCorrectCount(0);
        setMcqIncorrectList([]);
        setIsRecallRevealed(false);
        setRecallKnownCount(0);
        setRecallReviewList([]);
        setSentenceInput("");
        setSentenceValidation(null);
        setSentenceSuccessCount(0);
        setSentenceReviewList([]);
        isActionLockedRef.current = false;
    }, []);

    // Start a new practice session
    const startSession = useCallback(
        (targetMode = practiceMode, customWordsList = null) => {
            resetSessionState();
            setError("");

            const sourceWords = customWordsList || allWords;
            if (!sourceWords || sourceWords.length === 0) return;

            setSessionMode(targetMode);

            if (targetMode === "mcq") {
                const targetCount = customWordsList
                    ? customWordsList.length
                    : getResolvedCount(questionCountSelection, eligibleMcqCount);

                const questions = generateMcqQuestions(sourceWords, targetCount);
                if (questions.length === 0) {
                    setError(
                        "MCQ requires at least 4 saved words with distinct meanings. Try Meaning Recall or Sentence Formation!"
                    );
                    return;
                }
                setSessionItems(questions);
            } else if (targetMode === "recall") {
                const targetCount = customWordsList
                    ? customWordsList.length
                    : getResolvedCount(questionCountSelection, sourceWords.length);

                const validCandidates = sourceWords.filter((w) => Boolean(w?.word?.trim()));
                const shuffled = shuffleArray(validCandidates).slice(0, targetCount);
                if (shuffled.length === 0) {
                    setError("No valid words found to practice.");
                    return;
                }
                setSessionItems(shuffled);
            } else if (targetMode === "sentence") {
                const targetCount = customWordsList
                    ? customWordsList.length
                    : getResolvedCount(questionCountSelection, sourceWords.length);

                const validCandidates = sourceWords.filter((w) => Boolean(w?.word?.trim()));
                const shuffled = shuffleArray(validCandidates).slice(0, targetCount);
                if (shuffled.length === 0) {
                    setError("No valid words found to practice.");
                    return;
                }
                setSessionItems(shuffled);
            }

            setViewState("session");
        },
        [
            allWords,
            practiceMode,
            questionCountSelection,
            eligibleMcqCount,
            getResolvedCount,
            resetSessionState,
        ]
    );

    // --- MCQ Actions ---
    const handleSelectMcqOption = (option) => {
        if (isMcqSubmitted || isActionLockedRef.current) return;

        const currentQ = sessionItems[currentIndex];
        if (!currentQ) return;

        isActionLockedRef.current = true;
        setSelectedMcqOption(option);
        setIsMcqSubmitted(true);

        const isCorrect = option === currentQ.correctAnswer;
        if (isCorrect) {
            setMcqCorrectCount((prev) => prev + 1);
        } else {
            setMcqIncorrectList((prev) => [
                ...prev,
                {
                    word: currentQ.originalWord?.word || currentQ.prompt,
                    hindiMeaning: currentQ.originalWord?.hindiMeaning || currentQ.correctAnswer,
                    definition: currentQ.originalWord?.definition || "",
                    exampleSentence: currentQ.originalWord?.exampleSentence || "",
                    userAnswer: option,
                    correctAnswer: currentQ.correctAnswer,
                },
            ]);
        }

        // Release action lock for Next Question click
        setTimeout(() => {
            isActionLockedRef.current = false;
        }, 150);
    };

    const handleNextMcq = () => {
        if (isActionLockedRef.current) return;
        isActionLockedRef.current = true;

        if (currentIndex + 1 < sessionItems.length) {
            setCurrentIndex((prev) => prev + 1);
            setSelectedMcqOption(null);
            setIsMcqSubmitted(false);
        } else {
            setViewState("results");
        }

        setTimeout(() => {
            isActionLockedRef.current = false;
        }, 150);
    };

    // --- Meaning Recall Actions ---
    const handleRevealRecall = () => {
        setIsRecallRevealed(true);
    };

    const handleRecallAnswer = useCallback(
        (knewIt) => {
            if (isActionLockedRef.current) return;
            isActionLockedRef.current = true;

            const currentWord = sessionItems[currentIndex];
            if (!currentWord) {
                isActionLockedRef.current = false;
                return;
            }

            if (knewIt) {
                setRecallKnownCount((prev) => prev + 1);
            } else {
                setRecallReviewList((prev) => [...prev, currentWord]);
            }

            if (currentIndex + 1 < sessionItems.length) {
                setCurrentIndex((prev) => prev + 1);
                setIsRecallRevealed(false);
            } else {
                setViewState("results");
            }

            setTimeout(() => {
                isActionLockedRef.current = false;
            }, 150);
        },
        [currentIndex, sessionItems]
    );

    // --- Sentence Formation Actions ---
    const handleSubmitSentence = async (e) => {
        if (e) e.preventDefault();
        if (isActionLockedRef.current) return;

        const currentWord = sessionItems[currentIndex];
        if (!currentWord || !sentenceInput.trim() || sentenceValidation) return;

        isActionLockedRef.current = true;

        // 1. Separate word validation: checks target word or legitimate word family form
        const wordResult = validateSentenceWordUsage(sentenceInput, currentWord.word, {
            allowWordFamily: true,
        });

        if (!wordResult.isValid) {
            // Failed word check or sentence completeness
            setSentenceValidation({
                wordResult,
                grammarResult: null,
                isCheckingGrammar: false,
            });

            // Add to review list if not already present
            setSentenceReviewList((prev) => {
                if (prev.some((item) => item.word === currentWord.word)) return prev;
                return [...prev, currentWord];
            });

            setTimeout(() => {
                isActionLockedRef.current = false;
            }, 150);
            return;
        }

        // 2. Word usage passed! Now evaluate grammar via LanguageTool backend
        setSentenceValidation({
            wordResult,
            grammarResult: null,
            isCheckingGrammar: true,
        });

        try {
            const grammarData = await checkSentenceGrammar(sentenceInput, currentWord.word);

            if (grammarData && grammarData.grammarStatus === "passed") {
                // Sentence passed all checks
                setSentenceValidation({
                    wordResult,
                    grammarResult: {
                        status: "passed",
                        matches: [],
                        matchCount: 0,
                        message: grammarData.message || "Sentence passed grammar checks.",
                    },
                    isCheckingGrammar: false,
                });
                setSentenceSuccessCount((prev) => prev + 1);
                // Remove from review list if previously added
                setSentenceReviewList((prev) =>
                    prev.filter((item) => item.word !== currentWord.word)
                );
            } else if (grammarData && grammarData.grammarStatus === "grammar_issue") {
                // Grammar issue detected
                setSentenceValidation({
                    wordResult,
                    grammarResult: {
                        status: "grammar_issue",
                        matches: grammarData.matches || [],
                        matchCount: grammarData.matchCount || grammarData.matches?.length || 1,
                        message: grammarData.message || "Grammar issue detected.",
                    },
                    isCheckingGrammar: false,
                });
                setSentenceReviewList((prev) => {
                    if (prev.some((item) => item.word === currentWord.word)) return prev;
                    return [...prev, currentWord];
                });
            } else {
                // Grammar check unavailable (offline or rate limited) -> Never mark green
                setSentenceValidation({
                    wordResult,
                    grammarResult: {
                        status: "unavailable",
                        matches: [],
                        matchCount: 0,
                        message: grammarData?.message || "Word usage detected; grammar could not be checked.",
                    },
                    isCheckingGrammar: false,
                });
            }
        } catch {
            // Network failure or unexpected exception
            setSentenceValidation({
                wordResult,
                grammarResult: {
                    status: "unavailable",
                    matches: [],
                    matchCount: 0,
                    message: "Word usage detected; grammar could not be checked.",
                },
                isCheckingGrammar: false,
            });
        } finally {
            setTimeout(() => {
                isActionLockedRef.current = false;
            }, 150);
        }
    };

    const handleEditSentence = () => {
        // Allow user to fix their sentence if validation failed
        setSentenceValidation(null);
    };

    const handleSkipSentence = () => {
        if (isActionLockedRef.current) return;
        isActionLockedRef.current = true;

        const currentWord = sessionItems[currentIndex];
        if (currentWord) {
            setSentenceReviewList((prev) => {
                if (prev.some((item) => item.word === currentWord.word)) return prev;
                return [...prev, currentWord];
            });
        }

        if (currentIndex + 1 < sessionItems.length) {
            setCurrentIndex((prev) => prev + 1);
            setSentenceInput("");
            setSentenceValidation(null);
        } else {
            setViewState("results");
        }

        setTimeout(() => {
            isActionLockedRef.current = false;
        }, 150);
    };

    const handleNextSentence = () => {
        if (isActionLockedRef.current) return;
        isActionLockedRef.current = true;

        if (currentIndex + 1 < sessionItems.length) {
            setCurrentIndex((prev) => prev + 1);
            setSentenceInput("");
            setSentenceValidation(null);
        } else {
            setViewState("results");
        }

        setTimeout(() => {
            isActionLockedRef.current = false;
        }, 150);
    };

    // Textarea keydown: Enter or Ctrl+Enter submits
    const handleSentenceKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (sentenceInput.trim() && !sentenceValidation) {
                handleSubmitSentence();
            }
        }
    };

    // Retry only incorrect / missed words from the session
    const handleRetryIncorrect = () => {
        let missedWords = [];
        if (sessionMode === "mcq") {
            missedWords = mcqIncorrectList;
        } else if (sessionMode === "recall") {
            missedWords = recallReviewList;
        } else if (sessionMode === "sentence") {
            missedWords = sentenceReviewList;
        }

        if (missedWords.length > 0) {
            // For MCQ retry, if fewer than 4 missed words, retry them in Recall mode with full support
            if (sessionMode === "mcq" && missedWords.length < 4) {
                setPracticeMode("recall");
                startSession("recall", missedWords);
            } else {
                startSession(sessionMode, missedWords);
            }
        }
    };

    // Return to setup dashboard
    const handleBackToSetup = () => {
        resetSessionState();
        setViewState("setup");
    };

    // Keyboard navigation for Recall mode
    useEffect(() => {
        if (viewState !== "session" || sessionMode !== "recall") return;

        const handleKeyDown = (e) => {
            if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;

            if (e.code === "Space" || e.key === " ") {
                e.preventDefault();
                if (!isRecallRevealed) {
                    setIsRecallRevealed(true);
                }
            } else if (isRecallRevealed) {
                if (e.key === "1" || e.key === "ArrowLeft") {
                    e.preventDefault();
                    handleRecallAnswer(false);
                } else if (e.key === "2" || e.key === "ArrowRight") {
                    e.preventDefault();
                    handleRecallAnswer(true);
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [viewState, sessionMode, isRecallRevealed, handleRecallAnswer]);

    // Progress calculation
    const progressPercent = sessionItems.length > 0
        ? Math.min(
              100,
              Math.round(
                  ((currentIndex +
                      (isMcqSubmitted || sentenceValidation || isRecallRevealed ? 1 : 0)) /
                      sessionItems.length) *
                      100
              )
          )
        : 0;

    return (
        <div className="reader-page">
            {/* Header / Navigation */}
            <header className="reader-header" ref={headerRef}>
                <div className="reader-header-main">
                    <Link
                        to="/reader"
                        className="reader-brand"
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        <span>📖</span>
                        <span>ReadLingo</span>
                    </Link>

                    <button
                        type="button"
                        className="reader-mobile-menu-btn"
                        onClick={() => setMobileMenuOpen((prev) => !prev)}
                        aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
                        aria-expanded={mobileMenuOpen}
                    >
                        <span className="hamburger-icon">{mobileMenuOpen ? "✕" : "☰"}</span>
                    </button>
                </div>

                <div className={`reader-actions ${mobileMenuOpen ? "mobile-open" : ""}`}>
                    <Link
                        to="/reader"
                        className="reader-btn-secondary"
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        <span>📖</span>
                        <span>Reader</span>
                    </Link>
                    <Link
                        to="/vocabulary"
                        className="reader-btn-secondary"
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        <span>📚</span>
                        <span>Vocabulary</span>
                    </Link>
                    {currentUser && (
                        <div
                            className="reader-user-badge"
                            title={`Signed in as ${currentUser.email || currentUser.name}`}
                        >
                            <span className="reader-user-icon">👤</span>
                            <span className="reader-user-name">
                                {currentUser.name || currentUser.email}
                            </span>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            setMobileMenuOpen(false);
                            handleLogout();
                        }}
                        className="reader-btn-secondary reader-btn-logout"
                    >
                        Logout
                    </button>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="practice-container">
                {/* Error Banner */}
                {error && (
                    <div className="auth-error" role="alert" style={{ marginBottom: "20px" }}>
                        <span className="auth-error-icon">⚠️</span>
                        <span>{error}</span>
                        <button
                            type="button"
                            className="reader-btn-secondary"
                            onClick={() => {
                                setError("");
                                loadVocabulary();
                            }}
                            style={{ marginLeft: "auto", padding: "4px 10px", fontSize: "12px" }}
                        >
                            Dismiss
                        </button>
                    </div>
                )}

                {/* Loading State */}
                {loading && (
                    <div className="vocab-loading-state">
                        <div className="btn-spinner large" />
                        <p>Loading your saved vocabulary...</p>
                    </div>
                )}

                {/* Empty Vocabulary State */}
                {!loading && !error && allWords.length === 0 && (
                    <div className="practice-empty-card">
                        <div className="practice-empty-icon">🎯</div>
                        <h2>No Saved Words Yet</h2>
                        <p className="practice-empty-text">
                            Read PDFs and save unfamiliar words with their Hindi meanings to unlock MCQ tests, meaning recall, and sentence formation practice.
                        </p>
                        <Link to="/reader" className="reader-btn-primary" style={{ textDecoration: "none", marginTop: "12px" }}>
                            Open PDF Reader
                        </Link>
                    </div>
                )}

                {/* 1. Practice Setup Screen */}
                {!loading && !error && allWords.length > 0 && viewState === "setup" && (
                    <div className="practice-setup-card">
                        <div className="practice-setup-header">
                            <div className="practice-setup-badge">
                                <span>🎯</span>
                                <span>Active Vocabulary</span>
                            </div>
                            <h1 className="practice-setup-title">Vocabulary Practice</h1>
                            <p className="practice-setup-subtitle">
                                You have <strong>{allWords.length}</strong> saved {allWords.length === 1 ? "word" : "words"} in your personal library.
                            </p>
                        </div>

                        {/* Mode Selection */}
                        <div className="practice-modes-section">
                            <label className="practice-section-label">Select Practice Mode</label>
                            <div className="practice-mode-grid">
                                {/* MCQ Mode */}
                                <button
                                    type="button"
                                    className={`practice-mode-card ${practiceMode === "mcq" ? "active" : ""}`}
                                    onClick={() => setPracticeMode("mcq")}
                                >
                                    <div className="mode-card-icon">🎯</div>
                                    <div className="mode-card-content">
                                        <div className="mode-card-title-row">
                                            <span className="mode-card-title">Multiple Choice (MCQ)</span>
                                            {!canPlayMcq ? (
                                                <span className="mode-card-tag warning">
                                                    Needs 4+ words with Hindi ({eligibleMcqCount})
                                                </span>
                                            ) : (
                                                <span className="mode-card-tag success">
                                                    {eligibleMcqCount} questions ready
                                                </span>
                                            )}
                                        </div>
                                        <p className="mode-card-desc">
                                            Test English-to-Hindi and Hindi-to-English recognition with 4 distinct choices generated from your saved words.
                                        </p>
                                    </div>
                                </button>

                                {/* Meaning Recall Mode */}
                                <button
                                    type="button"
                                    className={`practice-mode-card ${practiceMode === "recall" ? "active" : ""}`}
                                    onClick={() => setPracticeMode("recall")}
                                >
                                    <div className="mode-card-icon">🧠</div>
                                    <div className="mode-card-content">
                                        <span className="mode-card-title">Meaning Recall</span>
                                        <p className="mode-card-desc">
                                            Self-test your memory. View the word, recall its meaning, reveal the answer, and track what you know.
                                        </p>
                                    </div>
                                </button>

                                {/* Sentence Formation Mode */}
                                <button
                                    type="button"
                                    className={`practice-mode-card ${practiceMode === "sentence" ? "active" : ""}`}
                                    onClick={() => setPracticeMode("sentence")}
                                >
                                    <div className="mode-card-icon">✍️</div>
                                    <div className="mode-card-content">
                                        <span className="mode-card-title">Sentence Formation</span>
                                        <p className="mode-card-desc">
                                            Write your own English sentences using your saved words. Validates word usage and compares with examples.
                                        </p>
                                    </div>
                                </button>
                            </div>
                        </div>

                        {/* MCQ Warning Note if insufficient words */}
                        {practiceMode === "mcq" && !canPlayMcq && (
                            <div className="practice-helper-note">
                                <span>⚠️</span>
                                <span>
                                    MCQ mode requires at least 4 saved words with distinct Hindi translations to generate 4 distinct choices (you currently have {eligibleMcqCount}). You can practice with <strong>Meaning Recall</strong> or <strong>Sentence Formation</strong> right now!
                                </span>
                            </div>
                        )}

                        {/* Question Count Selection */}
                        <div className="practice-count-section">
                            <label className="practice-section-label">Number of Questions</label>
                            <div className="practice-count-pills">
                                {availableCountOptions.map((opt) => {
                                    const label =
                                        opt === "all"
                                            ? `All (${eligibleCountForSelectedMode})`
                                            : opt;
                                    const isSelected = questionCountSelection === opt;
                                    return (
                                        <button
                                            key={opt}
                                            type="button"
                                            className={`practice-count-pill ${isSelected ? "active" : ""}`}
                                            onClick={() => setQuestionCountSelection(opt)}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="practice-setup-actions">
                            <button
                                type="button"
                                className="reader-btn-primary practice-start-btn"
                                onClick={() => startSession()}
                                disabled={practiceMode === "mcq" && !canPlayMcq}
                            >
                                <span>🚀</span>
                                <span>
                                    Start Practice (
                                    {getResolvedCount(
                                        questionCountSelection,
                                        eligibleCountForSelectedMode
                                    )}{" "}
                                    questions)
                                </span>
                            </button>
                        </div>
                    </div>
                )}

                {/* 2. Active Session Screen */}
                {!loading && !error && viewState === "session" && sessionItems.length > 0 && (
                    <div className="practice-session-wrapper">
                        {/* Session Top Bar */}
                        <div className="practice-header-bar">
                            <div className="practice-progress-info">
                                <span className="practice-badge">
                                    {sessionMode === "mcq" && "🎯 MCQ Quiz"}
                                    {sessionMode === "recall" && "🧠 Meaning Recall"}
                                    {sessionMode === "sentence" && "✍️ Sentence Formation"}
                                </span>
                                <span className="practice-counter">
                                    {currentIndex + 1} / {sessionItems.length}
                                </span>
                            </div>

                            {/* Session Score Counters */}
                            <div className="practice-stats-preview">
                                {sessionMode === "mcq" && (
                                    <>
                                        <span className="practice-stat-pill know" title="Correct in this session">
                                            ✓ {mcqCorrectCount}
                                        </span>
                                        <span className="practice-stat-pill review" title="Incorrect in this session">
                                            ✕ {mcqIncorrectList.length}
                                        </span>
                                    </>
                                )}
                                {sessionMode === "recall" && (
                                    <>
                                        <span className="practice-stat-pill know" title="Known in this session">
                                            ✓ {recallKnownCount}
                                        </span>
                                        <span className="practice-stat-pill review" title="Needs practice">
                                            ↺ {recallReviewList.length}
                                        </span>
                                    </>
                                )}
                                {sessionMode === "sentence" && (
                                    <>
                                        <span className="practice-stat-pill know" title="Target word included">
                                            ✓ {sentenceSuccessCount}
                                        </span>
                                        <span className="practice-stat-pill review" title="Needs practice">
                                            ↺ {sentenceReviewList.length}
                                        </span>
                                    </>
                                )}

                                <button
                                    type="button"
                                    className="practice-exit-btn"
                                    onClick={handleBackToSetup}
                                    title="Exit to Setup"
                                >
                                    ✕ Exit
                                </button>
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

                        {/* Mode A: MCQ Practice View */}
                        {sessionMode === "mcq" && (() => {
                            const currentQ = sessionItems[currentIndex];
                            if (!currentQ) return null;
                            const isCorrect = selectedMcqOption === currentQ.correctAnswer;

                            return (
                                <div className="practice-card practice-mcq-card">
                                    <div className="practice-card-head">
                                        <span className="practice-mcq-type-label">
                                            {currentQ.type === "word_to_hindi"
                                                ? "English → Hindi Meaning"
                                                : "Hindi → English Word"}
                                        </span>
                                        <h2 className="practice-card-word mcq-prompt">
                                            {currentQ.prompt}
                                        </h2>
                                        {currentQ.originalWord?.phonetic &&
                                            currentQ.type === "word_to_hindi" && (
                                                <span className="practice-card-phonetic">
                                                    {currentQ.originalWord.phonetic}
                                                </span>
                                            )}
                                        <p className="practice-mcq-prompt-hint">
                                            {currentQ.promptLabel}
                                        </p>
                                    </div>

                                    {/* 4 Choices Grid */}
                                    <div className="practice-mcq-options-grid">
                                        {currentQ.options.map((option, idx) => {
                                            const isSelected = selectedMcqOption === option;
                                            const isOptionCorrect = option === currentQ.correctAnswer;

                                            let btnClass = "practice-mcq-option-btn";
                                            if (isMcqSubmitted) {
                                                if (isSelected) {
                                                    btnClass += isCorrect ? " correct" : " wrong";
                                                } else if (isOptionCorrect) {
                                                    btnClass += " correct-reveal";
                                                } else {
                                                    btnClass += " disabled-dim";
                                                }
                                            }

                                            return (
                                                <button
                                                    key={`${currentQ.id}-opt-${idx}`}
                                                    type="button"
                                                    className={btnClass}
                                                    onClick={() => handleSelectMcqOption(option)}
                                                    disabled={isMcqSubmitted}
                                                >
                                                    <span className="mcq-option-letter">
                                                        {String.fromCharCode(65 + idx)}
                                                    </span>
                                                    <span className="mcq-option-text">{option}</span>
                                                    {isMcqSubmitted && isOptionCorrect && (
                                                        <span className="mcq-option-badge">✓</span>
                                                    )}
                                                    {isMcqSubmitted && isSelected && !isCorrect && (
                                                        <span className="mcq-option-badge">✕</span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Feedback & Next Button */}
                                    {isMcqSubmitted && (
                                        <div
                                            className={`practice-mcq-feedback ${
                                                isCorrect ? "correct" : "wrong"
                                            }`}
                                        >
                                            <div className="mcq-feedback-text">
                                                {isCorrect ? (
                                                    <span>
                                                        🎉 <strong>Correct!</strong> Well done.
                                                    </span>
                                                ) : (
                                                    <span>
                                                        ✕ <strong>Incorrect.</strong> The correct answer is{" "}
                                                        <strong>{currentQ.correctAnswer}</strong>.
                                                    </span>
                                                )}
                                            </div>

                                            <button
                                                type="button"
                                                className="reader-btn-primary mcq-next-btn"
                                                onClick={handleNextMcq}
                                                autoFocus
                                            >
                                                {currentIndex + 1 < sessionItems.length
                                                    ? "Next Question →"
                                                    : "See Results 🎉"}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Mode B: Meaning Recall View */}
                        {sessionMode === "recall" && (() => {
                            const currentWord = sessionItems[currentIndex];
                            if (!currentWord) return null;

                            return (
                                <div className={`practice-card ${isRecallRevealed ? "revealed" : ""}`}>
                                    <div className="practice-card-head">
                                        <h2 className="practice-card-word">{currentWord.word}</h2>
                                        {currentWord.phonetic && (
                                            <span className="practice-card-phonetic">
                                                {currentWord.phonetic}
                                            </span>
                                        )}
                                    </div>

                                    {!isRecallRevealed ? (
                                        <div className="practice-card-front-content">
                                            <p className="practice-card-hint">
                                                Recall the Hindi meaning and English definition, then reveal the card to verify.
                                            </p>
                                            <button
                                                type="button"
                                                className="practice-btn-reveal"
                                                onClick={handleRevealRecall}
                                                autoFocus
                                            >
                                                <span>👁️</span>
                                                <span>Show Meaning</span>
                                            </button>
                                            <span className="practice-keyboard-hint">
                                                Tip: Press [Space] to reveal
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="practice-card-revealed-content">
                                            {/* Hindi Meaning */}
                                            {(() => {
                                                const cleanHindi = formatDisplayHindi(
                                                    currentWord.hindiMeaning,
                                                    currentWord.word
                                                );
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
                                                    {formatDisplayText(currentWord.definition) ||
                                                        "No definition stored."}
                                                </p>
                                            </div>

                                            {/* Example Sentence */}
                                            {(() => {
                                                const cleanEx = formatDisplayText(
                                                    currentWord.exampleSentence
                                                );
                                                const hasValidEx =
                                                    cleanEx &&
                                                    cleanEx.toLowerCase() !==
                                                        "example not available.";
                                                return hasValidEx ? (
                                                    <div className="practice-meaning-group">
                                                        <span className="practice-field-label">Example:</span>
                                                        <p className="practice-example-text">“{cleanEx}”</p>
                                                    </div>
                                                ) : null;
                                            })()}

                                            {/* Feedback Actions */}
                                            <div className="practice-action-buttons">
                                                <button
                                                    type="button"
                                                    className="practice-action-btn need-practice"
                                                    onClick={() => handleRecallAnswer(false)}
                                                >
                                                    <span className="action-btn-icon">↺</span>
                                                    <span>I Didn't Know</span>
                                                    <span className="kbd-shortcut">[1]</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    className="practice-action-btn know"
                                                    onClick={() => handleRecallAnswer(true)}
                                                    autoFocus
                                                >
                                                    <span className="action-btn-icon">✓</span>
                                                    <span>I Knew It</span>
                                                    <span className="kbd-shortcut">[2]</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Mode C: Sentence Formation View */}
                        {sessionMode === "sentence" && (() => {
                            const currentWord = sessionItems[currentIndex];
                            if (!currentWord) return null;
                            const cleanHindi = formatDisplayHindi(
                                currentWord.hindiMeaning,
                                currentWord.word
                            );
                            const cleanDef = formatDisplayText(currentWord.definition);
                            const rawEx = formatDisplayText(currentWord.exampleSentence);
                            const hasRealEx =
                                rawEx && rawEx.toLowerCase() !== "example not available.";
                            const contextualEx = getContextualExample(currentWord.word, currentWord.definition);
                            const wordFamilyList = getWordFamily(currentWord.word);

                            // Status values
                            const isCheckingGrammar = Boolean(sentenceValidation?.isCheckingGrammar);
                            const wordResult = sentenceValidation?.wordResult;
                            const grammarResult = sentenceValidation?.grammarResult;

                            return (
                                <div className="practice-card practice-sentence-card">
                                    <div className="practice-card-head">
                                        <div className="sentence-target-badge">
                                            <span>TARGET WORD</span>
                                        </div>
                                        <h2 className="practice-card-word">{currentWord.word}</h2>
                                        {cleanHindi && (
                                            <div className="practice-hindi-pill" style={{ margin: "4px auto 8px" }}>
                                                <span>Hindi: {cleanHindi}</span>
                                            </div>
                                        )}
                                        {cleanDef && (
                                            <p className="practice-card-hint" style={{ marginTop: "4px" }}>
                                                Definition: {cleanDef}
                                            </p>
                                        )}
                                        {wordFamilyList && wordFamilyList.length > 1 && (
                                            <p className="practice-card-hint" style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
                                                Accepted forms: {wordFamilyList.join(", ")}
                                            </p>
                                        )}
                                    </div>

                                    {/* Sentence Input Form */}
                                    <form onSubmit={handleSubmitSentence} className="practice-sentence-form">
                                        <div className="sentence-input-wrapper">
                                            <label htmlFor="sentence-input" className="sentence-input-label">
                                                Write an English sentence using <strong>"{currentWord.word}"</strong> (or an accepted form):
                                            </label>
                                            <textarea
                                                id="sentence-input"
                                                className="practice-sentence-textarea"
                                                rows="3"
                                                placeholder={`e.g. Write a grammatically correct sentence using "${currentWord.word}" (Press Enter to check)...`}
                                                value={sentenceInput}
                                                onChange={(e) => setSentenceInput(e.target.value)}
                                                onKeyDown={handleSentenceKeyDown}
                                                disabled={Boolean(sentenceValidation && !isCheckingGrammar)}
                                                autoFocus
                                            />
                                            <div className="sentence-char-count">
                                                <span>{sentenceInput.trim().length} characters</span>
                                            </div>
                                        </div>

                                        {!sentenceValidation || isCheckingGrammar ? (
                                            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                                <button
                                                    type="submit"
                                                    className="reader-btn-primary sentence-submit-btn"
                                                    disabled={!sentenceInput.trim() || isCheckingGrammar}
                                                >
                                                    {isCheckingGrammar ? (
                                                        <>
                                                            <span className="btn-spinner" />
                                                            <span>Checking Grammar...</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span>✓</span>
                                                            <span>Check Sentence</span>
                                                        </>
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="reader-btn-secondary"
                                                    onClick={handleSkipSentence}
                                                    disabled={isCheckingGrammar}
                                                    title="Skip to next word"
                                                >
                                                    Skip Word
                                                </button>
                                            </div>
                                        ) : null}
                                    </form>

                                    {/* Sentence Feedback & Comparison */}
                                    {sentenceValidation && (
                                        <div className="sentence-feedback-section">
                                            {/* 1. Checking Grammar State */}
                                            {isCheckingGrammar && (
                                                <div className="sentence-feedback-alert checking">
                                                    <div className="btn-spinner" />
                                                    <div className="feedback-alert-text">
                                                        <p>Checking grammar & syntax...</p>
                                                        <small className="grammar-disclaimer">
                                                            Evaluating sentence grammar via LanguageTool backend.
                                                        </small>
                                                    </div>
                                                </div>
                                            )}

                                            {/* 2. Word usage or sentence completeness failed */}
                                            {!isCheckingGrammar && wordResult && !wordResult.isValid && (
                                                <div className="sentence-feedback-alert warning">
                                                    <span className="feedback-alert-icon">⚠️</span>
                                                    <div className="feedback-alert-text">
                                                        <p>{wordResult.message}</p>
                                                        <small className="grammar-disclaimer">
                                                            Make sure your sentence includes the target word "{currentWord.word}" or an accepted form ({wordFamilyList.join(", ")}).
                                                        </small>
                                                    </div>
                                                </div>
                                            )}

                                            {/* 3. Word usage valid + Grammar evaluated */}
                                            {!isCheckingGrammar && wordResult && wordResult.isValid && grammarResult && (
                                                <>
                                                    {grammarResult.status === "passed" && (
                                                        <div className="sentence-feedback-alert success">
                                                            <span className="feedback-alert-icon">✓</span>
                                                            <div className="feedback-alert-text">
                                                                <p>Sentence passed all checks!</p>
                                                                <small className="grammar-disclaimer">
                                                                    ✓ {wordResult.isWordFamily ? `Accepted form "${wordResult.matchedForm}" detected.` : `Target word "${wordResult.matchedForm}" included.`} No grammatical issues detected.
                                                                </small>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {grammarResult.status === "grammar_issue" && (
                                                        <div className="sentence-feedback-alert grammar-error">
                                                            <span className="feedback-alert-icon">⚠️</span>
                                                            <div className="feedback-alert-text">
                                                                <p>Grammar Issue Detected</p>
                                                                <small className="grammar-disclaimer">
                                                                    ✓ {wordResult.isWordFamily ? `Accepted form "${wordResult.matchedForm}" detected,` : `Target word "${wordResult.matchedForm}" detected,`} but grammatical issues were found:
                                                                </small>
                                                                <div className="grammar-issues-list">
                                                                    {grammarResult.matches.map((m, idx) => (
                                                                        <div key={idx} className="grammar-issue-item">
                                                                            <div className="grammar-issue-message">{m.message}</div>
                                                                            {m.replacements && m.replacements.length > 0 && (
                                                                                <div className="grammar-issue-suggestion">
                                                                                    <span>Suggestion:</span>
                                                                                    <strong>{m.replacements.join(", ")}</strong>
                                                                                </div>
                                                                            )}
                                                                            {m.ruleId && (
                                                                                <div className="grammar-issue-rule">Rule: {m.ruleId}</div>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {grammarResult.status === "unavailable" && (
                                                        <div className="sentence-feedback-alert neutral">
                                                            <span className="feedback-alert-icon">ℹ️</span>
                                                            <div className="feedback-alert-text">
                                                                <p>Word usage detected; grammar could not be checked.</p>
                                                                <small className="grammar-disclaimer">
                                                                    ✓ {wordResult.isWordFamily ? `Word form "${wordResult.matchedForm}" used.` : `Target word "${wordResult.matchedForm}" used.`} The grammar evaluation service is currently unavailable. Please review your grammar manually.
                                                                </small>
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            {/* Reference Example Comparison */}
                                            <div className="sentence-reference-comparison">
                                                <span className="comparison-label">
                                                    {hasRealEx ? "Saved Reference Example:" : "Contextual Reference Example:"}
                                                </span>
                                                {hasRealEx ? (
                                                    <blockquote className="reference-quote">
                                                        “{rawEx}”
                                                    </blockquote>
                                                ) : (
                                                    <blockquote className="reference-quote" style={{ fontStyle: "italic" }}>
                                                        “{contextualEx}”
                                                    </blockquote>
                                                )}
                                            </div>

                                            {/* Action Buttons */}
                                            {!isCheckingGrammar && (
                                                <div className="sentence-next-action" style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                                                    {(!wordResult?.isValid || grammarResult?.status !== "passed") && (
                                                        <button
                                                            type="button"
                                                            className="reader-btn-secondary"
                                                            onClick={handleEditSentence}
                                                        >
                                                            <span>✏️</span>
                                                            <span>Edit Sentence</span>
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        className="reader-btn-primary sentence-next-btn"
                                                        onClick={handleNextSentence}
                                                        autoFocus
                                                    >
                                                        {currentIndex + 1 < sessionItems.length
                                                            ? "Next Word →"
                                                            : "See Session Summary 🎉"}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* 3. Session Results / Summary Screen */}
                {!loading && !error && viewState === "results" && (() => {
                    const totalQuestions = sessionItems.length;
                    let correctCount = 0;
                    let missedItems = [];

                    if (sessionMode === "mcq") {
                        correctCount = mcqCorrectCount;
                        missedItems = mcqIncorrectList;
                    } else if (sessionMode === "recall") {
                        correctCount = recallKnownCount;
                        missedItems = recallReviewList;
                    } else if (sessionMode === "sentence") {
                        correctCount = sentenceSuccessCount;
                        missedItems = sentenceReviewList;
                    }

                    const accuracyPercent = calculateAccuracy(correctCount, totalQuestions);

                    return (
                        <div className="practice-complete-card">
                            <div className="practice-complete-celebration">🎉</div>
                            <h2 className="practice-complete-title">Practice Complete!</h2>
                            <p className="practice-complete-subtitle">
                                You reviewed {totalQuestions} {totalQuestions === 1 ? "word" : "words"} in{" "}
                                <strong>
                                    {sessionMode === "mcq" && "Multiple Choice Mode"}
                                    {sessionMode === "recall" && "Meaning Recall Mode"}
                                    {sessionMode === "sentence" && "Sentence Formation Mode"}
                                </strong>.
                            </p>

                            {/* Summary Grid */}
                            <div className="practice-results-grid">
                                <div className="practice-result-stat known">
                                    <span className="stat-label">
                                        {sessionMode === "sentence" ? "Included Word" : "Correct / Known"}
                                    </span>
                                    <span className="stat-value">{correctCount}</span>
                                </div>
                                <div className="practice-result-stat review">
                                    <span className="stat-label">
                                        {sessionMode === "sentence" ? "Missed Word" : "Need Practice"}
                                    </span>
                                    <span className="stat-value">{totalQuestions - correctCount}</span>
                                </div>
                            </div>

                            {/* Accuracy Badge */}
                            <div className="practice-mastery-badge">
                                <span>Accuracy / Success Rate:</span>
                                <strong>{accuracyPercent}%</strong>
                            </div>

                            {/* Words Needing Review List */}
                            {missedItems.length > 0 && (
                                <div className="practice-missed-section">
                                    <h3 className="missed-section-title">
                                        Words to Review ({missedItems.length})
                                    </h3>
                                    <div className="practice-missed-list">
                                        {missedItems.map((item, idx) => {
                                            const w = item.word;
                                            const h = formatDisplayHindi(item.hindiMeaning, w);
                                            const def = formatDisplayText(item.definition);
                                            return (
                                                <div key={`missed-${idx}`} className="practice-missed-item">
                                                    <div className="missed-item-header">
                                                        <span className="missed-word">{w}</span>
                                                        {h && <span className="missed-hindi">{h}</span>}
                                                    </div>
                                                    {def && <p className="missed-def">{def}</p>}
                                                    {item.userAnswer && (
                                                        <div className="missed-mcq-meta">
                                                            <span className="your-ans">Your answer: {item.userAnswer}</span>
                                                            <span className="correct-ans">Correct: {item.correctAnswer}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="practice-complete-actions">
                                {missedItems.length > 0 && (
                                    <button
                                        type="button"
                                        className="reader-btn-primary"
                                        onClick={handleRetryIncorrect}
                                    >
                                        <span>↺</span>
                                        <span>Retry Missed Words ({missedItems.length})</span>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="reader-btn-secondary"
                                    onClick={handleBackToSetup}
                                >
                                    <span>🎯</span>
                                    <span>Start New Practice</span>
                                </button>
                                <Link
                                    to="/vocabulary"
                                    className="reader-btn-secondary"
                                    style={{ textDecoration: "none" }}
                                >
                                    <span>📚</span>
                                    <span>Back to My Words</span>
                                </Link>
                            </div>
                        </div>
                    );
                })()}
            </main>
        </div>
    );
}

export default Practice;
