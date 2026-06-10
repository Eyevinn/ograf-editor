import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OGrafTemplate } from '../src/models/OGrafTemplate.js';
import { TimelinePanel } from '../src/components/TimelinePanel.js';

// jsdom has no rAF by default; install a controllable one so the playhead
// sweep loop can be driven deterministically in tests.
if (typeof globalThis.requestAnimationFrame !== 'function') {
    globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
}
if (typeof globalThis.cancelAnimationFrame !== 'function') {
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

/**
 * GAP-B.2 Timeline panel render + wiring smoke tests (jsdom).
 *
 * The full panel is drag/focus-heavy and not every interaction can be faithfully
 * exercised in jsdom (no real layout, no Element.animate by default), but the
 * render path, the placement contract (sibling after .editor-content), the
 * collapse persistence, the elementSelected highlight, and the add-keyframe ->
 * custom-lock path ARE checkable here. The keyboard drag/playhead geometry and
 * the live WAAPI preview are verified manually in the browser (noted in the PR).
 */

function setupDom() {
    document.body.innerHTML = `
        <section class="editor-area">
            <div class="editor-tabs"></div>
            <div class="editor-content"></div>
        </section>
        <div id="visual-editor"><div class="graphics-canvas"></div></div>
    `;
    if (!window.matchMedia) {
        window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    }
    if (typeof globalThis.CSS === 'undefined') {
        globalThis.CSS = { escape: (s) => String(s) };
    }
}

function makePanel() {
    const tpl = OGrafTemplate.createFromType('lower-third', 'panel-test', 'Panel Test', 'd');
    const templateManager = {
        getCurrentTemplate: () => tpl,
        saveToStorage: () => {}
    };
    const veContainer = document.querySelector('#visual-editor');
    const visualEditor = { container: veContainer, canvas: document.querySelector('.graphics-canvas') };
    const area = document.querySelector('.editor-area');
    const panel = new TimelinePanel(area, templateManager, visualEditor);
    return { panel, tpl, area, veContainer };
}

describe('TimelinePanel placement and render', () => {
    beforeEach(() => {
        setupDom();
        localStorage.clear();
    });

    it('docks at the bottom of .editor-area as the last flex child', () => {
        const { area } = makePanel();
        const panelEl = area.querySelector('.timeline-panel');
        expect(panelEl).toBeTruthy();
        expect(area.lastElementChild).toBe(panelEl);
        // It is a sibling of .editor-content, not inside any .editor-tab.
        expect(panelEl.closest('.editor-tab')).toBeNull();
    });

    it('shows a header with title and live in/out summary', () => {
        const { area } = makePanel();
        expect(area.querySelector('.timeline-title').textContent).toBe('Timeline');
        // Default lower-third uses the 500ms slide preset for both actions.
        expect(area.querySelector('.timeline-summary').textContent).toBe('In 500 ms, out 500 ms');
    });

    it('renders one track per element with an In and an Out lane', () => {
        const { area, tpl } = makePanel();
        const tracks = area.querySelectorAll('.timeline-track');
        expect(tracks.length).toBe(tpl.elements.length);
        // Two lanes per track.
        expect(area.querySelectorAll('.timeline-lane').length).toBe(tpl.elements.length * 2);
        // Lanes are labelled for a11y.
        const labels = Array.from(area.querySelectorAll('.timeline-lane')).map(l => l.getAttribute('aria-label'));
        expect(labels).toContain('In animation');
        expect(labels).toContain('Out animation');
    });

    it('exposes the a11y grid, track groups, and playhead slider', () => {
        const { area } = makePanel();
        expect(area.querySelector('.timeline-grid').getAttribute('aria-label')).toBe('Animation timeline');
        expect(area.querySelector('.timeline-track').getAttribute('role')).toBe('group');
        const ph = area.querySelector('.timeline-playhead');
        expect(ph.getAttribute('role')).toBe('slider');
        expect(ph.getAttribute('aria-valuemin')).toBe('0');
        expect(ph.getAttribute('aria-valuetext')).toMatch(/milliseconds/);
    });

    it('highlights the track when the canvas dispatches elementSelected', () => {
        const { area, tpl, veContainer } = makePanel();
        const id = tpl.elements[0].id;
        veContainer.dispatchEvent(new CustomEvent('elementSelected', { detail: { elementId: id } }));
        const selected = area.querySelector('.timeline-track.selected');
        expect(selected).toBeTruthy();
        expect(selected.dataset.track).toBe(id);
    });
});

describe('TimelinePanel collapse persistence', () => {
    beforeEach(() => {
        setupDom();
        localStorage.clear();
    });

    it('toggles collapsed state, hides the body, and persists to localStorage', () => {
        const { area } = makePanel();
        const toggle = area.querySelector('.timeline-toggle');
        expect(area.querySelector('.timeline-body').hasAttribute('hidden')).toBe(false);
        toggle.click();
        expect(area.querySelector('.timeline-panel').classList.contains('collapsed')).toBe(true);
        expect(area.querySelector('.timeline-body').hasAttribute('hidden')).toBe(true);
        expect(localStorage.getItem('ograf-timeline-panel-collapsed')).toBe('1');
        // Summary stays visible while collapsed (state not lost).
        expect(area.querySelector('.timeline-summary').textContent).toBe('In 500 ms, out 500 ms');
    });
});

describe('TimelinePanel add-keyframe drives the model and the custom lock', () => {
    beforeEach(() => {
        setupDom();
        localStorage.clear();
    });

    it('Add keyframe inserts at the playhead and marks the lane custom', () => {
        const { panel, tpl } = makePanel();
        const id = tpl.elements[0].id;
        // Start from an empty in lane.
        const lane = tpl.getLane(id, 'in');
        lane.keyframes = [];
        lane.custom = false;

        panel.selectedElementId = id;
        panel.selectedLane = 'in';
        panel.playhead = 320;
        panel.addKeyframeAtPlayhead();

        const edited = tpl.getLane(id, 'in');
        expect(edited.custom).toBe(true);
        expect(edited.keyframes.length).toBe(1);
        expect(edited.keyframes[0].t).toBe(320);
    });
});

describe('TimelinePanel handles the no-template state without throwing', () => {
    beforeEach(() => {
        setupDom();
        localStorage.clear();
    });

    it('renders an empty-state body when there is no current template', () => {
        const veContainer = document.querySelector('#visual-editor');
        const templateManager = { getCurrentTemplate: () => null, saveToStorage: () => {} };
        const visualEditor = { container: veContainer, canvas: document.querySelector('.graphics-canvas') };
        const area = document.querySelector('.editor-area');
        const panel = new TimelinePanel(area, templateManager, visualEditor);
        expect(() => panel.render()).not.toThrow();
        expect(area.querySelector('.timeline-summary').textContent).toBe('No template');
    });
});

// ---- In/Out preview toggle -------------------------------------------------

describe('TimelinePanel In/Out preview toggle', () => {
    beforeEach(() => {
        setupDom();
        localStorage.clear();
    });

    it('renders a two-button segmented toggle defaulting to In', () => {
        const { panel, area } = makePanel();
        expect(panel.previewAction).toBe('in');
        const buttons = area.querySelectorAll('[data-preview-action]');
        expect(buttons.length).toBe(2);
        const inBtn = area.querySelector('[data-preview-action="in"]');
        const outBtn = area.querySelector('[data-preview-action="out"]');
        expect(inBtn.textContent).toBe('In');
        expect(outBtn.textContent).toBe('Out');
        // In is active/pressed by default; Out is not.
        expect(inBtn.getAttribute('aria-pressed')).toBe('true');
        expect(outBtn.getAttribute('aria-pressed')).toBe('false');
        expect(inBtn.classList.contains('active')).toBe(true);
        expect(outBtn.classList.contains('active')).toBe(false);
    });

    it('clicking Out switches the previewed lane and aria-pressed state', () => {
        const { panel, area } = makePanel();
        area.querySelector('[data-preview-action="out"]').click();
        expect(panel.previewAction).toBe('out');
        // Re-rendered: the Out button is now pressed/active.
        expect(area.querySelector('[data-preview-action="out"]').getAttribute('aria-pressed')).toBe('true');
        expect(area.querySelector('[data-preview-action="in"]').getAttribute('aria-pressed')).toBe('false');
        expect(area.querySelector('[data-preview-action="out"]').classList.contains('active')).toBe(true);
    });

    it('runLocalPreview Snap uses the toggled lane total for the playhead', () => {
        const { panel, tpl, area } = makePanel();
        const id = tpl.elements[0].id;
        // Make the in and out lanes clearly different lengths so the chosen lane
        // is observable in the playhead position after Snap.
        tpl.getLane(id, 'in').keyframes = [
            { t: 0, props: { opacity: 0 }, easing: 'linear' },
            { t: 400, props: { opacity: 1 }, easing: 'linear' }
        ];
        tpl.getLane(id, 'out').keyframes = [
            { t: 0, props: { opacity: 1 }, easing: 'linear' },
            { t: 900, props: { opacity: 0 }, easing: 'linear' }
        ];
        tpl.markLaneCustom(id, 'in');
        tpl.markLaneCustom(id, 'out');
        // Other elements (default slide 500) would otherwise dominate the max,
        // so clear their lanes to isolate this element.
        tpl.elements.slice(1).forEach(el => {
            tpl.getLane(el.id, 'in').keyframes = [];
            tpl.getLane(el.id, 'out').keyframes = [];
        });

        // Snap on the In lane parks the playhead at the in-total (400ms).
        panel.runLocalPreview('snap');
        expect(panel.playhead).toBe(400);

        // Switch to Out and Snap: playhead jumps to the out-total (900ms).
        area.querySelector('[data-preview-action="out"]').click();
        panel.runLocalPreview('snap');
        expect(panel.playhead).toBe(900);
    });

    it('switching the toggle while a sweep runs cancels it and resets the playhead', () => {
        const { panel, area } = makePanel();
        panel.playhead = 250;
        panel.playheadRAF = 12345; // pretend a sweep is in flight
        area.querySelector('[data-preview-action="out"]').click();
        expect(panel.playheadRAF).toBeNull();
        expect(panel.playhead).toBe(0);
    });
});

// ---- Playhead sweep / reset ------------------------------------------------

describe('TimelinePanel playhead sweep and transport reset', () => {
    beforeEach(() => {
        setupDom();
        localStorage.clear();
    });

    afterEach(() => {
        // Drain any pending rAF timers between tests.
        if (typeof cancelAnimationFrame === 'function') {
            // no-op; loops park themselves, this is just defensive.
        }
    });

    it('Stop cancels any sweep and resets the playhead to 0', () => {
        const { panel } = makePanel();
        panel.playhead = 320;
        panel.playheadRAF = 999;
        panel.runLocalPreview('stop');
        expect(panel.playheadRAF).toBeNull();
        expect(panel.playhead).toBe(0);
    });

    it('startPlayheadSweep parks at the total when the loop completes', async () => {
        const { panel } = makePanel();
        // A short sweep so the real rAF (16ms steps) reaches the end quickly.
        panel.startPlayheadSweep(40);
        expect(panel.playheadRAF).not.toBeNull();
        await new Promise(resolve => setTimeout(resolve, 120));
        expect(panel.playheadRAF).toBeNull();
        expect(panel.playhead).toBe(40);
    });

    it('startPlayheadSweep parks at 0 for a zero-length action', () => {
        const { panel } = makePanel();
        panel.startPlayheadSweep(0);
        expect(panel.playheadRAF).toBeNull();
        expect(panel.playhead).toBe(0);
    });

    it('a full re-render cancels an in-flight sweep loop', () => {
        const { panel } = makePanel();
        panel.playheadRAF = 555;
        panel.render();
        expect(panel.playheadRAF).toBeNull();
    });

    it('destroy() cancels the sweep loop', () => {
        const { panel } = makePanel();
        panel.playheadRAF = 777;
        panel.destroy();
        expect(panel.playheadRAF).toBeNull();
    });

    it('setPlayheadMs clamps to the ruler and updates the playhead aria', () => {
        const { panel, area } = makePanel();
        panel.setPlayheadMs(300);
        const node = area.querySelector('.timeline-playhead');
        expect(node.getAttribute('aria-valuenow')).toBe('300');
        expect(node.getAttribute('aria-valuetext')).toBe('300 milliseconds');
        expect(panel.playhead).toBe(300);
        // Beyond the ruler clamps to rulerMs.
        panel.setPlayheadMs(10 ** 9);
        expect(panel.playhead).toBe(panel.rulerMs());
    });
});

// ---- model: action total feeding the sweep ---------------------------------

describe('OGrafTemplate.computeActionDuration (feeds the playhead sweep)', () => {
    it('is the max over lanes of delay + last keyframe time, per action', () => {
        const tpl = OGrafTemplate.createFromType('lower-third', 'dur', 'Dur', 'd');
        // Reset every lane, then author two elements with distinct in/out totals.
        tpl.elements.forEach(el => {
            tpl.getLane(el.id, 'in').keyframes = [];
            tpl.getLane(el.id, 'out').keyframes = [];
        });
        const a = tpl.elements[0].id;
        const b = tpl.elements[1].id;
        tpl.getLane(a, 'in').keyframes = [{ t: 0, props: { opacity: 0 } }, { t: 300, props: { opacity: 1 } }];
        tpl.getLane(b, 'in').keyframes = [{ t: 0, props: { opacity: 0 } }, { t: 500, props: { opacity: 1 } }];
        tpl.setLaneDelay(b, 'in', 200); // 200 + 500 = 700
        tpl.getLane(a, 'out').keyframes = [{ t: 0, props: { opacity: 1 } }, { t: 900, props: { opacity: 0 } }];

        expect(tpl.computeActionDuration('in')).toBe(700);
        expect(tpl.computeActionDuration('out')).toBe(900);
    });
});
