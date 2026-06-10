import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { OGrafTemplate } from '../src/models/OGrafTemplate.js';

/**
 * OGraf timeline-animation runtime test (GAP-B).
 *
 * The generated component animates with the Web Animations API driven by the
 * authored timeline (v_ografEditorTimeline), not CSS transitions. This file
 * drives the animated path end to end and asserts the OGraf contract:
 *  - playAction/stopAction resolve only when animation.finished resolves,
 *  - skipAnimation snaps instantly to the end state (animation.finish()) and
 *    still resolves with statusCode 200,
 *  - the published manifest.actionDurations reflect the real timeline length.
 *
 * jsdom does not implement Element.prototype.animate, so we install a faithful
 * enough stub: it records the keyframes/timing, exposes a `finished` promise
 * that resolves after `duration + delay` (driven by fake timers, exactly as a
 * real animation's finished does relative to wall clock), and a synchronous
 * finish() that resolves it immediately (the skipAnimation path).
 */

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
}
if (typeof globalThis.cancelAnimationFrame !== 'function') {
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

// Track every animation created so a test can inspect what the component asked
// the WAAPI to run.
let createdAnimations = [];

class FakeAnimation {
  constructor(node, keyframes, timing) {
    this.node = node;
    this.keyframes = keyframes;
    this.timing = timing || {};
    this._finished = false;
    this._resolve = null;
    this._reject = null;
    this.finished = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
    const total = (Number(this.timing.duration) || 0) + (Number(this.timing.delay) || 0);
    // Resolve `finished` after the action's wall-clock length, like a real
    // Animation. Under fake timers this is advanced explicitly by the test.
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
    // A real cancel() rejects finished; the component swallows that.
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

  const tag = `ograf-anim-test-${tagSeq++}`;
  customElements.define(tag, GraphicClass);

  const el = document.createElement(tag);
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  vi.useRealTimers();
  createdAnimations = [];
});

describe('OGraf timeline animation uses the Web Animations API', () => {
  let defaultEl;

  beforeAll(async () => {
    const template = OGrafTemplate.createFromType(
      'lower-third',
      'Anim Default',
      'Anim Default',
      'default timeline (slide preset)'
    );
    defaultEl = await instantiate(template);
  });

  it('(a) generated component animates via element.animate, not CSS transitions', async () => {
    const template = OGrafTemplate.createFromType('lower-third', 'src-check', 'Src', 'd');
    const code = template.generateWebComponent();
    // The animation tech is WAAPI now; the old CSS-transition path is gone.
    expect(code).toContain('node.animate(');
    expect(code).toContain('.finished');
    expect(code).not.toContain('transition: transform');
    expect(code).not.toMatch(/style\.transition\s*=/);
  });

  it('(b) playAction runs the in-timeline and resolves on animation.finished', async () => {
    vi.useFakeTimers();
    const el = defaultEl;
    await el.load({ data: { name: 'A', title: 'B' }, renderType: 'realtime', renderCharacteristics: {} });

    const playPromise = el.playAction({});
    // Flush the requestAnimationFrame, then the 500ms slide.
    await vi.advanceTimersByTimeAsync(600);
    const p = await playPromise;

    expect(p.statusCode).toBe(200);
    expect(typeof p.currentStep).toBe('number');
    // Each animated element produced a WAAPI animation with a translate transform.
    expect(createdAnimations.length).toBeGreaterThan(0);
    const first = createdAnimations[0];
    expect(first.keyframes.some(kf => /translate\(/.test(kf.transform || ''))).toBe(true);
    expect(first.timing.duration).toBe(500);
  });

  it('(c) skipAnimation snaps instantly to the end state and still resolves 200', async () => {
    const template = OGrafTemplate.createFromType('lower-third', 'skip', 'Skip', 'd');
    const el = await instantiate(template);
    await el.load({ data: { name: 'A', title: 'B' }, renderType: 'realtime', renderCharacteristics: {} });

    createdAnimations = [];
    // No fake timers: with skipAnimation, finished must resolve via finish(),
    // NOT via the wall-clock timeout. If the component awaited a timer this
    // would hang the test.
    const p = await el.playAction({ skipAnimation: true });
    expect(p.statusCode).toBe(200);
    expect(createdAnimations.length).toBeGreaterThan(0);
    // Every created animation was finished synchronously (snapped to the end).
    expect(createdAnimations.every(a => a._finished)).toBe(true);

    document.body.removeChild(el);
  });

  it('(d) stopAction runs the out-timeline, then clears the shadow DOM', async () => {
    const template = OGrafTemplate.createFromType('lower-third', 'stop', 'Stop', 'd');
    const el = await instantiate(template);
    await el.load({ data: { name: 'A', title: 'B' }, renderType: 'realtime', renderCharacteristics: {} });
    await el.playAction({ skipAnimation: true });

    createdAnimations = [];
    const s = await el.stopAction({ skipAnimation: true });
    expect(s.statusCode).toBe(200);
    // An out animation ran (skip-finished) before the shadow DOM was cleared.
    expect(createdAnimations.length).toBeGreaterThan(0);
    expect(el.shadowRoot.innerHTML).toBe('');

    document.body.removeChild(el);
  });
});

describe('actionDurations are published honestly from the timeline', () => {
  it('(e) default slide preset publishes 500ms play/stop durations', () => {
    const template = OGrafTemplate.createFromType('title', 'durs', 'Durs', 'd');
    const durations = template.manifest.actionDurations;
    expect(Array.isArray(durations)).toBe(true);
    const play = durations.find(d => d.type === 'playAction');
    const stop = durations.find(d => d.type === 'stopAction');
    expect(play.duration).toBe(500);
    expect(stop.duration).toBe(500);
  });

  it('(f) editing a custom keyframe time updates the declared duration', () => {
    const template = OGrafTemplate.createFromType('title', 'durs2', 'Durs2', 'd');
    const firstEl = template.elements[0].id;
    const lane = template.getLane(firstEl, 'in');
    // Push the last keyframe out to 1200ms; the declared play duration must follow.
    lane.keyframes[lane.keyframes.length - 1].t = 1200;
    template.markLaneCustom(firstEl, 'in');
    template.updateActionDurations();
    const play = template.manifest.actionDurations.find(d => d.type === 'playAction');
    expect(play.duration).toBe(1200);
  });

  it('(g) the timeline is carried in the manifest under v_ografEditorTimeline', () => {
    const template = OGrafTemplate.createFromType('bug', 'vendor', 'Vendor', 'd');
    const manifest = template.buildManifest();
    expect(manifest.v_ografEditorTimeline).toBeTruthy();
    expect(manifest.v_ografEditorTimeline.version).toBe(1);
    expect(Object.keys(manifest.v_ografEditorTimeline.elements).length).toBeGreaterThan(0);
    // actionDurations is a spec-allowed top-level key and rides along.
    expect(manifest.actionDurations).toBeTruthy();
  });
});

describe('Simple / Advanced custom-lock guardrail', () => {
  it('(h) applying a preset skips lanes marked custom unless forced', () => {
    const template = OGrafTemplate.createFromType('lower-third', 'guard', 'Guard', 'd');
    const id = template.elements[0].id;

    // Hand-tune the in lane and mark it custom.
    const lane = template.getLane(id, 'in');
    lane.keyframes = [{ t: 0, props: { opacity: 0 }, easing: 'linear' }, { t: 800, props: { opacity: 1 }, easing: 'linear' }];
    template.markLaneCustom(id, 'in');

    // A normal preset re-apply must NOT clobber the custom lane.
    const skipped = template.applyPresetToTimeline(false);
    expect(skipped).toContain(`${id}:in`);
    expect(template.getLane(id, 'in').keyframes[1].t).toBe(800);
    expect(template.getLane(id, 'in').custom).toBe(true);

    // Forced re-apply (after an explicit confirm) replaces it and clears custom.
    template.applyPresetToTimeline(true);
    expect(template.getLane(id, 'in').custom).toBe(false);
    expect(template.getLane(id, 'in').keyframes.length).toBeGreaterThan(0);
  });
});
