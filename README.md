# OGraf Template Editor

A web-based graphics template editor for broadcast, built on the EBU OGraf standard. Author professional broadcast graphics, lower thirds, titles, bugs, and custom overlays, without writing code.

Try it on [Eyevinn Open Source Cloud](https://app.osaas.io/browse/eyevinn-ograf-editor).

![OGraf Template Editor Screenshot](screenshot.png)

## Features

- Visual editor: drag-and-drop text, images, rectangles, and circles on a 1920x1080 canvas, with a property panel for position, size, and style.
- Keyframe timeline: per-element in and out animation lanes driven by the Web Animations API, with quick presets (fade, slide, pop) for non-developers and full keyframe editing (opacity, offset, scale, easing, delay) for fine control.
- Code editor: Monaco-based editing of the OGraf manifest and the generated web component, with live validation.
- Preview: play, stop, and update the graphic with sample data exactly as a renderer would.
- Export and import: download a portable `.ograf.zip` bundle (manifest plus component) or the raw spec files, and re-import a bundle, manifest, or separate files.

## Getting started

Requires Node.js 16 or later and a modern browser (Chrome, Firefox, Safari, or Edge).

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

New here? Follow [GETTING_STARTED.md](GETTING_STARTED.md), a hands-on, build-along guide that walks you through creating, animating, previewing, live-data binding, and exporting your first template.

## Usage

1. Create a template and choose a type: Lower Third, Title, Bug, or Custom.
2. Add and arrange elements in the visual editor, and bind dynamic values with `{{tokens}}` in the data inputs.
3. Animate elements with the timeline presets, or open the timeline panel for keyframe-level control.
4. Preview with sample data, then export the template as an `.ograf.zip` bundle.

## OGraf compliance

The editor generates templates that conform to the [EBU OGraf v1 specification](https://ograf.ebu.io/v1/specification/docs/Specification.html).

- Manifest: a spec-clean `<id>.ograf.json` with the required fields (`$schema`, `id`, `name`, `main`, `supportsRealTime`/`supportsNonRealTime`) and honest `actionDurations`. Editor-only authoring data is stored under `v_` vendor keys, so the manifest stays `additionalProperties: false` valid.
- Component: an ES module exporting a custom element with the OGraf lifecycle methods (`load`, `dispose`, `playAction`, `stopAction`, `updateAction`, `customAction`), each taking a params object and returning a status. Animations resolve when they actually finish and honor `skipAnimation`.
- Runtime data is escaped before rendering, and image sources are restricted to `http(s)` and `data:image` URLs.

## Verifying an export

Before trusting a template on air, verify the export independently. Validate against the Graphics part of the spec (stable), not the Control/Server API (still draft).

1. Schema validation. The manifest carries a `$schema` reference, so it validates machine-side:

   ```bash
   npx ajv-cli validate \
     -s https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json \
     -d "my-graphic.ograf.json" --spec=draft2020
   ```

   Editors with JSON-schema support (such as VS Code) also pick up the `$schema` reference for inline validation.

2. Reference checker. SuperFlyTV's [ograf-devtool](https://ograf-devtool.superfly.tv) loads a graphic from local disk, flags common compliance mistakes, and exercises play, stop, update, and custom actions.

3. Real renderer. Import the export into an independent renderer such as [SPX Graphics](https://www.spx.graphics/) and confirm it plays out.

## Development

```bash
npm run dev      # Start the dev server
npm run build    # Production build
npm run preview  # Preview the production build
npm run lint     # ESLint
npm test         # Run the test suite
```

```
src/
  components/   VisualEditor, PropertyPanel, PreviewEngine, CodeEditor, TimelinePanel
  models/       OGrafTemplate (template structure, manifest, generated component)
  services/     TemplateManager, ExportImportService
  utils/        zip (bundle export/import)
  styles/       CSS
  main.js       Application entry point
```

## Contributing

Fork the repository, create a feature branch, and open a pull request. Keep `npm run lint` and `npm run build` green and add tests for behavior changes.

## License

MIT. See [LICENSE](LICENSE).

## Resources

- [EBU OGraf specification](https://ograf.ebu.io/)
- [OGraf on GitHub](https://github.com/ebu/ograf)
- [EBU Technology & Innovation](https://tech.ebu.ch/)
