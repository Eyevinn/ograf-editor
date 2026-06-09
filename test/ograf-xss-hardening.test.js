import { describe, it, expect } from 'vitest';
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
