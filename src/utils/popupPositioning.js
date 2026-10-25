/**
 * Popup Positioning, Clamping, and Session Geometry Utilities
 *
 * Implements:
 * 1. Clamping within viewport boundaries for all screen orientations.
 * 2. Session position retention for user-dragged coordinates.
 * 3. Automatic anchor calculation near selected text when not manually positioned.
 * 4. Responsive dock and minimized geometry.
 */

export const POPUP_MARGIN = 12;
export const WORD_POPUP_DEFAULT_WIDTH = 340;
export const SENTENCE_POPUP_DEFAULT_WIDTH = 400;
export const WORD_POPUP_ESTIMATED_HEIGHT = 310;
export const SENTENCE_POPUP_ESTIMATED_HEIGHT = 250;
export const MINIMIZED_POPUP_HEIGHT = 44;

/**
 * Clamps coordinates so the popup is completely visible within viewport.
 * Accounts for margin, viewport width/height, and popup dimensions.
 */
export function clampPositionToViewport(pos, dimensions = {}, viewport = null) {
    const vw = viewport?.width ?? (typeof window !== "undefined" ? window.innerWidth : 1024);
    const vh = viewport?.height ?? (typeof window !== "undefined" ? window.innerHeight : 768);
    const margin = POPUP_MARGIN;

    const width = Math.min(dimensions.width || WORD_POPUP_DEFAULT_WIDTH, vw - margin * 2);
    const height = dimensions.height || WORD_POPUP_ESTIMATED_HEIGHT;

    const minLeft = margin;
    const maxLeft = Math.max(margin, vw - width - margin);
    const minTop = margin;
    const maxTop = Math.max(margin, vh - height - margin);

    const safeLeft = typeof pos?.left === "number" ? pos.left : minLeft;
    const safeTop = typeof pos?.top === "number" ? pos.top : minTop;

    return {
        left: Math.round(Math.min(Math.max(safeLeft, minLeft), maxLeft)),
        top: Math.round(Math.min(Math.max(safeTop, minTop), maxTop)),
    };
}

/**
 * Calculates initial automatic anchor position near text selection.
 */
export function computeAutoPopupPosition(range, popupType, viewport = null, fallbackEl = null) {
    const vw = viewport?.width ?? (typeof window !== "undefined" ? window.innerWidth : 1024);
    const vh = viewport?.height ?? (typeof window !== "undefined" ? window.innerHeight : 768);

    const isWord = popupType === "word";
    const defaultWidth = isWord ? WORD_POPUP_DEFAULT_WIDTH : SENTENCE_POPUP_DEFAULT_WIDTH;
    const popupWidth = Math.min(defaultWidth, vw - 32);
    const estimatedHeight = isWord ? WORD_POPUP_ESTIMATED_HEIGHT : SENTENCE_POPUP_ESTIMATED_HEIGHT;
    const margin = POPUP_MARGIN;
    const offset = 10;

    if (!range) {
        return {
            top: 100,
            left: Math.max(margin, Math.round((vw - popupWidth) / 2)),
        };
    }

    const clientRects = Array.from(range.getClientRects ? range.getClientRects() : []).filter(
        (r) => r.width > 0 && r.height > 0
    );
    const bRect = range.getBoundingClientRect ? range.getBoundingClientRect() : null;

    let selTop = bRect?.top || 0;
    let selBottom = bRect?.bottom || 0;
    let selLeft = bRect?.left || 0;
    let selRight = bRect?.right || 0;

    if (clientRects.length > 0) {
        selTop = Math.min(...clientRects.map((r) => r.top));
        selBottom = Math.max(...clientRects.map((r) => r.bottom));
        selLeft = Math.min(...clientRects.map((r) => r.left));
        selRight = Math.max(...clientRects.map((r) => r.right));
    } else if (fallbackEl?.getBoundingClientRect) {
        const fRect = fallbackEl.getBoundingClientRect();
        if (fRect.width > 0 || fRect.height > 0) {
            selTop = fRect.top;
            selBottom = fRect.bottom;
            selLeft = fRect.left;
            selRight = fRect.right;
        }
    }

    // Center horizontally with the selected text
    const selCenterX = selLeft + (selRight - selLeft) / 2;
    let left = selCenterX - popupWidth / 2;
    left = Math.max(margin, Math.min(left, vw - popupWidth - margin));

    // Vertical placement: prefer below selection, fallback above, fallback clamp
    const spaceBelow = vh - selBottom;
    const spaceAbove = selTop;

    let top;
    if (spaceBelow >= estimatedHeight + offset + margin) {
        top = selBottom + offset;
    } else if (spaceAbove >= estimatedHeight + offset + margin) {
        top = selTop - estimatedHeight - offset;
    } else {
        top = spaceBelow >= spaceAbove
            ? Math.max(margin, vh - estimatedHeight - margin)
            : margin;
    }

    top = Math.max(margin, Math.min(top, vh - estimatedHeight - margin));

    return { top: Math.round(top), left: Math.round(left) };
}

/**
 * Resolves the effective position:
 * If user has explicitly moved the popup during the current session, preserves that position (clamped).
 * Otherwise, calculates automatic anchor near selection.
 */
export function resolveEffectivePopupPosition({
    userManualPos,
    range,
    popupType,
    popupDimensions,
    viewport,
    fallbackEl,
    dockMode = "float", // "float" | "bottom"
}) {
    const vw = viewport?.width ?? (typeof window !== "undefined" ? window.innerWidth : 1024);
    const vh = viewport?.height ?? (typeof window !== "undefined" ? window.innerHeight : 768);

    if (dockMode === "bottom") {
        const defaultWidth = popupType === "word" ? WORD_POPUP_DEFAULT_WIDTH : SENTENCE_POPUP_DEFAULT_WIDTH;
        const width = Math.min(popupDimensions?.width || defaultWidth, vw - 32);
        const height = popupDimensions?.height || (popupType === "word" ? 220 : 180);
        return {
            left: Math.round(Math.max(POPUP_MARGIN, (vw - width) / 2)),
            top: Math.round(Math.max(POPUP_MARGIN, vh - height - POPUP_MARGIN)),
        };
    }

    if (userManualPos && typeof userManualPos.top === "number" && typeof userManualPos.left === "number") {
        return clampPositionToViewport(userManualPos, popupDimensions, viewport);
    }

    return computeAutoPopupPosition(range, popupType, viewport, fallbackEl);
}
