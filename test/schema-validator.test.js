import { describe, it, expect } from 'vitest';
import { SchemaValidator, getSchemaValidator } from '../src/services/SchemaValidator.js';
import { OGrafTemplate } from '../src/models/OGrafTemplate.js';
import { ExportImportService } from '../src/services/ExportImportService.js';

/**
 * PM-005 spec validator guard.
 *
 * SchemaValidator is the single authoritative "valid" verdict for an OGraf
 * manifest: it validates against the vendored EBU OGraf v1 JSON Schema (the
 * $ref closure under src/spec/ograf-v1/) plus a few structural checks the
 * schema cannot express (id with "/", duplicate customAction ids). Static
 * component-source portability checks are WARNINGS, never failures.
 *
 * The highest-value guards here:
 *  - a freshly built editor manifest validates clean,
 *  - v_ vendor keys are NEVER rejected by additionalProperties:false,
 *  - a non-vendor unknown top-level key (the PM-003 leak) IS rejected,
 *  - source-grep findings land in warnings and never flip `valid`.
 */

const CANONICAL_SCHEMA =
  'https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json';

/**
 * The smallest manifest that satisfies the six required fields. Tests clone
 * and mutate this so each invalid case isolates a single defect.
 */
function minimalValidManifest() {
  return {
    $schema: CANONICAL_SCHEMA,
    id: 'com.example.lower-third',
    name: 'Lower Third',
    main: 'template.mjs',
    supportsRealTime: true,
    supportsNonRealTime: false
  };
}

const REQUIRED_FIELDS = [
  '$schema',
  'id',
  'name',
  'main',
  'supportsRealTime',
  'supportsNonRealTime'
];

describe('SchemaValidator construction', () => {
  it('compiles the vendored schema closure and exposes a shared singleton', () => {
    expect(() => new SchemaValidator()).not.toThrow();
    const a = getSchemaValidator();
    const b = getSchemaValidator();
    expect(a).toBeInstanceOf(SchemaValidator);
    expect(a).toBe(b);
  });
});

describe('SchemaValidator valid cases', () => {
  const validator = getSchemaValidator();

  it('accepts a freshly built manifest from OGrafTemplate.createFromType', () => {
    const template = OGrafTemplate.createFromType(
      'lower-third',
      'My Lower Third',
      'My Lower Third',
      'A lower third'
    );
    const manifest = template.buildManifest();
    const result = validator.validateManifest(manifest);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('accepts a custom-type built manifest with authored elements', () => {
    const template = OGrafTemplate.createFromType('custom', 'my-card', 'My Card', 'desc');
    template.elements = [
      { id: 'box', type: 'rect', x: 0, y: 0, width: 10, height: 10, style: {} }
    ];
    const manifest = template.buildManifest();
    const result = validator.validateManifest(manifest);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('does NOT reject editor v_ vendor keys (additionalProperties:false + ^v_.*)', () => {
    const manifest = {
      ...minimalValidManifest(),
      v_ografEditorElements: [{ id: 'box', type: 'rect', x: 0, y: 0, width: 1, height: 1 }],
      v_ografEditorTimeline: { version: 1, elements: {} },
      v_ografEditorSteps: { version: 1, steps: [] },
      v_ografEditorDataSource: { enabled: false, type: 'json', url: '', intervalMs: 5000, mapping: {} }
    };
    const result = validator.validateManifest(manifest);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('accepts an arbitrary unknown v_-prefixed key (any vendor extension)', () => {
    const manifest = { ...minimalValidManifest(), v_someOtherVendorThing: { whatever: true } };
    const result = validator.validateManifest(manifest);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe('SchemaValidator invalid cases: missing required fields', () => {
  const validator = getSchemaValidator();

  for (const field of REQUIRED_FIELDS) {
    it(`rejects a manifest missing required field "${field}"`, () => {
      const manifest = minimalValidManifest();
      delete manifest[field];
      const result = validator.validateManifest(manifest);
      expect(result.valid).toBe(false);
      // The error must name the missing property so the author can act on it.
      const mentionsField = result.errors.some((e) => e.message.includes(field));
      expect(mentionsField, JSON.stringify(result.errors)).toBe(true);
    });
  }
});

describe('SchemaValidator invalid cases: field-level constraints', () => {
  const validator = getSchemaValidator();

  it('rejects an id containing "/"', () => {
    const manifest = { ...minimalValidManifest(), id: 'com/example/bad' };
    const result = validator.validateManifest(manifest);
    expect(result.valid).toBe(false);
    const idError = result.errors.find((e) => e.path === 'id');
    expect(idError, JSON.stringify(result.errors)).toBeTruthy();
    expect(idError.message).toMatch(/must not contain/i);
  });

  it('rejects a $schema that is not the canonical const URL', () => {
    const manifest = { ...minimalValidManifest(), $schema: 'https://example.com/not-ograf.json' };
    const result = validator.validateManifest(manifest);
    expect(result.valid).toBe(false);
    const schemaError = result.errors.find((e) => e.path === '$schema');
    expect(schemaError, JSON.stringify(result.errors)).toBeTruthy();
  });

  it('rejects a non-vendor unknown top-level key (PM-003 leak guard: "elements")', () => {
    const manifest = { ...minimalValidManifest(), elements: [] };
    const result = validator.validateManifest(manifest);
    expect(result.valid).toBe(false);
    const leak = result.errors.find((e) => e.message.includes('elements'));
    expect(leak, JSON.stringify(result.errors)).toBeTruthy();
    expect(leak.message).toMatch(/unsupported property|vendor extensions must be prefixed/i);
  });

  it('rejects a non-vendor unknown top-level key (PM-003 leak guard: "webComponent")', () => {
    const manifest = { ...minimalValidManifest(), webComponent: 'export default class {}' };
    const result = validator.validateManifest(manifest);
    expect(result.valid).toBe(false);
    const leak = result.errors.find((e) => e.message.includes('webComponent'));
    expect(leak, JSON.stringify(result.errors)).toBeTruthy();
  });

  it('rejects an actionDurations entry with a non-integer duration', () => {
    const manifest = {
      ...minimalValidManifest(),
      actionDurations: [{ type: 'playAction', duration: 1.5 }]
    };
    const result = validator.validateManifest(manifest);
    expect(result.valid).toBe(false);
  });

  it('rejects an actionDurations entry with duration < -1', () => {
    const manifest = {
      ...minimalValidManifest(),
      actionDurations: [{ type: 'playAction', duration: -2 }]
    };
    const result = validator.validateManifest(manifest);
    expect(result.valid).toBe(false);
  });

  it('accepts an actionDurations entry with duration -1 (dynamic/unknown)', () => {
    const manifest = {
      ...minimalValidManifest(),
      actionDurations: [{ type: 'playAction', duration: -1 }]
    };
    const result = validator.validateManifest(manifest);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('rejects a non-numeric stepCount (schema types stepCount as number)', () => {
    // NB: the vendored schema declares stepCount as "type": "number" with
    // minimum -1, NOT integer. A fractional value like 2.5 is therefore VALID
    // per the spec; what is rejected is a non-number. Test the contract that
    // actually exists, not an integer rule the schema does not impose.
    const manifest = { ...minimalValidManifest(), stepCount: 'two' };
    const result = validator.validateManifest(manifest);
    expect(result.valid).toBe(false);
    const stepError = result.errors.find((e) => e.path === 'stepCount');
    expect(stepError, JSON.stringify(result.errors)).toBeTruthy();
  });

  it('accepts a fractional stepCount (schema permits any number >= -1)', () => {
    const manifest = { ...minimalValidManifest(), stepCount: 2.5 };
    const result = validator.validateManifest(manifest);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('rejects a stepCount < -1', () => {
    const manifest = { ...minimalValidManifest(), stepCount: -2 };
    const result = validator.validateManifest(manifest);
    expect(result.valid).toBe(false);
    const stepError = result.errors.find((e) => e.path === 'stepCount');
    expect(stepError, JSON.stringify(result.errors)).toBeTruthy();
  });
});

describe('SchemaValidator invalid cases: customActions', () => {
  const validator = getSchemaValidator();

  it('rejects a customActions entry missing id', () => {
    const manifest = {
      ...minimalValidManifest(),
      customActions: [{ name: 'Slide In' }]
    };
    const result = validator.validateManifest(manifest);
    expect(result.valid).toBe(false);
    const hit = result.errors.some((e) => e.message.includes('id'));
    expect(hit, JSON.stringify(result.errors)).toBe(true);
  });

  it('rejects a customActions entry missing name', () => {
    const manifest = {
      ...minimalValidManifest(),
      customActions: [{ id: 'slideIn' }]
    };
    const result = validator.validateManifest(manifest);
    expect(result.valid).toBe(false);
    const hit = result.errors.some((e) => e.message.includes('name'));
    expect(hit, JSON.stringify(result.errors)).toBe(true);
  });

  it('rejects duplicate customActions ids (structural check beyond the schema)', () => {
    const manifest = {
      ...minimalValidManifest(),
      customActions: [
        { id: 'slideIn', name: 'Slide In' },
        { id: 'slideIn', name: 'Slide In Again' }
      ]
    };
    const result = validator.validateManifest(manifest);
    expect(result.valid).toBe(false);
    const dup = result.errors.find((e) => /duplicate customAction id/i.test(e.message));
    expect(dup, JSON.stringify(result.errors)).toBeTruthy();
    expect(dup.path).toBe('customActions[1].id');
  });

  it('accepts distinct customActions ids', () => {
    const manifest = {
      ...minimalValidManifest(),
      customActions: [
        { id: 'slideIn', name: 'Slide In' },
        { id: 'slideOut', name: 'Slide Out' }
      ]
    };
    const result = validator.validateManifest(manifest);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe('SchemaValidator non-object input', () => {
  const validator = getSchemaValidator();

  it('rejects null, arrays, and primitives without throwing', () => {
    for (const bad of [null, undefined, [], 'a string', 42]) {
      const result = validator.validateManifest(bad);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

describe('SchemaValidator component-portability checks are WARNINGS, not errors', () => {
  const validator = getSchemaValidator();

  it('warns (does not fail) when supportsNonRealTime is true but source lacks goToTime/setActionsSchedule', () => {
    const manifest = { ...minimalValidManifest(), supportsNonRealTime: true };
    const sourceWithout = 'class X extends HTMLElement { load(){} updateAction(){} }';
    const result = validator.validateManifest(manifest, { componentSource: sourceWithout });

    // The schema is satisfied, so valid stays true; the source grep only warns.
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);

    const goToTimeWarn = result.warnings.find(
      (w) => w.path === 'supportsNonRealTime' && w.message.includes('goToTime')
    );
    const scheduleWarn = result.warnings.find(
      (w) => w.path === 'supportsNonRealTime' && w.message.includes('setActionsSchedule')
    );
    expect(goToTimeWarn, JSON.stringify(result.warnings)).toBeTruthy();
    expect(scheduleWarn, JSON.stringify(result.warnings)).toBeTruthy();
  });

  it('does not warn about non-real-time methods when the source implements them', () => {
    const manifest = { ...minimalValidManifest(), supportsNonRealTime: true };
    const sourceWith =
      'class X extends HTMLElement { goToTime(){} setActionsSchedule(){} }';
    const result = validator.validateManifest(manifest, { componentSource: sourceWith });
    expect(result.valid).toBe(true);
    const nrtWarn = result.warnings.find((w) => w.path === 'supportsNonRealTime');
    expect(nrtWarn, JSON.stringify(result.warnings)).toBeFalsy();
  });

  it('warns (does not fail) when a declared customAction is not referenced in the source', () => {
    const manifest = {
      ...minimalValidManifest(),
      customActions: [{ id: 'slideIn', name: 'Slide In' }]
    };
    const source = 'class X extends HTMLElement { load(){} }';
    const result = validator.validateManifest(manifest, { componentSource: source });
    expect(result.valid).toBe(true);
    const warn = result.warnings.find(
      (w) => w.path === 'customActions' && w.message.includes('slideIn')
    );
    expect(warn, JSON.stringify(result.warnings)).toBeTruthy();
  });

  it('warns (does not fail) when main does not match the supplied component filename', () => {
    const manifest = { ...minimalValidManifest(), main: 'template.mjs' };
    const result = validator.validateManifest(manifest, { componentFilename: 'other.mjs' });
    expect(result.valid).toBe(true);
    const warn = result.warnings.find((w) => w.path === 'main');
    expect(warn, JSON.stringify(result.warnings)).toBeTruthy();
  });

  it('warns (does not fail) when a vendor-looking key is missing the v_ prefix', () => {
    const manifest = { ...minimalValidManifest(), ografEditorSteps: { steps: [] } };
    const result = validator.validateManifest(manifest);
    // additionalProperties:false hard-fails the bare key (it is not v_-prefixed)...
    expect(result.valid).toBe(false);
    // ...but the validator ALSO surfaces a fix-hint warning about the prefix.
    const warn = result.warnings.find((w) => w.path === 'ografEditorSteps');
    expect(warn, JSON.stringify(result.warnings)).toBeTruthy();
    expect(warn.message).toMatch(/v_ prefix/i);
  });
});

describe('ExportImportService.importRawManifest schema gate (integration)', () => {
  // Stub manager (same approach as the XSS hardening test): importTemplate is
  // the only method importRawManifest reaches once the schema gate passes. The
  // real TemplateManager additionally refuses any manifest with no
  // ograf-editor authoring data, which is an UNRELATED rule. Stubbing it keeps
  // these tests focused on the schema gate in importRawManifest itself.
  function makeService() {
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

  it('imports a minimal partial raw manifest after normalization fills the required fields', () => {
    const service = makeService();
    // Only id + name supplied; normalizeManifest must complete $schema, main,
    // and the support flags so the schema gate passes.
    const raw = { $schema: 'x', id: 'my-card', name: 'My Card' };
    let template;
    expect(() => {
      template = service.importRawManifest(raw);
    }).not.toThrow();
    expect(template).toBeTruthy();
    expect(template.manifest.id).toBe('my-card');
    expect(template.manifest.$schema).toBe(CANONICAL_SCHEMA);
    expect(template.manifest.main).toBe('template.mjs');
    expect(typeof template.manifest.supportsRealTime).toBe('boolean');
    expect(typeof template.manifest.supportsNonRealTime).toBe('boolean');
  });

  it('throws a readable schema error for a genuinely broken manifest (id with "/")', () => {
    const service = makeService();
    const raw = { $schema: 'x', id: 'com/example/bad', name: 'Bad' };
    expect(() => service.importRawManifest(raw)).toThrow(/OGraf schema/);
    // The thrown message must carry the actionable id detail.
    let message = '';
    try {
      service.importRawManifest(raw);
    } catch (e) {
      message = e.message;
    }
    expect(message).toMatch(/id/);
    expect(message).toMatch(/must not contain/i);
  });
});
