import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";
import { lookupWord, saveVocabulary, checkVocabularySaved } from "../services/api";

// Set worker source using Vite's URL import
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

function Reader() {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    const canvasRef = useRef(null);
    const textLayerRef = useRef(null);
    const renderTaskRef = useRef(null);
    const popupRef = useRef(null);

    const [pdfDoc, setPdfDoc] = useState(null);
    const [bookTitle, setBookTitle] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [scale, setScale] = useState(1.2);
    const [pageDimensions, setPageDimensions] = useState({ width: 0, height: 0 });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Word Popup State
    const [popupVisible, setPopupVisible] = useState(false);
    const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });
    const [selectedWord, setSelectedWord] = useState("");
    const [wordData, setWordData] = useState(null);
    const [popupLoading, setPopupLoading] = useState(false);
    const [popupError, setPopupError] = useState("");
    const [isWordSaved, setIsWordSaved] = useState(false);
    const [savingWord, setSavingWord] = useState(false);

    const [isDragging, setIsDragging] = useState(false);

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login");
    };

    const loadPdfFile = async (file) => {
        if (!file) return;

        // Validation: Accept only PDF
        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
            setError("Please upload a valid PDF file (.pdf)");
            return;
        }

        try {
            setError("");
            setLoading(true);
            setBookTitle(file.name);
            setPopupVisible(false);

            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const doc = await loadingTask.promise;

            console.log("[ReadLingo] PDF loaded successfully, total pages:", doc.numPages);
            setPdfDoc(doc);
            setTotalPages(doc.numPages);
            setCurrentPage(1);
        } catch (err) {
            console.error("[ReadLingo] Error loading PDF:", err);
            setError("Failed to load PDF. Please try a different document.");
            setPdfDoc(null);
        } finally {
            setLoading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (file) loadPdfFile(file);
    };

    // Render the current page on canvas + textLayer
    useEffect(() => {
        let isCancelled = false;

        const renderPage = async () => {
            if (!pdfDoc || !canvasRef.current) return;

            try {
                // Cancel any ongoing render task before starting a new one
                if (renderTaskRef.current) {
                    await renderTaskRef.current.cancel();
                    renderTaskRef.current = null;
                }

                const page = await pdfDoc.getPage(currentPage);
                if (isCancelled) return;

                const viewport = page.getViewport({ scale });
                setPageDimensions({ width: viewport.width, height: viewport.height });

                const canvas = canvasRef.current;
                if (!canvas) return;

                const context = canvas.getContext("2d");
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                const renderContext = {
                    canvasContext: context,
                    viewport,
                };

                const renderTask = page.render(renderContext);
                renderTaskRef.current = renderTask;
                await renderTask.promise;

                if (isCancelled) return;

                // Render TextLayer for selectable text
                if (textLayerRef.current) {
                    const textLayerDiv = textLayerRef.current;
                    textLayerDiv.innerHTML = "";
                    textLayerDiv.style.width = `${Math.floor(viewport.width)}px`;
                    textLayerDiv.style.height = `${Math.floor(viewport.height)}px`;
                    textLayerDiv.style.setProperty("--total-scale-factor", viewport.scale);
                    textLayerDiv.style.setProperty("--scale-factor", viewport.scale);

                    const textContent = await page.getTextContent();
                    if (isCancelled) return;

                    console.log("[ReadLingo] Rendering TextLayer with items count:", textContent.items.length);

                    const textLayer = new pdfjsLib.TextLayer({
                        textContentSource: textContent,
                        container: textLayerDiv,
                        viewport,
                    });

                    await textLayer.render();
                    console.log("[ReadLingo] TextLayer rendered successfully. Spans count:", textLayerDiv.children.length);
                }
            } catch (err) {
                if (err?.name !== "RenderingCancelledException") {
                    console.error("[ReadLingo] Render error:", err);
                }
            }
        };

        renderPage();

        return () => {
            isCancelled = true;
            if (renderTaskRef.current) {
                renderTaskRef.current.cancel();
                renderTaskRef.current = null;
            }
        };
    }, [pdfDoc, currentPage, scale]);

    // Helper to extract reliable bounding rectangle
    const getSelectionRect = (range) => {
        if (!range) return null;

        // 1. Try client rects
        const clientRects = range.getClientRects();
        for (let i = 0; i < clientRects.length; i++) {
            const r = clientRects[i];
            if (r.width > 0 && r.height > 0) {
                return r;
            }
        }

        // 2. Try bounding client rect
        const bRect = range.getBoundingClientRect();
        if (bRect && (bRect.width > 0 || bRect.height > 0)) {
            return bRect;
        }

        // 3. Fallback to commonAncestorContainer element
        let elem = range.commonAncestorContainer;
        if (elem?.nodeType === Node.TEXT_NODE) {
            elem = elem.parentElement;
        }
        if (elem?.getBoundingClientRect) {
            const elemRect = elem.getBoundingClientRect();
            if (elemRect.width > 0 || elemRect.height > 0) {
                return elemRect;
            }
        }

        return bRect;
    };

    // References for latest-request and closing protection
    const abortControllerRef = useRef(null);
    const latestRequestIdRef = useRef(0);
    const isClosingRef = useRef(false);
    const closingTimeoutRef = useRef(null);

    // Close popup: resets all state, clears selection, and aborts pending lookups
    const closePopup = useCallback(() => {
        isClosingRef.current = true;
        if (closingTimeoutRef.current) {
            clearTimeout(closingTimeoutRef.current);
        }
        closingTimeoutRef.current = setTimeout(() => {
            isClosingRef.current = false;
        }, 200);

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        latestRequestIdRef.current++;

        try {
            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
            }
        } catch (e) {
            console.warn("[ReadLingo] Error clearing text selection:", e);
        }

        setPopupVisible(false);
        setSelectedWord("");
        setWordData(null);
        setPopupLoading(false);
        setPopupError("");
        setIsWordSaved(false);
        setSavingWord(false);
    }, []);

    // Detect user text selection on the PDF
    const handleSelection = useCallback(async () => {
        if (isClosingRef.current) return;

        const selection = window.getSelection();
        if (!selection) return;

        if (selection.isCollapsed) {
            // Clicking empty area closes popup if open
            if (popupVisible) {
                closePopup();
            }
            return;
        }

        const rawText = selection.toString();
        if (!rawText || !rawText.trim()) return;

        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        if (!range) return;

        const containerNode = range.commonAncestorContainer;
        const targetElement = containerNode.nodeType === Node.ELEMENT_NODE
            ? containerNode
            : containerNode.parentElement;

        // Never trigger selection from inside the popup
        if (targetElement?.closest(".word-popup")) {
            return;
        }

        // Verify selection is inside PDF TextLayer or PDF reader page
        if (!targetElement?.closest(".textLayer") && !targetElement?.closest(".pdf-page-wrapper")) {
            console.log("[ReadLingo WordSelection] Selection outside PDF textLayer, ignoring.");
            return;
        }

        // Clean invisible/zero-width chars, soft hyphens, and edge punctuation
        const sanitized = rawText.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "").trim();
        const cleaned = sanitized
            .replace(/^[\s"'“‘([{<«–—.,;:!?]+|[\s"'”’)\]}>»–—.,;:!?]+$/g, "")
            .trim();

        // Must be a single English word (letters, optional internal apostrophe or hyphen)
        const isSingleWord = /^[a-zA-Z]+(?:['’-][a-zA-Z]+)*$/.test(cleaned);

        if (!isSingleWord || cleaned.length < 1) {
            console.log("[ReadLingo WordSelection] Rejected: Not a single English word.");
            return;
        }

        const rect = getSelectionRect(range);
        if (!rect) {
            console.warn("[ReadLingo WordSelection] No valid rect found.");
            return;
        }

        const popupWidth = Math.min(330, window.innerWidth - 32);
        let left = rect.left + rect.width / 2 - popupWidth / 2;
        left = Math.max(16, Math.min(left, window.innerWidth - popupWidth - 16));

        const estimatedHeight = 310;
        let top = rect.bottom + 10;
        if (top + estimatedHeight > window.innerHeight) {
            if (rect.top - estimatedHeight - 10 > 10) {
                top = rect.top - estimatedHeight - 10;
            } else {
                top = Math.max(16, window.innerHeight - estimatedHeight - 16);
            }
        }

        // 1. Show popup immediately with selected word and loading state
        setSelectedWord(cleaned);
        setPopupPos({ top, left });
        setPopupVisible(true);
        setPopupLoading(true);
        setPopupError("");
        setWordData(null);
        setIsWordSaved(false);

        // 2. Abort prior pending request and track latest request ID
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const currentReqId = ++latestRequestIdRef.current;

        try {
            const data = await lookupWord(cleaned, { signal: controller.signal });
            // Guard: Ignore if a newer request was dispatched
            if (latestRequestIdRef.current !== currentReqId) {
                return;
            }
            setWordData(data);
            setPopupLoading(false);

            // Check if user already saved this word
            try {
                const checkRes = await checkVocabularySaved(cleaned, { signal: controller.signal });
                if (latestRequestIdRef.current === currentReqId) {
                    setIsWordSaved(Boolean(checkRes?.isSaved));
                }
            } catch {
                // Ignore background check failure
            }
        } catch (err) {
            if (err.name === "AbortError" || latestRequestIdRef.current !== currentReqId) {
                return;
            }
            console.error("[ReadLingo WordSelection] Lookup error:", err);
            setPopupError(err.message || "Could not find word details");
            setPopupLoading(false);
        }
    }, [popupVisible, closePopup]);

    // Document-level mouseup listener ensures selection is captured
    useEffect(() => {
        const onMouseUp = (e) => {
            // Ignore mouseup inside the popup
            if (popupRef.current && popupRef.current.contains(e.target)) {
                return;
            }
            if (isClosingRef.current) return;
            setTimeout(handleSelection, 20);
        };

        document.addEventListener("mouseup", onMouseUp);
        return () => {
            document.removeEventListener("mouseup", onMouseUp);
        };
    }, [handleSelection]);

    // Close popup on Escape key press
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === "Escape" && popupVisible) {
                closePopup();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [popupVisible, closePopup]);

    // Close popup on window resize
    useEffect(() => {
        const handleResize = () => {
            if (popupVisible) closePopup();
        };
        window.addEventListener("resize", handleResize);
        return () => {
            window.removeEventListener("resize", handleResize);
        };
    }, [popupVisible, closePopup]);

    // Close popup on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (popupRef.current && !popupRef.current.contains(e.target)) {
                // If clicked outside on header, toolbar, or non-text areas
                if (
                    e.target.closest(".reader-header") ||
                    e.target.closest(".reader-toolbar") ||
                    e.target.closest(".upload-card") ||
                    !e.target.closest(".textLayer")
                ) {
                    closePopup();
                }
            }
        };

        if (popupVisible) {
            document.addEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [popupVisible, closePopup]);

    // Save Word handler: User must explicitly click 'Save Word'
    const handleSaveWord = async () => {
        if (!wordData || isWordSaved || savingWord) return;

        try {
            setSavingWord(true);
            await saveVocabulary({
                word: wordData.word,
                definition: wordData.definition,
                hindiMeaning: wordData.hindiMeaning,
                exampleSentence: wordData.exampleSentence,
                phonetic: wordData.phonetic,
            });
            setIsWordSaved(true);
        } catch (err) {
            setPopupError(err.message || "Failed to save word");
        } finally {
            setSavingWord(false);
        }
    };

    const handlePrevPage = () => {
        if (currentPage > 1) {
            setPopupVisible(false);
            setCurrentPage((prev) => prev - 1);
        }
    };

    const handleNextPage = () => {
        if (currentPage < totalPages) {
            setPopupVisible(false);
            setCurrentPage((prev) => prev + 1);
        }
    };

    const handleZoomIn = () => {
        setPopupVisible(false);
        setScale((prev) => Math.min(Number((prev + 0.2).toFixed(1)), 3.0));
    };

    const handleZoomOut = () => {
        setPopupVisible(false);
        setScale((prev) => Math.max(Number((prev - 0.2).toFixed(1)), 0.6));
    };

    const handleResetZoom = () => {
        setPopupVisible(false);
        setScale(1.2);
    };

    return (
        <div className="reader-page">
            {/* Top Navigation */}
            <header className="reader-header">
                <Link to="/reader" className="reader-brand">
                    <span>📖</span>
                    <span>ReadLingo</span>
                </Link>

                {bookTitle && (
                    <div className="reader-book-title" title={bookTitle}>
                        {bookTitle}
                    </div>
                )}

                <div className="reader-actions">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/pdf"
                        onChange={handleFileSelect}
                        style={{ display: "none" }}
                    />
                    <button
                        type="button"
                        className="reader-btn-primary"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        {pdfDoc ? "Upload Another PDF" : "Upload PDF"}
                    </button>

                    <Link to="/vocabulary" className="reader-btn-secondary">
                        <span>📚</span>
                        <span>Vocabulary</span>
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

            {/* Error Message */}
            {error && (
                <div style={{ padding: "16px 24px 0", maxWidth: "680px", margin: "0 auto", width: "100%" }}>
                    <div className="auth-error" role="alert">
                        <span className="auth-error-icon">⚠️</span>
                        <span>{error}</span>
                    </div>
                </div>
            )}

            {/* Reader Toolbar (Visible when PDF is loaded) */}
            {pdfDoc && (
                <div className="reader-toolbar">
                    {/* Page Navigation */}
                    <div className="toolbar-group">
                        <button
                            type="button"
                            className="toolbar-btn"
                            onClick={handlePrevPage}
                            disabled={currentPage <= 1}
                            title="Previous Page"
                        >
                            ◀ Prev
                        </button>
                        <span className="toolbar-info">
                            Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                        </span>
                        <button
                            type="button"
                            className="toolbar-btn"
                            onClick={handleNextPage}
                            disabled={currentPage >= totalPages}
                            title="Next Page"
                        >
                            Next ▶
                        </button>
                    </div>

                    <div className="toolbar-divider" />

                    {/* Zoom Controls */}
                    <div className="toolbar-group">
                        <button
                            type="button"
                            className="toolbar-btn icon-btn"
                            onClick={handleZoomOut}
                            disabled={scale <= 0.6}
                            title="Zoom Out"
                        >
                            −
                        </button>
                        <span className="toolbar-info zoom-info">
                            {Math.round(scale * 100)}%
                        </span>
                        <button
                            type="button"
                            className="toolbar-btn icon-btn"
                            onClick={handleZoomIn}
                            disabled={scale >= 3.0}
                            title="Zoom In"
                        >
                            +
                        </button>
                        <button
                            type="button"
                            className="toolbar-btn"
                            onClick={handleResetZoom}
                            title="Reset to 120%"
                        >
                            Reset
                        </button>
                    </div>
                </div>
            )}

            {/* Reader Main Content */}
            <main className="reader-content">
                {loading && (
                    <div className="reader-loading-state">
                        <div className="btn-spinner large" />
                        <p>Loading PDF document...</p>
                    </div>
                )}

                {!pdfDoc && !loading && (
                    <div
                        className={`upload-card ${isDragging ? "dragging" : ""}`}
                        onDragOver={(e) => {
                            e.preventDefault();
                            setIsDragging(true);
                        }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setIsDragging(false);
                            const file = e.dataTransfer.files?.[0];
                            if (file) loadPdfFile(file);
                        }}
                    >
                        <div className="upload-card-icon">📖</div>
                        <h3>Upload an English Book or PDF</h3>
                        <p>
                            Select or drop any PDF document here to start reading and translating unfamiliar words.
                        </p>
                        <button
                            type="button"
                            className="reader-btn-primary"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <span>📂</span>
                            <span>Choose PDF File</span>
                        </button>
                        <div className="upload-card-badge">
                            Client-Side Only • Private & Temporary
                        </div>
                    </div>
                )}

                {pdfDoc && !loading && (
                    <div
                        className="pdf-page-wrapper"
                        style={{
                            width: pageDimensions.width ? `${Math.floor(pageDimensions.width)}px` : "auto",
                            height: pageDimensions.height ? `${Math.floor(pageDimensions.height)}px` : "auto",
                        }}
                    >
                        <canvas ref={canvasRef} />
                        <div ref={textLayerRef} className="textLayer" />
                    </div>
                )}
            </main>

            {/* Contextual Word Popup */}
            {popupVisible && (
                <div
                    ref={popupRef}
                    className="word-popup"
                    style={{
                        position: "fixed",
                        top: `${popupPos.top}px`,
                        left: `${popupPos.left}px`,
                        zIndex: 99999,
                    }}
                >
                    <div className="popup-header">
                        <div className="popup-word-title">
                            <span>{wordData?.word || selectedWord}</span>
                            {wordData?.phonetic && (
                                <span className="popup-phonetic">{wordData.phonetic}</span>
                            )}
                        </div>
                        <button
                            type="button"
                            className="popup-close-btn"
                            onMouseDown={(e) => {
                                e.stopPropagation();
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                closePopup();
                            }}
                            title="Close (Esc)"
                        >
                            ✕
                        </button>
                    </div>

                    {popupLoading && (
                        <div className="popup-loading">
                            <div className="btn-spinner" />
                            <span>Looking up word & meaning...</span>
                        </div>
                    )}

                    {popupError && (
                        <div className="auth-error" style={{ marginBottom: "12px", fontSize: "13px" }}>
                            {popupError}
                        </div>
                    )}

                    {wordData && !popupLoading && (
                        <>
                            {/* Hindi Meaning */}
                            {wordData.hindiMeaning && (
                                <div className="popup-hindi-badge">
                                    <span className="popup-hindi-label">Hindi:</span>
                                    <span>{wordData.hindiMeaning}</span>
                                </div>
                            )}

                            {/* English Definition */}
                            <div className="popup-section">
                                <div className="popup-section-label">Definition</div>
                                <div className="popup-definition">
                                    {wordData.definition || "Definition not available."}
                                </div>
                            </div>

                            {/* Example Sentence */}
                            <div className="popup-section">
                                <div className="popup-section-label">Example</div>
                                <div className="popup-example">
                                    {wordData.exampleSentence && wordData.exampleSentence !== "Example not available."
                                        ? `“${wordData.exampleSentence}”`
                                        : "Example not available."}
                                </div>
                            </div>

                            {/* Save Word Button */}
                            <div className="popup-footer">
                                <button
                                    type="button"
                                    className={`popup-save-btn ${isWordSaved ? "saved" : ""}`}
                                    onClick={handleSaveWord}
                                    disabled={savingWord || isWordSaved}
                                >
                                    {isWordSaved ? (
                                        <>
                                            <span>✓</span>
                                            <span>Saved in Vocabulary</span>
                                        </>
                                    ) : savingWord ? (
                                        <>
                                            <span className="btn-spinner" />
                                            <span>Saving...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span>⭐</span>
                                            <span>Save Word</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default Reader;
