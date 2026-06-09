import { describe, it, expect } from 'vitest';
import * as acorn from 'acorn';
import { OGrafTemplate } from '../src/models/OGrafTemplate.js';

/**
 * OGraf v1 contract guard.
 *
 * This pins down that the editor emits spec-valid, portable OGraf:
 * - a syntactically valid ES module web component,
 * - all six lifecycle methods (load, dispose, playAction, stopAction,
 *   updateAction, customAction),
 * - a sanitized id and class name (the live bug: ids with spaces, caps, or
 *   punctuation produced an invalid class header and unsafe element name),
 * - the required manifest fields.
 *
 * These assertions are written against the spec-compliant output the frontend
 * agent is producing (ES-module default export, sanitized id/class, single
 * params lifecycle). They do not depend on the buggy pre-rewrite shape.
 */

const LIFECYCLE_METHODS = [
  'load',
  'dispose',
  'playAction',
  'stopAction',
  'updateAction',
  'customAction'
];

/**
 * Parse generated component code as an ES module. acorn natively understands
 * `export default class`, so a clean parse is a real syntactic-validity proof,
 * including for adversarial ids that previously broke the class header.
 */
function parseAsModule(code) {
  return acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
}

/**
 * Extract the class identifier token from `... class <Name> extends`.
 * Returns null if no class declaration is found.
 */
function extractClassName(code) {
  const match = code.match(/\bclass\s+([^\s{]+)/);
  return match ? match[1] : null;
}

const CASES = [
  { type: 'lower-third', id: 'lower-third', name: 'Lower Third', desc: 'A lower third' },
  // Adversarial id: spaces, capitals, punctuation. Must be sanitized to a safe
  // slug and a valid class identifier, or the generated component is broken.
  { type: 'lower-third', id: 'My Lower Third!', name: 'My Lower Third!', desc: 'Adversarial id' }
];

describe('OGraf component generation contract', () => {
  for (const c of CASES) {
    describe(`id="${c.id}"`, () => {
      const template = OGrafTemplate.createFromType(c.type, c.id, c.name, c.desc);
      const code = template.generateWebComponent();

      it('produces syntactically valid ES module code', () => {
        expect(() => parseAsModule(code)).not.toThrow();
      });

      it('emits a valid, space-free class identifier ending in Graphic', () => {
        const className = extractClassName(code);
        expect(className).toBeTruthy();
        // No whitespace or punctuation snuck into the identifier.
        expect(className).toMatch(/^[A-Za-z_$][\w$]*Graphic$/);
        // Guard the exact live bug: never `class <something with a space>`.
        expect(code).not.toMatch(/class\s+\S+\s+\S+\s+extends/);
      });

      it('exports the component class as an ES module default', () => {
        expect(code).toMatch(/export\s+default\s+class\b/);
      });

      it('defines all six OGraf lifecycle methods', () => {
        for (const method of LIFECYCLE_METHODS) {
          // Match `methodName(` or `async methodName(` as a class member.
          const re = new RegExp(`(?:async\\s+)?${method}\\s*\\(`);
          expect(code, `missing lifecycle method: ${method}`).toMatch(re);
        }
      });
    });
  }

  describe('manifest contract', () => {
    const template = OGrafTemplate.createFromType('lower-third', 'My Lower Third!', 'My Lower Third!', 'Adversarial id');
    const manifest = template.manifest;

    it('has the required OGraf manifest fields', () => {
      expect(manifest.$schema).toBeTruthy();
      expect(manifest.id).toBeTruthy();
      expect(manifest.name).toBeTruthy();
      expect(manifest.main).toBeTruthy();
      expect(manifest).toHaveProperty('supportsRealTime');
      expect(manifest).toHaveProperty('supportsNonRealTime');
      expect(typeof manifest.supportsRealTime).toBe('boolean');
      expect(typeof manifest.supportsNonRealTime).toBe('boolean');
    });

    it('sanitizes the id to a safe lowercase slug (no spaces or punctuation)', () => {
      expect(manifest.id).not.toMatch(/\s/);
      expect(manifest.id).toBe(manifest.id.toLowerCase());
      // Slug is restricted to url/element-name-safe characters.
      expect(manifest.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    });
  });
});
