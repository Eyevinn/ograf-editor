import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OGrafTemplate } from '../src/models/OGrafTemplate.js';
import { TemplateManager } from '../src/services/TemplateManager.js';
import { ExportImportService } from '../src/services/ExportImportService.js';

/**
 * Regression guards for the model/services bug fixes:
 *  1. localStorage save failures are surfaced, not silently swallowed.
 *  2. addElement() ids are unique even within the same millisecond.
 *  3. createElementsFromSchema de-duplicates ids for keys that slugify alike.
 *  4. A spec manifest/bundle round-trip preserves authored elements via the
 *     v_ografEditorElements vendor key instead of regenerating defaults.
 */

describe('OGrafTemplate.addElement id uniqueness', () => {
  it('generates unique ids for elements added back to back', () => {
    const template = new OGrafTemplate();
    template.elements = [];

    // Freeze Date.now so all adds land in the same millisecond, the exact
    // condition that produced colliding `element_${Date.now()}` ids.
    const fixed = 1_700_000_000_000;
    const spy = vi.spyOn(Date, 'now').mockReturnValue(fixed);
    try {
      for (let i = 0; i < 50; i++) {
        template.addElement({ type: 'text', x: 0, y: 0, width: 10, height: 10 });
      }
    } finally {
      spy.mockRestore();
    }

    const ids = template.elements.map(el => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('TemplateManager.createElementsFromSchema id de-duplication', () => {
  it('does not collapse keys that slugify to the same id', () => {
    const manager = new TemplateManager();
    const manifest = {
      name: 'Collision Test',
      schema: {
        properties: {
          Title: { type: 'string' },
          title: { type: 'string' },
          'ti.tle': { type: 'string' }
        }
      }
    };

    const elements = manager.createElementsFromSchema(manifest);
    const textIds = elements.filter(el => el.type === 'text').map(el => el.id);

    // Three distinct string properties must yield three distinct element ids.
    expect(textIds.length).toBe(3);
    expect(new Set(textIds).size).toBe(3);
  });
});

describe('TemplateManager.saveToStorage failure surfacing', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not silently swallow a save failure', () => {
    const manager = new TemplateManager();

    // Simulate a QuotaExceededError-style failure.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const events = [];
    const handler = (e) => events.push(e);
    window.addEventListener('ograf-storage-error', handler);

    manager.saveToStorage();

    window.removeEventListener('ograf-storage-error', handler);

    // The failure must be visible: a flag is set, a clear error is logged, and
    // an event is dispatched for the app to show.
    expect(manager.lastStorageError).toBeInstanceOf(Error);
    expect(consoleSpy).toHaveBeenCalled();
    expect(events.length).toBe(1);
    expect(events[0].detail.message).toMatch(/failed to save/i);
  });
});

describe('TemplateManager.loadFromStorage corruption handling', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    // Clear the deliberately-corrupt entry so it cannot leak into later
    // describes and surface as a stray "corrupt JSON" log under another test.
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('logs and continues with an empty set on corrupt JSON instead of throwing', () => {
    localStorage.setItem('ograf-templates', '{ this is not valid json');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let manager;
    expect(() => {
      manager = new TemplateManager();
    }).not.toThrow();

    expect(consoleSpy).toHaveBeenCalled();
    expect(manager.getAllTemplates().length).toBe(0);
  });
});

describe('Spec manifest round-trip preserves authored elements', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('restores authored elements from v_ografEditorElements on bundle import', () => {
    const manager = new TemplateManager();
    const service = new ExportImportService(manager);

    // Author a template with non-default geometry and a non-text element that
    // createElementsFromSchema would never reproduce.
    const template = OGrafTemplate.createFromType(
      'custom',
      'round-trip',
      'Round Trip',
      'desc'
    );
    template.elements = [
      {
        id: 'badge',
        type: 'circle',
        x: 800,
        y: 40,
        width: 120,
        height: 120,
        style: { backgroundColor: 'red' }
      },
      {
        id: 'headline',
        type: 'text',
        x: 33,
        y: 777,
        width: 444,
        height: 55,
        content: '{{text}}',
        style: { fontSize: '40px' }
      }
    ];
    manager.templates.set(template.manifest.id, template);

    // Export the spec-clean manifest and confirm the vendor key carries the
    // authored elements (and the manifest stays v_-clean otherwise).
    const manifest = template.buildManifest();
    expect(Array.isArray(manifest.v_ografEditorElements)).toBe(true);
    expect(manifest.v_ografEditorElements.length).toBe(2);

    // Build an OGraf export bundle (the lossy path) and re-import it.
    const files = manager.exportTemplate('round-trip');
    const bundle = {
      templateId: 'round-trip',
      exportDate: new Date().toISOString(),
      files
    };

    manager.deleteTemplate('round-trip');
    const imported = service.importOGrafBundle(bundle);

    const headline = imported.elements.find(el => el.id === 'headline');
    const badge = imported.elements.find(el => el.id === 'badge');

    expect(badge).toBeDefined();
    expect(badge.type).toBe('circle');
    expect(headline).toBeDefined();
    expect(headline.x).toBe(33);
    expect(headline.y).toBe(777);
    expect(headline.width).toBe(444);
    expect(headline.style.fontSize).toBe('40px');
  });
});
