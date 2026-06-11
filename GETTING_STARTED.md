# Getting started with OGraf Template Editor

A follow-along guide. By the end you will have built a real broadcast lower third, animated it, previewed it, wired it to a live data feed, turned it into a multi-step reveal, and exported it as a spec-compliant OGraf bundle.

No prior OGraf knowledge needed. Work through it top to bottom, it builds on itself. Each step takes a few seconds.

---

## What this tool is

The OGraf Template Editor is a web-based editor for building broadcast graphics templates (lower thirds, title cards, station bugs, full-screen graphics) on the [EBU OGraf](https://ograf.ebu.io/) standard. You design visually, the editor generates a portable, spec-valid template (a manifest plus a web-component) that you can export and run in a playout system.

There is no account, no backend. Your templates live in your browser (localStorage) until you export them.

## Open the editor

If you are running it locally:

```bash
npm install
npm run dev
```

Then open the printed URL (usually http://localhost:3000/). Use a recent Chrome, Edge, or Firefox (the preview uses Custom Elements and Shadow DOM).

## The layout at a glance

- **Header** (top): New Template, Import, Export.
- **Left sidebar**: your **Templates** list (top) and the **Properties** panel (below). The Properties panel changes depending on what is selected.
- **Center tabs**: **Visual Editor**, **Code Editor**, **Preview**. Switch with the tabs or press `1`, `2`, `3`.
- **Bottom**: a collapsible **Timeline** panel for fine animation control.

---

## Step 1: Create your first template

1. Click **New Template**.
2. Fill in the form:
   - **Template ID**: `my-lower-third` (this becomes the file id, it is lowercased and hyphenated automatically when you create it, so typing `My Lower Third` is fine too).
   - **Name**: `My Lower Third`
   - **Description**: `Name and title bar`
   - **Template Type**: **Lower Third**
3. Click **Create**.

Your template appears in the Templates list and is selected. The "Lower Third" type comes pre-built with two text elements (a name and a title) and matching data inputs, so you have something to work with immediately.

> The other types are **Title Card**, **Station Bug**, and **Custom** (a blank canvas). Try them later.

---

## Step 2: Move around the Visual Editor

Make sure you are on the **Visual Editor** tab (press `1`).

The white frame in the center is the **1920x1080 broadcast canvas**, your work area. The gray around it is just viewport.

Try these:

- **Zoom**: hold `Ctrl`/`Cmd` and scroll. **Pan**: scroll without a modifier.
- Lost in the zoom? Use the three buttons at the top-right of the canvas toolbar:
  - **Fit to elements**, frames everything you have placed.
  - **Fit whole canvas**, frames the full 1920x1080 frame.
  - **Reset zoom**, back to 100%.
- Add elements with the toolbar buttons on the left: **Text** (T), **Image**, **Rectangle**, **Circle**.

### Select, move, resize, delete

1. Click the blue bar (the lower-third background). It gets a blue outline with **corner handles**.
2. Drag it to move. Drag a corner handle to resize. The **X / Y / Width / Height** fields in Properties update live as you drag.
3. To remove an element: click the **trash icon** in the Element Properties header, or press `Delete`. Press `Escape` to deselect.

---

## Step 3: Data inputs and tokens

Data inputs are the variables an operator fills in when running the template live. Each one becomes a `{{token}}` you place in text.

The Lower Third type already has two: `name` and `title`. Let's look:

1. Click an empty part of the canvas to **deselect** any element. The Properties panel now shows the template-level sections.
   - Tip: when an element is selected you see element properties instead. Use the **"Template settings"** button at the top of the panel to get back to these template sections.
2. Expand **Data Inputs**. You will see `name` and `title`, each with a Key, a Label, a Type (Text / Number / Yes-No), and a default value.
3. Add one of your own: click **Add data input**, set the Key to `location`, Label to `Location`, Type to **Text**.

### Use the token

1. Select the **name** text element on the canvas.
2. In its **Content** field, you can reference any input with double braces, for example `{{name}}` or `{{location}}`.
3. Deselect again and check the Data Inputs list, the "not used yet" note disappears once an input is referenced.

Number inputs become numeric fields and Yes-No inputs become checkboxes (you will see this in the Preview).

---

## Step 4: Animate it

1. Deselect elements so you see the template sections, expand **Animation (quick presets)**.
2. Click a preset: **None**, **Fade**, **Slide**, or **Pop**. Each sets how the graphic enters and exits.
3. With **Slide** active, adjust the In/Out **Duration**, **Timing**, and **Direction** dropdowns.

For frame-accurate control, open the **Timeline** panel at the bottom: it has per-element keyframe lanes you can drag. (Re-applying a preset after hand-tuning a lane will ask before overwriting it.)

---

## Step 5: Preview like an operator

Switch to the **Preview** tab (press `3`).

1. Above the frame are the operator controls, one per data input. Notice the types: `name`/`title`/`location` are text boxes, a Number input is a compact number field, a Yes-No input is a checkbox.
2. Type a value into **name**, the text updates live in the black broadcast frame.
3. Click **Play** to run the in-animation, then **Stop** to animate out and reset.

The black frame is your 1920x1080 output, shown on a gray surround so you can see its edges.

---

## Step 6: Bind it to a live feed (optional)

The editor can auto-fill data inputs from an external feed so the on-air graphic updates by itself. There is a built-in catalog of ready-to-use, CORS-open feeds to try.

1. Back on the template sections (Preview's left panel, or the Visual Editor), expand **Live data** and tick **Enable**.
2. Use **Load an example** and pick **Cat Facts**. This sets the source type to JSON, fills the feed URL (`https://catfact.ninja/fact`), and auto-maps its `fact` field to your first text input.
   - Other examples: **Random Joke**, **Useless Facts**, **NASA Breaking News** (RSS).
3. Click **Test connection**, it validates the URL and lists the fields the feed exposes.
4. In the mapping table, map a feed field to each input you want fed (the pill flips to **Feed-driven**, and that input becomes read-only in Data Inputs since the feed now owns it).
5. Set **Refresh every (seconds)** (minimum 1). Go to **Preview** and watch the text refresh on each poll.

If a refresh fails, the last good values stay on screen.

---

## Step 7: Make it multi-step (optional)

Steps let one template reveal in stages, each step can show or hide elements and override data.

1. In the template sections, expand **Steps** and click **Add step** twice.
2. Select a step, set its **Step name**, untick an element under **Visible elements** to hide it at that step, and set a value under **Data overrides for this step** to change a value just for that step.
3. Reorder steps with the up/down arrows, delete with the x.
4. The **Prev / Next** buttons (with a "Step X of N" indicator) sit at the bottom of the **Steps** section and drive the live Preview, so open the **Preview** tab to watch as you step through. **Stop** returns to the start.

---

## Step 8: Peek at the generated code

Switch to the **Code Editor** tab (press `2`).

- **Manifest** tab: the OGraf JSON for your template. Editable, with live validation. Your `id` shows here as `my-lower-third`.
- **Component** tab: the generated `.mjs` web-component (read-only). It regenerates whenever you change elements, presets, or the timeline.

You do not need to touch code to ship a template, but it is there when you want it.

---

## Step 9: Export and re-import

1. Click **Export** (or `Ctrl`/`Cmd` + `S`). You get `my-lower-third.ograf.zip`, a spec-compliant bundle (manifest + component) ready for a playout system.
2. To prove the round-trip: create a throwaway template, then **Import** the zip you just exported. Everything (elements, data inputs, animation, live-data config, steps) comes back intact.

Your templates also persist in the browser across reloads, so you can pick up where you left off.

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `1` / `2` / `3` | Visual Editor / Code Editor / Preview |
| `Ctrl`/`Cmd` + `N` | New template |
| `Ctrl`/`Cmd` + `O` | Import |
| `Ctrl`/`Cmd` + `S` | Export current template |
| `Delete` | Delete selected element |
| `Escape` | Deselect |
| `Ctrl`/`Cmd` + scroll | Zoom canvas |

---

## Where to go next

- Build a **Title Card** or **Station Bug** from the New Template type dropdown.
- Hand-tune an animation in the bottom **Timeline** panel.
- Read the [EBU OGraf spec](https://ograf.ebu.io/) to understand what the manifest fields mean.
- Export a template and load it into your graphics playout to see it on air.

Happy building.
