import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";
import { lookupWord, saveVocabulary, checkVocabularySaved, translateSentence, getMe } from "../services/api";

// Set worker source using Vite's URL import
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Shared discrete zoom levels across desktop and mobile: 60%, 70%, 80%, 90%, 100%, 110%, 120%
const ZOOM_LEVELS = [0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2];
const DEFAULT_ZOOM = 1.0;

// Check client-side SpeechSynthesis support safely
const isSpeechSupported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance !== "undefined";

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
    const [scale, setScale] = useState(DEFAULT_ZOOM);
    const [pageDimensions, setPageDimensions] = useState({ width: 0, height: 0 });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Contextual Popup State
    const [popupVisible, setPopupVisible] = useState(false);
    const [popupType, setPopupType] = useState("word"); // "word" | "sentence"
    const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });

    // Word Popup State
    const [selectedWord, setSelectedWord] = useState("");
    const [wordData, setWordData] = useState(null);
    const [popupLoading, setPopupLoading] = useState(false);
    const [popupError, setPopupError] = useState("");
    const [isWordSaved, setIsWordSaved] = useState(false);
    const [savingWord, setSavingWord] = useState(false);

    // Sentence Popup State
    const [selectedSentence, setSelectedSentence] = useState("");
    const [sentenceData, setSentenceData] = useState(null);
    const [sentenceLoading, setSentenceLoading] = useState(false);
    const [sentenceError, setSentenceError] = useState("");

    // Pronunciation state
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [voices, setVoices] = useState([]);
    const utteranceRef = useRef(null);

    // Cancel speech and clear utterance safely
    const stopPronunciation = useCallback(() => {
        if (utteranceRef.current) {
            utteranceRef.current.onstart = null;
            utteranceRef.current.onend = null;
            utteranceRef.current.onerror = null;
            utteranceRef.current = null;
        }
        if (isSpeechSupported) {
            try {
                window.speechSynthesis.cancel();
            } catch {
                // Safe ignore
            }
        }
        setIsSpeaking(false);
    }, []);

    // Load available voices asynchronously for Chrome/Android/Safari/iOS support
    useEffect(() => {
        if (!isSpeechSupported) return;

        const updateVoices = () => {
            try {
                const list = window.speechSynthesis.getVoices() || [];
                if (list.length > 0) {
                    setVoices(list);
                }
            } catch {
                // Safe ignore
            }
        };

        updateVoices();

        if (typeof window.speechSynthesis.addEventListener === "function") {
            window.speechSynthesis.addEventListener("voiceschanged", updateVoices);
        } else if ("onvoiceschanged" in window.speechSynthesis) {
            window.speechSynthesis.onvoiceschanged = updateVoices;
        }

        return () => {
            if (typeof window.speechSynthesis.removeEventListener === "function") {
                window.speechSynthesis.removeEventListener("voiceschanged", updateVoices);
            } else if ("onvoiceschanged" in window.speechSynthesis) {
                window.speechSynthesis.onvoiceschanged = null;
            }
        };
    }, []);

    // Cleanup: cancel speech when Reader unmounts
    useEffect(() => {
        return () => {
            if (utteranceRef.current) {
                utteranceRef.current.onstart = null;
                utteranceRef.current.onend = null;
                utteranceRef.current.onerror = null;
                utteranceRef.current = null;
            }
            if (isSpeechSupported) {
                try {
                    window.speechSynthesis.cancel();
                } catch {
                    // Safe ignore
                }
            }
        };
    }, []);

    // Safe English voice selector (prefer en-US, then en-GB, then English-capable, fallback to default)
    const getEnglishVoice = useCallback(() => {
        if (!isSpeechSupported) return null;
        try {
            const voiceList = voices.length > 0 ? voices : (window.speechSynthesis.getVoices() || []);
            if (!voiceList || voiceList.length === 0) return null;

            // 1. Prefer en-US
            let matched = voiceList.find((v) => /^en[-_]US$/i.test(v.lang));
            if (matched) return matched;

            // 2. Prefer en-GB
            matched = voiceList.find((v) => /^en[-_]GB$/i.test(v.lang));
            if (matched) return matched;

            // 3. Fallback to any English voice
            matched = voiceList.find((v) => /^en\b/i.test(v.lang) || v.lang?.toLowerCase().startsWith("en-"));
            if (matched) return matched;

            // 4. Fallback to default voice
            matched = voiceList.find((v) => v.default);
            return matched || voiceList[0] || null;
        } catch {
            return null;
        }
    }, [voices]);

    // Explicit pronunciation toggle triggered only by user click
    const togglePronunciation = useCallback((e) => {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }

        if (!isSpeechSupported) return;

        if (isSpeaking) {
            stopPronunciation();
            return;
        }

        const textToSpeak = (
            popupType === "sentence"
                ? (sentenceData?.sentence || selectedSentence || "")
                : (wordData?.word || selectedWord || "")
        ).trim();
        if (!textToSpeak) return;

        try {
            stopPronunciation();
            if (window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
            }

            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            utterance.rate = 0.9;
            utterance.pitch = 1.0;

            const voice = getEnglishVoice();
            if (voice) {
                utterance.voice = voice;
                utterance.lang = voice.lang || "en-US";
            } else {
                utterance.lang = "en-US";
            }

            utterance.onstart = () => {
                if (utteranceRef.current === utterance) {
                    setIsSpeaking(true);
                }
            };

            utterance.onend = () => {
                if (utteranceRef.current === utterance) {
                    setIsSpeaking(false);
                    utteranceRef.current = null;
                }
            };

            utterance.onerror = () => {
                if (utteranceRef.current === utterance) {
                    setIsSpeaking(false);
                    utteranceRef.current = null;
                }
            };

            utteranceRef.current = utterance;
            window.speechSynthesis.speak(utterance);
        } catch (err) {
            console.warn("[ReadLingo] Pronunciation error:", err);
            setIsSpeaking(false);
            utteranceRef.current = null;
        }
    }, [isSpeaking, popupType, sentenceData, selectedSentence, wordData, selectedWord, getEnglishVoice, stopPronunciation]);

    const [isDragging, setIsDragging] = useState(false);

    const popupVisibleRef = useRef(popupVisible);
    useEffect(() => {
        popupVisibleRef.current = popupVisible;
    }, [popupVisible]);

    const popupTypeRef = useRef(popupType);
    useEffect(() => {
        popupTypeRef.current = popupType;
    }, [popupType]);

    const activeWordRef = useRef("");
    const activeSentenceRef = useRef("");

    const [currentUser, setCurrentUser] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem("user")) || null;
        } catch {
            return null;
        }
    });

    useEffect(() => {
        let isMounted = true;
        getMe()
            .then((userData) => {
                if (isMounted && userData && userData.email) {
                    setCurrentUser(userData);
                    localStorage.setItem("user", JSON.stringify(userData));
                }
            })
            .catch(() => {});
        return () => {
            isMounted = false;
        };
    }, []);

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setCurrentUser(null);
        navigate("/login", { replace: true });
    };

    const pdfDocRef = useRef(null);
    useEffect(() => {
        pdfDocRef.current = pdfDoc;
    }, [pdfDoc]);

    useEffect(() => {
        return () => {
            if (pdfDocRef.current) {
                try {
                    if (typeof pdfDocRef.current.destroy === "function") {
                        pdfDocRef.current.destroy().catch(() => {});
                    } else if (typeof pdfDocRef.current.cleanup === "function") {
                        pdfDocRef.current.cleanup();
                    }
                } catch {
                    // Safe cleanup ignore
                }
            }
        };
    }, []);

    const loadPdfFile = async (file) => {
        if (!file) return;

        // Validation: Accept only PDF
        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
            setError("Please upload a valid PDF file (.pdf)");
            return;
        }

        if (file.size === 0) {
            setError("The selected PDF file is empty (0 bytes).");
            return;
        }

        if (file.size > 50 * 1024 * 1024) {
            setError("PDF file exceeds the 50MB browser memory limit. Please upload a smaller file.");
            return;
        }

        try {
            setError("");
            setLoading(true);
            setBookTitle(file.name);
            setPopupVisible(false);

            // Clean up any previously loaded PDF to free memory
            if (pdfDoc) {
                try {
                    if (typeof pdfDoc.destroy === "function") {
                        pdfDoc.destroy().catch(() => {});
                    } else if (typeof pdfDoc.cleanup === "function") {
                        pdfDoc.cleanup();
                    }
                } catch {
                    // Safe cleanup ignore
                }
            }

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

    // Render the current page on canvas + textLayer with devicePixelRatio support
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

                // Support high-DPI displays (Retina, mobile screens, high-DPI laptops)
                const dpr = window.devicePixelRatio || 1;
                // Cap outputScale to 2.5 to avoid excessive memory on extreme screens
                const outputScale = Math.min(Math.max(dpr, 1), 2.5);

                const viewport = page.getViewport({ scale });
                const cssWidth = Math.floor(viewport.width);
                const cssHeight = Math.floor(viewport.height);

                setPageDimensions({ width: cssWidth, height: cssHeight });

                const canvas = canvasRef.current;
                if (!canvas) return;

                const context = canvas.getContext("2d");
                // Internal canvas resolution scaled by outputScale for crisp rendering
                canvas.width = Math.floor(viewport.width * outputScale);
                canvas.height = Math.floor(viewport.height * outputScale);
                // Canvas display dimensions match viewport CSS layout pixels exactly
                canvas.style.width = `${cssWidth}px`;
                canvas.style.height = `${cssHeight}px`;

                const transform = outputScale !== 1
                    ? [outputScale, 0, 0, outputScale, 0, 0]
                    : null;

                const renderContext = {
                    canvasContext: context,
                    transform,
                    viewport,
                };

                const renderTask = page.render(renderContext);
                renderTaskRef.current = renderTask;
                await renderTask.promise;

                if (isCancelled) return;

                // Render TextLayer for selectable text (strictly aligned with canvas CSS dimensions)
                if (textLayerRef.current) {
                    const textLayerDiv = textLayerRef.current;
                    textLayerDiv.innerHTML = "";
                    textLayerDiv.style.width = `${cssWidth}px`;
                    textLayerDiv.style.height = `${cssHeight}px`;
                    textLayerDiv.style.setProperty("--total-scale-factor", viewport.scale);
                    textLayerDiv.style.setProperty("--scale-factor", viewport.scale);

                    const textContent = await page.getTextContent();
                    if (isCancelled) return;

                    const textLayer = new pdfjsLib.TextLayer({
                        textContentSource: textContent,
                        container: textLayerDiv,
                        viewport,
                    });

                    await textLayer.render();
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
    const getSelectionRect = (range, fallbackEl = null) => {
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

        // 3. Fallback to start element (the specific text span)
        if (fallbackEl?.getBoundingClientRect) {
            const fRect = fallbackEl.getBoundingClientRect();
            if (fRect.width > 0 || fRect.height > 0) {
                return fRect;
            }
        }

        // 4. Fallback to commonAncestorContainer element
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
        activeWordRef.current = "";
        activeSentenceRef.current = "";
        if (closingTimeoutRef.current) {
            clearTimeout(closingTimeoutRef.current);
        }
        closingTimeoutRef.current = setTimeout(() => {
            isClosingRef.current = false;
        }, 100);

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

        stopPronunciation();
        setPopupVisible(false);
        setPopupType("word");
        setSelectedWord("");
        setWordData(null);
        setPopupLoading(false);
        setPopupError("");
        setIsWordSaved(false);
        setSavingWord(false);
        setSelectedSentence("");
        setSentenceData(null);
        setSentenceLoading(false);
        setSentenceError("");
    }, [stopPronunciation]);

    // Detect user text selection on the PDF
    const handleSelection = useCallback(async () => {
        if (isClosingRef.current) {
            return;
        }

        const selection = window.getSelection();
        if (!selection) {
            return;
        }

        if (selection.isCollapsed) {
            if (popupVisibleRef.current) {
                closePopup();
            }
            return;
        }

        const rawText = selection.toString();
        if (!rawText || !rawText.trim()) {
            return;
        }

        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        if (!range) {
            return;
        }

        const containerNode = range.commonAncestorContainer;
        const startNode = range.startContainer;
        const endNode = range.endContainer;
        const startEl = startNode?.nodeType === Node.ELEMENT_NODE ? startNode : startNode?.parentElement;
        const endEl = endNode?.nodeType === Node.ELEMENT_NODE ? endNode : endNode?.parentElement;
        const targetElement = containerNode?.nodeType === Node.ELEMENT_NODE
            ? containerNode
            : containerNode?.parentElement;

        // Never trigger selection from inside the popup
        if (targetElement?.closest(".word-popup") || startEl?.closest(".word-popup")) {
            return;
        }

        // Verify selection is inside PDF TextLayer or PDF reader page (support cross-span selections)
        const inTextLayer = Boolean(
            targetElement?.closest(".textLayer") ||
            targetElement?.closest(".pdf-page-wrapper") ||
            startEl?.closest(".textLayer") ||
            endEl?.closest(".textLayer") ||
            startEl?.closest(".pdf-page-wrapper")
        );

        if (!inTextLayer) {
            return;
        }

        // Clean invisible/zero-width chars, soft hyphens, non-breaking spaces
        const sanitized = rawText
            .replace(/[\u200B-\u200D\uFEFF\u00AD\u200E\u200F\u00A0]/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        if (!sanitized) {
            return;
        }

        // 1. Single English word check
        const cleanedWord = sanitized
            .replace(/^[\s"'“‘([{<«–—.,;:!?]+|[\s"'”’)\]}>»–—.,;:!?]+$/g, "")
            .trim()
            .toLowerCase();
        const isSingleWord = /^[a-zA-Z]+(?:['’-][a-zA-Z]+)*$/.test(cleanedWord) &&
            cleanedWord.length >= 1 &&
            cleanedWord.length <= 45;

        // 2. Sentence / Multiple English words check
        const cleanedSentence = sanitized
            .replace(/^[\s"'“‘([{<«–—]+|[\s"'”’)\]}>»–—]+$/g, "")
            .trim();
        const sentenceWords = cleanedSentence.split(/\s+/).filter(Boolean);
        const isSentence = !isSingleWord &&
            sentenceWords.length >= 2 &&
            sentenceWords.length <= 150 &&
            /[a-zA-Z]{2,}/.test(cleanedSentence) &&
            cleanedSentence.length <= 1000;

        if (!isSingleWord && !isSentence) {
            return;
        }

        const rect = getSelectionRect(range, startEl);
        if (!rect) {
            return;
        }

        // Temporary debug logs for classification verification
        if (process.env.NODE_ENV !== "production") {
            console.log("[ReadLingo] Selection classified:", {
                rawText,
                sanitized,
                isSingleWord,
                isSentence,
                cleanedWord: isSingleWord ? cleanedWord : null,
                cleanedSentence: isSentence ? cleanedSentence : null,
                rect,
                targetElement,
            });
        }

        // Handle Single English Word Selection
        if (isSingleWord) {
            if (activeWordRef.current === cleanedWord && popupVisibleRef.current && popupTypeRef.current === "word") {
                return;
            }
            activeWordRef.current = cleanedWord;
            activeSentenceRef.current = "";

            const popupWidth = Math.min(340, window.innerWidth - 32);
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

            stopPronunciation();
            setPopupType("word");
            setSelectedWord(cleanedWord);
            setSelectedSentence("");
            setSentenceData(null);
            setSentenceError("");
            setSentenceLoading(false);
            setPopupPos({ top, left });
            setPopupVisible(true);
            setPopupLoading(true);
            setPopupError("");
            setWordData(null);
            setIsWordSaved(false);

            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            const controller = new AbortController();
            abortControllerRef.current = controller;
            const currentReqId = ++latestRequestIdRef.current;

            try {
                const data = await lookupWord(cleanedWord, { signal: controller.signal });
                if (latestRequestIdRef.current !== currentReqId) return;
                setWordData(data);
                setPopupLoading(false);

                checkVocabularySaved(cleanedWord, { signal: controller.signal })
                    .then((checkRes) => {
                        if (latestRequestIdRef.current === currentReqId) {
                            setIsWordSaved(Boolean(checkRes?.isSaved));
                        }
                    })
                    .catch(() => {});
            } catch (err) {
                if (err.name === "AbortError" || latestRequestIdRef.current !== currentReqId) return;
                setPopupLoading(false);
                setPopupError(err.message || "Could not find word details");
            }
            return;
        }

        // Handle Multiple Words / Sentence Selection
        if (isSentence) {
            if (activeSentenceRef.current === cleanedSentence && popupVisibleRef.current && popupTypeRef.current === "sentence") {
                return;
            }
            activeSentenceRef.current = cleanedSentence;
            activeWordRef.current = "";

            const popupWidth = Math.min(390, window.innerWidth - 32);
            let left = rect.left + rect.width / 2 - popupWidth / 2;
            left = Math.max(16, Math.min(left, window.innerWidth - popupWidth - 16));

            const estimatedHeight = 260;
            let top = rect.bottom + 10;
            if (top + estimatedHeight > window.innerHeight) {
                if (rect.top - estimatedHeight - 10 > 10) {
                    top = rect.top - estimatedHeight - 10;
                } else {
                    top = Math.max(16, window.innerHeight - estimatedHeight - 16);
                }
            }

            stopPronunciation();
            setPopupType("sentence");
            setSelectedSentence(cleanedSentence);
            setSelectedWord("");
            setWordData(null);
            setPopupLoading(false);
            setPopupError("");
            setIsWordSaved(false);
            setSentenceLoading(true);
            setSentenceError("");
            setSentenceData(null);
            setPopupPos({ top, left });
            setPopupVisible(true);

            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            const controller = new AbortController();
            abortControllerRef.current = controller;
            const currentReqId = ++latestRequestIdRef.current;

            try {
                const data = await translateSentence(cleanedSentence, { signal: controller.signal });
                if (latestRequestIdRef.current !== currentReqId) return;
                setSentenceData(data);
                setSentenceLoading(false);
            } catch (err) {
                if (err.name === "AbortError" || latestRequestIdRef.current !== currentReqId) return;
                setSentenceLoading(false);
                setSentenceError(err.message || "Could not translate sentence");
            }
            return;
        }
    }, [closePopup, stopPronunciation]);

    const selectionTimeoutRef = useRef(null);

    // Document-level selection listeners: mouseup (desktop), touchend (mobile), and selectionchange (debounced)
    useEffect(() => {
        const scheduleSelection = (delay) => {
            if (isClosingRef.current) return;
            if (selectionTimeoutRef.current) {
                clearTimeout(selectionTimeoutRef.current);
            }
            selectionTimeoutRef.current = setTimeout(handleSelection, delay);
        };

        const onMouseUp = (e) => {
            if (popupRef.current && popupRef.current.contains(e.target)) {
                return;
            }
            scheduleSelection(30);
        };

        const onTouchEnd = (e) => {
            if (popupRef.current && popupRef.current.contains(e.target)) {
                return;
            }
            // Allow 100ms for mobile selection handles to settle
            scheduleSelection(100);
        };

        const onSelectionChange = () => {
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed) return;
            const text = selection.toString().trim();
            if (!text) return;

            scheduleSelection(150);
        };

        document.addEventListener("mouseup", onMouseUp);
        document.addEventListener("touchend", onTouchEnd);
        document.addEventListener("selectionchange", onSelectionChange);

        return () => {
            document.removeEventListener("mouseup", onMouseUp);
            document.removeEventListener("touchend", onTouchEnd);
            document.removeEventListener("selectionchange", onSelectionChange);
            if (selectionTimeoutRef.current) {
                clearTimeout(selectionTimeoutRef.current);
            }
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
                // Do NOT close if tapping inside PDF textLayer or PDF page wrapper (user might be selecting a word!)
                if (
                    e.target.closest(".textLayer") ||
                    e.target.closest(".pdf-page-wrapper") ||
                    e.target.tagName === "CANVAS"
                ) {
                    return;
                }
                closePopup();
            }
        };

        if (popupVisible) {
            document.addEventListener("mousedown", handleClickOutside);
            document.addEventListener("touchstart", handleClickOutside, { passive: true });
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("touchstart", handleClickOutside);
        };
    }, [popupVisible, closePopup]);

    // Save Word handler: User must explicitly click 'Save Word' (never auto-saved)
    const handleSaveWord = async () => {
        if (!wordData || isWordSaved || savingWord) return;

        try {
            setSavingWord(true);
            await saveVocabulary({
                word: wordData.word || selectedWord,
                definition: wordData.definition || "",
                hindiMeaning: wordData.hindiMeaning || "",
                exampleSentence: wordData.exampleSentence || "",
                phonetic: wordData.phonetic || "",
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
            stopPronunciation();
            setPopupVisible(false);
            setCurrentPage((prev) => prev - 1);
        }
    };

    const handleNextPage = () => {
        if (currentPage < totalPages) {
            stopPronunciation();
            setPopupVisible(false);
            setCurrentPage((prev) => prev + 1);
        }
    };

    // Shared zoom handlers through discrete levels: 60, 70, 80, 90, 100, 110, 120
    const handleZoomIn = () => {
        stopPronunciation();
        setPopupVisible(false);
        setScale((prev) => {
            const rounded = Number(prev.toFixed(1));
            const currentIndex = ZOOM_LEVELS.findIndex((lvl) => Math.abs(lvl - rounded) < 0.05);
            if (currentIndex >= 0 && currentIndex < ZOOM_LEVELS.length - 1) {
                return ZOOM_LEVELS[currentIndex + 1];
            }
            const next = ZOOM_LEVELS.find((lvl) => lvl > rounded + 0.01);
            return next !== undefined ? next : ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
        });
    };

    const handleZoomOut = () => {
        stopPronunciation();
        setPopupVisible(false);
        setScale((prev) => {
            const rounded = Number(prev.toFixed(1));
            const currentIndex = ZOOM_LEVELS.findIndex((lvl) => Math.abs(lvl - rounded) < 0.05);
            if (currentIndex > 0) {
                return ZOOM_LEVELS[currentIndex - 1];
            }
            const reversed = [...ZOOM_LEVELS].reverse();
            const prevLvl = reversed.find((lvl) => lvl < rounded - 0.01);
            return prevLvl !== undefined ? prevLvl : ZOOM_LEVELS[0];
        });
    };

    const handleResetZoom = () => {
        stopPronunciation();
        setPopupVisible(false);
        setScale(DEFAULT_ZOOM);
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
                        onClick={handleLogout}
                        className="reader-btn-secondary reader-btn-logout"
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

                    {/* Shared Responsive Zoom Controls: 60%, 70%, 80%, 90%, 100%, 110%, 120% */}
                    <div className="toolbar-group">
                        <button
                            type="button"
                            className="toolbar-btn icon-btn"
                            onClick={handleZoomOut}
                            disabled={scale <= ZOOM_LEVELS[0]}
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
                            disabled={scale >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
                            title="Zoom In"
                        >
                            +
                        </button>
                        <button
                            type="button"
                            className="toolbar-btn"
                            onClick={handleResetZoom}
                            title="Reset to 100%"
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
                            Select or drop any PDF document here to start reading and translating unfamiliar words. Your PDF stays in your browser and isn't uploaded to our server.
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
                            🔒 Private • PDF is not uploaded
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

            {/* Contextual Word / Sentence Popup */}
            {popupVisible && (
                <div
                    ref={popupRef}
                    className={`word-popup ${popupType === "sentence" ? "sentence-popup" : ""}`}
                    style={{
                        position: "fixed",
                        top: `${popupPos.top}px`,
                        left: `${popupPos.left}px`,
                        zIndex: 99999,
                    }}
                >
                    {popupType === "word" ? (
                        <>
                            <div className="popup-header">
                                <div className="popup-word-title">
                                    <span className="popup-word-text">{wordData?.word || selectedWord}</span>
                                    {isSpeechSupported && (
                                        <button
                                            type="button"
                                            className={`popup-audio-btn ${isSpeaking ? "playing" : ""}`}
                                            onClick={togglePronunciation}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            onTouchEnd={(e) => e.stopPropagation()}
                                            title={isSpeaking ? "Stop pronunciation" : "Pronounce word"}
                                            aria-label={isSpeaking ? "Stop pronunciation" : "Pronounce word"}
                                        >
                                            <svg
                                                width="15"
                                                height="15"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                aria-hidden="true"
                                            >
                                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                                {isSpeaking && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
                                            </svg>
                                        </button>
                                    )}
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
                                    {/* Hindi Meaning Badge */}
                                    {wordData.hindiMeaning && wordData.hindiMeaning !== "Translation not available." ? (
                                        <div className="popup-hindi-badge">
                                            <span className="popup-hindi-label">Hindi:</span>
                                            <span>{wordData.hindiMeaning}</span>
                                        </div>
                                    ) : (
                                        <div className="popup-hindi-badge fallback">
                                            <span className="popup-hindi-label">Hindi:</span>
                                            <span>Translation unavailable</span>
                                        </div>
                                    )}

                                    {/* English Definition Section */}
                                    <div className="popup-section">
                                        <div className="popup-section-label">Definition</div>
                                        <div className="popup-definition">
                                            {wordData.definition || "Definition not available."}
                                        </div>
                                    </div>

                                    {/* Example Sentence Section */}
                                    <div className="popup-section">
                                        <div className="popup-section-label">Example</div>
                                        <div className="popup-example">
                                            {wordData.exampleSentence && wordData.exampleSentence !== "Example not available."
                                                ? `“${wordData.exampleSentence}”`
                                                : "Example not available."}
                                        </div>
                                    </div>

                                    {/* Save Word Button (Enabled when word data is loaded; never auto-saved) */}
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
                        </>
                    ) : (
                        <>
                            {/* Sentence Understanding Popup */}
                            <div className="popup-header">
                                <div className="popup-sentence-title">
                                    <span className="popup-tag-badge">Sentence</span>
                                    {isSpeechSupported && (
                                        <button
                                            type="button"
                                            className={`popup-audio-btn ${isSpeaking ? "playing" : ""}`}
                                            onClick={togglePronunciation}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            onTouchEnd={(e) => e.stopPropagation()}
                                            title={isSpeaking ? "Stop pronunciation" : "Pronounce sentence"}
                                            aria-label={isSpeaking ? "Stop pronunciation" : "Pronounce sentence"}
                                        >
                                            <svg
                                                width="15"
                                                height="15"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                aria-hidden="true"
                                            >
                                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                                {isSpeaking && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
                                            </svg>
                                        </button>
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

                            {/* Selected Sentence Quote Display */}
                            <div className="sentence-display-box">
                                “{selectedSentence}”
                            </div>

                            {sentenceLoading && (
                                <div className="popup-loading">
                                    <div className="btn-spinner" />
                                    <span>Translating sentence...</span>
                                </div>
                            )}

                            {sentenceError && (
                                <div className="auth-error" style={{ marginBottom: "12px", fontSize: "13px" }}>
                                    {sentenceError}
                                </div>
                            )}

                            {sentenceData && !sentenceLoading && (
                                <div className="sentence-hindi-box">
                                    <div className="popup-section-label">Hindi Translation</div>
                                    <div className="sentence-hindi-text">
                                        {sentenceData.hindiTranslation && sentenceData.hindiTranslation !== "Translation not available."
                                            ? sentenceData.hindiTranslation
                                            : "Translation unavailable."}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default Reader;
