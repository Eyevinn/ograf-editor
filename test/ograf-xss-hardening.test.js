import { describe, it, expect, afterEach, vi } from 'vitest';
import { OGrafTemplate } from '../src/models/OGrafTemplate.js';
import { ExportImportService } from '../src/services/ExportImportService.js';
import { escapeHtml } from '../src/utils/escapeHtml.js';

/**
 * XSS hardening guard for the import threat model.
 *
 * A user imports a crafted .ograf / editor-template file. Its manifest and
 * element fields then reach innerHTML (editor UI + generated component) or are
 * spliced into generated code. These tests pin down that the hostile payloads
 * are neutralized: escaped in markup, slugified in ids, stripped in CSS.
 */

// Minimal TemplateManager stub: importTemplate is the only method
// ExportImportService.importEditorTemplate / importRawManifest call here.
function makeServiceWithStubManager() {
  const manager = {
    importTemplate(manifestJson, webComponent) {
      const template = new OGrafTemplate();
      template.manifest = JSON.parse(manifestJson);
      template.webComponent = webComponent;
      return template;
    }
  };
  return new ExportImportService(manager);
}

describe('escapeHtml utility', () => {
  it('neutralizes the angle brackets and quotes used to break out of markup', () => {
    expect(escapeHtml('<img onerror=alert(1)>')).toBe(
      '&lt;img onerror=alert(1)&gt;'
    );
    expect(escapeHtml('" onmouseover="alert(1)')).toBe(
      '&quot; onmouseover=&quot;alert(1)'
    );
  });

  it('returns an empty string for null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('generateBasicComponent (raw manifest import)', () => {
  it('does not splice a hostile manifest.name into the generated source', () => {
    const service = makeServiceWithStubManager();
    const template = service.importRawManifest({
      $schema: 'x',
      id: 'evil',
      name: '<img src=x onerror=alert(1)>'
    });
    const code = template.webComponent;

    // The name is carried as a safe JSON string literal on this.templateName
    // (a string assignment, not markup), and emitted at runtime through the
    // component's own escapeHtml. It must NOT be spliced raw into the render()
    // body, which previously emitted `${manifest.name}` straight into innerHTML.
    expect(code).toContain('this.escapeHtml(this.templateName)');
    expect(code).toContain('this.templateName = "<img src=x onerror=alert(1)>"');
    // The only place the payload bytes appear is that JS string literal: it is
    // never written into the shadowRoot.innerHTML template as raw markup.
    const renderBody = code.slice(code.indexOf('render() {'));
    expect(renderBody).not.toContain('<img src=x onerror=alert(1)>');
    // renderData escapes both key and value at runtime.
    expect(code).toContain('this.escapeHtml(key)');
    expect(code).toContain('this.escapeHtml(value)');
  });
});

describe('imported element ids are slugified', () => {
  it('slugifies a quote-bearing element id on editor-template import', () => {
    const service = makeServiceWithStubManager();
    const template = service.importEditorTemplate({
      manifest: { $schema: 'x', id: 'safe', name: 'Safe' },
      webComponent: '',
      elements: [
        { id: '" onmouseover=alert(1)', type: 'text', x: 0, y: 0, width: 10, height: 10 }
      ]
    });
    const id = template.elements[0].id;
    expect(id).not.toMatch(/["<>{}\s]/);
    expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('slugifies element ids in OGrafTemplate.fromJSON', () => {
    const template = OGrafTemplate.fromJSON({
      manifest: { $schema: 'x', id: 'safe', name: 'Safe' },
      elements: [
        { id: '"><script>alert(1)</script>', type: 'rect', x: 0, y: 0, width: 10, height: 10 }
      ],
      webComponent: null
    });
    const id = template.elements[0].id;
    expect(id).not.toMatch(/["<>{}\s]/);
    expect(id).toMatch(/^[a-z0-9-]+$/);
  });
});

describe('CSS style values are sanitized in the generated <style> block', () => {
  it('strips a value that tries to close the rule or the style element', () => {
    const template = new OGrafTemplate();
    template.elements = [
      {
        id: 'box',
        type: 'rect',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        style: { color: 'red; } </style><img src=x onerror=alert(1)>' }
      }
    ];
    const css = template.generateElementStyles();
    expect(css).not.toContain('</style>');
    expect(css).not.toContain('<img');
    // The hostile value is dropped, leaving an empty declaration.
    expect(css).toContain('.element-box {');
  });

  it('passes through legitimate values (colors, px, rgba)', () => {
    const template = new OGrafTemplate();
    template.elements = [
      {
        id: 'box',
        type: 'rect',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        style: { backgroundColor: 'rgba(0, 120, 204, 0.9)', borderRadius: '4px' }
      }
    ];
    const css = template.generateElementStyles();
    expect(css).toContain('rgba(0, 120, 204, 0.9)');
    expect(css).toContain('4px');
  });
});

/**
 * Runtime hardening for interpolateContent (the generated web component).
 *
 * The fix escapes/validates the WHOLE authored content, not just {{token}}
 * substitutions. Previously a text element whose content was literal markup
 * with no token (e.g. <img src=x onerror=...>), or a literal hostile image src
 * (javascript:..., x" onload=...), bypassed escaping. These tests instantiate
 * the generated .mjs as a real custom element (same pattern as the live-data
 * suite) and assert against the rendered shadow DOM, so they prove the escaping
 * happens at the real render path, not just in source strings.
 *
 * Each case builds a single 'custom' template (one {{text}} input by default),
 * then overrides template.elements with the exact element under test, regenerates
 * the component, and drives load() to render. A unique tag per build avoids the
 * customElements one-definition-per-name limit across cases.
 */
describe('interpolateContent runtime hardening (generated component, jsdom)', () => {
  let tagCounter = 0;

  // Build a generated component from a single explicit element, instantiate it
  // as a real custom element, load() the given data, and return the live node.
  async function renderElement(element, data = {}) {
    const t = OGrafTemplate.createFromType('custom', 'xss-rt', 'XSS', 'rt');
    // Replace the preset elements with exactly the element under test so the
    // rendered shadow DOM contains only what we are asserting on.
    t.elements = [element];
    const code = t.generateWebComponent();
    const dataUrl =
      'data:text/javascript;base64,' + Buffer.from(code, 'utf8').toString('base64');
    const mod = await import(/* @vite-ignore */ dataUrl);
    const GraphicClass = mod.default;
    const tag = `ograf-xss-rt-${tagCounter++}`;
    if (!customElements.get(tag)) {
      customElements.define(tag, GraphicClass);
    }
    const el = document.createElement(tag);
    document.body.appendChild(el);
    await el.load({ data });
    return el;
  }

  afterEach(() => {
    // Tear down any nodes appended during a case.
    document.querySelectorAll('[class*="element-"]').forEach(() => {});
    document.body.innerHTML = '';
    delete window.__x;
    vi.restoreAllMocks();
  });

  // 1. TEXT element with LITERAL markup and NO token: must render escaped.
  it('escapes literal markup in a text element with no token (no live onerror)', async () => {
    const el = await renderElement({
      id: 'lit', type: 'text', x: 0, y: 0, width: 100, height: 30,
      content: '<img src=x onerror="window.__x=1">'
    });
    const node = el.shadowRoot.querySelector('.element-lit');
    expect(node).toBeTruthy();
    // No live <img> element was created from the literal content.
    expect(el.shadowRoot.querySelector('.element-lit img')).toBeNull();
    // The markup is present only as escaped text, never as live HTML.
    expect(node.innerHTML).toContain('&lt;img');
    expect(node.innerHTML).not.toContain('<img');
    // The onerror appears escaped (inside the &quot;-quoted text), never as a
    // live attribute. textContent round-trips the original literal string.
    expect(node.textContent).toBe('<img src=x onerror="window.__x=1">');
    // Nothing executed: the payload would have set window.__x.
    expect(window.__x).toBeUndefined();
  });

  // 2. TEXT element mixing literal specials with a resolved token, plus an
  //    unresolved token that must survive as escaped literal text.
  it('escapes literal special chars AND the resolved token value, keeps unresolved tokens literal', async () => {
    const el = await renderElement(
      {
        id: 'mix', type: 'text', x: 0, y: 0, width: 200, height: 30,
        content: 'a & b < c " {{name}} {{missing}}'
      },
      { name: '<script>alert(1)</script>' }
    );
    const node = el.shadowRoot.querySelector('.element-mix');
    // Literal & and < are escaped once in the serialized markup. (A literal "
    // is also escaped to &quot; by the component, but jsdom's innerHTML getter
    // re-serializes it as a bare " since a quote needs no escaping in text
    // context, so we assert the quote via textContent below, not innerHTML.)
    expect(node.innerHTML).toContain('a &amp; b &lt; c');
    expect(node.innerHTML).not.toContain('&amp;amp;');
    // The resolved token's hostile value is escaped (no live <script>).
    expect(el.shadowRoot.querySelector('.element-mix script')).toBeNull();
    expect(node.innerHTML).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    // The unresolved {{missing}} token survives as escaped literal text, not
    // dropped and not crashing render.
    expect(node.textContent).toContain('{{missing}}');
    // textContent decodes to the fully-resolved, unescaped logical string.
    expect(node.textContent).toBe('a & b < c " <script>alert(1)</script> {{missing}}');
  });

  // 3. IMAGE element with a LITERAL hostile src and no token: blanked/neutralized.
  it('blanks a literal javascript: image src', async () => {
    const el = await renderElement({
      id: 'imgjs', type: 'image', x: 0, y: 0, width: 50, height: 50,
      content: 'javascript:alert(1)'
    });
    const img = el.shadowRoot.querySelector('img.element-imgjs');
    expect(img).toBeTruthy();
    // safeSrc blanks any non-http(s)/non-data:image scheme.
    expect(img.getAttribute('src')).toBe('');
    expect(el.shadowRoot.innerHTML).not.toContain('src="javascript:');
  });

  it('blanks a literal attribute-breakout image src and emits no onload attribute', async () => {
    const el = await renderElement({
      id: 'imgbreak', type: 'image', x: 0, y: 0, width: 50, height: 50,
      content: 'x" onload="alert(1)'
    });
    const img = el.shadowRoot.querySelector('img.element-imgbreak');
    expect(img).toBeTruthy();
    // Not a valid scheme, so blanked; the breakout never becomes a real attr.
    expect(img.getAttribute('src')).toBe('');
    expect(img.hasAttribute('onload')).toBe(false);
    expect(el.shadowRoot.innerHTML).not.toMatch(/onload\s*=/i);
  });

  // 4. IMAGE element with valid literal https:// and data:image/ srcs: render through.
  it('passes a valid literal https:// image src through unblanked', async () => {
    const el = await renderElement({
      id: 'imghttps', type: 'image', x: 0, y: 0, width: 50, height: 50,
      content: 'https://cdn.example.com/logo.png'
    });
    const img = el.shadowRoot.querySelector('img.element-imghttps');
    expect(img.getAttribute('src')).toBe('https://cdn.example.com/logo.png');
  });

  it('passes a valid literal data:image/ src through unblanked', async () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const el = await renderElement({
      id: 'imgdata', type: 'image', x: 0, y: 0, width: 50, height: 50,
      content: dataUri
    });
    const img = el.shadowRoot.querySelector('img.element-imgdata');
    expect(img.getAttribute('src')).toBe(dataUri);
  });

  // 5. IMAGE src assembled from literal + token, and a token carrying javascript:.
  it('resolves a literal+token https src and blanks a javascript: token src', async () => {
    const okEl = await renderElement(
      {
        id: 'imgtok', type: 'image', x: 0, y: 0, width: 50, height: 50,
        content: 'https://cdn.example.com/{{slug}}.png'
      },
      { slug: 'a' }
    );
    const okImg = okEl.shadowRoot.querySelector('img.element-imgtok');
    expect(okImg.getAttribute('src')).toBe('https://cdn.example.com/a.png');

    const badEl = await renderElement(
      {
        id: 'imgtokbad', type: 'image', x: 0, y: 0, width: 50, height: 50,
        content: '{{u}}'
      },
      { u: 'javascript:alert(1)' }
    );
    const badImg = badEl.shadowRoot.querySelector('img.element-imgtokbad');
    // The assembled URL is validated as a whole, so a hostile token is blanked.
    expect(badImg.getAttribute('src')).toBe('');
    expect(badEl.shadowRoot.innerHTML).not.toContain('javascript:');
  });

  // 6. A normal safe text value renders correctly with single (not double) escaping.
  it('does not double-escape a safe text value with an ampersand and a token', async () => {
    const el = await renderElement(
      {
        id: 'safe', type: 'text', x: 0, y: 0, width: 200, height: 30,
        content: 'Tom & Jerry {{name}}'
      },
      { name: 'Show' }
    );
    const node = el.shadowRoot.querySelector('.element-safe');
    // The ampersand is encoded exactly once (&amp;), never double-encoded
    // (&amp;amp;), and the token resolves to its plain value.
    expect(node.innerHTML).toContain('Tom &amp; Jerry Show');
    expect(node.innerHTML).not.toContain('&amp;amp;');
    // The reader sees the literal, unescaped text.
    expect(node.textContent).toBe('Tom & Jerry Show');
  });
});
