import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getVocabulary, deleteVocabulary } from "../services/api";

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

function Vocabulary() {
    const navigate = useNavigate();
    const [words, setWords] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [deletingId, setDeletingId] = useState(null);
    const [successMessage, setSuccessMessage] = useState("");

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login");
    };

    useEffect(() => {
        let isMounted = true;
        const load = async () => {
            try {
                const data = await getVocabulary();
                if (isMounted) setWords(data || []);
            } catch (err) {
                if (isMounted) setError(err.message || "Failed to load vocabulary");
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        load();
        return () => {
            isMounted = false;
        };
    }, []);

    const handleDelete = async (id, wordText) => {
        try {
            setDeletingId(id);
            setError("");
            await deleteVocabulary(id);
            setWords((prev) => prev.filter((w) => w._id !== id));
            setSuccessMessage(`Removed "${wordText}" from your vocabulary.`);
            setTimeout(() => {
                setSuccessMessage("");
            }, 3000);
        } catch (err) {
            setError(err.message || "Failed to delete word");
        } finally {
            setDeletingId(null);
        }
    };

    const filteredWords = words.filter((item) => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase().trim();
        const matchesWord = item.word?.toLowerCase().includes(query);
        const matchesHindi = item.hindiMeaning?.toLowerCase().includes(query);
        const matchesDef = item.definition?.toLowerCase().includes(query);
        return matchesWord || matchesHindi || matchesDef;
    });

    return (
        <div className="reader-page">
            {/* Header */}
            <header className="reader-header">
                <Link to="/reader" className="reader-brand">
                    <span>📖</span>
                    <span>ReadLingo</span>
                </Link>

                <div className="reader-actions">
                    <Link to="/reader" className="reader-btn-secondary">
                        <span>◀</span>
                        <span>Back to Reader</span>
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

            {/* Main Vocabulary Container */}
            <main className="vocab-container">
                <div className="vocab-header-section">
                    <div>
                        <h1 className="vocab-title">My Vocabulary</h1>
                        <p className="vocab-subtitle">
                            {words.length} {words.length === 1 ? "word" : "words"} saved from your reading sessions
                        </p>
                    </div>

                    {words.length > 0 && (
                        <div className="vocab-search-wrapper">
                            <input
                                type="text"
                                className="vocab-search-input"
                                placeholder="Search saved words or meanings..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    className="vocab-search-clear"
                                    onClick={() => setSearchQuery("")}
                                    title="Clear search"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {error && (
                    <div className="auth-error" role="alert">
                        <span className="auth-error-icon">⚠️</span>
                        <span>{error}</span>
                    </div>
                )}

                {successMessage && (
                    <div className="vocab-success-toast">
                        <span>✓</span>
                        <span>{successMessage}</span>
                    </div>
                )}

                {loading && (
                    <div className="vocab-loading-state">
                        <div className="btn-spinner large" />
                        <p>Loading your saved words...</p>
                    </div>
                )}

                {!loading && words.length === 0 && (
                    <div className="upload-card">
                        <div className="upload-card-icon">📚</div>
                        <h3>No Saved Words Yet</h3>
                        <p>
                            Open any English PDF in the Reader, select an unfamiliar word, and click "Save Word".
                        </p>
                        <Link to="/reader" className="reader-btn-primary" style={{ textDecoration: "none" }}>
                            Open Reader
                        </Link>
                    </div>
                )}

                {!loading && words.length > 0 && filteredWords.length === 0 && (
                    <div className="vocab-no-results">
                        <p>No words found matching "<strong>{searchQuery}</strong>".</p>
                        <button
                            type="button"
                            className="reader-btn-secondary"
                            onClick={() => setSearchQuery("")}
                        >
                            Reset Search Filter
                        </button>
                    </div>
                )}

                {!loading && filteredWords.length > 0 && (
                    <div className="vocab-list">
                        {filteredWords.map((item) => {
                            const isDeleting = deletingId === item._id;
                            return (
                                <div
                                    key={item._id}
                                    className={`vocab-card ${isDeleting ? "deleting" : ""}`}
                                >
                                    <div className="vocab-card-header">
                                        <div className="vocab-card-word-group">
                                            <span className="vocab-card-word">
                                                {item.word}
                                            </span>
                                            {item.phonetic && (
                                                <span className="vocab-card-phonetic">
                                                    {item.phonetic}
                                                </span>
                                            )}
                                        </div>

                                        <button
                                            type="button"
                                            className="vocab-delete-btn"
                                            onClick={() => handleDelete(item._id, item.word)}
                                            disabled={isDeleting}
                                            title="Delete word from vocabulary"
                                        >
                                            {isDeleting ? "Deleting..." : "🗑️ Delete"}
                                        </button>
                                    </div>

                                    {(() => {
                                        const cleanHindi = formatDisplayHindi(item.hindiMeaning, item.word);
                                        return cleanHindi ? (
                                            <div className="vocab-hindi-pill">
                                                <span className="vocab-hindi-label">Hindi:</span>
                                                <span>{cleanHindi}</span>
                                            </div>
                                        ) : null;
                                    })()}

                                    {(() => {
                                        const cleanDef = formatDisplayText(item.definition);
                                        return cleanDef ? (
                                            <div className="vocab-definition">
                                                {cleanDef}
                                            </div>
                                        ) : null;
                                    })()}

                                    {(() => {
                                        const cleanEx = formatDisplayText(item.exampleSentence);
                                        return cleanEx ? (
                                            <div className="vocab-example">
                                                “{cleanEx}”
                                            </div>
                                        ) : null;
                                    })()}
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}

export default Vocabulary;
