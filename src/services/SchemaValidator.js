// SchemaValidator: the honest, schema-backed validation gate for OGraf
// manifests. This replaces the old hand-rolled field checks scattered across
// ExportImportService and CodeEditor. The manifest is validated against the
// vendored EBU OGraf v1 JSON Schema (draft 2020-12) using ajv's 2020 build.
//
// PM-005 is STATIC / no-execution. We do NOT load or run the component here.
// Runtime proof (constructable default export, callable lifecycle methods) is
// owned by the PM-006 module-load smoke test. The component-portability checks
// in this module are source-text heuristics and are therefore emitted as
// WARNINGS, never as hard failures.
//
// Grounding: schema fields and the $ref closure are vendored under
// src/spec/ograf-v1/ (see PROVENANCE.md). Do not invent field names here.

import Ajv2020 from 'ajv/dist/2020.js';

// The vendored schemas. Vite bundles these JSON imports at build time, so there
// is no runtime network fetch.
import graphicsSchema from '../spec/ograf-v1/schema.json';
import actionSchema from '../spec/ograf-v1/lib/action.json';
import numberConstraintSchema from '../spec/ograf-v1/lib/constraints/number.json';
import booleanConstraintSchema from '../spec/ograf-v1/lib/constraints/boolean.json';
import gddObjectSchema from '../spec/ograf-v1/gdd/object.json';
import gddTypesSchema from '../spec/ograf-v1/gdd/gdd-types.json';
import gddBasicTypesSchema from '../spec/ograf-v1/gdd/basic-types.json';

// The $id of the root manifest schema, used to look up the compiled validator.
const ROOT_SCHEMA_ID =
    'https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json';

// The known, allowed editor vendor keys. Any other v_-prefixed key is valid per
// the schema (patternProperties "^v_.*"); these are just the ones this editor
// itself writes, listed for documentation.
const KNOWN_VENDOR_KEYS = [
    'v_ografEditorElements',
    'v_ografEditorTimeline',
    'v_ografEditorDataSource',
    'v_ografEditorSteps'
];

export class SchemaValidator {
    constructor() {
        // strict:false because the upstream schemas mix `type` and `$ref` on the
        // same object (e.g. schema.json "schema" property), which ajv's strict
        // mode flags as redundant. allErrors so we can report every problem at
        // once rather than bailing on the first.
        this.ajv = new Ajv2020({ allErrors: true, strict: false });

        // Register every schema in the closure. ajv keys each by its own $id, so
        // the cross-file $refs resolve. Order does not matter for addSchema.
        const schemas = [
            graphicsSchema,
            actionSchema,
            numberConstraintSchema,
            booleanConstraintSchema,
            gddObjectSchema,
            gddTypesSchema,
            gddBasicTypesSchema
        ];
        for (const schema of schemas) {
            this.ajv.addSchema(schema);
        }

        // Look up the compiled root validator by its $id. getSchema compiles on
        // first access; if the closure were incomplete this throws here, which
        // is the hard guarantee that the vendored set is complete.
        this.validateRoot = this.ajv.getSchema(ROOT_SCHEMA_ID);
        if (!this.validateRoot) {
            throw new Error(
                `OGraf root schema ${ROOT_SCHEMA_ID} could not be compiled`
            );
        }
    }

    /**
     * Validate an OGraf manifest against the EBU OGraf v1 schema, plus a set of
     * editor-specific structural checks the schema cannot express (id must not
     * contain "/", customAction ids must be unique) and source-text portability
     * warnings.
     *
     * @param {object} manifest      The parsed manifest object.
     * @param {object} [options]
     * @param {string} [options.componentSource]  The component JS source, if
     *        available, for static portability warnings.
     * @param {string} [options.componentFilename] The filename of the component
     *        in the export pair, if known, for the main-reference check.
     * @returns {{ valid: boolean, errors: Array<{path:string,message:string}>,
     *             warnings: Array<{path:string,message:string}> }}
     */
    validateManifest(manifest, options = {}) {
        const errors = [];
        const warnings = [];

        if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
            errors.push({ path: '', message: 'Manifest must be a JSON object' });
            return { valid: false, errors, warnings };
        }

        // 1. Schema validation (the authoritative gate).
        const schemaValid = this.validateRoot(manifest);
        if (!schemaValid && Array.isArray(this.validateRoot.errors)) {
            for (const err of this.validateRoot.errors) {
                errors.push(this.formatAjvError(err));
            }
        }

        // 2. Structural checks the JSON Schema cannot express.
        this.checkId(manifest, errors);
        this.checkCustomActions(manifest, errors);
        this.checkVendorKeyPrefixes(manifest, warnings);
        this.checkAuthorString(manifest, warnings);

        // 3. Static component-portability checks (WARNINGS only).
        this.checkComponentPortability(manifest, options, warnings);

        // De-duplicate errors/warnings that can arise from overlapping checks.
        const dedupedErrors = this.dedupe(errors);
        const dedupedWarnings = this.dedupe(warnings);

        return {
            valid: dedupedErrors.length === 0,
            errors: dedupedErrors,
            warnings: dedupedWarnings
        };
    }

    /**
     * Map a raw ajv error into a readable { path, message }. ajv's instancePath
     * is a JSON Pointer ("" for the root, "/customActions/0/id" for nested);
     * present it as a dotted/bracketed path the user can find in the manifest.
     */
    formatAjvError(err) {
        const path = this.pointerToPath(err.instancePath);
        let message = err.message || 'is invalid';

        // Enrich the messages where ajv's default is too terse to act on.
        if (err.keyword === 'required' && err.params && err.params.missingProperty) {
            const prop = err.params.missingProperty;
            const where = path ? `${path} ` : '';
            message = `${where}is missing required property "${prop}"`;
            return { path: path || '', message };
        }
        if (err.keyword === 'additionalProperties' && err.params && err.params.additionalProperty) {
            const prop = err.params.additionalProperty;
            const where = path || 'manifest';
            message = `${where} has an unsupported property "${prop}" (vendor extensions must be prefixed with v_)`;
            return { path: path || '', message };
        }
        if (err.keyword === 'const' && err.params && 'allowedValue' in err.params) {
            message = `must equal "${err.params.allowedValue}"`;
        }
        if (err.keyword === 'enum' && err.params && Array.isArray(err.params.allowedValues)) {
            message = `must be one of: ${err.params.allowedValues.join(', ')}`;
        }

        const where = path || 'manifest';
        return { path: path || '', message: `${where} ${message}` };
    }

    /** JSON Pointer ("/a/0/b") -> readable path ("a[0].b"). */
    pointerToPath(pointer) {
        if (!pointer) return '';
        return pointer
            .split('/')
            .filter(Boolean)
            .map((seg) => {
                // Unescape JSON Pointer tokens.
                const token = seg.replace(/~1/g, '/').replace(/~0/g, '~');
                return /^\d+$/.test(token) ? `[${token}]` : `.${token}`;
            })
            .join('')
            .replace(/^\./, '');
    }

    /**
     * The schema types `id` as a plain string. The editor additionally requires
     * that an id contain no "/", because the id is spliced into generated tag
     * names, class attributes and file paths. This is a hard failure.
     */
    checkId(manifest, errors) {
        if (typeof manifest.id === 'string' && manifest.id.includes('/')) {
            errors.push({
                path: 'id',
                message: 'id must not contain "/" (it is used in tag names and file paths)'
            });
        }
    }

    /**
     * customActions[].id must be present (the schema already requires id+name)
     * and unique within the manifest. Duplicate ids are not expressible in JSON
     * Schema, so check here. Hard failure.
     */
    checkCustomActions(manifest, errors) {
        if (!Array.isArray(manifest.customActions)) return;
        const seen = new Map();
        manifest.customActions.forEach((action, index) => {
            if (!action || typeof action !== 'object') return;
            const id = action.id;
            if (typeof id !== 'string' || id.length === 0) {
                // The schema also reports this; we add a clearer path-specific note.
                return;
            }
            if (seen.has(id)) {
                errors.push({
                    path: `customActions[${index}].id`,
                    message: `duplicate customAction id "${id}" (also at customActions[${seen.get(id)}])`
                });
            } else {
                seen.set(id, index);
            }
        });
    }

    /**
     * The schema allows any "^v_.*" key but rejects other extra keys. A key that
     * looks like an editor extension but is missing the v_ prefix (e.g.
     * "ografEditorSteps") would be rejected by additionalProperties with a
     * generic message; surface a clearer warning so the author can fix the
     * prefix. Warning, not failure (additionalProperties already hard-fails it).
     */
    checkVendorKeyPrefixes(manifest, warnings) {
        const suspectFragments = ['ografEditor', 'vendor', 'ograf_'];
        for (const key of Object.keys(manifest)) {
            if (key.startsWith('v_')) continue;
            const looksLikeVendor = suspectFragments.some((frag) => key.includes(frag));
            const matchesKnown = KNOWN_VENDOR_KEYS.some((k) => k.slice(2) === key);
            if (looksLikeVendor || matchesKnown) {
                warnings.push({
                    path: key,
                    message: `"${key}" looks like a vendor extension but is missing the required v_ prefix (e.g. "v_${key}")`
                });
            }
        }
    }

    /**
     * The editor's normalizeManifest coerces a bare-string author into
     * { name, email }. A raw manifest with author as a string is technically
     * invalid against the schema (author must be an object), but it is trivially
     * fixable, so surface it as a warning rather than relying only on the hard
     * schema error. (The schema error still fires; this adds the fix hint.)
     */
    checkAuthorString(manifest, warnings) {
        if (typeof manifest.author === 'string') {
            warnings.push({
                path: 'author',
                message: 'author is a string; it will be normalized to { name, email } on import'
            });
        }
    }

    /**
     * Static, source-text portability checks. These are heuristics over the
     * component source and are emitted as WARNINGS only, because grepping source
     * is unreliable (methods can be defined dynamically, names can appear in
     * comments). Runtime verification is owned by PM-006.
     */
    checkComponentPortability(manifest, options, warnings) {
        const { componentSource, componentFilename } = options;

        // main must reference the component file in the export pair, when known.
        if (typeof componentFilename === 'string' && componentFilename.length > 0) {
            if (typeof manifest.main !== 'string' || manifest.main.length === 0) {
                // Missing main is already a hard schema error; nothing to add.
            } else {
                const mainBase = manifest.main.split('/').pop();
                const fileBase = componentFilename.split('/').pop();
                if (mainBase !== fileBase) {
                    warnings.push({
                        path: 'main',
                        message: `main "${manifest.main}" does not match the component file "${componentFilename}"`
                    });
                }
            }
        }

        if (typeof componentSource !== 'string' || componentSource.length === 0) {
            return;
        }

        // If non-real-time is declared, the OGraf spec expects goToTime() and
        // setActionsSchedule(). Source absence is a warning, not a failure.
        if (manifest.supportsNonRealTime === true) {
            for (const method of ['goToTime', 'setActionsSchedule']) {
                if (!componentSource.includes(method)) {
                    warnings.push({
                        path: 'supportsNonRealTime',
                        message: `supportsNonRealTime is true but the component source does not appear to implement ${method}()`
                    });
                }
            }
        }

        // Each declared customAction id should have a corresponding handler hint
        // in the source. Warning only.
        if (Array.isArray(manifest.customActions)) {
            for (const action of manifest.customActions) {
                if (!action || typeof action.id !== 'string' || action.id.length === 0) continue;
                if (!componentSource.includes(action.id)) {
                    warnings.push({
                        path: 'customActions',
                        message: `customAction "${action.id}" is declared but does not appear to be handled in the component source`
                    });
                }
            }
        }
    }

    /** Remove duplicate {path,message} entries, preserving order. */
    dedupe(list) {
        const seen = new Set();
        const out = [];
        for (const item of list) {
            const key = `${item.path} ${item.message}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(item);
        }
        return out;
    }
}

// Lazily-constructed shared instance. Building the Ajv instance (registering and
// compiling the closure) is non-trivial work; share one across the app.
let sharedValidator = null;

export function getSchemaValidator() {
    if (!sharedValidator) {
        sharedValidator = new SchemaValidator();
    }
    return sharedValidator;
}
