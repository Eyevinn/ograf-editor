import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { OGrafTemplate } from '../src/models/OGrafTemplate.js';

/**
 * GAP-D "live data binding" coverage.
 *
 * Two layers are exercised:
 *
 *  1. MODEL (OGrafTemplate) - the v_ografEditorDataSource vendor config and the
 *     methods that read/repair/mutate it: getDataSource, updateDataSource,
 *     setDataSourceMapping, reconcileDataSourceMapping, plus the mapping
 *     migration hooks in removeProperty/renameProperty and the toJSON/fromJSON +
 *     buildManifest round-trip. These are pure data transforms and directly
 *     testable.
 *
 *  2. GENERATED COMPONENT - the editor bakes the config into the .mjs source it
 *     emits. We load that emitted source as a real ES module (base64 data: URL
 *     dynamic import, the exact pattern ograf-lifecycle.test.js uses) and drive
 *     the pure-ish parse/map/merge helpers: mapFeedToData, parseCsv, applyData.
 *
 * Every assertion is grounded against the real API in
 * src/models/OGrafTemplate.js (read 2026-06-10). No method names are invented.
 *
 * Note on the applyData animation branch: applyData routes a patch to
 * refreshDataInPlace when this.runningAnimations is non-empty, and to render()
 * otherwise. We do not have a real WAAPI here (jsdom lacks
 * Element.prototype.animate), so rather than drive a real in-flight animation we
 * set this.runningAnimations directly (it is a plain array the component reads)
 * and spy on render/refreshDataInPlace to assert the branch. This exercises the
 * real applyData logic; only the upstream animation that populates
 * runningAnimations is stood in for. See the test for the exact note.
 */

// jsdom lacks requestAnimationFrame; harmless to polyfill (the helpers we drive
// here do not use it, but load()/playAction() in the generated source do).
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
}
if (typeof globalThis.cancelAnimationFrame !== 'function') {
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

const MIN = OGrafTemplate.MIN_DATA_SOURCE_INTERVAL_MS; // 1000

describe('GAP-D live data: model layer (OGrafTemplate)', () => {
  describe('getDataSource() default + repair', () => {
    it('returns a well-formed default shape on a fresh template', () => {
      const t = new OGrafTemplate();
      const ds = t.getDataSource();
      expect(ds).toEqual({
        enabled: false,
        type: 'json',
        url: '',
        intervalMs: 5000,
        mapping: {}
      });
    });

    it('rebuilds a missing/garbage config object entirely', () => {
      const t = new OGrafTemplate();
      t.manifest.v_ografEditorDataSource = 'not-an-object';
      const ds = t.getDataSource();
      expect(typeof ds).toBe('object');
      expect(ds.enabled).toBe(false);
      expect(ds.type).toBe('json');
      expect(ds.url).toBe('');
      expect(ds.intervalMs).toBe(5000);
      expect(ds.mapping).toEqual({});
    });

    it('repairs each partial/garbage field to a safe value', () => {
      const t = new OGrafTemplate();
      t.manifest.v_ografEditorDataSource = {
        enabled: 'yes',          // non-boolean -> false
        type: 'xml',             // unknown -> json
        url: 123,                // non-string -> ''
        intervalMs: 250,         // below floor -> floored to MIN
        mapping: 'nope'          // non-object -> {}
      };
      const ds = t.getDataSource();
      expect(ds.enabled).toBe(false);
      expect(ds.type).toBe('json');
      expect(ds.url).toBe('');
      expect(ds.intervalMs).toBe(MIN);
      expect(ds.mapping).toEqual({});
    });

    it('floors a sub-minimum interval to MIN_DATA_SOURCE_INTERVAL_MS', () => {
      const t = new OGrafTemplate();
      t.manifest.v_ografEditorDataSource.intervalMs = 10;
      expect(t.getDataSource().intervalMs).toBe(MIN);
    });

    it('rounds a fractional interval and keeps it above the floor', () => {
      const t = new OGrafTemplate();
      t.manifest.v_ografEditorDataSource.intervalMs = 4200.7;
      expect(t.getDataSource().intervalMs).toBe(4201);
    });

    it('falls back to 5000 when interval is NaN/non-finite', () => {
      const t = new OGrafTemplate();
      t.manifest.v_ografEditorDataSource.intervalMs = Number.NaN;
      expect(t.getDataSource().intervalMs).toBe(5000);
    });
  });

  describe('updateDataSource()', () => {
    it('sets enabled/type/url/intervalMs/mapping from a patch', () => {
      const t = new OGrafTemplate();
      // mapping keys must be existing schema properties to survive reconcile.
      t.addProperty('title', 'string', 'Title', '');
      const ds = t.updateDataSource({
        enabled: true,
        type: 'csv',
        url: 'https://example.com/feed.csv',
        intervalMs: 3000,
        mapping: { title: 'Headline' }
      });
      expect(ds.enabled).toBe(true);
      expect(ds.type).toBe('csv');
      expect(ds.url).toBe('https://example.com/feed.csv');
      expect(ds.intervalMs).toBe(3000);
      expect(ds.mapping).toEqual({ title: 'Headline' });
    });

    it('rejects an unknown type, leaving the previous type intact', () => {
      const t = new OGrafTemplate();
      t.updateDataSource({ type: 'gsheet' });
      t.updateDataSource({ type: 'totally-bogus' });
      expect(t.getDataSource().type).toBe('gsheet');
    });

    it('floors intervalMs in updateDataSource', () => {
      const t = new OGrafTemplate();
      const ds = t.updateDataSource({ intervalMs: 50 });
      expect(ds.intervalMs).toBe(MIN);
    });

    it('enabling live data forces manifest.supportsNonRealTime to false', () => {
      const t = new OGrafTemplate();
      t.manifest.supportsNonRealTime = true; // pretend the author opted in
      t.updateDataSource({ enabled: true });
      expect(t.manifest.supportsNonRealTime).toBe(false);
    });

    it('disabling live data does NOT touch supportsNonRealTime', () => {
      const t = new OGrafTemplate();
      t.manifest.supportsNonRealTime = true;
      t.updateDataSource({ enabled: false });
      // Only enabling forces the flag; disabling leaves the author's value alone.
      expect(t.manifest.supportsNonRealTime).toBe(true);
    });
  });

  describe('setDataSourceMapping()', () => {
    it('stores a non-blank field as the mapping for an input', () => {
      const t = new OGrafTemplate();
      t.addProperty('name', 'string', 'Name', '');
      t.setDataSourceMapping('name', 'fullName');
      expect(t.getDataSource().mapping).toEqual({ name: 'fullName' });
    });

    it('deletes the entry when the field is blank/whitespace-only (stays manual)', () => {
      const t = new OGrafTemplate();
      t.addProperty('name', 'string', 'Name', '');
      t.setDataSourceMapping('name', 'fullName');
      t.setDataSourceMapping('name', '   ');
      expect('name' in t.getDataSource().mapping).toBe(false);
    });

    it('trims surrounding whitespace before storing', () => {
      const t = new OGrafTemplate();
      t.addProperty('name', 'string', 'Name', '');
      t.setDataSourceMapping('name', '  fullName  ');
      expect(t.getDataSource().mapping.name).toBe('fullName');
    });
  });

  describe('reconcileDataSourceMapping()', () => {
    it('drops mapping keys that are no longer schema properties and returns them', () => {
      const t = new OGrafTemplate();
      t.addProperty('title', 'string', 'Title', '');
      // Seed a mapping with one valid and one stale key directly on the config.
      t.getDataSource().mapping = { title: 'Headline', ghost: 'Gone' };
      const dropped = t.reconcileDataSourceMapping();
      expect(dropped).toEqual(['ghost']);
      expect(t.getDataSource().mapping).toEqual({ title: 'Headline' });
    });

    it('returns an empty array when every mapping key is still valid', () => {
      const t = new OGrafTemplate();
      t.addProperty('title', 'string', 'Title', '');
      t.getDataSource().mapping = { title: 'Headline' };
      expect(t.reconcileDataSourceMapping()).toEqual([]);
    });
  });

  describe('schema edits migrate the mapping', () => {
    it('removeProperty() drops that property mapping', () => {
      const t = new OGrafTemplate();
      t.addProperty('name', 'string', 'Name', '');
      t.addProperty('title', 'string', 'Title', '');
      t.setDataSourceMapping('name', 'fullName');
      t.setDataSourceMapping('title', 'Headline');
      t.removeProperty('name');
      expect('name' in t.getDataSource().mapping).toBe(false);
      // The other mapping is untouched.
      expect(t.getDataSource().mapping.title).toBe('Headline');
    });

    it('renameProperty() migrates the mapping to the new key, value unchanged', () => {
      const t = new OGrafTemplate();
      t.addProperty('name', 'string', 'Name', '');
      t.setDataSourceMapping('name', 'fullName');
      const ok = t.renameProperty('name', 'presenter');
      expect(ok).toBe(true);
      const mapping = t.getDataSource().mapping;
      expect('name' in mapping).toBe(false);
      expect(mapping.presenter).toBe('fullName'); // value carried over
    });
  });

  describe('toJSON/fromJSON + buildManifest round-trip', () => {
    it('an enabled data source + mapping survives a JSON round-trip', () => {
      const t = OGrafTemplate.createFromType('lower-third', 'rt', 'RT', 'desc');
      t.updateDataSource({
        enabled: true,
        type: 'json',
        url: 'https://example.com/data.json',
        intervalMs: 2000,
        mapping: { name: 'fullName', title: 'role' }
      });

      const restored = OGrafTemplate.fromJSON(JSON.parse(JSON.stringify(t.toJSON())));
      const ds = restored.getDataSource();
      expect(ds.enabled).toBe(true);
      expect(ds.type).toBe('json');
      expect(ds.url).toBe('https://example.com/data.json');
      expect(ds.intervalMs).toBe(2000);
      expect(ds.mapping).toEqual({ name: 'fullName', title: 'role' });
    });

    it('buildManifest() includes v_ografEditorDataSource via the v_ passthrough', () => {
      const t = OGrafTemplate.createFromType('lower-third', 'bm', 'BM', 'desc');
      t.updateDataSource({
        enabled: true,
        url: 'https://example.com/d.json',
        mapping: { name: 'fullName' }
      });
      const manifest = t.buildManifest();
      expect(manifest).toHaveProperty('v_ografEditorDataSource');
      expect(manifest.v_ografEditorDataSource.enabled).toBe(true);
      expect(manifest.v_ografEditorDataSource.url).toBe('https://example.com/d.json');
      expect(manifest.v_ografEditorDataSource.mapping).toEqual({ name: 'fullName' });
    });
  });
});

/**
 * Generated-component helpers. We instantiate the emitted .mjs as a real module
 * and drive the parse/map/merge helpers on a real instance.
 */
describe('GAP-D live data: generated component helpers (jsdom)', () => {
  let GraphicClass;
  const TAG = 'ograf-gap-d-live-data';

  beforeAll(async () => {
    const t = OGrafTemplate.createFromType('lower-third', 'live-data-rt', 'Live', 'rt');
    // Bake an enabled JSON source with a partial mapping so dataSource.mapping is
    // present on the instance for mapFeedToData. The lower-third preset exposes
    // {{name}} and {{title}} inputs.
    t.updateDataSource({
      enabled: true,
      type: 'json',
      url: 'https://example.com/feed.json',
      mapping: { name: 'fullName' } // title intentionally left manual
    });
    const code = t.generateWebComponent();
    const dataUrl =
      'data:text/javascript;base64,' + Buffer.from(code, 'utf8').toString('base64');
    const mod = await import(/* @vite-ignore */ dataUrl);
    GraphicClass = mod.default;
    if (!customElements.get(TAG)) {
      customElements.define(TAG, GraphicClass);
    }
  });

  function makeEl() {
    const el = document.createElement(TAG);
    document.body.appendChild(el);
    return el;
  }

  describe('mapFeedToData()', () => {
    it('JSON: maps only mapped top-level keys; unmapped feed keys are ignored', () => {
      const el = makeEl();
      // Baked mapping is { name: 'fullName' }; title is manual (unmapped).
      const patch = el.mapFeedToData({ fullName: 'Ada Lovelace', role: 'Engineer', extra: 'x' });
      expect(patch).toEqual({ name: 'Ada Lovelace' });
      // A controller-pushed key (title) is never produced by the feed mapping,
      // so it can never be clobbered by an unmapped feed field.
      expect('title' in patch).toBe(false);
      document.body.removeChild(el);
    });

    it('JSON: a non-object payload yields an empty patch', () => {
      const el = makeEl();
      expect(el.mapFeedToData(null)).toEqual({});
      expect(el.mapFeedToData('string')).toEqual({});
      document.body.removeChild(el);
    });

    it('CSV/gsheet: maps the first data row by header NAME and by 0-based column INDEX', () => {
      const el = makeEl();
      // Drive the CSV branch directly by setting the instance dataSource type and
      // mapping (mapFeedToData reads this.dataSource). One key maps by header
      // name ("Full Name"), one by 0-based column index ("1").
      el.dataSource.type = 'csv';
      el.dataSource.mapping = { name: 'Full Name', title: '1' };
      const parsed = {
        headers: ['Full Name', 'Role'],
        rows: [['Ada Lovelace', 'Engineer'], ['Ignored', 'Row']]
      };
      const patch = el.mapFeedToData(parsed);
      expect(patch.name).toBe('Ada Lovelace'); // by header NAME "Full Name" -> column 0 of the first row
      expect(patch.title).toBe('Engineer');    // by 0-based INDEX "1" -> column 1 of the first row
      document.body.removeChild(el);
    });

    it('CSV/gsheet: empty rows yield an empty patch', () => {
      const el = makeEl();
      el.dataSource.type = 'csv';
      el.dataSource.mapping = { name: '0' };
      expect(el.mapFeedToData({ headers: ['A'], rows: [] })).toEqual({});
      document.body.removeChild(el);
    });
  });

  describe('parseCsv()', () => {
    it('treats the first row as headers and returns the rest as rows', () => {
      const el = makeEl();
      const { headers, rows } = el.parseCsv('a,b,c\n1,2,3\n4,5,6');
      expect(headers).toEqual(['a', 'b', 'c']);
      expect(rows).toEqual([['1', '2', '3'], ['4', '5', '6']]);
      document.body.removeChild(el);
    });

    it('handles quoted fields, doubled quotes, and commas/newlines inside quotes', () => {
      const el = makeEl();
      // Row 1 field 1: a comma inside quotes. Row 1 field 2: doubled quotes ->
      // a single literal quote. Row 2 field 1: a newline inside quotes.
      const csv = 'name,note\n"Doe, John","say ""hi"""\n"line1\nline2",plain';
      const { headers, rows } = el.parseCsv(csv);
      expect(headers).toEqual(['name', 'note']);
      expect(rows[0]).toEqual(['Doe, John', 'say "hi"']);
      expect(rows[1]).toEqual(['line1\nline2', 'plain']);
      document.body.removeChild(el);
    });
  });

  describe('applyData()', () => {
    it('merges a patch into this.data with last-writer-wins per key', () => {
      const el = makeEl();
      el.data = { name: 'Old', title: 'Keep' };
      el.runningAnimations = []; // no animation -> render path
      el.applyData({ name: 'New' });
      expect(el.data.name).toBe('New');  // overwritten
      expect(el.data.title).toBe('Keep'); // untouched key preserved
      document.body.removeChild(el);
    });

    it('a non-object patch is a no-op', () => {
      const el = makeEl();
      el.data = { name: 'Keep' };
      el.applyData(null);
      el.applyData('nope');
      expect(el.data).toEqual({ name: 'Keep' });
      document.body.removeChild(el);
    });

    it('with no running animation, applyData calls render (full rebuild)', () => {
      const el = makeEl();
      el.runningAnimations = [];
      const renderSpy = vi.spyOn(el, 'render');
      const refreshSpy = vi.spyOn(el, 'refreshDataInPlace');
      el.applyData({ name: 'X' });
      expect(renderSpy).toHaveBeenCalledTimes(1);
      expect(refreshSpy).not.toHaveBeenCalled();
      renderSpy.mockRestore();
      refreshSpy.mockRestore();
      document.body.removeChild(el);
    });

    it('with an in-flight animation, applyData uses refreshDataInPlace and does NOT rebuild via render', () => {
      // NOTE: jsdom has no Element.prototype.animate, so we cannot drive a real
      // WAAPI tween to populate runningAnimations. applyData only reads
      // this.runningAnimations.length, so we set it directly to a non-empty
      // sentinel to exercise the real branch. The animation that would populate
      // it (runActionAnimation) is covered elsewhere and not re-tested here.
      const el = makeEl();
      el.runningAnimations = [{}]; // pretend one animation is in flight
      const renderSpy = vi.spyOn(el, 'render');
      const refreshSpy = vi.spyOn(el, 'refreshDataInPlace');
      el.applyData({ name: 'Y' });
      expect(refreshSpy).toHaveBeenCalledTimes(1);
      expect(renderSpy).not.toHaveBeenCalled();
      // Data still merged regardless of which render path ran.
      expect(el.data.name).toBe('Y');
      renderSpy.mockRestore();
      refreshSpy.mockRestore();
      document.body.removeChild(el);
    });
  });
});

/**
 * Network + lifecycle path of the generated component: fetchAndApply (success,
 * failure-keeps-last-good, disposed guard) and start/stopLiveData (immediate
 * fetch, timer, idempotency, teardown).
 *
 * We instantiate the SAME generated component the helper tests above use, then
 * stub global.fetch and use fake timers where a setInterval/await is involved.
 * fetchAndApply/startLiveData/stopLiveData read this.dataSource, this.disposed,
 * this.pollTimer, this.pollAbort, this.lastGoodLiveData and call this.applyData
 * -> render(); all of those live on the instance, so no editor runtime is
 * needed. Grounded against fetchAndApply/startLiveData/stopLiveData in
 * src/models/OGrafTemplate.js (read 2026-06-10).
 */
describe('GAP-D live data: generated component network + lifecycle (jsdom)', () => {
  let GraphicClass;
  const TAG = 'ograf-gap-d-live-net';

  beforeAll(async () => {
    const t = OGrafTemplate.createFromType('lower-third', 'live-net-rt', 'LiveNet', 'rt');
    // Enabled JSON source; map the feed's "fullName" onto the {{name}} input.
    t.updateDataSource({
      enabled: true,
      type: 'json',
      url: 'https://example.com/feed.json',
      intervalMs: 2000,
      mapping: { name: 'fullName' }
    });
    const code = t.generateWebComponent();
    const dataUrl =
      'data:text/javascript;base64,' + Buffer.from(code, 'utf8').toString('base64');
    const mod = await import(/* @vite-ignore */ dataUrl);
    GraphicClass = mod.default;
    if (!customElements.get(TAG)) {
      customElements.define(TAG, GraphicClass);
    }
  });

  // Build a real instance but DO NOT connect it (we are exercising the data
  // path, not connectedCallback). The constructor bakes dataSource +
  // disposed/timer state, so a bare instance is enough.
  function makeEl() {
    const el = document.createElement(TAG);
    document.body.appendChild(el);
    return el;
  }

  afterEach(() => {
    // Always restore real timers + the global fetch stub between tests so one
    // test's fake clock or stub can never leak into another.
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete globalThis.fetch;
  });

  // A JSON Response double good enough for fetchAndApply: it reads res.ok,
  // res.status, then res.text().
  function jsonResponse(body, { ok = true, status = 200 } = {}) {
    return {
      ok,
      status,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
    };
  }

  describe('fetchAndApply() success', () => {
    it('merges mapped keys into this.data + lastGoodLiveData and returns { ok:true, patch }', async () => {
      const el = makeEl();
      el.data = { title: 'Manual Title' }; // a controller-pushed, unmapped key
      el.runningAnimations = [];
      globalThis.fetch = vi.fn().mockResolvedValue(
        jsonResponse({ fullName: 'Ada Lovelace', role: 'ignored-because-unmapped' })
      );

      const result = await el.fetchAndApply();

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://example.com/feed.json',
        expect.any(Object)
      );
      expect(result.ok).toBe(true);
      expect(result.patch).toEqual({ name: 'Ada Lovelace' });
      // Mapped key merged; unmapped feed key dropped; manual key preserved.
      expect(el.data.name).toBe('Ada Lovelace');
      expect(el.data.title).toBe('Manual Title');
      expect('role' in el.data).toBe(false);
      // last-good snapshot tracks the mapped patch.
      expect(el.lastGoodLiveData).toEqual({ name: 'Ada Lovelace' });
      document.body.removeChild(el);
    });
  });

  describe('fetchAndApply() failure keeps last-good on air', () => {
    it('a rejected fetch after one good fetch does NOT blank this.data and returns ok:false', async () => {
      const el = makeEl();
      el.runningAnimations = [];
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ fullName: 'Good Value' }))
        .mockRejectedValueOnce(new TypeError('Failed to fetch')); // network/CORS

      const good = await el.fetchAndApply();
      expect(good.ok).toBe(true);
      expect(el.data.name).toBe('Good Value');

      const bad = await el.fetchAndApply();
      // On-air guarantee: the failed poll returns ok:false and leaves the
      // previously-applied value untouched (NOT blanked).
      expect(bad.ok).toBe(false);
      expect(el.data.name).toBe('Good Value');
      expect(el.lastGoodLiveData).toEqual({ name: 'Good Value' });
      document.body.removeChild(el);
    });

    it('an HTTP 500 (res.ok === false) does NOT blank this.data and returns ok:false', async () => {
      const el = makeEl();
      el.runningAnimations = [];
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ fullName: 'Good Value' }))
        .mockResolvedValueOnce(jsonResponse('Server Error', { ok: false, status: 500 }));

      await el.fetchAndApply();
      expect(el.data.name).toBe('Good Value');

      const bad = await el.fetchAndApply();
      expect(bad.ok).toBe(false);
      expect(bad.error).toBe('HTTP 500');
      // last-good stays on air; data not blanked.
      expect(el.data.name).toBe('Good Value');
      expect(el.lastGoodLiveData).toEqual({ name: 'Good Value' });
      document.body.removeChild(el);
    });
  });

  describe('fetchAndApply() disposed guard', () => {
    it('is a no-op when disposed flips true between the fetch call and its resolution', async () => {
      const el = makeEl();
      el.data = { name: 'Untouched' };
      el.runningAnimations = [];
      const applySpy = vi.spyOn(el, 'applyData');

      // Resolve fetch only after we have flipped disposed, simulating a response
      // that arrives after teardown.
      let resolveFetch;
      globalThis.fetch = vi.fn().mockImplementation(
        () => new Promise((resolve) => { resolveFetch = resolve; })
      );

      const promise = el.fetchAndApply();
      el.disposed = true; // teardown happened while the request was in flight
      resolveFetch(jsonResponse({ fullName: 'Stale Value' }));
      const result = await promise;

      // Early-return after the disposed check: no data write, no applyData.
      expect(result).toEqual({ ok: false, error: 'disposed' });
      expect(applySpy).not.toHaveBeenCalled();
      expect(el.data).toEqual({ name: 'Untouched' });
      expect(el.lastGoodLiveData).toEqual({});
      document.body.removeChild(el);
    });
  });

  describe('startLiveData() / stopLiveData() lifecycle', () => {
    it('startLiveData fires an immediate fetch and arms an interval timer', () => {
      vi.useFakeTimers();
      const el = makeEl();
      globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ fullName: 'X' }));
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

      el.startLiveData();

      // Immediate kick-off fetch (not awaited inside startLiveData).
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
      expect(el.pollTimer).not.toBeNull();
      expect(el.pollAbort).not.toBeNull(); // fetchAndApply set the controller

      // Advancing the floored interval (2000ms) drives another poll.
      vi.advanceTimersByTime(2000);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);

      el.stopLiveData();
      document.body.removeChild(el);
    });

    it('calling startLiveData twice is idempotent: it does not stack timers', () => {
      vi.useFakeTimers();
      const el = makeEl();
      globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ fullName: 'X' }));
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

      el.startLiveData();
      const firstTimer = el.pollTimer;
      el.startLiveData();
      const secondTimer = el.pollTimer;

      // The second call cleared the first timer before arming a new one.
      expect(clearIntervalSpy).toHaveBeenCalledWith(firstTimer);
      expect(secondTimer).not.toBe(firstTimer);

      // Only ONE timer is live: a single interval tick triggers a single poll
      // (immediate fetches aside). Count ticks, not immediate kick-offs.
      globalThis.fetch.mockClear();
      vi.advanceTimersByTime(2000);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      el.stopLiveData();
      document.body.removeChild(el);
    });

    it('stopLiveData clears the timer and aborts the in-flight fetch', () => {
      vi.useFakeTimers();
      const el = makeEl();
      globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ fullName: 'X' }));

      el.startLiveData();
      const controller = el.pollAbort;
      const abortSpy = vi.spyOn(controller, 'abort');

      el.stopLiveData();

      expect(el.pollTimer).toBeNull();
      expect(el.pollAbort).toBeNull();
      expect(abortSpy).toHaveBeenCalledTimes(1);

      // The interval is dead: advancing time fires no further fetch.
      globalThis.fetch.mockClear();
      vi.advanceTimersByTime(10000);
      expect(globalThis.fetch).not.toHaveBeenCalled();
      document.body.removeChild(el);
    });

    it('startLiveData is a no-op when the source is disabled', () => {
      vi.useFakeTimers();
      const el = makeEl();
      el.dataSource = { ...el.dataSource, enabled: false };
      globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ fullName: 'X' }));

      el.startLiveData();

      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(el.pollTimer).toBeNull();
      document.body.removeChild(el);
    });

    it('dispose() tears the timer down and marks disposed', async () => {
      vi.useFakeTimers();
      const el = makeEl();
      globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ fullName: 'X' }));

      el.startLiveData();
      expect(el.pollTimer).not.toBeNull();

      await el.dispose();

      expect(el.disposed).toBe(true);
      expect(el.pollTimer).toBeNull();
      expect(el.pollAbort).toBeNull();

      // Post-dispose, no further polls fire even as the clock advances.
      globalThis.fetch.mockClear();
      vi.advanceTimersByTime(10000);
      expect(globalThis.fetch).not.toHaveBeenCalled();
      document.body.removeChild(el);
    });
  });
});
