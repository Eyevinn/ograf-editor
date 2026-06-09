import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { OGrafTemplate } from '../src/models/OGrafTemplate.js';

/**
 * OGraf slide-animation runtime test (the regression guard for the
 * "transition: transform undefinedms undefined" bug).
 *
 * The existing lifecycle test (ograf-lifecycle.test.js) only ever drove
 * playAction({ skipAnimation: true }), so the animated branch
 * (animateSlideIn) was never exercised and the bug shipped. This file drives
 * the ANIMATED path end to end and asserts on the inline `transition` style
 * the animation writes onto each rendered element.
 *
 * It would FAIL against the old code, which built the transition as
 * `transform ${duration}ms ${timing}` with object-level (not per-field)
 * defaulting, so a partial/empty animationSettings object yielded
 * `transform undefinedms undefined`.
 */

// jsdom has no requestAnimationFrame. The animated path awaits a rAF promise
// and schedules the transform inside rAF, so we polyfill it as setTimeout(0)
// exactly as the lifecycle test does. With fake timers active, this becomes a
// fake-timer-driven setTimeout, which advanceTimersByTimeAsync flushes.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
}
if (typeof globalThis.cancelAnimationFrame !== 'function') {
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

// Each generateWebComponent() output is a distinct class, and a class can only
// be customElements.define'd under a single tag. So every imported class gets
// its own unique tag.
let tagSeq = 0;

/**
 * Generate the component for `template`, import it as a real ES module via a
 * base64 data: URL (the proven-under-vitest pattern from the lifecycle test),
 * register it under a fresh unique tag, and return a live instance attached to
 * the document.
 */
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
  // Always restore real timers so a failing assertion can't leave fake timers
  // installed for the next test.
  vi.useRealTimers();
});

describe('OGraf slide-in animation produces valid CSS (regression: undefinedms)', () => {
  let defaultEl;

  beforeAll(async () => {
    // createFromType now seeds real animationSettings, so this is the
    // "default settings" condition (a).
    const template = OGrafTemplate.createFromType(
      'lower-third',
      'Anim Default',
      'Anim Default',
      'default animation settings'
    );
    defaultEl = await instantiate(template);
  });

  it('(a) default settings: slide-in writes a valid 500ms transition, no "undefined"', async () => {
    vi.useFakeTimers();

    const el = defaultEl;
    await el.load({ data: { name: 'A', title: 'B' }, renderType: 'realtime', renderCharacteristics: {} });

    // Drive the ANIMATED path. playAction awaits a rAF promise and then
    // animateSlideIn, which resolves via setTimeout(resolve, duration=500).
    // Advance fake timers past 500ms while the play promise is pending.
    const playPromise = el.playAction({});
    await vi.advanceTimersByTimeAsync(600);
    const p = await playPromise;
    expect(p.statusCode).toBe(200);

    const elements = el.shadowRoot.querySelectorAll('.element');
    expect(elements.length).toBeGreaterThan(0);

    elements.forEach((node) => {
      const t = node.style.transition;
      // The exact regression: old code emitted "transform undefinedms undefined".
      expect(t).not.toContain('undefined');
      // A real millisecond duration and the default timing function.
      expect(t).toMatch(/\d+ms/);
      expect(t).toContain('500ms');
      expect(t).toContain('ease-out');
    });
  });

  it('(b) empty animationSettings {}: slide-in STILL writes a valid defaulted transition', async () => {
    vi.useFakeTimers();

    // The original bug condition: an empty (but truthy) settings object. This
    // proves the PER-FIELD defaulting inside animateSlideIn, not just the
    // constructor default seeded by createFromType. Set BEFORE generation so
    // the empty object is what gets serialized into the component.
    const template = OGrafTemplate.createFromType(
      'lower-third',
      'Anim Empty',
      'Anim Empty',
      'empty animation settings'
    );
    template.animationSettings = {};

    const el = await instantiate(template);

    await el.load({ data: { name: 'A', title: 'B' }, renderType: 'realtime', renderCharacteristics: {} });

    const playPromise = el.playAction({});
    await vi.advanceTimersByTimeAsync(600);
    const p = await playPromise;
    expect(p.statusCode).toBe(200);

    const elements = el.shadowRoot.querySelectorAll('.element');
    expect(elements.length).toBeGreaterThan(0);

    elements.forEach((node) => {
      const t = node.style.transition;
      expect(t).not.toContain('undefined');
      expect(t).toMatch(/\d+ms/);
      // Per-field default duration is 500ms even with an empty settings object.
      expect(t).toContain('500ms');
      // Per-field default timing function.
      expect(t).toContain('ease-out');
    });

    document.body.removeChild(el);
  });

  it('(c) string duration "1500" is applied, not silently defaulted to 500', async () => {
    vi.useFakeTimers();

    // The reported bug: editing the duration in the Property Panel stored it as
    // a string ("1500"), and Number.isFinite('1500') is false, so the animation
    // silently fell back to 500ms and edits had no visible effect. The component
    // must coerce the value to a number.
    const template = OGrafTemplate.createFromType(
      'lower-third',
      'Anim String Duration',
      'Anim String Duration',
      'string duration'
    );
    template.animationSettings = { ...template.animationSettings, slideInDuration: '1500' };

    const el = await instantiate(template);
    await el.load({ data: { name: 'A', title: 'B' }, renderType: 'realtime', renderCharacteristics: {} });

    const playPromise = el.playAction({});
    await vi.advanceTimersByTimeAsync(1600);
    const p = await playPromise;
    expect(p.statusCode).toBe(200);

    const elements = el.shadowRoot.querySelectorAll('.element');
    expect(elements.length).toBeGreaterThan(0);
    elements.forEach((node) => {
      const t = node.style.transition;
      // 1500ms must be applied (not silently defaulted). Match on a word
      // boundary so this is not satisfied by the "500ms" substring of "1500ms".
      expect(t).toMatch(/\b1500ms\b/);
    });

    document.body.removeChild(el);
  });
});
