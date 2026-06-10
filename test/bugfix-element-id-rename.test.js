import { describe, it, expect, beforeEach } from 'vitest';
import { OGrafTemplate } from '../src/models/OGrafTemplate.js';

/**
 * Bug fix: the element "Element ID" field in the Property Panel was readonly,
 * so an element's id could not be changed. The fix makes it editable and adds
 * OGrafTemplate.renameElementId, which migrates everything keyed off the id:
 * the element itself, the per-element timeline lane, and the regenerated styles
 * / web component (which emit `.element-<id>` and serialize the timeline).
 *
 * The id is a CSS class segment and the timeline-lane key, NOT a data token, so
 * a rename must never touch {{...}} content (those are data-input keys, a
 * separate namespace).
 */
describe('OGrafTemplate.renameElementId', () => {
  let template;

  beforeEach(() => {
    // A lower-third seeds three elements (background, name, title) and, via
    // applyPresetToTimeline, a timeline lane for each.
    template = OGrafTemplate.createFromType('lower-third', 'rename-test', 'Rename Test', '');
  });

  it('updates element.id', () => {
    const result = template.renameElementId('name', 'presenter-name');
    expect(result.ok).toBe(true);
    expect(result.id).toBe('presenter-name');
    expect(template.getElementById('presenter-name')).toBeDefined();
    expect(template.getElementById('name')).toBeUndefined();
  });

  it('migrates the timeline lane to the new id, preserving its keyframes', () => {
    const before = template.getTimeline().elements['name'];
    expect(before).toBeDefined();
    expect(before.in.keyframes.length).toBeGreaterThan(0);
    const inFramesBefore = JSON.stringify(before.in.keyframes);

    const result = template.renameElementId('name', 'presenter-name');
    expect(result.ok).toBe(true);

    const elements = template.getTimeline().elements;
    expect(elements['name']).toBeUndefined();
    expect(elements['presenter-name']).toBeDefined();
    // The lane object (keyframes/delay/custom) moved intact.
    expect(JSON.stringify(elements['presenter-name'].in.keyframes)).toBe(inFramesBefore);
  });

  it('preserves timeline key order when migrating a lane', () => {
    const orderBefore = Object.keys(template.getTimeline().elements);
    const idx = orderBefore.indexOf('name');

    template.renameElementId('name', 'zzz-last');

    const orderAfter = Object.keys(template.getTimeline().elements);
    // Same length, and the renamed key sits in the same slot (not pushed to end).
    expect(orderAfter.length).toBe(orderBefore.length);
    expect(orderAfter[idx]).toBe('zzz-last');
  });

  it('regenerates element styles to reference the new class segment', () => {
    template.renameElementId('background', 'backdrop');
    const styles = template.generateElementStyles();
    expect(styles).toContain('.element-backdrop');
    expect(styles).not.toContain('.element-background ');
  });

  it('rejects a duplicate id', () => {
    const result = template.renameElementId('name', 'title');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('duplicate');
    // The original is untouched.
    expect(template.getElementById('name')).toBeDefined();
    expect(template.getTimeline().elements['name']).toBeDefined();
  });

  it('rejects an empty id', () => {
    const result = template.renameElementId('name', '   ');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('empty');
    expect(template.getElementById('name')).toBeDefined();
  });

  it('rejects a non slug-safe id (uppercase, spaces, symbols)', () => {
    for (const bad of ['Name', 'lower third', 'name!', 'name_2', 'café']) {
      const result = template.renameElementId('name', bad);
      expect(result.ok, `expected ${bad} to be rejected`).toBe(false);
      expect(result.reason).toBe('invalid');
    }
    // Nothing changed.
    expect(template.getElementById('name')).toBeDefined();
  });

  it('rejects a rename of a missing element', () => {
    const result = template.renameElementId('does-not-exist', 'whatever');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing');
  });

  it('treats a no-op rename (same id) as success without disturbing the lane', () => {
    const laneBefore = template.getTimeline().elements['name'];
    const result = template.renameElementId('name', 'name');
    expect(result.ok).toBe(true);
    expect(result.id).toBe('name');
    expect(template.getTimeline().elements['name']).toBe(laneBefore);
  });

  it('does not rewrite {{token}} data-input content on rename', () => {
    // The "name" element's content references the {{name}} data input. Renaming
    // the ELEMENT must not touch the data token (a separate namespace).
    const el = template.getElementById('name');
    expect(el.content).toContain('{{name}}');
    template.renameElementId('name', 'presenter-name');
    const renamed = template.getElementById('presenter-name');
    expect(renamed.content).toContain('{{name}}');
  });
});
