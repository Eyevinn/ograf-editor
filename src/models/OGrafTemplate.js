export class OGrafTemplate {
    constructor() {
        this.manifest = {
            $schema: "https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json",
            id: "",
            version: "1.0.0",
            name: "",
            description: "",
            author: {
                name: "OGraf Editor",
                email: ""
            },
            main: "template.mjs",
            schema: {
                type: "object",
                properties: {}
            },
            supportsRealTime: true,
            supportsNonRealTime: false
        };
        
        this.elements = [];
        this.webComponent = null;

        // Default animation settings so a freshly created template animates.
        // These are the inputs to the "Simple (quick presets)" path: picking a
        // preset + duration + easing GENERATES keyframes into the timeline below.
        // The animation itself is driven by the timeline (v_ografEditorTimeline),
        // not by these settings directly; they are retained as the preset state.
        this.animationSettings = {
            slideInPreset: 'slide',
            slideInDuration: 500,
            slideInType: 'ease-out',
            slideInDirection: 'left',
            slideOutPreset: 'slide',
            slideOutDuration: 500,
            slideOutType: 'ease-in',
            slideOutDirection: 'left'
        };

        // The authoritative animation data. Stored on the manifest under the
        // vendor key v_ografEditorTimeline (additionalProperties:false safe), and
        // the single source the generated component animates from via the Web
        // Animations API. Shape:
        //   { version:1, elements: { "<id>": { in:{delay, custom, keyframes:[]},
        //                                       out:{delay, custom, keyframes:[]} } } }
        // keyframe = { t:<ms>, props:{opacity?, tx?, ty?, scale?}, easing:'<css>' }
        // An empty keyframes array means the element does not animate for that
        // action (it snaps to its resting state). `custom` is the Simple/Advanced
        // guardrail flag: once a lane is hand-edited in Advanced it is `true`, and
        // re-applying a Simple preset to it requires explicit confirmation.
        this.manifest.v_ografEditorTimeline = { version: 1, elements: {} };
    }

    // Named easing presets the timeline UI offers, stored as the CSS easing
    // string the Web Animations API understands. cubic-bezier curve editing is
    // deferred (presets only for v1).
    static get EASING_PRESETS() {
        return ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'];
    }

    // Turn arbitrary user input into a safe OGraf id: lowercase, hyphen-separated,
    // only [a-z0-9-]. e.g. "My Lower Third" -> "my-lower-third".
    static get MANIFEST_ALLOWED_KEYS() {
        return [
            // Required.
            '$schema', 'id', 'name', 'main', 'supportsRealTime', 'supportsNonRealTime',
            // Optional.
            'version', 'description', 'author', 'schema', 'customActions',
            'actionDurations', 'stepCount', 'renderRequirements', 'thumbnails'
        ];
    }

    static slugifyId(rawId) {
        const slug = String(rawId || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '');
        return slug || 'template';
    }

    static createFromType(type, id, name, description) {
        const template = new OGrafTemplate();
        template.manifest.id = OGrafTemplate.slugifyId(id);
        template.manifest.name = name;
        template.manifest.description = description;
        
        switch (type) {
            case 'lower-third':
                template.setupLowerThird();
                break;
            case 'title':
                template.setupTitle();
                break;
            case 'bug':
                template.setupBug();
                break;
            default:
                template.setupCustom();
        }

        // Seed the timeline from the default Simple slide preset so a freshly
        // created template animates immediately, and publish honest durations.
        template.applyPresetToTimeline(true);
        template.updateActionDurations();

        return template;
    }

    setupLowerThird() {
        // Add step count and custom actions to manifest
        this.manifest.stepCount = 1;
        this.manifest.customActions = [
            {
                "id": "slideIn",
                "name": "Slide In",
                "description": "Animate the lower third sliding in from the left"
            },
            {
                "id": "slideOut", 
                "name": "Slide Out",
                "description": "Animate the lower third sliding out to the left"
            }
        ];
        
        this.manifest.schema.properties = {
            name: {
                type: "string",
                title: "Name",
                default: "John Doe"
            },
            title: {
                type: "string",
                title: "Title",
                default: "Reporter"
            }
        };

        this.elements = [
            {
                id: 'background',
                type: 'rect',
                x: 50,
                y: 450,
                width: 400,
                height: 80,
                style: {
                    backgroundColor: 'rgba(0, 120, 204, 0.9)',
                    borderRadius: '4px'
                }
            },
            {
                id: 'name',
                type: 'text',
                x: 70,
                y: 460,
                width: 360,
                height: 30,
                content: '{{name}}',
                style: {
                    fontSize: '24px',
                    fontFamily: 'Arial, sans-serif',
                    fontWeight: 'bold',
                    color: '#ffffff',
                    textAlign: 'left'
                }
            },
            {
                id: 'title',
                type: 'text',
                x: 70,
                y: 490,
                width: 360,
                height: 25,
                content: '{{title}}',
                style: {
                    fontSize: '16px',
                    fontFamily: 'Arial, sans-serif',
                    color: '#ffffff',
                    textAlign: 'left'
                }
            }
        ];
    }

    setupTitle() {
        // Add step count and custom actions to manifest
        this.manifest.stepCount = 1;
        this.manifest.customActions = [
            {
                "id": "slideIn",
                "name": "Slide In",
                "description": "Animate the title sliding in"
            },
            {
                "id": "slideOut", 
                "name": "Slide Out",
                "description": "Animate the title sliding out"
            }
        ];
        
        this.manifest.schema.properties = {
            title: {
                type: "string",
                title: "Title Text",
                default: "Breaking News"
            },
            subtitle: {
                type: "string",
                title: "Subtitle",
                default: ""
            }
        };

        this.elements = [
            {
                id: 'background',
                type: 'rect',
                x: 100,
                y: 200,
                width: 600,
                height: 120,
                style: {
                    backgroundColor: 'rgba(220, 20, 20, 0.9)',
                    borderRadius: '8px'
                }
            },
            {
                id: 'title',
                type: 'text',
                x: 120,
                y: 220,
                width: 560,
                height: 50,
                content: '{{title}}',
                style: {
                    fontSize: '36px',
                    fontFamily: 'Arial, sans-serif',
                    fontWeight: 'bold',
                    color: '#ffffff',
                    textAlign: 'center'
                }
            },
            {
                id: 'subtitle',
                type: 'text',
                x: 120,
                y: 270,
                width: 560,
                height: 30,
                content: '{{subtitle}}',
                style: {
                    fontSize: '18px',
                    fontFamily: 'Arial, sans-serif',
                    color: '#ffffff',
                    textAlign: 'center'
                }
            }
        ];
    }

    setupBug() {
        // Add step count and custom actions to manifest
        this.manifest.stepCount = 1;
        this.manifest.customActions = [
            {
                "id": "slideIn",
                "name": "Slide In",
                "description": "Animate the bug sliding in"
            },
            {
                "id": "slideOut", 
                "name": "Slide Out",
                "description": "Animate the bug sliding out"
            }
        ];
        
        this.manifest.schema.properties = {
            logo: {
                type: "string",
                title: "Logo URL",
                default: ""
            }
        };

        this.elements = [
            {
                id: 'background',
                type: 'circle',
                x: 50,
                y: 50,
                width: 80,
                height: 80,
                style: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    border: '2px solid #ffffff'
                }
            },
            {
                id: 'logo',
                type: 'image',
                x: 60,
                y: 60,
                width: 60,
                height: 60,
                content: '{{logo}}',
                style: {
                    objectFit: 'contain'
                }
            }
        ];
    }

    setupCustom() {
        // Add step count and custom actions to manifest
        this.manifest.stepCount = 1;
        this.manifest.customActions = [
            {
                "id": "slideIn",
                "name": "Slide In",
                "description": "Animate the graphic sliding in"
            },
            {
                "id": "slideOut", 
                "name": "Slide Out",
                "description": "Animate the graphic sliding out"
            }
        ];
        
        this.manifest.schema.properties = {
            text: {
                type: "string",
                title: "Text",
                default: "Custom Text"
            }
        };

        this.elements = [
            {
                id: 'text',
                type: 'text',
                x: 100,
                y: 100,
                width: 200,
                height: 50,
                content: '{{text}}',
                style: {
                    fontSize: '20px',
                    fontFamily: 'Arial, sans-serif',
                    color: '#ffffff',
                    textAlign: 'left'
                }
            }
        ];
    }

    addProperty(name, type, title, defaultValue) {
        this.manifest.schema.properties[name] = {
            type: type,
            title: title,
            default: defaultValue
        };
    }

    removeProperty(name) {
        delete this.manifest.schema.properties[name];
    }

    // Rename a schema property key while preserving the key order.
    // A naive delete + re-add would move the key to the end, which would
    // reorder the operator's data-input list on every rename. We rebuild the
    // properties object, swapping the single key in place. No-op if oldKey is
    // missing or newKey already exists (and differs from oldKey).
    renameProperty(oldKey, newKey) {
        const properties = this.manifest.schema.properties;
        if (!(oldKey in properties)) return false;
        if (oldKey === newKey) return false;
        if (newKey in properties) return false;

        const rebuilt = {};
        for (const key of Object.keys(properties)) {
            if (key === oldKey) {
                rebuilt[newKey] = properties[oldKey];
            } else {
                rebuilt[key] = properties[key];
            }
        }
        this.manifest.schema.properties = rebuilt;
        return true;
    }

    // Find elements whose content references {{key}}. The token form must match
    // the interpolation regex (\{\{(\w+)\}\}) used by the generated component,
    // so we match the exact {{key}} substring. Used for "not used" cues and
    // rename/remove reference warnings.
    findElementsReferencingProperty(key) {
        const token = `{{${key}}}`;
        return this.elements.filter(
            el => typeof el.content === 'string' && el.content.includes(token)
        );
    }

    addElement(element) {
        // Date.now() alone collides for elements added within the same
        // millisecond, producing duplicate ids that break per-element style and
        // animation lookup. Combine the timestamp with a random suffix and then
        // guarantee uniqueness against existing ids.
        const existingIds = new Set(this.elements.map(el => el.id));
        let id = `element_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        while (existingIds.has(id)) {
            id = `element_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        }
        this.elements.push({
            id,
            ...element
        });
    }

    removeElement(elementId) {
        this.elements = this.elements.filter(el => el.id !== elementId);
        // Drop any timeline lanes for the removed element so the manifest does
        // not carry animation data for an element that no longer exists.
        const timeline = this.manifest.v_ografEditorTimeline;
        if (timeline && timeline.elements && timeline.elements[elementId]) {
            delete timeline.elements[elementId];
        }
    }

    getElementById(elementId) {
        return this.elements.find(el => el.id === elementId);
    }

    // Rename an element's id atomically. The id is used as a CSS class segment
    // (`.element-<id>` in generateElementStyles), as the data-element-id keying
    // the per-element animation lane lookup at play/stop time, and as the
    // timeline-lane key in v_ografEditorTimeline.elements[<id>]. It is NOT a data
    // token, so {{...}} content (data-input keys, a separate namespace) is left
    // untouched.
    //
    // Validation here is the model-layer guard; the panel validates first for an
    // inline error, but the model is the safe boundary for any caller. Returns
    //   { ok: true, id }
    //   { ok: false, reason: 'empty' | 'invalid' | 'duplicate' | 'missing' }
    // On a no-op rename (newId equals oldId after slugify) returns ok with the
    // unchanged id. On success the timeline lane is migrated in place, the styles
    // and web component are regenerated, and the new id is returned.
    renameElementId(oldId, rawNewId) {
        const element = this.getElementById(oldId);
        if (!element) {
            return { ok: false, reason: 'missing' };
        }

        const trimmed = String(rawNewId == null ? '' : rawNewId).trim();
        if (trimmed === '') {
            return { ok: false, reason: 'empty' };
        }

        // slug-safe: lowercase letters, digits, hyphens. We require the input to
        // already be slug-safe rather than silently coercing, so "Lower Third"
        // is rejected with a clear error instead of becoming "lower-third"
        // behind the user's back. (The panel may auto-slugify before calling.)
        if (OGrafTemplate.slugifyId(trimmed) !== trimmed || !/^[a-z0-9-]+$/.test(trimmed)) {
            return { ok: false, reason: 'invalid' };
        }

        const newId = trimmed;

        // No-op: nothing to migrate, but report success so callers can treat it
        // as "committed".
        if (newId === oldId) {
            return { ok: true, id: oldId };
        }

        // Unique among the template's elements.
        if (this.elements.some(el => el.id === newId)) {
            return { ok: false, reason: 'duplicate' };
        }

        // 1. Update the element's id.
        element.id = newId;

        // 2. Migrate the timeline lane, preserving key order so the timeline
        //    track list does not reshuffle. Only moves an existing lane; a
        //    missing lane is left missing (getElementTimeline lazily creates one
        //    later if needed).
        const timeline = this.getTimeline();
        if (timeline.elements[oldId] !== undefined) {
            const rebuilt = {};
            for (const key of Object.keys(timeline.elements)) {
                if (key === oldId) {
                    rebuilt[newId] = timeline.elements[oldId];
                } else {
                    rebuilt[key] = timeline.elements[key];
                }
            }
            timeline.elements = rebuilt;
        }

        // 3. Regenerate styles + web component so `.element-<id>`,
        //    data-element-id, and the serialized timeline all reflect the new id.
        this.generateWebComponent();

        return { ok: true, id: newId };
    }

    updateElement(elementId, updates) {
        const element = this.getElementById(elementId);
        if (element) {
            Object.assign(element, updates);
        }
    }

    // ---- Timeline (v_ografEditorTimeline) ----------------------------------

    // Always return a well-formed timeline object, repairing older or partial
    // shapes (e.g. an imported template without a timeline).
    getTimeline() {
        let timeline = this.manifest.v_ografEditorTimeline;
        if (!timeline || typeof timeline !== 'object') {
            timeline = { version: 1, elements: {} };
            this.manifest.v_ografEditorTimeline = timeline;
        }
        if (!timeline.elements || typeof timeline.elements !== 'object') {
            timeline.elements = {};
        }
        if (timeline.version !== 1) {
            timeline.version = 1;
        }
        return timeline;
    }

    // Return (creating if needed) the { in, out } lanes for one element.
    getElementTimeline(elementId) {
        const timeline = this.getTimeline();
        if (!timeline.elements[elementId]) {
            timeline.elements[elementId] = {
                in: { delay: 0, custom: false, keyframes: [] },
                out: { delay: 0, custom: false, keyframes: [] }
            };
        }
        const entry = timeline.elements[elementId];
        if (!entry.in) entry.in = { delay: 0, custom: false, keyframes: [] };
        if (!entry.out) entry.out = { delay: 0, custom: false, keyframes: [] };
        return entry;
    }

    // Return a single lane ('in' | 'out') for an element.
    getLane(elementId, action) {
        const entry = this.getElementTimeline(elementId);
        return action === 'out' ? entry.out : entry.in;
    }

    // Mark a lane as hand-tuned in Advanced mode. Once custom, re-applying a
    // Simple preset to it requires explicit confirmation (handled in the UI).
    markLaneCustom(elementId, action) {
        const lane = this.getLane(elementId, action);
        lane.custom = true;
    }

    // Sort a lane's keyframes by time and guarantee a t:0 frame exists so the
    // generated WAAPI keyframes always start from a defined offset.
    normalizeLane(lane) {
        if (!Array.isArray(lane.keyframes)) lane.keyframes = [];
        lane.keyframes.sort((a, b) => a.t - b.t);
        return lane;
    }

    // Build keyframes for a Simple preset on one element + action. tx/ty are
    // offsets from the element's resting position; the off-stage distance is
    // derived from the stage size and the element's bounds so the graphic
    // travels fully on/off screen as a unit (mirrors the old slide behaviour).
    // Returns { delay, keyframes } for the lane.
    buildPresetLane(element, action, preset, durationMs, easing, direction) {
        const duration = Number.isFinite(Number(durationMs)) && Number(durationMs) >= 0
            ? Number(durationMs)
            : 500;
        const css = OGrafTemplate.EASING_PRESETS.includes(easing) ? easing : 'ease-out';

        // Off-stage offset for a slide, relative to the element's resting x/y.
        const stageW = 1920;
        const stageH = 1080;
        const x = Number(element.x) || 0;
        const y = Number(element.y) || 0;
        const w = Number(element.width) || 0;
        const h = Number(element.height) || 0;
        const offsetFor = (dir) => {
            switch (dir) {
                case 'right': return { tx: stageW - x, ty: 0 };
                case 'top': return { tx: 0, ty: -(y + h) };
                case 'bottom': return { tx: 0, ty: stageH - y };
                case 'left':
                default: return { tx: -(x + w), ty: 0 };
            }
        };

        let keyframes;
        switch (preset) {
            case 'none':
                keyframes = [];
                break;
            case 'fade':
                keyframes = action === 'out'
                    ? [
                        { t: 0, props: { opacity: 1 }, easing: css },
                        { t: duration, props: { opacity: 0 }, easing: css }
                    ]
                    : [
                        { t: 0, props: { opacity: 0 }, easing: css },
                        { t: duration, props: { opacity: 1 }, easing: css }
                    ];
                break;
            case 'pop':
                keyframes = action === 'out'
                    ? [
                        { t: 0, props: { scale: 1, opacity: 1 }, easing: css },
                        { t: duration, props: { scale: 0.6, opacity: 0 }, easing: css }
                    ]
                    : [
                        { t: 0, props: { scale: 0.6, opacity: 0 }, easing: css },
                        { t: duration, props: { scale: 1, opacity: 1 }, easing: css }
                    ];
                break;
            case 'slide':
            default: {
                const off = offsetFor(direction || 'left');
                keyframes = action === 'out'
                    ? [
                        { t: 0, props: { tx: 0, ty: 0 }, easing: css },
                        { t: duration, props: { tx: off.tx, ty: off.ty }, easing: css }
                    ]
                    : [
                        { t: 0, props: { tx: off.tx, ty: off.ty }, easing: css },
                        { t: duration, props: { tx: 0, ty: 0 }, easing: css }
                    ];
                break;
            }
        }
        return { delay: 0, keyframes };
    }

    // Apply a Simple preset across every element for both actions, generating
    // keyframes into the timeline. Respects the custom-lock guardrail: a lane
    // that has been hand-edited in Advanced (custom:true) is left untouched
    // unless force=true (the UI sets force after an explicit confirm). Returns
    // the list of element ids whose lanes were skipped because they were custom.
    applyPresetToTimeline(force = false) {
        const s = this.animationSettings || {};
        const skipped = [];
        this.elements.forEach(element => {
            const entry = this.getElementTimeline(element.id);
            const lanes = [
                {
                    key: 'in', lane: entry.in,
                    preset: s.slideInPreset || 'slide',
                    duration: s.slideInDuration, easing: s.slideInType,
                    direction: s.slideInDirection
                },
                {
                    key: 'out', lane: entry.out,
                    preset: s.slideOutPreset || 'slide',
                    duration: s.slideOutDuration, easing: s.slideOutType,
                    direction: s.slideOutDirection
                }
            ];
            lanes.forEach(({ key, lane, preset, duration, easing, direction }) => {
                if (lane.custom && !force) {
                    skipped.push(`${element.id}:${key}`);
                    return;
                }
                const built = this.buildPresetLane(element, key, preset, duration, easing, direction);
                lane.keyframes = built.keyframes;
                lane.delay = built.delay;
                // Re-applying a preset clears the custom flag (it is no longer
                // hand-tuned). When force is used after a confirm, this is the
                // intended "replace my custom keyframes" behaviour.
                lane.custom = false;
            });
        });
        return skipped;
    }

    // ---- Advanced keyframe editing (used by the Timeline panel UI) ---------
    // These are thin, testable mutations over a single lane. Each marks the
    // lane custom (it is now hand-tuned, so a Simple preset must not silently
    // overwrite it) and re-sorts by time. None of them touch actionDurations;
    // the caller runs updateActionDurations() once after a batch of edits.

    // Add a keyframe to a lane at time t (ms) capturing the given props. Returns
    // the inserted keyframe. t is clamped to >= 0; props is { opacity?, tx?, ty?,
    // scale? }; easing falls back to the lane's last frame easing or 'ease-out'.
    addKeyframe(elementId, action, t, props = {}, easing) {
        const lane = this.getLane(elementId, action);
        const time = Math.max(0, Math.round(Number(t) || 0));
        const css = OGrafTemplate.EASING_PRESETS.includes(easing)
            ? easing
            : (lane.keyframes[lane.keyframes.length - 1]?.easing || 'ease-out');
        const cleanProps = {};
        ['opacity', 'tx', 'ty', 'scale'].forEach(key => {
            if (props[key] !== undefined && props[key] !== null && props[key] !== '') {
                const num = Number(props[key]);
                if (Number.isFinite(num)) cleanProps[key] = num;
            }
        });
        const keyframe = { t: time, props: cleanProps, easing: css };
        lane.keyframes.push(keyframe);
        lane.custom = true;
        this.normalizeLane(lane);
        return keyframe;
    }

    // Remove the keyframe at index from a lane. Marks the lane custom.
    removeKeyframe(elementId, action, index) {
        const lane = this.getLane(elementId, action);
        if (index < 0 || index >= lane.keyframes.length) return false;
        lane.keyframes.splice(index, 1);
        lane.custom = true;
        return true;
    }

    // Move a keyframe in time, clamped so it cannot cross its neighbours or go
    // below 0. Returns the keyframe's new index (the lane is kept sorted), or -1
    // if the index was invalid. Marks the lane custom.
    moveKeyframe(elementId, action, index, newT) {
        const lane = this.getLane(elementId, action);
        if (index < 0 || index >= lane.keyframes.length) return -1;
        const sorted = lane.keyframes.slice().sort((a, b) => a.t - b.t);
        const orderIndex = sorted.indexOf(lane.keyframes[index]);
        const lower = orderIndex > 0 ? sorted[orderIndex - 1].t : 0;
        const upper = orderIndex < sorted.length - 1 ? sorted[orderIndex + 1].t : Infinity;
        const clamped = Math.max(lower, Math.min(upper, Math.max(0, Math.round(Number(newT) || 0))));
        const kf = lane.keyframes[index];
        kf.t = clamped;
        lane.custom = true;
        this.normalizeLane(lane);
        return lane.keyframes.indexOf(kf);
    }

    // Set the editable props/easing of one keyframe. Marks the lane custom.
    updateKeyframe(elementId, action, index, updates = {}) {
        const lane = this.getLane(elementId, action);
        if (index < 0 || index >= lane.keyframes.length) return false;
        const kf = lane.keyframes[index];
        if (!kf.props) kf.props = {};
        ['opacity', 'tx', 'ty', 'scale'].forEach(key => {
            if (key in updates) {
                const raw = updates[key];
                if (raw === '' || raw === null || raw === undefined) {
                    delete kf.props[key];
                } else {
                    const num = Number(raw);
                    if (Number.isFinite(num)) kf.props[key] = num;
                }
            }
        });
        if (updates.easing && OGrafTemplate.EASING_PRESETS.includes(updates.easing)) {
            kf.easing = updates.easing;
        }
        lane.custom = true;
        return true;
    }

    // Set a lane's start delay (ms, >= 0). Marks the lane custom.
    setLaneDelay(elementId, action, delayMs) {
        const lane = this.getLane(elementId, action);
        lane.delay = Math.max(0, Math.round(Number(delayMs) || 0));
        lane.custom = true;
        return lane.delay;
    }

    // The real length (ms) of an action across all elements: max over every
    // lane of (delay + last keyframe time). This is what feeds actionDurations
    // so the renderer schedules play/stop honestly.
    computeActionDuration(action) {
        const timeline = this.getTimeline();
        let max = 0;
        Object.values(timeline.elements).forEach(entry => {
            const lane = action === 'out' ? entry.out : entry.in;
            if (!lane || !Array.isArray(lane.keyframes) || lane.keyframes.length === 0) return;
            const last = lane.keyframes.reduce((m, kf) => Math.max(m, Number(kf.t) || 0), 0);
            const delay = Number(lane.delay) || 0;
            max = Math.max(max, delay + last);
        });
        // Clamp to a finite, non-negative integer: the OGraf schema requires
        // actionDurations[].duration to be an integer, and JSON.stringify turns
        // a non-finite value into null (an invalid manifest). Advanced keyframe
        // editing can introduce fractional or non-finite times, so guard here at
        // the model layer rather than trusting every caller.
        return Number.isFinite(max) ? Math.max(0, Math.round(max)) : 0;
    }

    // Refresh manifest.actionDurations from the current timeline. Published as
    // honest static timing metadata (ms) for playAction and stopAction so an
    // on-air renderer knows exactly how long each action takes.
    updateActionDurations() {
        this.manifest.actionDurations = [
            { type: 'playAction', duration: this.computeActionDuration('in') },
            { type: 'stopAction', duration: this.computeActionDuration('out') }
        ];
        return this.manifest.actionDurations;
    }

    // Reject CSS style values that could break out of a `key: value;` declaration
    // inside the generated `<style>` block, OR out of the JS template literal that
    // the generated component source wraps that block in. A crafted value with
    // { } < > or a double quote could close the rule or the <style> element; a
    // backtick or `${` could close the template literal in the generated .mjs and
    // inject executable code. Legitimate values (colors, px, rgba(), Arial,
    // sans-serif) contain none of these, so they pass through untouched.
    static sanitizeCssValue(value) {
        const str = String(value);
        if (/[{}<>"`]/.test(str) || str.includes('${')) {
            return '';
        }
        return str;
    }

    // A CSS property name is only safe to splice into a declaration if it is a
    // plain dashed identifier. Anything else (a key carrying braces, a backtick,
    // or `${`) is rejected so a crafted style key cannot break out of the rule or
    // the generated module's template literal the way a value could.
    static sanitizeCssKey(key) {
        const kebab = String(key)
            .replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2')
            .toLowerCase();
        return /^-?[a-z][a-z0-9-]*$/.test(kebab) ? kebab : '';
    }

    generateElementStyles() {
        // Generate CSS styles for all elements. element.id is already slugified on
        // import, and each key/value is checked so neither can escape the
        // declaration, the surrounding <style> element, or the generated module's
        // template literal. A key or value that fails validation is dropped.
        return this.elements.map(element => {
            const styles = Object.entries(element.style || {})
                .map(([key, value]) => {
                    const safeKey = OGrafTemplate.sanitizeCssKey(key);
                    if (!safeKey) return '';
                    return `${safeKey}: ${OGrafTemplate.sanitizeCssValue(value)};`;
                })
                .filter(Boolean)
                .join(' ');
            return `.element-${element.id} { ${styles} }`;
        }).join('\n');
    }

    kebabCase(str) {
        return str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
    }

    // Build a custom-element tag that is always valid, regardless of the id.
    // Rules: lowercase, only [a-z0-9-], collapse repeats, no leading digit/hyphen,
    // and it must contain a hyphen (required for custom elements).
    safeTagName() {
        let slug = String(this.manifest.id || '')
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '');
        if (!slug) {
            slug = 'graphic';
        }
        // Always prefix so the tag contains a hyphen and never starts with a digit/hyphen.
        return `ograf-${slug}`;
    }

    // Build a class identifier that is always a valid JS identifier.
    // PascalCase from the slug, prefixed so it always starts with a letter.
    safeClassName() {
        const pascal = String(this.manifest.id || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join('');
        // Prefix guarantees a leading letter even when pascal is empty or starts with a digit.
        return `OGraf${pascal}Graphic`;
    }

    generateWebComponent() {
        // Generate the element styles at template generation time
        const elementStyles = this.generateElementStyles();

        // Keep declared timing honest: recompute actionDurations from the
        // timeline before serializing, so the manifest always matches what the
        // generated component will actually run.
        this.updateActionDurations();

        // Serialize elements data and the timeline for the component. The
        // timeline (v_ografEditorTimeline) is the single source the component
        // animates from via the Web Animations API.
        const elementsData = JSON.stringify(this.elements);
        const timelineData = JSON.stringify(this.getTimeline());

        const className = this.safeClassName();

        const componentCode = `
// Escape data values before they are interpolated into shadow DOM innerHTML.
// The template author's static markup is trusted; runtime data (operator/feed
// input arriving via load()/updateAction()) is not, so it is escaped here.
// Self-contained: no imports, lives in this generated module.
function escapeHtml(value) {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

// Only allow http(s) and data:image URLs for an image src; anything else
// (e.g. javascript:) becomes a blank src, which is safer than a hostile one.
function safeSrc(value) {
    const s = escapeHtml(value);
    if (/^https?:\\/\\//i.test(value) || /^data:image\\//i.test(value)) {
        return s;
    }
    return '';
}

// A style property name is only emitted if it is a plain dashed identifier, so a
// crafted style key cannot close the style="..." attribute and inject markup.
// Values are escaped separately; the key is not in an escapable context, so it
// is validated rather than escaped.
function safeCssKey(key) {
    const kebab = String(key)
        .replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2')
        .toLowerCase();
    return /^-?[a-z][a-z0-9-]*$/.test(kebab) ? kebab : '';
}

export default class ${className} extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.data = {};
        this.isVisible = false;
        this.currentStep = 0;
        this.elements = ${elementsData};
        // Authored animation timeline. Each element has an "in" lane (played by
        // playAction) and an "out" lane (played by stopAction). A lane is
        // { delay, keyframes:[{ t, props:{opacity?,tx?,ty?,scale?}, easing }] }.
        this.timeline = ${timelineData};
        this.elementStyles = \`${elementStyles}\`;
        // Live Animation objects currently running, so a new action can cancel
        // the previous one cleanly instead of fighting it.
        this.runningAnimations = [];
    }

    // OGraf lifecycle: load applies the initial data and renders the graphic.
    async load(params = {}) {
        const { data } = params;
        if (data) {
            this.data = { ...this.data, ...data };
        }
        this.isVisible = false;
        this.render();
        // Apply the in-animation's start state immediately so a loaded-but-not-
        // played graphic shows its pre-animation state (e.g. opacity 0) instead
        // of its visible resting state. Elements with no in-lane stay at rest.
        this.applyInitialState('in');
        return { statusCode: 200 };
    }

    async dispose(params = {}) {
        this.isVisible = false;
        this.currentStep = 0;
        this.shadowRoot.innerHTML = '';
        return { statusCode: 200 };
    }

    async playAction(params = {}) {
        const { skipAnimation } = params;
        this.isVisible = true;
        this.currentStep = 1;
        this.render();

        // Apply the in-animation's initial keyframe state to every element's
        // inline style NOW, synchronously, before the browser paints and before
        // the rAF below. Otherwise the resting (visible) frame paints first and a
        // fade-in/slide-in element flashes visible before the WAAPI animation
        // hides it, and stays visible during a lane delay.
        this.applyInitialState('in');

        // Wait one frame so the rendered elements are laid out before the Web
        // Animations API reads/animates them.
        await new Promise(resolve => requestAnimationFrame(resolve));
        // Run the authored "in" timeline and resolve ONLY when it finishes (or
        // immediately, snapped to the end, when skipAnimation is true).
        await this.runActionAnimation('in', skipAnimation);

        return { statusCode: 200, currentStep: this.currentStep };
    }

    async stopAction(params = {}) {
        const { skipAnimation } = params;

        // Run the authored "out" timeline to completion before clearing, unless
        // skipAnimation snaps it to the end state instantly.
        await this.runActionAnimation('out', skipAnimation);

        this.isVisible = false;
        this.currentStep = 0;

        // Completely clear the shadow DOM - back to empty state
        this.shadowRoot.innerHTML = '';
        return { statusCode: 200 };
    }

    async updateAction(params = {}) {
        const { data } = params;
        if (data) {
            this.data = { ...this.data, ...data };
        }
        this.render();
        return { statusCode: 200 };
    }

    async customAction(params = {}) {
        const { id, skipAnimation } = params;
        switch (id) {
            case 'slideIn':
                await this.runActionAnimation('in', skipAnimation);
                return { statusCode: 200 };
            case 'slideOut':
                await this.runActionAnimation('out', skipAnimation);
                return { statusCode: 200 };
            default:
                return { statusCode: 200 };
        }
    }

    // Translate one authored keyframe's props into a Web Animations API keyframe
    // for the given offset (0..1). tx/ty are offsets in px from the element's
    // resting position; scale is a multiplier; opacity is 0..1.
    timelineKeyframeToWAAPI(kf, offset) {
        const props = (kf && kf.props) || {};
        const tx = Number(props.tx) || 0;
        const ty = Number(props.ty) || 0;
        const hasScale = props.scale !== undefined && props.scale !== null;
        const scale = hasScale ? Number(props.scale) : 1;
        const out = {
            offset,
            transform: \`translate(\${tx}px, \${ty}px) scale(\${scale})\`
        };
        if (props.opacity !== undefined && props.opacity !== null) {
            out.opacity = Number(props.opacity);
        }
        // Per-keyframe easing applies from this keyframe to the next.
        if (kf && typeof kf.easing === 'string' && kf.easing) {
            out.easing = kf.easing;
        }
        return out;
    }

    // Build the WAAPI keyframe list + timing for one element lane. Each element
    // animates over its own span (its last keyframe time), offset by its delay;
    // there is no shared-clock scaling across elements. Returns null when the
    // lane is empty (element does not animate; it stays at its resting state).
    buildLaneEffect(lane) {
        if (!lane || !Array.isArray(lane.keyframes) || lane.keyframes.length === 0) {
            return null;
        }
        const sorted = lane.keyframes.slice().sort((a, b) => (a.t || 0) - (b.t || 0));
        const delay = Number(lane.delay) || 0;
        const last = sorted.reduce((m, kf) => Math.max(m, Number(kf.t) || 0), 0);
        // Map offsets over the full [0..last] span. The element animates over its
        // own length (last keyframe time), offset by its delay; there is no
        // shared-clock scaling across elements.
        const span = last > 0 ? last : 1;
        const keyframes = sorted.map(kf => this.timelineKeyframeToWAAPI(kf, (Number(kf.t) || 0) / span));
        // Guarantee an explicit offset:0 frame holding the earliest authored
        // value. Without it, when the first authored keyframe is at t>0 (or there
        // is only one keyframe), WAAPI synthesizes the 0-offset from the
        // element's underlying/computed style and the authored first value is
        // ignored. Cloning the earliest frame at offset 0 honors the gap before
        // it as a lead-in hold, so the element holds its first authored state
        // from the start of the (delay-offset) span.
        if (keyframes.length === 0 || keyframes[0].offset !== 0) {
            keyframes.unshift({ ...keyframes[0], offset: 0 });
        }
        return { keyframes, timing: { duration: span, delay, fill: 'both', easing: 'linear' } };
    }

    // Apply each element's pre-animation state for an action ('in' | 'out')
    // directly to its inline style, synchronously and BEFORE any paint/rAF. This
    // is what stops an element that should start hidden (e.g. a fade-in with
    // opacity 0 at t:0, or a slide-in translated off-stage) from flashing at its
    // visible resting state on the first painted frame and during any lane delay.
    // For each .element node with a lane for this action we read the lane's
    // offset:0 WAAPI keyframe (buildLaneEffect always provides one) and set
    // opacity/transform from it. Elements with no lane for this action are left
    // at their resting state (no inline override). After the WAAPI animation
    // runs, fill:'both' holds the final (visible) state, so the resting style is
    // correct again at the end.
    applyInitialState(action) {
        const timeline = this.timeline || { elements: {} };
        const nodes = this.shadowRoot.querySelectorAll('.element');
        if (!nodes || nodes.length === 0) return;
        nodes.forEach(node => {
            const id = node.getAttribute('data-element-id');
            const entry = id && timeline.elements ? timeline.elements[id] : null;
            const lane = entry ? (action === 'out' ? entry.out : entry.in) : null;
            const effect = this.buildLaneEffect(lane);
            if (!effect || !effect.keyframes || effect.keyframes.length === 0) {
                // No lane: leave the element at its resting state.
                return;
            }
            const first = effect.keyframes[0];
            if (first.opacity !== undefined && first.opacity !== null) {
                node.style.opacity = String(first.opacity);
            }
            if (first.transform) {
                node.style.transform = first.transform;
            }
        });
    }

    // Run an action's authored timeline ('in' | 'out') across every element via
    // the Web Animations API. Resolves only when every element's
    // animation.finished resolves. When skipAnimation is true it starts each
    // animation then immediately finish()es it, snapping to the end state and
    // still resolving (the OGraf skipAnimation contract).
    async runActionAnimation(action, skipAnimation) {
        // Cancel any in-flight animations from a previous action.
        this.runningAnimations.forEach(a => { try { a.cancel(); } catch (e) { /* ignore */ } });
        this.runningAnimations = [];

        const timeline = this.timeline || { elements: {} };
        const nodes = this.shadowRoot.querySelectorAll('.element');
        if (!nodes || nodes.length === 0) {
            return;
        }
        if (typeof Element.prototype.animate !== 'function') {
            // No WAAPI available: nothing to animate, resting state is correct.
            return;
        }

        const animations = [];
        nodes.forEach(node => {
            const id = node.getAttribute('data-element-id');
            const entry = id && timeline.elements ? timeline.elements[id] : null;
            const lane = entry ? (action === 'out' ? entry.out : entry.in) : null;
            const effect = this.buildLaneEffect(lane);
            if (!effect) return;
            const anim = node.animate(effect.keyframes, effect.timing);
            animations.push(anim);
        });

        if (animations.length === 0) {
            return;
        }
        this.runningAnimations = animations;

        if (skipAnimation) {
            // Snap instantly to the end state, then resolve.
            animations.forEach(a => { try { a.finish(); } catch (e) { /* ignore */ } });
            this.runningAnimations = [];
            return;
        }

        // Resolve only when every animation has finished (the spec contract:
        // the action promise tracks animation.finished, never a setTimeout).
        try {
            await Promise.all(animations.map(a => a.finished));
        } catch (e) {
            // A cancel() rejects .finished; treat a superseded action as done.
        }
        this.runningAnimations = [];
    }

    render() {
        const style = \`
            <style>
                :host {
                    display: block;
                    position: relative;
                    width: 1920px;
                    height: 1080px;
                    font-family: Arial, sans-serif;
                    overflow: hidden;
                }
                .element {
                    position: absolute;
                }
                \${this.elementStyles}
            </style>
        \`;

        const elements = this.elements.map(element => this.renderElement(element)).join('');

        this.shadowRoot.innerHTML = \`
            \${style}
            <div class="container">
                \${elements}
            </div>
        \`;
    }

    renderElement(element) {
        const baseStyles = \`left: \${element.x}px; top: \${element.y}px; width: \${element.width}px; height: \${element.height}px;\`;
        
        // Convert element.style object to CSS string. Validate each key (drop it
        // unless it is a plain dashed identifier) and escape each value for the
        // double-quoted style="..." attribute context, so an imported style key
        // or value cannot close the attribute and inject markup.
        // element.x/y/width/height are numbers set by the editor, so baseStyles
        // needs no escaping.
        const additionalStyles = element.style ? Object.entries(element.style)
            .map(([key, value]) => {
                const safeKey = safeCssKey(key);
                return safeKey ? \`\${safeKey}: \${escapeHtml(value)};\` : '';
            })
            .filter(Boolean)
            .join(' ') : '';
        
        const allStyles = baseStyles + ' ' + additionalStyles;

        // data-element-id keys the per-element animation lane lookup at play/stop
        // time. element.id is slugified ([a-z0-9-]) so it is attribute-safe.
        const idAttr = \`data-element-id="\${element.id}"\`;

        switch (element.type) {
            case 'text': {
                // Text context: escape the resolved data value.
                const content = this.interpolateContent(element.content || '');
                return \`<div class="element element-\${element.id}" \${idAttr} style="\${allStyles}">\${content}</div>\`;
            }
            case 'image': {
                // src context: only allow http(s)/data:image URLs, else blank src.
                const src = this.interpolateContent(element.content || '', 'src');
                return \`<img class="element element-\${element.id}" \${idAttr} src="\${src}" style="\${allStyles}" />\`;
            }
            case 'rect':
            case 'rectangle':
                return \`<div class="element element-\${element.id}" \${idAttr} style="\${allStyles}"></div>\`;
            case 'circle':
                const circleStyles = allStyles + ' border-radius: 50%;';
                return \`<div class="element element-\${element.id}" \${idAttr} style="\${circleStyles}"></div>\`;
            default:
                return '';
        }
    }

    interpolateContent(content, context = 'text') {
        const result = content.replace(/\\{\\{(\\w+)\\}\\}/g, (match, key) => {
            // Keep the presence check so empty-string/0 still render, and an
            // unresolved placeholder is left untouched (then escaped).
            const value = key in this.data ? this.data[key] : match;
            return context === 'src' ? safeSrc(value) : escapeHtml(value);
        });
        return result;
    }

    kebabCase(str) {
        return str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
    }
}
`;

        this.webComponent = componentCode.trim();
        return this.webComponent;
    }

    toCamelCase(str) {
        return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase())
                 .replace(/^[a-z]/, (g) => g.toUpperCase());
    }

    // Build a portable, spec-clean OGraf v1 manifest object: only the top-level
    // fields the schema allows (additionalProperties:false), plus any v_-prefixed
    // vendor extensions. The editor's internal fields (elements, webComponent) and
    // export-wrapper fields must never leak into the manifest written to disk.
    // Allowed keys verified 2026-06-09 against the OGraf v1 graphics JSON schema
    // (source: https://raw.githubusercontent.com/ebu/ograf/main/v1/specification/json-schemas/graphics/schema.json).
    buildManifest() {
        const clean = {};
        for (const key of OGrafTemplate.MANIFEST_ALLOWED_KEYS) {
            if (this.manifest[key] !== undefined) {
                clean[key] = this.manifest[key];
            }
        }
        // Pass through vendor extensions (patternProperties ^v_.*).
        for (const [key, value] of Object.entries(this.manifest)) {
            if (key.startsWith('v_') && value !== undefined) {
                clean[key] = value;
            }
        }
        // Persist the authored editor elements (and timeline, if any) under
        // v_-prefixed vendor keys. The OGraf v1 schema allows any ^v_.* property
        // (patternProperties) even under additionalProperties:false, so this stays
        // spec-valid. Without this, a manifest/bundle round-trip rebuilds elements
        // from the schema with default positions, discarding authored
        // x/y/width/height/style/content and any rect/circle/image elements.
        if (Array.isArray(this.elements) && this.elements.length > 0) {
            clean.v_ografEditorElements = this.elements;
        }
        if (this.timeline !== undefined && this.timeline !== null) {
            clean.v_ografEditorTimeline = this.timeline;
        }
        return clean;
    }

    toJSON() {
        return {
            manifest: this.manifest,
            elements: this.elements,
            webComponent: this.webComponent,
            // Persist animation settings so the operator's slide direction,
            // duration, and easing survive a reload. Without this they round-trip
            // to nothing and reset to the constructor defaults on every load.
            animationSettings: this.animationSettings
        };
    }

    static fromJSON(json) {
        const template = new OGrafTemplate();
        template.manifest = json.manifest;
        // Restore persisted animation settings, merged over the constructor
        // defaults so a partial or older saved object keeps valid values for any
        // field it omits.
        if (json.animationSettings) {
            template.animationSettings = {
                ...template.animationSettings,
                ...json.animationSettings
            };
        }
        // Sanitize each element id before assignment: it is interpolated into an
        // `element-<id>` class attribute and the generateElementStyles `<style>`
        // block, so a crafted id from an imported file (e.g. `" onmouseover=...`)
        // could otherwise break out of that context.
        template.elements = Array.isArray(json.elements)
            ? json.elements.map(element => ({
                ...element,
                id: OGrafTemplate.slugifyId(element.id)
            }))
            : json.elements;
        template.webComponent = json.webComponent;

        // Repair / migrate the timeline. A template saved before the timeline
        // existed (or an imported bare manifest) has no v_ografEditorTimeline;
        // seed it from the persisted animationSettings preset so its existing
        // slide animation survives. getTimeline() also normalizes the shape.
        template.getTimeline();
        const hasAnyLane = Object.keys(template.manifest.v_ografEditorTimeline.elements).length > 0;
        if (!hasAnyLane && Array.isArray(template.elements) && template.elements.length > 0) {
            template.applyPresetToTimeline(true);
        }
        template.updateActionDurations();
        return template;
    }
}