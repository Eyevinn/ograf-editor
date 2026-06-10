import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PreviewEngine } from '../src/components/PreviewEngine.js';

afterEach(() => {
  // Each test appends a fresh container; clear the body so duplicate ids from a
  // previous test cannot leak into the next one's lookups.
  document.body.innerHTML = '';
  // Restore any console spies so suppression stays scoped to the test that set it.
  vi.restoreAllMocks();
});

/**
 * Regression tests for the PreviewEngine bug batch.
 *
 * These guard the exact failure modes that were verified by hand:
 *  - reloadComponent() used to early-return on a truthy animationSettings, so
 *    the live preview never refreshed after an edit. It must now always take
 *    the recreate path.
 *  - stop() with no current component used to surface a scary "not properly
 *    initialized" error on a normal Stop. It must now be a silent no-op.
 *  - showWebComponentError used to throw when scaledContainer was null.
 *  - renderDataInputs used to collapse falsy numeric/boolean defaults to ''.
 *
 * The component itself is generated/imported only on Play, so these tests stub
 * the component and container surfaces and assert PreviewEngine's own logic.
 */

// Build the DOM surface PreviewEngine.init() queries for: a .preview-frame and
// the play/stop control buttons inside a .preview-controls block.
function buildContainer() {
  const container = document.createElement('div');
  container.innerHTML = `
    <div class="preview-frame"></div>
    <div class="preview-controls">
      <button id="play-preview">Play</button>
      <button id="stop-preview" disabled>Stop</button>
    </div>
  `;
  document.body.appendChild(container);
  return container;
}

// A template manager whose current template is swappable, matching the real
// TemplateManager.getCurrentTemplate() surface PreviewEngine consumes.
function makeManager(template) {
  return {
    _t: template,
    getCurrentTemplate() {
      return this._t;
    }
  };
}

function makeTemplate(id, properties = {}) {
  return {
    manifest: {
      id,
      name: id,
      schema: { properties }
    },
    // Always truthy: this is exactly what used to trip reloadComponent's
    // early-return.
    animationSettings: { duration: 1000 },
    generateWebComponent() {
      return 'export default class X extends HTMLElement {}';
    }
  };
}

describe('PreviewEngine.reloadComponent', () => {
  let engine;

  beforeEach(() => {
    const container = buildContainer();
    engine = new PreviewEngine(container, makeManager(makeTemplate('tmpl-a')));
    // render() schedules setup on a timer; run it so scaledContainer exists.
    vi.useFakeTimers();
    engine.render();
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('does not early-return when animationSettings is truthy and not playing', () => {
    // animationSettings is truthy (the old short-circuit condition). The fix
    // removed that branch, so reloadComponent must reach the recreate path:
    // mark content uncreated, drop the component, clear the container.
    engine.currentComponent = { playAction: vi.fn(), stopAction: vi.fn() };
    engine.previewContentCreated = true;
    engine.isPlaying = false;

    engine.reloadComponent();

    expect(engine.currentComponent).toBeNull();
    expect(engine.previewContentCreated).toBe(false);
    expect(engine.scaledContainer.innerHTML).toBe('');
  });

  it('recreates and resumes playback when it was playing', async () => {
    // Simulate "was playing" then an edit lands. reloadComponent must rebuild
    // content and re-play, leaving isPlaying true.
    const playAction = vi.fn().mockResolvedValue({ statusCode: 200 });
    engine.isPlaying = true;
    // createPreviewContent is exercised separately by the lifecycle test; here
    // we stub it to install a fresh component so we can assert the resume path.
    engine.createPreviewContent = vi.fn().mockImplementation(async () => {
      engine.currentComponent = { playAction };
    });

    engine.reloadComponent();
    // Let the createPreviewContent().then() chain settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(engine.createPreviewContent).toHaveBeenCalled();
    expect(playAction).toHaveBeenCalled();
    expect(engine.isPlaying).toBe(true);
  });

  it('routes a recreate failure to showWebComponentError and resets play state', async () => {
    engine.isPlaying = true;
    engine.createPreviewContent = vi.fn().mockRejectedValue(new Error('boom'));
    // showWebComponentError logs the failure via console.error by design; this
    // test drives that path on purpose, so silence the expected log to keep the
    // test output clean (we still assert the handler was reached below).
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const spy = vi.spyOn(engine, 'showWebComponentError');

    engine.reloadComponent();
    await Promise.resolve();
    await Promise.resolve();

    expect(spy).toHaveBeenCalled();
    expect(engine.isPlaying).toBe(false);
  });
});

describe('PreviewEngine.stop', () => {
  let engine;

  beforeEach(() => {
    const container = buildContainer();
    engine = new PreviewEngine(container, makeManager(makeTemplate('tmpl-a')));
    vi.useFakeTimers();
    engine.render();
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('is a silent no-op when there is no component (no error surfaced)', async () => {
    engine.currentComponent = null;
    engine.isPlaying = true;
    const spy = vi.spyOn(engine, 'showWebComponentError');

    await expect(engine.stop()).resolves.toBeUndefined();

    expect(spy).not.toHaveBeenCalled();
    expect(engine.isPlaying).toBe(false);
    const stopBtn = engine.container.querySelector('#stop-preview');
    expect(stopBtn.disabled).toBe(true);
  });

  it('calls stopAction when a component is present', async () => {
    const stopAction = vi.fn().mockResolvedValue({ statusCode: 200 });
    engine.currentComponent = { stopAction };
    engine.isPlaying = true;

    await engine.stop();

    expect(stopAction).toHaveBeenCalled();
    expect(engine.isPlaying).toBe(false);
  });
});

describe('PreviewEngine.showWebComponentError', () => {
  it('does not throw when scaledContainer is null (logs instead)', () => {
    const container = buildContainer();
    const engine = new PreviewEngine(container, makeManager(null));
    engine.scaledContainer = null;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => engine.showWebComponentError('msg', new Error('x'))).not.toThrow();
    expect(errSpy).toHaveBeenCalled();

    errSpy.mockRestore();
  });
});

describe('PreviewEngine.renderDataInputs falsy defaults', () => {
  it('preserves a numeric 0 default instead of collapsing it to empty string', () => {
    const container = buildContainer();
    const template = makeTemplate('tmpl-num', {
      score: { type: 'number', title: 'Score', default: 0 },
      enabled: { type: 'boolean', title: 'Enabled', default: false }
    });
    const engine = new PreviewEngine(container, makeManager(template));
    vi.useFakeTimers();
    engine.render();
    vi.runAllTimers();
    vi.useRealTimers();

    expect(engine.previewData.score).toBe(0);
    expect(engine.previewData.enabled).toBe(false);

    // The rendered input reflects the falsy default rather than blanking it.
    const scoreInput = container.querySelector('[data-property="score"]');
    expect(scoreInput.value).toBe('0');
  });
});
