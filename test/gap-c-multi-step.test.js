import { describe, it, expect, beforeAll } from 'vitest';
import { OGrafTemplate } from '../src/models/OGrafTemplate.js';

/**
 * GAP-C multi-step authoring.
 *
 * Two layers:
 *  - the editor model (v_ografEditorSteps): step CRUD, honest stepCount,
 *    per-step visibility/data, element rename/remove cleanup, round-trip;
 *  - the generated component's runtime: playAction({goto, delta}) resolves the
 *    target step, applies per-step visibility + data overlay, returns the right
 *    currentStep, transitions to the end past the last step, and clamps below 0.
 *    Single-step templates (no authored steps) keep the original behaviour.
 *
 * jsdom lacks Element.prototype.animate; a minimal stub whose `finished`
 * resolves immediately is enough here (we assert step state, not timing).
 */

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
}
if (typeof Element.prototype.animate !== 'function') {
  Element.prototype.animate = function () {
    return { finished: Promise.resolve(), finish() {}, cancel() {} };
  };
}

let tagSeq = 0;
async function instantiate(template) {
  const seq = tagSeq++;
  // Append a unique marker so each instantiation is a distinct module (the data
  // URL is the module key; identical source would be cached and its class would
  // already be registered when we define a fresh tag).
  const code = template.generateWebComponent() + `\n//# gapc-${seq}`;
  const dataUrl =
    'data:text/javascript;base64,' + Buffer.from(code, 'utf8').toString('base64');
  const mod = await import(/* @vite-ignore */ dataUrl);
  const tag = `ograf-gapc-test-${seq}`;
  customElements.define(tag, mod.default);
  const el = document.createElement(tag);
  document.body.appendChild(el);
  return el;
}

const node = (el, id) =>
  el.shadowRoot.querySelector(`[data-element-id="${id}"]`);

describe('GAP-C model: steps (v_ografEditorSteps)', () => {
  it('a fresh template is single-step (no steps, stepCount 1)', () => {
    const t = OGrafTemplate.createFromType('title', 'st', 'St', '');
    expect(t.getSteps().steps).toHaveLength(0);
    expect(t.updateStepCount()).toBe(1);
    expect(t.manifest.stepCount).toBe(1);
  });

  it('addStep publishes an honest stepCount and removeStep restores it', () => {
    const t = OGrafTemplate.createFromType('title', 'st', 'St', '');
    t.addStep('One');
    t.addStep('Two');
    t.addStep('Three');
    expect(t.getSteps().steps.map((s) => s.name)).toEqual(['One', 'Two', 'Three']);
    expect(t.manifest.stepCount).toBe(3);
    t.removeStep(1);
    expect(t.getSteps().steps.map((s) => s.name)).toEqual(['One', 'Three']);
    expect(t.manifest.stepCount).toBe(2);
  });

  it('moveStep reorders and renameStep renames', () => {
    const t = OGrafTemplate.createFromType('title', 'st', 'St', '');
    t.addStep('A'); t.addStep('B'); t.addStep('C');
    expect(t.moveStep(2, 0)).toBe(0);
    expect(t.getSteps().steps.map((s) => s.name)).toEqual(['C', 'A', 'B']);
    t.renameStep(1, '  Renamed  ');
    expect(t.getSteps().steps[1].name).toBe('Renamed');
  });

  it('per-step visibility defaults to visible; explicit false hides; true clears', () => {
    const t = OGrafTemplate.createFromType('title', 'st', 'St', '');
    t.addStep('s0');
    expect(t.isElementVisibleAtStep(0, 'subtitle')).toBe(true);
    t.setStepVisibility(0, 'subtitle', false);
    expect(t.isElementVisibleAtStep(0, 'subtitle')).toBe(false);
    expect(t.getSteps().steps[0].visible).toEqual({ subtitle: false });
    t.setStepVisibility(0, 'subtitle', true);
    expect(t.isElementVisibleAtStep(0, 'subtitle')).toBe(true);
    expect(t.getSteps().steps[0].visible).toEqual({});
  });

  it('per-step data override sets and clears', () => {
    const t = OGrafTemplate.createFromType('title', 'st', 'St', '');
    t.addStep('s0');
    t.setStepData(0, 'title', 'Step Title');
    expect(t.getSteps().steps[0].data).toEqual({ title: 'Step Title' });
    t.setStepData(0, 'title', '');
    expect(t.getSteps().steps[0].data).toEqual({});
  });

  it('removeElement drops, and renameElementId migrates, per-step visibility', () => {
    const t = OGrafTemplate.createFromType('title', 'st', 'St', '');
    t.addStep('s0');
    t.setStepVisibility(0, 'subtitle', false);
    t.renameElementId('subtitle', 'sub');
    expect(t.getSteps().steps[0].visible).toEqual({ sub: false });
    t.removeElement('sub');
    expect(t.getSteps().steps[0].visible).toEqual({});
  });

  it('reconcileSteps drops references to removed elements and data inputs', () => {
    const t = OGrafTemplate.createFromType('title', 'st', 'St', '');
    t.addStep('s0');
    t.getSteps().steps[0].visible = { ghost: false, title: false };
    t.getSteps().steps[0].data = { phantom: 'x', title: 'ok' };
    t.reconcileSteps();
    expect(t.getSteps().steps[0].visible).toEqual({ title: false });
    expect(t.getSteps().steps[0].data).toEqual({ title: 'ok' });
  });

  it('buildManifest carries v_ografEditorSteps with an honest stepCount, and fromJSON round-trips', () => {
    const t = OGrafTemplate.createFromType('title', 'st', 'St', '');
    t.addStep('one'); t.addStep('two');
    t.setStepVisibility(1, 'subtitle', false);
    const manifest = t.buildManifest();
    expect(manifest.stepCount).toBe(2);
    expect(manifest.v_ografEditorSteps.steps).toHaveLength(2);

    const round = OGrafTemplate.fromJSON(JSON.parse(JSON.stringify(t.toJSON())));
    expect(round.getSteps().steps.map((s) => s.name)).toEqual(['one', 'two']);
    expect(round.isElementVisibleAtStep(1, 'subtitle')).toBe(false);
    expect(round.manifest.stepCount).toBe(2);
  });
});

describe('GAP-C runtime: generated component stepping', () => {
  it('single-step template is unchanged (playAction returns currentStep 1)', async () => {
    const t = OGrafTemplate.createFromType('title', 'one', 'One', '');
    const el = await instantiate(t);
    const r = await el.playAction({});
    expect(r.statusCode).toBe(200);
    expect(r.currentStep).toBe(1);
  });

  let stepped;
  beforeAll(() => {
    stepped = OGrafTemplate.createFromType('title', 'multi', 'Multi', '');
    stepped.addStep('s0');
    stepped.addStep('s1');
    // s0 hides the subtitle; s1 shows all and overrides the title text.
    stepped.setStepVisibility(0, 'subtitle', false);
    stepped.setStepData(1, 'title', 'Second');
  });

  it('a plain play from start lands on step 0, then advances by delta default 1', async () => {
    const el = await instantiate(stepped);
    await el.load({ data: { title: 'Base', subtitle: 'Sub' } });
    const r0 = await el.playAction({});
    expect(r0.currentStep).toBe(0);
    const r1 = await el.playAction({});
    expect(r1.currentStep).toBe(1);
  });

  it('goto is absolute', async () => {
    const el = await instantiate(stepped);
    const r = await el.playAction({ goto: 1 });
    expect(r.currentStep).toBe(1);
  });

  it('advancing past the last step transitions to the end (currentStep undefined, cleared)', async () => {
    const el = await instantiate(stepped);
    await el.playAction({ goto: 1 });            // last step (stepCount 2)
    const end = await el.playAction({});         // target 2 >= stepCount -> end
    expect(end.statusCode).toBe(200);
    expect(end.currentStep).toBeUndefined();
    expect(el.shadowRoot.innerHTML).toBe('');
  });

  it('delta -1 at step 0 clamps to 0 (no transition to start)', async () => {
    const el = await instantiate(stepped);
    await el.playAction({ goto: 0 });
    const r = await el.playAction({ delta: -1 });
    expect(r.currentStep).toBe(0);
  });

  it('applies per-step visibility (subtitle hidden at step 0, shown at step 1)', async () => {
    const el = await instantiate(stepped);
    await el.load({ data: { title: 'Base', subtitle: 'Sub' } });
    await el.playAction({ goto: 0 });
    expect(node(el, 'subtitle').style.display).toBe('none');
    await el.playAction({ goto: 1 });
    expect(node(el, 'subtitle').style.display).toBe('');
  });

  it('layers per-step data over the base data', async () => {
    const el = await instantiate(stepped);
    await el.load({ data: { title: 'Base', subtitle: 'Sub' } });
    await el.playAction({ goto: 0 });
    expect(node(el, 'title').textContent).toBe('Base');   // no override at s0
    await el.playAction({ goto: 1 });
    expect(node(el, 'title').textContent).toBe('Second');  // s1 overrides title
  });

  it('stopAction resets to the start state so the next plain play re-enters at step 0', async () => {
    const el = await instantiate(stepped);
    await el.playAction({ goto: 1 });
    await el.stopAction({});
    expect(el.currentStep).toBeUndefined();
    const r = await el.playAction({});
    expect(r.currentStep).toBe(0);
  });
});
