import { describe, it, expect } from 'vitest';
import { OGrafTemplate } from '../src/models/OGrafTemplate.js';

/**
 * Data Inputs model helpers.
 *
 * The Data Inputs editor edits manifest.schema.properties (a keyed object whose
 * key is the {{token}} name). Two invariants matter:
 * - renameProperty preserves key order (a naive delete + re-add would move the
 *   renamed key to the end, reordering the operator's list on every edit).
 * - findElementsReferencingProperty finds elements whose content uses {{key}},
 *   which the editor relies on for rename/remove warnings and the "not used"
 *   cue.
 */

function templateWithProps() {
  const t = new OGrafTemplate();
  t.manifest.schema.properties = {
    name: { type: 'string', title: 'Name', default: 'John' },
    title: { type: 'string', title: 'Title', default: 'Reporter' },
    score: { type: 'number', title: 'Score', default: 0 }
  };
  return t;
}

describe('OGrafTemplate.renameProperty', () => {
  it('renames a key in place and preserves order', () => {
    const t = templateWithProps();
    const ok = t.renameProperty('title', 'role');
    expect(ok).toBe(true);
    expect(Object.keys(t.manifest.schema.properties)).toEqual(['name', 'role', 'score']);
    // The value object is carried over unchanged.
    expect(t.manifest.schema.properties.role).toEqual({
      type: 'string',
      title: 'Title',
      default: 'Reporter'
    });
    expect('title' in t.manifest.schema.properties).toBe(false);
  });

  it('renaming the first key keeps it first', () => {
    const t = templateWithProps();
    t.renameProperty('name', 'fullName');
    expect(Object.keys(t.manifest.schema.properties)).toEqual(['fullName', 'title', 'score']);
  });

  it('is a no-op when the old key is missing', () => {
    const t = templateWithProps();
    expect(t.renameProperty('nope', 'whatever')).toBe(false);
    expect(Object.keys(t.manifest.schema.properties)).toEqual(['name', 'title', 'score']);
  });

  it('refuses to overwrite an existing key', () => {
    const t = templateWithProps();
    expect(t.renameProperty('name', 'title')).toBe(false);
    expect(Object.keys(t.manifest.schema.properties)).toEqual(['name', 'title', 'score']);
  });

  it('is a no-op when old and new key are identical', () => {
    const t = templateWithProps();
    expect(t.renameProperty('name', 'name')).toBe(false);
    expect(Object.keys(t.manifest.schema.properties)).toEqual(['name', 'title', 'score']);
  });
});

describe('OGrafTemplate.findElementsReferencingProperty', () => {
  it('returns elements whose content includes the {{key}} token', () => {
    const t = templateWithProps();
    t.elements = [
      { id: 'a', type: 'text', content: 'Hello {{name}}' },
      { id: 'b', type: 'text', content: '{{title}} of the year' },
      { id: 'c', type: 'rect' },
      { id: 'd', type: 'text', content: 'plain text' }
    ];
    const refs = t.findElementsReferencingProperty('name');
    expect(refs.map(e => e.id)).toEqual(['a']);
  });

  it('does not match a key that is a substring of a different token', () => {
    const t = templateWithProps();
    t.elements = [
      { id: 'a', type: 'text', content: '{{username}}' }
    ];
    // {{name}} must match the exact braces, not {{username}}.
    expect(t.findElementsReferencingProperty('name')).toEqual([]);
  });

  it('returns an empty array when nothing references the key', () => {
    const t = templateWithProps();
    t.elements = [{ id: 'a', type: 'text', content: '{{title}}' }];
    expect(t.findElementsReferencingProperty('score')).toEqual([]);
  });
});
