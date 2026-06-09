import { describe, it, expect, beforeEach } from 'vitest';
import { OGrafTemplate } from '../src/models/OGrafTemplate.js';
import { TimelinePanel } from '../src/components/TimelinePanel.js';

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
