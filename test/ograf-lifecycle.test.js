import { describe, it, expect, beforeAll } from 'vitest';
import { OGrafTemplate } from '../src/models/OGrafTemplate.js';

/**
 * OGraf runtime lifecycle smoke test.
 *
 * The contract test (ograf-component.test.js) proves the generated code is
 * syntactically valid and has the right shape. This test proves it actually
 * RUNS: it loads the generated class as a real ES module, defines it as a
 * custom element, and drives the full OGraf lifecycle in jsdom.
 *
 * It guards the exact live bug a user hit: "playAction method not available"
 * and a crash on Play. Here we instantiate the generated component and call
 * each lifecycle method, asserting the spec ReturnPayload contract
 * (statusCode 200, currentStep on play) and that data interpolation renders.
 *
 * The adversarial id ("My Lower Third!") also exercises the id/class/tag
 * sanitization path at runtime, not just at parse time.
 */

// jsdom does not implement requestAnimationFrame. The component uses it only on
// the non-skipAnimation paths, but polyfill defensively so any rAF use resolves.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
}
if (typeof globalThis.cancelAnimationFrame !== 'function') {
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

let GraphicClass;
const TAG = 'ograf-lifecycle-smoke-test';

beforeAll(async () => {
  // Adversarial id: spaces, capitals, punctuation. Forces the sanitization
  // path (slugifyId, safeClassName, safeTagName) to produce valid output.
  const template = OGrafTemplate.createFromType(
    'lower-third',
    'My Lower Third!',
    'My Lower Third!',
    'Adversarial id runtime smoke'
  );
  const code = template.generateWebComponent();

  // Load the generated component the same way a real renderer would: as a real
  // ES module. We dynamic-import it from a base64 data: URL, which Node's loader
  // evaluates as an ES module and resolves `export default class ...`. This is
  // a genuine module-evaluation proof (not regex/eval), and unlike a temp file
  // it is not intercepted by Vite's file-based module resolver under vitest.
  const dataUrl =
    'data:text/javascript;base64,' + Buffer.from(code, 'utf8').toString('base64');
  const mod = await import(/* @vite-ignore */ dataUrl);
  GraphicClass = mod.default;
});

describe('OGraf generated component runtime lifecycle (jsdom)', () => {
  it('default export is a class (function)', () => {
    expect(typeof GraphicClass).toBe('function');
  });

  it('drives the full OGraf lifecycle and honors the ReturnPayload contract', async () => {
    // Register and instantiate via the real custom-elements path.
    if (!customElements.get(TAG)) {
      customElements.define(TAG, GraphicClass);
    }
    const el = document.createElement(TAG);
    document.body.appendChild(el);

    expect(el).toBeInstanceOf(GraphicClass);
    expect(el.shadowRoot).toBeTruthy();

    // load -> applies initial data, renders, returns 200.
    const r = await el.load({
      data: { name: 'Hello', title: 'World' },
      renderType: 'realtime',
      renderCharacteristics: {}
    });
    expect(r).toBeTruthy();
    expect(r.statusCode).toBe(200);

    // playAction -> 200 with a numeric currentStep. This is the exact method
    // the live bug reported as "not available"; here it must exist and resolve.
    expect(typeof el.playAction).toBe('function');
    const p = await el.playAction({ skipAnimation: true });
    expect(p.statusCode).toBe(200);
    expect(typeof p.currentStep).toBe('number');

    // After play, the graphic must actually be rendered into the shadow DOM
    // with the interpolated data visible. The lower-third preset uses
    // {{name}} and {{title}} tokens (confirmed in OGrafTemplate.setupLowerThird).
    const rendered = el.shadowRoot.querySelectorAll('.element');
    expect(rendered.length).toBeGreaterThan(0);
    expect(el.shadowRoot.innerHTML).toContain('Hello');
    expect(el.shadowRoot.innerHTML).toContain('World');

    // updateAction -> merges new data, re-renders, 200. New value must appear.
    const u = await el.updateAction({ data: { name: 'Changed' } });
    expect(u.statusCode).toBe(200);
    expect(el.shadowRoot.innerHTML).toContain('Changed');
    // The untouched field is preserved by the data merge.
    expect(el.shadowRoot.innerHTML).toContain('World');

    // stopAction -> 200 (clears the shadow DOM).
    const s = await el.stopAction({ skipAnimation: true });
    expect(s.statusCode).toBe(200);

    // customAction -> known id resolves 200.
    const c = await el.customAction({ id: 'slideIn', payload: {} });
    expect(c.statusCode).toBe(200);

    // customAction -> unknown id must not throw, still returns 200.
    const cUnknown = await el.customAction({ id: 'does-not-exist', payload: {} });
    expect(cUnknown.statusCode).toBe(200);

    // dispose -> 200.
    const d = await el.dispose({});
    expect(d.statusCode).toBe(200);

    document.body.removeChild(el);
  });

  it('renders an explicitly empty value instead of the raw token', async () => {
    // Guards interpolateContent: an empty-string (or 0) value is a real value,
    // not a missing key, so it must render as empty and never fall back to the
    // literal {{token}}.
    // Reuse the tag already registered for GraphicClass; a custom-element class
    // can only be registered under one tag.
    if (!customElements.get(TAG)) {
      customElements.define(TAG, GraphicClass);
    }
    const el = document.createElement(TAG);
    document.body.appendChild(el);

    await el.load({ data: { name: '', title: '' }, renderType: 'realtime', renderCharacteristics: {} });
    await el.playAction({ skipAnimation: true });

    expect(el.shadowRoot.innerHTML).not.toContain('{{name}}');
    expect(el.shadowRoot.innerHTML).not.toContain('{{title}}');

    document.body.removeChild(el);
  });
});
