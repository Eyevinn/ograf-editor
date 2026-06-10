import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OGrafTemplate } from '../src/models/OGrafTemplate.js';
import { TimelinePanel } from '../src/components/TimelinePanel.js';

/**
 * Timeline-animation faithfulness bugfixes.
 *
 * Covers three diagnosed regressions in the generated component's WAAPI path
 * and the Timeline panel wiring:
 *
 *  BUG 1 - elements that should start hidden flashed visible on the first
 *          painted frame (resting state painted before the in-animation hid
 *          them). The fix applies each element's in-animation initial keyframe
 *          state to its inline style synchronously, BEFORE any paint/rAF, in
 *          both load() and playAction().
 *
 *  BUG 2 - editing keyframes in the Timeline panel did not refresh the live
 *          preview. The fix calls previewEngine.reloadComponent() from the
 *          panel's persist().
 *
 *  BUG 3 - buildLaneEffect dropped the authored first value when the earliest
 *          keyframe was at t>0 (WAAPI synthesized offset:0 from underlying
 *          style). The fix always prepends an explicit offset:0 frame holding
 *          the earliest authored value, and maps offsets over [0..last].
 *
 * jsdom has no Element.prototype.animate, so we install the same faithful stub
 * the main animation test uses: it records keyframes/timing and resolves a
 * `finished` promise after duration+delay (or immediately on finish()).
 */

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
}
if (typeof globalThis.cancelAnimationFrame !== 'function') {
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
if (typeof globalThis.CSS === 'undefined') {
  globalThis.CSS = { escape: (s) => String(s) };
}

let createdAnimations = [];

class FakeAnimation {
  constructor(node, keyframes, timing) {
    this.node = node;
    this.keyframes = keyframes;
    this.timing = timing || {};
    this._finished = false;
    this.finished = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
    const total = (Number(this.timing.duration) || 0) + (Number(this.timing.delay) || 0);
    this._timer = setTimeout(() => {
      this._finished = true;
      this._resolve(this);
    }, total);
  }
  finish() {
    if (this._finished) return;
    this._finished = true;
    clearTimeout(this._timer);
    this._resolve(this);
  }
  cancel() {
    if (this._finished) return;
    this._finished = true;
    clearTimeout(this._timer);
    this._reject(new DOMException('canceled', 'AbortError'));
  }
}

if (typeof Element.prototype.animate !== 'function') {
  Element.prototype.animate = function (keyframes, timing) {
    const anim = new FakeAnimation(this, keyframes, timing);
    createdAnimations.push(anim);
    return anim;
  };
}

let tagSeq = 0;

async function instantiate(template) {
  const code = template.generateWebComponent();
  const dataUrl =
    'data:text/javascript;base64,' + Buffer.from(code, 'utf8').toString('base64');
  const mod = await import(/* @vite-ignore */ dataUrl);
  const GraphicClass = mod.default;
  const tag = `ograf-faith-test-${tagSeq++}`;
  customElements.define(tag, GraphicClass);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  vi.useRealTimers();
  createdAnimations = [];
});

// ---- BUG 1: initial state applied before play -----------------------------

describe('BUG 1: hidden elements do not flash visible before the in-animation', () => {
  // Build a template whose first element fades in (opacity 0 -> 1) so its
  // pre-animation state is opacity 0.
  // Unique id per call so each generated component has a distinct class name;
  // the same class constructor cannot be registered twice in the registry.
  let fadeSeq = 0;
  function fadeInTemplate() {
    const tpl = OGrafTemplate.createFromType('lower-third', `fade-${fadeSeq++}`, 'Fade', 'd');
    tpl.animationSettings.slideInPreset = 'fade';
    tpl.applyPresetToTimeline(true);
    tpl.updateActionDurations();
    return tpl;
  }

  it('load() applies the in-animation start state (opacity 0) before any play', async () => {
    const tpl = fadeInTemplate();
    const el = await instantiate(tpl);
    await el.load({ data: { name: 'A', title: 'B' }, renderType: 'realtime', renderCharacteristics: {} });

    const firstId = tpl.elements[0].id;
    const node = el.shadowRoot.querySelector(`.element-${firstId}`);
    expect(node).toBeTruthy();
    // The fade-in lane starts at opacity 0; the element must be hidden after
    // load(), not at its visible resting state.
    expect(node.style.opacity).toBe('0');

    document.body.removeChild(el);
  });

  it('playAction() sets the start state synchronously before the rAF paints', async () => {
    vi.useFakeTimers();
    const tpl = fadeInTemplate();
    const el = await instantiate(tpl);
    await el.load({ data: { name: 'A', title: 'B' }, renderType: 'realtime', renderCharacteristics: {} });

    const firstId = tpl.elements[0].id;

    // Kick off play but do NOT advance timers yet: the rAF has not fired, so
    // no WAAPI animation exists. The element must already be hidden via the
    // inline initial state, not painted visible.
    const playPromise = el.playAction({});
    const node = el.shadowRoot.querySelector(`.element-${firstId}`);
    expect(node.style.opacity).toBe('0');

    await vi.advanceTimersByTimeAsync(700);
    const result = await playPromise;
    expect(result.statusCode).toBe(200);

    document.body.removeChild(el);
  });

  it('an element with NO in-lane is left at its resting state (no inline override)', async () => {
    const tpl = OGrafTemplate.createFromType('lower-third', 'norest', 'NoRest', 'd');
    // Clear the in-lane for the first element so it does not animate in.
    const firstId = tpl.elements[0].id;
    const lane = tpl.getLane(firstId, 'in');
    lane.keyframes = [];
    tpl.markLaneCustom(firstId, 'in');
    tpl.updateActionDurations();

    const el = await instantiate(tpl);
    await el.load({ data: { name: 'A', title: 'B' }, renderType: 'realtime', renderCharacteristics: {} });
    const node = el.shadowRoot.querySelector(`.element-${firstId}`);
    // No lane -> applyInitialState leaves the node untouched (resting state).
    expect(node.style.opacity).toBe('');
    expect(node.style.transform).toBe('');

    document.body.removeChild(el);
  });

  it('skipAnimation still snaps to the visible end state', async () => {
    const tpl = fadeInTemplate();
    const el = await instantiate(tpl);
    await el.load({ data: { name: 'A', title: 'B' }, renderType: 'realtime', renderCharacteristics: {} });

    createdAnimations = [];
    const result = await el.playAction({ skipAnimation: true });
    expect(result.statusCode).toBe(200);
    expect(createdAnimations.length).toBeGreaterThan(0);
    // Every animation was finished synchronously, snapping to the end (opacity 1
    // for the fade-in) under WAAPI fill:'both'.
    expect(createdAnimations.every(a => a._finished)).toBe(true);

    document.body.removeChild(el);
  });
});

// ---- BUG 3: buildLaneEffect keyframe robustness ----------------------------

describe('BUG 3: WAAPI keyframe list is robust to first-keyframe-at-t>0 and waypoints', () => {
  it('a 3-keyframe lane (opacity 0 -> 1 -> 0) produces the intermediate waypoint', async () => {
    const tpl = OGrafTemplate.createFromType('lower-third', 'wp', 'Waypoint', 'd');
    const firstId = tpl.elements[0].id;
    const lane = tpl.getLane(firstId, 'in');
    lane.keyframes = [
      { t: 0, props: { opacity: 0 }, easing: 'linear' },
      { t: 500, props: { opacity: 1 }, easing: 'linear' },
      { t: 1000, props: { opacity: 0 }, easing: 'linear' }
    ];
    tpl.markLaneCustom(firstId, 'in');
    tpl.updateActionDurations();

    const el = await instantiate(tpl);
    await el.load({ data: { name: 'A', title: 'B' }, renderType: 'realtime', renderCharacteristics: {} });

    createdAnimations = [];
    await el.playAction({ skipAnimation: true });

    const anim = createdAnimations.find(a => a.keyframes.some(kf => kf.opacity === 1));
    expect(anim).toBeTruthy();
    // The middle waypoint at t:500 over a [0..1000] span lands at offset 0.5.
    const mid = anim.keyframes.find(kf => kf.opacity === 1);
    expect(mid.offset).toBeCloseTo(0.5, 5);
    // Start (offset 0) and end (offset 1) are both opacity 0.
    const start = anim.keyframes.find(kf => kf.offset === 0);
    const end = anim.keyframes.find(kf => kf.offset === 1);
    expect(start.opacity).toBe(0);
    expect(end.opacity).toBe(0);

    document.body.removeChild(el);
  });

  it('a lane whose first keyframe is at t>0 holds that initial value at offset 0', async () => {
    const tpl = OGrafTemplate.createFromType('lower-third', 'gap', 'Gap', 'd');
    const firstId = tpl.elements[0].id;
    const lane = tpl.getLane(firstId, 'in');
    // Earliest authored keyframe at t:1000, opacity 0.2; final at t:2000.
    lane.keyframes = [
      { t: 1000, props: { opacity: 0.2 }, easing: 'linear' },
      { t: 2000, props: { opacity: 1 }, easing: 'linear' }
    ];
    tpl.markLaneCustom(firstId, 'in');
    tpl.updateActionDurations();

    const el = await instantiate(tpl);
    await el.load({ data: { name: 'A', title: 'B' }, renderType: 'realtime', renderCharacteristics: {} });

    // The initial state applied on load must be the earliest authored value
    // (opacity 0.2), held as a lead-in, NOT the resting/visible state.
    const node = el.shadowRoot.querySelector(`.element-${firstId}`);
    expect(node.style.opacity).toBe('0.2');

    createdAnimations = [];
    await el.playAction({ skipAnimation: true });
    const anim = createdAnimations.find(a => a.keyframes.length > 0);
    expect(anim).toBeTruthy();
    const start = anim.keyframes.find(kf => kf.offset === 0);
    expect(start).toBeTruthy();
    // Offset 0 holds the earliest authored opacity (0.2), honoring the gap as a
    // lead-in hold rather than letting WAAPI synthesize it from style.
    expect(start.opacity).toBe(0.2);
    // The authored t:1000 frame maps to offset 0.5 over the [0..2000] span.
    const authoredFirst = anim.keyframes.find(kf => kf.offset === 0.5);
    expect(authoredFirst).toBeTruthy();
    expect(authoredFirst.opacity).toBe(0.2);

    document.body.removeChild(el);
  });
});

// ---- BUG 2: Timeline panel refreshes the live preview ----------------------

describe('BUG 2: a Timeline-panel keyframe edit refreshes the live preview', () => {
  beforeEach(() => {
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
    localStorage.clear();
  });

  it('persist() calls previewEngine.reloadComponent()', () => {
    const tpl = OGrafTemplate.createFromType('lower-third', 'panel-reload', 'PanelReload', 'd');
    const templateManager = {
      getCurrentTemplate: () => tpl,
      saveToStorage: () => {}
    };
    const veContainer = document.querySelector('#visual-editor');
    const visualEditor = { container: veContainer, canvas: document.querySelector('.graphics-canvas') };
    const area = document.querySelector('.editor-area');
    const panel = new TimelinePanel(area, templateManager, visualEditor);

    let reloads = 0;
    const previewEngine = { reloadComponent: () => { reloads += 1; } };
    panel.setPreviewEngine(previewEngine);

    // Simulate a keyframe edit committing through persist().
    const firstId = tpl.elements[0].id;
    tpl.addKeyframe(firstId, 'in', 250, { opacity: 0.5 });
    panel.persist();

    expect(reloads).toBe(1);
  });

  it('persist() falls back to window.ografEditor.previewEngine when no engine is wired', () => {
    const tpl = OGrafTemplate.createFromType('lower-third', 'panel-fallback', 'PanelFallback', 'd');
    const templateManager = {
      getCurrentTemplate: () => tpl,
      saveToStorage: () => {}
    };
    const veContainer = document.querySelector('#visual-editor');
    const visualEditor = { container: veContainer, canvas: document.querySelector('.graphics-canvas') };
    const area = document.querySelector('.editor-area');
    const panel = new TimelinePanel(area, templateManager, visualEditor);
    // No setPreviewEngine call.

    let reloads = 0;
    window.ografEditor = { previewEngine: { reloadComponent: () => { reloads += 1; } } };
    try {
      panel.persist();
      expect(reloads).toBe(1);
    } finally {
      delete window.ografEditor;
    }
  });
});
