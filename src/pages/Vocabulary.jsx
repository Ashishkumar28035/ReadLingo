import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getVocabulary, deleteVocabulary } from "../services/api";

function Vocabulary() {
    const navigate = useNavigate();
    const [words, setWords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

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

    const handleDelete = async (id) => {
        try {
            await deleteVocabulary(id);
            setWords((prev) => prev.filter((w) => w._id !== id));
        } catch (err) {
            alert(err.message || "Failed to delete word");
        }
    };

    return (
        <div className="reader-page">
            <header className="reader-header">
                <Link to="/reader" className="reader-brand">
                    <span>📖</span>
                    <span>ReadLingo</span>
                </Link>

                <div className="reader-actions">
                    <Link to="/reader" className="reader-btn-secondary">
                        ◀ Back to Reader
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

            <main style={{ maxWidth: "800px", width: "100%", margin: "32px auto", padding: "0 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "24px" }}>
                    <div>
                        <h2 style={{ fontSize: "28px", color: "#111", marginBottom: "6px" }}>My Vocabulary</h2>
                        <p style={{ color: "#666", fontSize: "14px" }}>
                            {words.length} {words.length === 1 ? "word" : "words"} saved from your reading sessions
                        </p>
                    </div>
                </div>

                {error && <div className="auth-error">{error}</div>}

                {loading && (
                    <div style={{ textAlign: "center", padding: "40px", color: "#666" }}>
                        Loading your saved words...
                    </div>
                )}

                {!loading && words.length === 0 && (
                    <div className="upload-card">
                        <div className="upload-card-icon">📚</div>
                        <h3>No Saved Words Yet</h3>
                        <p>Open any PDF in the Reader, select an English word, and click "Save Word".</p>
                        <Link to="/reader" className="reader-btn-primary" style={{ textDecoration: "none" }}>
                            Open Reader
                        </Link>
                    </div>
                )}

                {!loading && words.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        {words.map((item) => (
                            <div
                                key={item._id}
                                style={{
                                    background: "white",
                                    border: "1px solid #e7e7e7",
                                    borderRadius: "12px",
                                    padding: "20px 24px",
                                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
                                }}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                                    <div>
                                        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                                            <span style={{ fontSize: "22px", fontWeight: "700", color: "#111" }}>
                                                {item.word}
                                            </span>
                                            {item.phonetic && (
                                                <span style={{ fontSize: "13px", color: "#888" }}>
                                                    {item.phonetic}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(item._id)}
                                        style={{
                                            background: "none",
                                            border: "none",
                                            color: "#dc2626",
                                            cursor: "pointer",
                                            fontSize: "13px",
                                            padding: "4px 8px",
                                        }}
                                        title="Delete word"
                                    >
                                        Delete
                                    </button>
                                </div>

                                {item.hindiMeaning && (
                                    <div
                                        style={{
                                            display: "inline-block",
                                            background: "#f4f3ec",
                                            border: "1px solid #e7e5dc",
                                            padding: "4px 10px",
                                            borderRadius: "6px",
                                            fontSize: "16px",
                                            fontWeight: "600",
                                            color: "#222",
                                            marginBottom: "12px",
                                        }}
                                    >
                                        {item.hindiMeaning}
                                    </div>
                                )}

                                {item.definition && (
                                    <p style={{ fontSize: "14px", color: "#333", lineHeight: "1.5", marginBottom: "8px" }}>
                                        {item.definition}
                                    </p>
                                )}

                                {item.exampleSentence && (
                                    <p style={{ fontSize: "13px", color: "#666", fontStyle: "italic", background: "#fafaf8", padding: "6px 10px", borderLeft: "3px solid #ddd", borderRadius: "0 6px 6px 0" }}>
                                        “{item.exampleSentence}”
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}

export default Vocabulary;
