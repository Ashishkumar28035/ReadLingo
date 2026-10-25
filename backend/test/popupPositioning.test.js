import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    POPUP_MARGIN,
    clampPositionToViewport,
    computeAutoPopupPosition,
    resolveEffectivePopupPosition,
} from '../../src/utils/popupPositioning.js';

describe('Popup Positioning, Clamping & Session Memory Suite', () => {
    describe('1. Viewport Clamping (clampPositionToViewport)', () => {
        const viewport = { width: 412, height: 915 }; // Mobile screen
        const dimensions = { width: 340, height: 300 };

        test('preserves valid coordinates comfortably within bounds', () => {
            const pos = { left: 50, top: 200 };
            const clamped = clampPositionToViewport(pos, dimensions, viewport);
            assert.equal(clamped.left, 50);
            assert.equal(clamped.top, 200);
        });

        test('clamps negative coordinates to margin boundary', () => {
            const pos = { left: -50, top: -20 };
            const clamped = clampPositionToViewport(pos, dimensions, viewport);
            assert.equal(clamped.left, POPUP_MARGIN);
            assert.equal(clamped.top, POPUP_MARGIN);
        });

        test('clamps coordinates extending beyond right or bottom screen edge', () => {
            const pos = { left: 500, top: 1200 };
            const clamped = clampPositionToViewport(pos, dimensions, viewport);
            // maxLeft = 412 - 340 - 12 = 60
            assert.equal(clamped.left, 60);
            // maxTop = 915 - 300 - 12 = 603
            assert.equal(clamped.top, 603);
        });

        test('simulates mobile screen rotation and keeps popup visible', () => {
            // User had positioned popup in portrait mode (412 x 915) at top: 700
            const portraitPos = { left: 40, top: 700 };

            // User rotates phone to landscape (915 x 412)
            const landscapeViewport = { width: 915, height: 412 };
            const clamped = clampPositionToViewport(portraitPos, dimensions, landscapeViewport);

            // In landscape (height 412), top: 700 would be completely off-screen.
            // Clamping must bring it back inside: 412 - 300 - 12 = 100
            assert.ok(clamped.top <= landscapeViewport.height - dimensions.height - POPUP_MARGIN);
            assert.equal(clamped.top, 100);
            assert.equal(clamped.left, 40);
        });
    });

    describe('2. Automatic Anchor Calculation (computeAutoPopupPosition)', () => {
        const viewport = { width: 800, height: 600 };

        test('places popup below selection when sufficient space below exists', () => {
            const mockRange = {
                getBoundingClientRect: () => ({ top: 100, bottom: 120, left: 200, right: 280, width: 80, height: 20 }),
                getClientRects: () => [{ top: 100, bottom: 120, left: 200, right: 280, width: 80, height: 20 }],
            };

            const pos = computeAutoPopupPosition(mockRange, 'word', viewport);
            // Must be below selection: top >= 120 + offset
            assert.ok(pos.top >= 130);
        });

        test('falls back above selection when space below is insufficient', () => {
            // Selection near the bottom of viewport
            const mockRange = {
                getBoundingClientRect: () => ({ top: 500, bottom: 520, left: 200, right: 280, width: 80, height: 20 }),
                getClientRects: () => [{ top: 500, bottom: 520, left: 200, right: 280, width: 80, height: 20 }],
            };

            const pos = computeAutoPopupPosition(mockRange, 'word', viewport);
            // Must be above selection: top < 500
            assert.ok(pos.top < 500);
            assert.ok(pos.top >= POPUP_MARGIN);
        });

        test('handles missing range safely without errors', () => {
            const pos = computeAutoPopupPosition(null, 'word', viewport);
            assert.ok(typeof pos.top === 'number');
            assert.ok(typeof pos.left === 'number');
            assert.ok(pos.top >= POPUP_MARGIN);
            assert.ok(pos.left >= POPUP_MARGIN);
        });
    });

    describe('3. User Manual Position Retention vs Auto Anchor (resolveEffectivePopupPosition)', () => {
        const viewport = { width: 1024, height: 768 };
        const dimensions = { width: 340, height: 300 };

        const wordRange1 = {
            getBoundingClientRect: () => ({ top: 100, bottom: 120, left: 200, right: 260, width: 60, height: 20 }),
            getClientRects: () => [{ top: 100, bottom: 120, left: 200, right: 260, width: 60, height: 20 }],
        };

        const wordRange2 = {
            getBoundingClientRect: () => ({ top: 400, bottom: 420, left: 500, right: 580, width: 80, height: 20 }),
            getClientRects: () => [{ top: 400, bottom: 420, left: 500, right: 580, width: 80, height: 20 }],
        };

        test('defaults to auto anchor when user has NOT moved the popup', () => {
            const resolved = resolveEffectivePopupPosition({
                userManualPos: null,
                range: wordRange1,
                popupType: 'word',
                popupDimensions: dimensions,
                viewport,
            });

            // Auto position will be anchored near word 1
            assert.ok(resolved.top >= 130 && resolved.top <= 200);
        });

        test('REGRESSION: remembers user manual position when new selection is made', () => {
            // User manually moved popup to (left: 30, top: 40)
            const userChosenPos = { left: 30, top: 40 };

            // User now selects word 2 at bottom of screen
            const resolved = resolveEffectivePopupPosition({
                userManualPos: userChosenPos,
                range: wordRange2, // completely different text coordinates
                popupType: 'word',
                popupDimensions: dimensions,
                viewport,
            });

            // DESIRED BEHAVIOR: does NOT jump to auto anchor near word 2!
            // Instead, retains user's chosen (30, 40)
            assert.equal(resolved.left, 30);
            assert.equal(resolved.top, 40);
        });

        test('supports bottom dock mode keeping popup completely out of reading area', () => {
            const resolved = resolveEffectivePopupPosition({
                userManualPos: null,
                range: wordRange1,
                popupType: 'word',
                popupDimensions: dimensions,
                viewport,
                dockMode: 'bottom',
            });

            // Docked at bottom: top is near the bottom edge
            assert.ok(resolved.top >= viewport.height - dimensions.height - POPUP_MARGIN);
            // Centered horizontally
            assert.ok(resolved.left > 0);
        });
    });
});
