# OGraf v1 JSON Schemas (vendored)

These JSON Schema files are vendored copies of the EBU OGraf v1 graphics
manifest schema and its full `$ref` closure. They are bundled with the editor
so validation runs fully offline, with no network fetch at runtime.

- Standard: EBU OGraf v1
- JSON Schema dialect: draft 2020-12
- Root schema `$id`: `https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json`
- Fetched: 2026-06-11

## Source

All files were fetched from the `ebu/ograf` repository on the `main` branch,
under `v1/specification/json-schemas/`.

Raw base URL:
`https://raw.githubusercontent.com/ebu/ograf/main/v1/specification/json-schemas/`

| Local path                     | Upstream path                          |
| ------------------------------ | -------------------------------------- |
| `schema.json`                  | `graphics/schema.json`                 |
| `lib/action.json`              | `lib/action.json`                      |
| `lib/constraints/number.json`  | `lib/constraints/number.json`          |
| `lib/constraints/boolean.json` | `lib/constraints/boolean.json`         |
| `gdd/object.json`              | `gdd/object.json`                      |
| `gdd/gdd-types.json`           | `gdd/gdd-types.json`                   |
| `gdd/basic-types.json`         | `gdd/basic-types.json`                 |

Note: the root manifest schema lives under `graphics/`, but its `$ref`s resolve
relative to the `json-schemas/` root (e.g. `lib/...`, `gdd/...`), so the other
files are fetched from the `json-schemas/` base, not the `graphics/` base.

## Closure completeness

The seven files above are the complete `$ref` closure. Every `$ref` in every
file resolves to the `$id` of one of these seven files, except references to the
draft 2020-12 meta-schema (`https://json-schema.org/draft/2020-12/schema`),
which the `ajv/dist/2020` build provides built-in. `SchemaValidator` registers
all seven via `ajv.addSchema()` and compiles the root by its `$id`; if the
closure were incomplete, `ajv` would throw "can't resolve reference" at compile
time, which is the hard check that this set is complete.

## Updating

Re-fetch from the same upstream paths, then verify the closure by running the
validator (it compiles the schema at construction time). If `ajv` reports an
unresolved reference, grep the new files for `"$ref"` and vendor any newly
referenced files here, preserving the relative `lib/` and `gdd/` layout.
