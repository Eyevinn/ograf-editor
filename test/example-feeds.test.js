import { describe, it, expect, vi } from 'vitest';
import { EXAMPLE_FEEDS, getExampleFeed } from '../src/data/exampleFeeds.js';
import { OGrafTemplate } from '../src/models/OGrafTemplate.js';
import { PropertyPanel } from '../src/components/PropertyPanel.js';

/**
 * GAP-D "Load an example" feed picker coverage.
 *
 * Three layers, none hitting the network (the feed URLs are external):
 *
 *  1. CATALOG INTEGRITY - the durable guard on src/data/exampleFeeds.js. Every
 *     entry must be a well-formed, flat, https feed whose primaryField is a real
 *     field; getExampleFeed must resolve ids and return undefined otherwise.
 *
 *  2. applyExampleFeed BEHAVIOR - driven through the REAL
 *     PropertyPanel.applyExampleFeed. The constructor touches the DOM and wires
 *     listeners, so rather than build a full panel we invoke the method on the
 *     prototype with a hand-built `this` carrying only what applyExampleFeed
 *     reads: templateManager, previewEngine, render. This is the same
 *     prototype-call pattern bugfix-propertypanel.test.js uses for colorToHex,
 *     and it exercises the production method verbatim (no logic re-implemented).
 *
 *  3. EMBEDDED CONFIG SANITY - after applying an example, the data source the
 *     editor would bake into the generated component carries the expected
 *     type/url and the primaryField mapped onto the first text input key, and
 *     buildManifest passes that config through to the manifest.
 *
 * Grounded against src/data/exampleFeeds.js, src/components/PropertyPanel.js
 * (applyExampleFeed), and src/models/OGrafTemplate.js (read 2026-06-11). No
 * method names invented.
 */

// Invoke the real PropertyPanel.applyExampleFeed without running its DOM-heavy
// constructor: bind a minimal `this` exposing the same collaborators the method
// reads. render/previewEngine.reloadComponent are spies so we can assert the
// method ran its full update path (save -> regenerate -> reload -> render).
function applyExampleFeedOn(template, feed) {
  const saveToStorage = vi.fn();
  const reloadComponent = vi.fn();
  const render = vi.fn();
  const ctx = {
    templateManager: {
      getCurrentTemplate: () => template,
      saveToStorage
    },
    previewEngine: { reloadComponent },
    render
  };
  PropertyPanel.prototype.applyExampleFeed.call(ctx, feed);
  return { saveToStorage, reloadComponent, render };
}

describe('exampleFeeds catalog integrity', () => {
  it('exposes a non-empty catalog', () => {
    expect(Array.isArray(EXAMPLE_FEEDS)).toBe(true);
    expect(EXAMPLE_FEEDS.length).toBeGreaterThan(0);
  });

  it('every entry is a well-formed, flat, https feed whose primaryField is a real field', () => {
    for (const feed of EXAMPLE_FEEDS) {
      expect(typeof feed.id, `id of ${JSON.stringify(feed)}`).toBe('string');
      expect(feed.id.length).toBeGreaterThan(0);

      expect(typeof feed.label, `label of ${feed.id}`).toBe('string');
      expect(feed.label.length).toBeGreaterThan(0);

      // The mapper only understands json + rss; the picker must not offer a type
      // updateDataSource would reject (which would silently no-op the type).
      expect(['json', 'rss'], `type of ${feed.id}`).toContain(feed.type);

      expect(typeof feed.url, `url of ${feed.id}`).toBe('string');
      expect(feed.url.length).toBeGreaterThan(0);
      expect(feed.url.startsWith('https://'), `${feed.id} url must be https`).toBe(true);

      expect(Array.isArray(feed.fields), `fields of ${feed.id}`).toBe(true);
      expect(feed.fields.length, `${feed.id} fields must be non-empty`).toBeGreaterThan(0);

      const fieldNames = feed.fields.map((f) => {
        expect(typeof f.name, `field name in ${feed.id}`).toBe('string');
        expect(f.name.length).toBeGreaterThan(0);
        // The mapper reads top-level JSON keys / RSS item field names only, so a
        // nested path (a.b) would never resolve. Keep the catalog flat.
        expect(f.name.includes('.'), `${feed.id}.${f.name} must be a flat field`).toBe(false);
        return f.name;
      });

      expect(typeof feed.primaryField, `primaryField of ${feed.id}`).toBe('string');
      expect(fieldNames, `${feed.id} primaryField must be one of its fields`).toContain(
        feed.primaryField
      );
    }
  });

  it('ids are unique across the catalog', () => {
    const ids = EXAMPLE_FEEDS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('getExampleFeed returns the matching entry by id', () => {
    for (const feed of EXAMPLE_FEEDS) {
      expect(getExampleFeed(feed.id)).toBe(feed);
    }
  });

  it('getExampleFeed returns undefined for unknown / blank ids', () => {
    expect(getExampleFeed('not-a-real-feed')).toBeUndefined();
    expect(getExampleFeed('')).toBeUndefined();
    expect(getExampleFeed(undefined)).toBeUndefined();
  });
});

describe('PropertyPanel.applyExampleFeed (real method, no DOM)', () => {
  it('sets the data source type + url to the chosen example feed', () => {
    const t = OGrafTemplate.createFromType('lower-third', 'rt', 'RT', 'desc');
    const feed = getExampleFeed('catfact');
    applyExampleFeedOn(t, feed);

    const ds = t.getDataSource();
    expect(ds.type).toBe(feed.type);
    expect(ds.url).toBe(feed.url);
  });

  it('auto-maps the primary field to the FIRST text input key, leaving later inputs manual', () => {
    // lower-third exposes text inputs {name, title} in that order.
    const t = OGrafTemplate.createFromType('lower-third', 'rt', 'RT', 'desc');
    const feed = getExampleFeed('catfact'); // primaryField 'fact'
    applyExampleFeedOn(t, feed);

    const mapping = t.getDataSource().mapping;
    expect(mapping.name).toBe('fact'); // first text input mapped
    expect('title' in mapping).toBe(false); // second input untouched (manual)
  });

  it('maps to the first UNMAPPED text input, skipping one already feed-driven', () => {
    const t = OGrafTemplate.createFromType('lower-third', 'rt', 'RT', 'desc');
    // Pre-map the first input by hand; the example should target the next one.
    t.setDataSourceMapping('name', 'manuallyChosen');

    const feed = getExampleFeed('joke'); // primaryField 'setup'
    applyExampleFeedOn(t, feed);

    const mapping = t.getDataSource().mapping;
    expect(mapping.name).toBe('manuallyChosen'); // existing mapping preserved
    expect(mapping.title).toBe('setup'); // primary field went to next free input
  });

  it('runs the full update path: save, regenerate, preview reload, re-render', () => {
    const t = OGrafTemplate.createFromType('lower-third', 'rt', 'RT', 'desc');
    const genSpy = vi.spyOn(t, 'generateWebComponent');
    const { saveToStorage, reloadComponent, render } = applyExampleFeedOn(t, getExampleFeed('catfact'));

    expect(saveToStorage).toHaveBeenCalledTimes(1);
    expect(genSpy).toHaveBeenCalledTimes(1);
    expect(reloadComponent).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
    genSpy.mockRestore();
  });

  it('with NO text input: does not throw and leaves the mapping empty', () => {
    // A blank template has zero schema properties, so there is no text input to
    // auto-map onto. The type/url still apply; mapping stays empty.
    const t = new OGrafTemplate();
    expect(Object.keys(t.manifest.schema.properties || {})).toHaveLength(0);

    const feed = getExampleFeed('uselessfacts');
    expect(() => applyExampleFeedOn(t, feed)).not.toThrow();

    const ds = t.getDataSource();
    expect(ds.type).toBe(feed.type);
    expect(ds.url).toBe(feed.url);
    expect(ds.mapping).toEqual({});
  });

  it('is a safe no-op when there is no current template', () => {
    const render = vi.fn();
    const ctx = {
      templateManager: { getCurrentTemplate: () => null, saveToStorage: vi.fn() },
      previewEngine: { reloadComponent: vi.fn() },
      render
    };
    expect(() =>
      PropertyPanel.prototype.applyExampleFeed.call(ctx, getExampleFeed('catfact'))
    ).not.toThrow();
    expect(render).not.toHaveBeenCalled();
  });

  it('tolerates a missing previewEngine (guarded reload)', () => {
    const t = OGrafTemplate.createFromType('lower-third', 'rt', 'RT', 'desc');
    const ctx = {
      templateManager: { getCurrentTemplate: () => t, saveToStorage: vi.fn() },
      previewEngine: null,
      render: vi.fn()
    };
    expect(() =>
      PropertyPanel.prototype.applyExampleFeed.call(ctx, getExampleFeed('nasa'))
    ).not.toThrow();
    expect(t.getDataSource().url).toBe(getExampleFeed('nasa').url);
  });
});

describe('embedded data-source config after applying an example', () => {
  it('the data source mapping carries the expected key -> primaryField', () => {
    const t = OGrafTemplate.createFromType('lower-third', 'rt', 'RT', 'desc');
    const feed = getExampleFeed('catfact');
    applyExampleFeedOn(t, feed);

    const ds = t.getDataSource();
    expect(ds.mapping).toEqual({ name: feed.primaryField });
  });

  it('buildManifest passes the applied example config through to the manifest', () => {
    const t = OGrafTemplate.createFromType('lower-third', 'rt', 'RT', 'desc');
    // Enable live data so the embedded config is the on-air shape, then apply.
    t.updateDataSource({ enabled: true });
    const feed = getExampleFeed('nasa'); // rss, primaryField 'title'
    applyExampleFeedOn(t, feed);

    const manifest = t.buildManifest();
    expect(manifest).toHaveProperty('v_ografEditorDataSource');
    const baked = manifest.v_ografEditorDataSource;
    expect(baked.type).toBe(feed.type);
    expect(baked.url).toBe(feed.url);
    expect(baked.mapping.name).toBe(feed.primaryField);
  });

  it('a generated component carrying an example feed builds and resolves the mapping', async () => {
    const t = OGrafTemplate.createFromType('lower-third', 'rt', 'RT', 'desc');
    t.updateDataSource({ enabled: true });
    const feed = getExampleFeed('catfact');
    applyExampleFeedOn(t, feed);

    const code = t.generateWebComponent();
    expect(typeof code).toBe('string');
    expect(code.length).toBeGreaterThan(0);

    // Load the emitted source as a real module (same base64 data: URL pattern as
    // gap-d-live-data.test.js) and confirm the baked mapping resolves the feed's
    // primaryField onto the first text input via the component's own mapFeedToData.
    const dataUrl =
      'data:text/javascript;base64,' + Buffer.from(code, 'utf8').toString('base64');
    const mod = await import(/* @vite-ignore */ dataUrl);
    const TAG = 'ograf-example-feed-catfact';
    if (!customElements.get(TAG)) {
      customElements.define(TAG, mod.default);
    }
    const el = document.createElement(TAG);
    document.body.appendChild(el);

    const patch = el.mapFeedToData({ fact: 'Cats sleep a lot', length: 16 });
    expect(patch.name).toBe('Cats sleep a lot'); // primaryField 'fact' -> input 'name'
    expect('title' in patch).toBe(false); // unmapped input not produced

    document.body.removeChild(el);
  });
});
