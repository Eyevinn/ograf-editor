import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { OGrafTemplate } from '../src/models/OGrafTemplate.js';
import { PropertyPanel } from '../src/components/PropertyPanel.js';

/**
 * GAP-D "live data" RSS / Atom feed source coverage.
 *
 * The RSS/Atom source type extends the existing live-data feature (see
 * gap-d-live-data.test.js, whose 39 tests stay intact). This file covers ONLY
 * the RSS additions, grounded against the real implementation read 2026-06-10:
 *
 *  - src/models/OGrafTemplate.js
 *      getDataSource()/updateDataSource() now accept 'rss' in the type set;
 *      the generated component gains parseRss(text) -> { items: [ {<localName>:
 *      value} ] } in document order, and a new 'rss' branch in mapFeedToData()
 *      that maps a mapping value as an item field name, supporting a "N.field"
 *      reference to pick item N (0-based), defaulting to item 0.
 *  - src/components/PropertyPanel.js
 *      parseRssFields(text) returns the first item's child element local names
 *      for the Test-connection preview, [] on malformed/empty.
 *
 * As in gap-d-live-data.test.js, the generated component is loaded as a real ES
 * module via a base64 data: URL dynamic import, and its pure-ish helpers are
 * driven on a real instance. jsdom provides DOMParser. Real sample feed strings
 * are parsed; the behavior under test is never mocked away.
 */

// jsdom lacks requestAnimationFrame; the generated load()/playAction() use it.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
}
if (typeof globalThis.cancelAnimationFrame !== 'function') {
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

// ---- Real sample feed strings ---------------------------------------------

// RSS 2.0 with three items, newest first (the order feeds publish in).
const RSS_2_0 = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>News Channel</title>
    <link>https://example.com</link>
    <description>Sample feed</description>
    <item>
      <title>First Headline</title>
      <description>First body</description>
      <link>https://example.com/1</link>
      <pubDate>Mon, 09 Jun 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Second Headline</title>
      <description>Second body</description>
      <link>https://example.com/2</link>
      <pubDate>Mon, 09 Jun 2026 09:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Third Headline</title>
      <description>Third body</description>
      <link>https://example.com/3</link>
      <pubDate>Mon, 09 Jun 2026 08:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

// Atom feed: entries use <summary> not <description>, and <link href="..."/>
// contributes its href attribute (not text content).
const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Channel</title>
  <entry>
    <title>Atom First</title>
    <summary>Atom summary one</summary>
    <link href="https://example.com/a1"/>
  </entry>
  <entry>
    <title>Atom Second</title>
    <summary>Atom summary two</summary>
    <link href="https://example.com/a2"/>
  </entry>
</feed>`;

// A channel with no items/entries.
const RSS_EMPTY = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Empty</title></channel></rss>`;

// Not XML at all: jsdom's DOMParser yields a <parsererror> for this.
const MALFORMED = 'this is not a feed <<< &&& not xml';

describe('GAP-D RSS: model layer (OGrafTemplate)', () => {
  describe('updateDataSource()/getDataSource() accept and preserve rss', () => {
    it('updateDataSource({type:"rss"}) is accepted; type becomes "rss"', () => {
      const t = new OGrafTemplate();
      const ds = t.updateDataSource({ type: 'rss' });
      expect(ds.type).toBe('rss');
      expect(t.getDataSource().type).toBe('rss');
    });

    it('getDataSource() repairs an unknown type to "json" but preserves "rss"', () => {
      const t = new OGrafTemplate();
      // Unknown type repaired to json.
      t.manifest.v_ografEditorDataSource.type = 'xml';
      expect(t.getDataSource().type).toBe('json');
      // 'rss' is in the known set, so it is preserved as-is.
      t.manifest.v_ografEditorDataSource.type = 'rss';
      expect(t.getDataSource().type).toBe('rss');
    });

    it('an rss source + item-field mapping survives a JSON round-trip', () => {
      const t = OGrafTemplate.createFromType('lower-third', 'rss-rt', 'RSS', 'desc');
      t.updateDataSource({
        enabled: true,
        type: 'rss',
        url: 'https://example.com/feed.xml',
        mapping: { name: 'title', title: '1.title' }
      });
      const restored = OGrafTemplate.fromJSON(JSON.parse(JSON.stringify(t.toJSON())));
      const ds = restored.getDataSource();
      expect(ds.type).toBe('rss');
      expect(ds.mapping).toEqual({ name: 'title', title: '1.title' });
    });
  });
});

/**
 * Generated-component RSS helpers: parseRss() and the mapFeedToData() rss
 * branch, driven on a real instance of the emitted .mjs.
 */
describe('GAP-D RSS: generated component helpers (jsdom)', () => {
  let GraphicClass;
  const TAG = 'ograf-gap-d-rss';

  beforeAll(async () => {
    const t = OGrafTemplate.createFromType('lower-third', 'rss-comp', 'RSS', 'comp');
    // Bake an enabled rss source so dataSource is present on the instance. The
    // lower-third preset exposes {{name}} and {{title}} inputs. The mapping here
    // is replaced per-test by setting el.dataSource.mapping directly.
    t.updateDataSource({
      enabled: true,
      type: 'rss',
      url: 'https://example.com/feed.xml',
      mapping: { name: 'title' }
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

  describe('parseRss()', () => {
    it('parses an RSS 2.0 feed into items in document order', () => {
      const el = makeEl();
      const { items } = el.parseRss(RSS_2_0);
      expect(items).toHaveLength(3);
      // Document order is preserved (newest-first as the feed lists it).
      expect(items[0]).toEqual({
        title: 'First Headline',
        description: 'First body',
        link: 'https://example.com/1',
        pubDate: 'Mon, 09 Jun 2026 10:00:00 GMT'
      });
      expect(items[1].title).toBe('Second Headline');
      expect(items[2].title).toBe('Third Headline');
      document.body.removeChild(el);
    });

    it('parses an Atom feed: <entry> children + <link href> contributes its href', () => {
      const el = makeEl();
      const { items } = el.parseRss(ATOM);
      expect(items).toHaveLength(2);
      expect(items[0]).toEqual({
        title: 'Atom First',
        summary: 'Atom summary one',
        link: 'https://example.com/a1' // from the href attribute, not text
      });
      expect(items[1].link).toBe('https://example.com/a2');
      document.body.removeChild(el);
    });

    it('a malformed / non-XML string returns { items: [] }', () => {
      const el = makeEl();
      expect(el.parseRss(MALFORMED)).toEqual({ items: [] });
      document.body.removeChild(el);
    });

    it('an empty feed (channel with no items) returns { items: [] }', () => {
      const el = makeEl();
      expect(el.parseRss(RSS_EMPTY)).toEqual({ items: [] });
      document.body.removeChild(el);
    });
  });

  describe('mapFeedToData() rss branch', () => {
    // parseRss output shape, reused so map tests do not depend on parse.
    const parsed = {
      items: [
        { title: 'First Headline', description: 'First body', link: 'https://example.com/1' },
        { title: 'Second Headline', description: 'Second body', link: 'https://example.com/2' }
      ]
    };

    it('a bare field name maps the FIRST item (index 0) by field name', () => {
      const el = makeEl();
      el.dataSource.type = 'rss';
      el.dataSource.mapping = { name: 'title', title: 'description' };
      const patch = el.mapFeedToData(parsed);
      expect(patch).toEqual({ name: 'First Headline', title: 'First body' });
      document.body.removeChild(el);
    });

    it('a "1.title" reference picks item index 1 (0-based)', () => {
      const el = makeEl();
      el.dataSource.type = 'rss';
      // name -> item 0 title; title -> item 1 title.
      el.dataSource.mapping = { name: 'title', title: '1.title' };
      const patch = el.mapFeedToData(parsed);
      expect(patch.name).toBe('First Headline');
      expect(patch.title).toBe('Second Headline');
      document.body.removeChild(el);
    });

    it('an unmapped input produces no patch entry (manual stays manual)', () => {
      const el = makeEl();
      el.dataSource.type = 'rss';
      // Only name is mapped; title is left manual (absent from mapping).
      el.dataSource.mapping = { name: 'title' };
      const patch = el.mapFeedToData(parsed);
      expect(patch).toEqual({ name: 'First Headline' });
      expect('title' in patch).toBe(false);
      document.body.removeChild(el);
    });

    it('an out-of-range item index produces no entry (no crash)', () => {
      const el = makeEl();
      el.dataSource.type = 'rss';
      // Item 9 does not exist; field "title" cannot resolve.
      el.dataSource.mapping = { name: '9.title' };
      const patch = el.mapFeedToData(parsed);
      expect(patch).toEqual({});
      document.body.removeChild(el);
    });

    it('a missing field name on an existing item produces no entry', () => {
      const el = makeEl();
      el.dataSource.type = 'rss';
      el.dataSource.mapping = { name: 'author' }; // no such field on the items
      const patch = el.mapFeedToData(parsed);
      expect(patch).toEqual({});
      document.body.removeChild(el);
    });

    it('an empty feed ({ items: [] }) yields an empty patch', () => {
      const el = makeEl();
      el.dataSource.type = 'rss';
      el.dataSource.mapping = { name: 'title' };
      expect(el.mapFeedToData({ items: [] })).toEqual({});
      document.body.removeChild(el);
    });
  });
});

/**
 * End-to-end network path with type 'rss': fetchAndApply stubs global.fetch to
 * return a real RSS body, parses it through parseRss + mapFeedToData, and merges
 * the mapped item field into this.data / lastGoodLiveData. A malformed feed must
 * keep the last-good values (never blank).
 */
describe('GAP-D RSS: generated component network (jsdom)', () => {
  let GraphicClass;
  const TAG = 'ograf-gap-d-rss-net';

  beforeAll(async () => {
    const t = OGrafTemplate.createFromType('lower-third', 'rss-net', 'RSSNet', 'net');
    t.updateDataSource({
      enabled: true,
      type: 'rss',
      url: 'https://example.com/feed.xml',
      intervalMs: 2000,
      // name <- item 0 title; title <- item 1 title (a second headline).
      mapping: { name: 'title', title: '1.title' }
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

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete globalThis.fetch;
  });

  // A text Response double good enough for fetchAndApply: ok, status, text().
  function textResponse(body, { ok = true, status = 200 } = {}) {
    return { ok, status, text: async () => String(body) };
  }

  it('fetches an RSS body, maps item fields into this.data + lastGoodLiveData', async () => {
    const el = makeEl();
    el.runningAnimations = [];
    globalThis.fetch = vi.fn().mockResolvedValue(textResponse(RSS_2_0));

    const result = await el.fetchAndApply();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    // name <- item 0 title; title <- item 1 title.
    expect(result.patch).toEqual({ name: 'First Headline', title: 'Second Headline' });
    expect(el.data.name).toBe('First Headline');
    expect(el.data.title).toBe('Second Headline');
    expect(el.lastGoodLiveData).toEqual({ name: 'First Headline', title: 'Second Headline' });
    document.body.removeChild(el);
  });

  it('a malformed feed keeps last-good values (no blank) and returns ok:true with empty patch', async () => {
    const el = makeEl();
    el.runningAnimations = [];
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(textResponse(RSS_2_0))
      .mockResolvedValueOnce(textResponse(MALFORMED));

    await el.fetchAndApply();
    expect(el.data.name).toBe('First Headline');
    expect(el.data.title).toBe('Second Headline');

    // A malformed feed parses to { items: [] }, so mapFeedToData yields an empty
    // patch. fetchAndApply still succeeds (the fetch + parse did not throw), but
    // the empty patch means no mapped key is overwritten: last-good stays on air.
    const bad = await el.fetchAndApply();
    expect(bad.ok).toBe(true);
    expect(bad.patch).toEqual({});
    expect(el.data.name).toBe('First Headline');
    expect(el.data.title).toBe('Second Headline');
    expect(el.lastGoodLiveData).toEqual({ name: 'First Headline', title: 'Second Headline' });
    document.body.removeChild(el);
  });
});

/**
 * PropertyPanel.parseRssFields(): the Test-connection preview helper. It is a
 * pure method that uses only DOMParser and `this` for nothing, so we call it via
 * the prototype with a bare `this` (the pattern bugfix-propertypanel.test.js
 * uses for colorToHex) rather than constructing the panel + its DOM wiring.
 */
describe('GAP-D RSS: PropertyPanel.parseRssFields()', () => {
  const parseRssFields = (text) => PropertyPanel.prototype.parseRssFields.call({}, text);

  it('returns the first item field names for an RSS 2.0 feed', () => {
    expect(parseRssFields(RSS_2_0)).toEqual(['title', 'description', 'link', 'pubDate']);
  });

  it('returns the first entry field names for an Atom feed', () => {
    expect(parseRssFields(ATOM)).toEqual(['title', 'summary', 'link']);
  });

  it('returns [] on a malformed / non-XML string', () => {
    expect(parseRssFields(MALFORMED)).toEqual([]);
  });

  it('returns [] on an empty feed (no items/entries)', () => {
    expect(parseRssFields(RSS_EMPTY)).toEqual([]);
  });
});
