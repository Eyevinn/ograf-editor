import { describe, it, expect, beforeEach } from 'vitest';
import { TemplateManager } from '../src/services/TemplateManager.js';
import { ExportImportService } from '../src/services/ExportImportService.js';

const SCHEMA = 'https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json';

// Scope decision (A): the editor only opens templates it created. A code-first
// OGraf graphic (hand-written component, lib/ modules, resources) has no
// ograf-editor authoring data and must be refused, not fabricated from schema.
describe('foreign graphic import guard', () => {
  let tm, io;
  beforeEach(() => {
    try { localStorage.clear(); } catch (e) { /* ignore */ }
    tm = new TemplateManager();
    io = new ExportImportService(tm);
  });

  it('refuses a code-first graphic with no ograf-editor authoring data', () => {
    const foreign = JSON.stringify({
      $schema: SCHEMA, id: 'l3rd-name', name: 'Lower 3rd', main: 'graphic.mjs',
      supportsRealTime: true, supportsNonRealTime: true,
      schema: { type: 'object', properties: { name: { type: 'string' } } }
    });
    expect(() => io.importFromJSON(foreign)).toThrow(/not created in this editor/i);
  });

  it('imports a manifest that carries ograf-editor authoring data (ours)', () => {
    const ours = JSON.stringify({
      $schema: SCHEMA, id: 'mine', name: 'Mine', main: 'template.mjs',
      supportsRealTime: true, supportsNonRealTime: false,
      schema: { type: 'object', properties: {} },
      v_ografEditorElements: [
        { id: 'bg', type: 'rect', x: 0, y: 0, width: 10, height: 10, style: {} }
      ]
    });
    const t = io.importFromJSON(ours);
    expect(t.manifest.id).toBe('mine');
    expect(t.elements).toHaveLength(1);
    expect(t.elements[0].id).toBe('bg');
  });

  it('imports the editor JSON bundle (elements provided separately; manifest has no v_ key)', () => {
    // Regression: the foreign-graphic guard must not reject our own editor
    // bundle, whose elements live in a top-level field, not in the manifest.
    const bundle = JSON.stringify({
      format: 'ograf-editor-template',
      template: {
        manifest: {
          $schema: SCHEMA, id: 'bundled', name: 'Bundled', main: 'template.mjs',
          supportsRealTime: true, supportsNonRealTime: false,
          schema: { type: 'object', properties: {} }
        },
        elements: [{ id: 'bg', type: 'rect', x: 0, y: 0, width: 5, height: 5, style: {} }],
        webComponent: 'export default class Bundled extends HTMLElement {}'
      }
    });
    const t = io.importFromJSON(bundle);
    expect(t.manifest.id).toBe('bundled');
    expect(t.elements).toHaveLength(1);
    expect(t.elements[0].id).toBe('bg');
  });
});
