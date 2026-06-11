import { escapeHtml } from '../utils/escapeHtml.js';
import { OGrafTemplate } from '../models/OGrafTemplate.js';
import { EXAMPLE_FEEDS, getExampleFeed } from '../data/exampleFeeds.js';

export class PropertyPanel {
    constructor(containerElement, visualEditor, templateManager) {
        this.container = containerElement;
        this.visualEditor = visualEditor;
        this.templateManager = templateManager;
        this.previewEngine = null;
        this.currentElement = null;
        // Stash of which data-input control should regain focus after the panel
        // re-renders via innerHTML (which destroys the old element refs).
        // Shape: { key, field } where field is 'key' | 'label' | 'type' |
        // 'default' | 'remove', or { add: true } to target the Add button.
        this.dataInputFocusTarget = null;

        this.init();
    }

    setPreviewEngine(previewEngine) {
        this.previewEngine = previewEngine;
    }

    init() {
        this.setupEventListeners();
        this.render();
    }

    setupEventListeners() {
        // Listen for element selection changes
        this.visualEditor.container.addEventListener('elementSelected', (e) => {
            this.setCurrentElement(e.detail.elementId);
        });

        this.visualEditor.container.addEventListener('elementDeselected', () => {
            this.setCurrentElement(null);
        });

        // A deleted element has no properties to show. Without this the panel
        // would keep rendering the removed element's fields (it only re-renders
        // on select/deselect otherwise), so fall back to the template view.
        this.visualEditor.container.addEventListener('elementDeleted', () => {
            this.setCurrentElement(null);
        });

        // A local image file dropped onto an image element on the canvas. The
        // editor has already selected the target element; embed the file
        // through the same path the file picker uses.
        this.visualEditor.container.addEventListener('imageFileDropped', (e) => {
            const { elementId, file } = e.detail || {};
            if (!file) return;
            if (this.currentElement !== elementId) {
                this.setCurrentElement(elementId);
            }
            this.handleImageFile(file);
        });

        // Keep the Position & Size fields live while the element is dragged or
        // resized on the canvas. updateElementPosition/Bounds fire elementUpdated
        // on every move tick, so we patch the four inputs in place instead of
        // re-rendering the whole panel (which would clobber focus and churn the
        // DOM on every pixel of a drag).
        this.visualEditor.container.addEventListener('elementUpdated', (e) => {
            this.syncElementGeometry(e.detail || {});
        });
    }

    // Live-update the X / Y / Width / Height inputs from a canvas drag or resize
    // without a full re-render. No-op unless the moved element is the one shown,
    // and we skip any field the user is currently editing so we never yank a
    // value out from under the keyboard.
    syncElementGeometry(detail) {
        const { elementId } = detail;
        if (!elementId || elementId !== this.currentElement) return;
        ['x', 'y', 'width', 'height'].forEach(prop => {
            if (detail[prop] === undefined) return;
            const input = this.container.querySelector(`[data-property="${prop}"]`);
            if (input && document.activeElement !== input) {
                input.value = detail[prop];
            }
        });
    }

    setCurrentElement(elementId) {
        this.currentElement = elementId;
        this.render();
    }

    render() {
        const propertiesContent = this.container;

        if (!this.currentElement) {
            this.renderTemplateProperties(propertiesContent);
            return;
        }

        const template = this.templateManager.getCurrentTemplate();
        if (!template) {
            this.renderEmptyState(propertiesContent);
            return;
        }

        const element = template.getElementById(this.currentElement);
        if (!element) {
            this.renderEmptyState(propertiesContent);
            return;
        }

        this.renderElementProperties(propertiesContent, element);
    }

    renderEmptyState(container) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Select an element to edit properties</p>
            </div>
        `;
    }

    renderTemplateProperties(container) {
        const template = this.templateManager.getCurrentTemplate();
        if (!template) {
            this.renderEmptyState(container);
            return;
        }

        // Get current animation settings (with defaults)
        const defaultAnimationSettings = {
            slideInDuration: 500,
            slideOutDuration: 500,
            slideInType: 'ease-out',
            slideOutType: 'ease-in',
            slideInDirection: 'left',
            slideOutDirection: 'left'
        };
        
        // Initialize animation settings if they don't exist
        if (!template.animationSettings) {
            template.animationSettings = { ...defaultAnimationSettings };
            this.templateManager.saveToStorage();
            template.generateWebComponent();
        }
        
        const animationSettings = template.animationSettings;

        container.innerHTML = `
            <div class="property-section collapsible" data-section="template">
                <button type="button" class="property-section-header" aria-expanded="true"><span class="section-caret" aria-hidden="true">&#9662;</span>Template Properties</button>
                <p class="section-description">Configure the overall template settings and metadata.</p>
                
                <div class="property-group">
                    <label>Template Name</label>
                    <input type="text" class="property-input" data-template-property="name" value="${escapeHtml(template.manifest.name)}">
                    <small class="help-text">The display name for this graphics template</small>
                </div>

                <div class="property-group">
                    <label>Description</label>
                    <textarea class="property-input" data-template-property="description" rows="2">${escapeHtml(template.manifest.description || '')}</textarea>
                    <small class="help-text">Optional description of what this template does</small>
                </div>
            </div>

            <div class="property-section collapsible" data-section="animation">
                <button type="button" class="property-section-header" aria-expanded="false"><span class="section-caret" aria-hidden="true">&#9662;</span>Animation (quick presets)</button>
                <p class="section-description">Pick how the graphic animates in and out. For fine control, use the Timeline panel at the bottom.</p>

                ${this.renderPresetChips(template, animationSettings)}

                <div class="property-group">
                    <label>Slide In Duration (ms)</label>
                    <input type="number" class="property-input" data-animation-property="slideInDuration" value="${animationSettings.slideInDuration}" min="100" max="3000" step="100">
                </div>

                <div class="property-group">
                    <label>Slide Out Duration (ms)</label>
                    <input type="number" class="property-input" data-animation-property="slideOutDuration" value="${animationSettings.slideOutDuration}" min="100" max="3000" step="100">
                </div>

                <div class="property-group">
                    <label>Slide In Timing</label>
                    <select class="property-input" data-animation-property="slideInType">
                        <option value="ease-out" ${animationSettings.slideInType === 'ease-out' ? 'selected' : ''}>Ease Out</option>
                        <option value="ease-in" ${animationSettings.slideInType === 'ease-in' ? 'selected' : ''}>Ease In</option>
                        <option value="ease-in-out" ${animationSettings.slideInType === 'ease-in-out' ? 'selected' : ''}>Ease In-Out</option>
                        <option value="linear" ${animationSettings.slideInType === 'linear' ? 'selected' : ''}>Linear</option>
                    </select>
                </div>

                <div class="property-group">
                    <label>Slide Out Timing</label>
                    <select class="property-input" data-animation-property="slideOutType">
                        <option value="ease-in" ${animationSettings.slideOutType === 'ease-in' ? 'selected' : ''}>Ease In</option>
                        <option value="ease-out" ${animationSettings.slideOutType === 'ease-out' ? 'selected' : ''}>Ease Out</option>
                        <option value="ease-in-out" ${animationSettings.slideOutType === 'ease-in-out' ? 'selected' : ''}>Ease In-Out</option>
                        <option value="linear" ${animationSettings.slideOutType === 'linear' ? 'selected' : ''}>Linear</option>
                    </select>
                </div>

                <div class="property-group">
                    <label>Slide In Direction</label>
                    <select class="property-input" data-animation-property="slideInDirection">
                        <option value="left" ${animationSettings.slideInDirection === 'left' ? 'selected' : ''}>From Left</option>
                        <option value="right" ${animationSettings.slideInDirection === 'right' ? 'selected' : ''}>From Right</option>
                        <option value="top" ${animationSettings.slideInDirection === 'top' ? 'selected' : ''}>From Top</option>
                        <option value="bottom" ${animationSettings.slideInDirection === 'bottom' ? 'selected' : ''}>From Bottom</option>
                    </select>
                </div>
                <div class="property-group">
                    <label>Slide Out Direction</label>
                    <select class="property-input" data-animation-property="slideOutDirection">
                        <option value="left" ${animationSettings.slideOutDirection === 'left' ? 'selected' : ''}>To Left</option>
                        <option value="right" ${animationSettings.slideOutDirection === 'right' ? 'selected' : ''}>To Right</option>
                        <option value="top" ${animationSettings.slideOutDirection === 'top' ? 'selected' : ''}>To Top</option>
                        <option value="bottom" ${animationSettings.slideOutDirection === 'bottom' ? 'selected' : ''}>To Bottom</option>
                    </select>
                </div>

            </div>

            ${this.renderDataInputsSection(template)}

            ${this.renderLiveDataSection(template)}

            ${this.renderStepsSection(template)}
        `;

        this.setupAnimationEventListeners();
        this.setupDataInputEventListeners();
        this.setupLiveDataEventListeners();
        this.setupStepsEventListeners();
        this.restoreDataInputFocus();
        this.setupCollapsibleSections(container);
    }

    // Preset chips for the Simple path. Selecting a chip sets the preset for
    // both the in and out lanes and regenerates the timeline keyframes through
    // the shared model API (applyPresetToTimeline), honouring the custom-lock
    // guardrail. "Slide" keeps the existing direction controls below; the other
    // presets ignore direction.
    renderPresetChips(template, animationSettings) {
        const current = animationSettings.slideInPreset || 'slide';
        const chips = [
            { value: 'none', label: 'None' },
            { value: 'fade', label: 'Fade' },
            { value: 'slide', label: 'Slide' },
            { value: 'pop', label: 'Pop' }
        ];
        const buttons = chips.map(chip => `
            <button type="button" class="preset-chip ${current === chip.value ? 'active' : ''}"
                    data-animation-preset="${chip.value}"
                    aria-pressed="${current === chip.value}">${chip.label}</button>
        `).join('');
        return `
            <div class="property-group">
                <label id="preset-chips-label">Preset</label>
                <div class="preset-chips" role="group" aria-labelledby="preset-chips-label">
                    ${buttons}
                </div>
            </div>
        `;
    }


    // Make the template-level sections collapsible so the narrow sidebar is not
    // crowded by Template Properties, Animation Settings, and Data Inputs all at
    // once. Collapsing hides the body via CSS (it stays in the DOM), so the data
    // input listeners and focus restoration keep working. State persists on the
    // instance across the panel's wholesale re-renders. Animation Settings starts
    // collapsed since it is the least frequently touched and the tallest.
    setupCollapsibleSections(container) {
        if (!this.collapsedSections) {
            this.collapsedSections = new Set(['animation', 'livedata', 'steps']);
        }
        const sections = container.querySelectorAll('.property-section.collapsible');
        sections.forEach(section => {
            const key = section.dataset.section;
            const header = section.querySelector('.property-section-header');
            const collapsed = this.collapsedSections.has(key);
            section.classList.toggle('collapsed', collapsed);
            if (header) {
                header.setAttribute('aria-expanded', String(!collapsed));
                header.addEventListener('click', () => {
                    const nowCollapsed = !this.collapsedSections.has(key);
                    if (nowCollapsed) {
                        this.collapsedSections.add(key);
                    } else {
                        this.collapsedSections.delete(key);
                    }
                    section.classList.toggle('collapsed', nowCollapsed);
                    header.setAttribute('aria-expanded', String(!nowCollapsed));
                    // If we just hid a body that held focus, move focus to the
                    // header so keyboard users do not lose their place.
                    if (nowCollapsed && section.contains(document.activeElement)) {
                        header.focus();
                    }
                });
            }
        });
    }

    // Build the "Data Inputs" section. Operators fill these in when running the
    // template; each key becomes a {{token}} placed in text element content.
    // manifest.schema.properties is a keyed object {key: {type, title, default}}
    // and key order is meaningful, so we iterate Object.keys in order.
    renderDataInputsSection(template) {
        const properties = template.manifest.schema.properties || {};
        const keys = Object.keys(properties);

        let rowsHtml;
        if (keys.length === 0) {
            rowsHtml = `
                <p class="data-input-empty">No data inputs yet. Add one so operators can change this graphic without editing code.</p>
            `;
        } else {
            rowsHtml = keys
                .map(key => this.renderDataInputRow(template, key, properties[key]))
                .join('');
        }

        return `
            <div class="property-section collapsible" data-section="datainputs">
                <button type="button" class="property-section-header" aria-expanded="true"><span class="section-caret" aria-hidden="true">&#9662;</span>Data Inputs</button>
                <div class="data-inputs-body" role="group" aria-label="Data Inputs">
                    <p class="section-description">Variables an operator fills in when running the template. Each becomes a {{token}} you place in text elements.</p>

                    <div class="data-input-list">
                        ${rowsHtml}
                    </div>

                    <button type="button" class="btn-add-data-input" data-add-data-input>Add data input</button>
                </div>
            </div>
        `;
    }

    renderDataInputRow(template, key, prop) {
        const type = prop.type || 'string';
        const title = prop.title || '';
        const defaultValue = prop.default;

        const safeKey = this.escapeHtml(key);
        const safeTitle = this.escapeHtml(title);

        // id namespace is per key + field so every label/control pair is unique.
        const idBase = `data-input-${this.escapeAttr(key)}`;

        // Is this input currently fed by the live feed? Only when live data is
        // enabled AND this key has a non-blank mapping. When fed, the
        // Default-value control becomes readonly (not disabled, so it stays
        // focusable and screen-reader reachable) with a "Fed by live data" note;
        // Key/Label/Type stay editable. Reverts when disabled or unmapped.
        const ds = template.getDataSource();
        const isFed = ds.enabled && typeof ds.mapping[key] === 'string' && ds.mapping[key] !== '';
        const fedAttrs = isFed
            ? `readonly aria-describedby="${idBase}-fed-note"`
            : '';

        // Default-value control follows the type.
        let defaultControl;
        if (type === 'number') {
            const numVal = (defaultValue === '' || defaultValue === undefined || defaultValue === null)
                ? ''
                : this.escapeAttr(String(defaultValue));
            defaultControl = `<input type="number" id="${idBase}-default" class="property-input" data-data-input-field="default" data-data-input-key="${this.escapeAttr(key)}" value="${numVal}" ${fedAttrs}>`;
        } else if (type === 'boolean') {
            const checked = defaultValue === true ? 'checked' : '';
            // A checkbox cannot be readonly; disable it when fed so it cannot be
            // toggled, but it still announces its state and the fed note.
            const boolFed = isFed ? `disabled aria-describedby="${idBase}-fed-note"` : '';
            defaultControl = `
                <label class="data-input-checkbox-label">
                    <input type="checkbox" id="${idBase}-default" data-data-input-field="default" data-data-input-key="${this.escapeAttr(key)}" ${checked} ${boolFed}>
                    <span>Yes</span>
                </label>
            `;
        } else {
            const textVal = (defaultValue === undefined || defaultValue === null)
                ? ''
                : this.escapeAttr(String(defaultValue));
            defaultControl = `<input type="text" id="${idBase}-default" class="property-input" data-data-input-field="default" data-data-input-key="${this.escapeAttr(key)}" value="${textVal}" ${fedAttrs}>`;
        }

        const fedBadge = isFed
            ? `<span class="live-data-badge" id="${idBase}-fed-note">Fed by live data</span>`
            : '';

        const referencingCount = template.findElementsReferencingProperty(key).length;
        const notUsedNote = referencingCount === 0
            ? `<p class="data-input-note">Not used in any element yet.</p>`
            : '';

        return `
            <div class="data-input-row" role="group" aria-label="Data input: ${safeKey}" data-data-input-row="${this.escapeAttr(key)}">
                <p class="data-input-helper">Use {{${safeKey}}} in a text element</p>
                <div class="property-group">
                    <label for="${idBase}-key">Key</label>
                    <input type="text" id="${idBase}-key" class="property-input data-input-key" data-data-input-field="key" data-data-input-key="${this.escapeAttr(key)}" value="${safeKey}" autocomplete="off" spellcheck="false">
                    <p class="data-input-error" data-data-input-error="${this.escapeAttr(key)}" role="alert" hidden></p>
                </div>
                <div class="property-group">
                    <label for="${idBase}-label">Label</label>
                    <input type="text" id="${idBase}-label" class="property-input" data-data-input-field="label" data-data-input-key="${this.escapeAttr(key)}" value="${safeTitle}">
                </div>
                <div class="property-group">
                    <label for="${idBase}-type">Type</label>
                    <select id="${idBase}-type" class="property-input" data-data-input-field="type" data-data-input-key="${this.escapeAttr(key)}">
                        <option value="string" ${type === 'string' ? 'selected' : ''}>Text</option>
                        <option value="number" ${type === 'number' ? 'selected' : ''}>Number</option>
                        <option value="boolean" ${type === 'boolean' ? 'selected' : ''}>Yes/No</option>
                    </select>
                </div>
                <div class="property-group">
                    <label for="${idBase}-default">Default value ${fedBadge}</label>
                    ${defaultControl}
                </div>
                <button type="button" class="btn-remove-data-input" data-remove-data-input="${this.escapeAttr(key)}" aria-label="Remove data input ${safeKey}">Remove</button>
                ${notUsedNote}
            </div>
        `;
    }

    // Build the "Live data" section. Lets a template auto-fill its data inputs
    // from an external feed (polled JSON URL / CSV URL / Google Sheet published
    // as CSV). Manual inputs still work; a mapped input is fed by the feed,
    // others stay manual. OGraf data is push-only, so this is editor-side: the
    // generated component bakes the config and polls itself. Enabling forces
    // supportsNonRealTime=false (handled in the model).
    renderLiveDataSection(template) {
        const ds = template.getDataSource();
        const enabled = !!ds.enabled;
        const intervalSec = Math.max(1, Math.round((ds.intervalMs || 5000) / 1000));

        const placeholderFor = (type) => {
            if (type === 'csv') return 'https://docs.host/data.csv';
            if (type === 'gsheet') return 'https://docs.google.com/.../pub?output=csv';
            if (type === 'rss') return 'https://www.nasa.gov/feed/';
            return 'https://catfact.ninja/fact';
        };

        // If the current type+url match a catalog entry, surface its fields so
        // the operator knows what to map. Matching by url keeps the hint visible
        // across re-renders (the data source does not store the picked example).
        const activeExample = EXAMPLE_FEEDS.find(
            feed => feed.type === ds.type && feed.url === (ds.url || '')
        );
        const exampleOptions = EXAMPLE_FEEDS.map(feed =>
            `<option value="${this.escapeAttr(feed.id)}">${this.escapeHtml(feed.label)}</option>`
        ).join('');
        const fieldsHint = activeExample
            ? `<p class="live-data-fields-hint" data-live-data-fields-hint>Fields: ${this.escapeHtml(activeExample.fields.map(f => f.name).join(', '))}</p>`
            : '';

        const body = enabled
            ? `
                <div class="property-group">
                    <label for="live-data-example">Load an example</label>
                    <select id="live-data-example" class="property-input" data-live-data-example>
                        <option value="">Choose an example feed...</option>
                        ${exampleOptions}
                    </select>
                    ${fieldsHint}
                </div>
                <div class="property-group">
                    <label for="live-data-type">Source type</label>
                    <select id="live-data-type" class="property-input" data-live-data-field="type">
                        <option value="json" ${ds.type === 'json' ? 'selected' : ''}>JSON URL</option>
                        <option value="csv" ${ds.type === 'csv' ? 'selected' : ''}>CSV URL</option>
                        <option value="gsheet" ${ds.type === 'gsheet' ? 'selected' : ''}>Google Sheet (published as CSV)</option>
                        <option value="rss" ${ds.type === 'rss' ? 'selected' : ''}>RSS / Atom feed</option>
                    </select>
                </div>
                <div class="property-group">
                    <label for="live-data-url">Feed URL</label>
                    <input type="url" id="live-data-url" class="property-input" data-live-data-field="url" value="${this.escapeAttr(ds.url || '')}" placeholder="${this.escapeAttr(placeholderFor(ds.type))}" autocomplete="off" spellcheck="false">
                </div>
                <div class="property-group">
                    <label for="live-data-interval">Refresh every (seconds)</label>
                    <input type="number" id="live-data-interval" class="property-input" data-live-data-field="interval" value="${intervalSec}" min="1" step="1">
                </div>
                <div class="property-group">
                    <button type="button" class="btn-add-data-input" data-live-data-test>Test connection</button>
                    <p class="live-data-status" data-live-data-status role="status" aria-live="polite"></p>
                </div>
                ${this.renderLiveDataMapping(template, ds)}
            `
            : `
                <p class="data-input-empty">No live data. Bind inputs to a feed to auto-fill them.</p>
            `;

        return `
            <div class="property-section collapsible" data-section="livedata">
                <button type="button" class="property-section-header" aria-expanded="false"><span class="section-caret" aria-hidden="true">&#9662;</span>Live data</button>
                <div class="live-data-body" role="group" aria-label="Live data">
                    <p class="section-description">Auto-fill data inputs from an external feed so the on-air graphic updates live. Manual inputs still work, and the last good values stay on screen if a refresh fails.</p>

                    <div class="property-group">
                        <label class="data-input-checkbox-label">
                            <input type="checkbox" data-live-data-field="enabled" ${enabled ? 'checked' : ''}>
                            <span>Enable live data</span>
                        </label>
                    </div>

                    ${body}
                </div>
            </div>
        `;
    }

    // One mapping row per existing data input, in schema order. Each row shows
    // "Label ({{key}})", a Feed field text input (placeholder depends on type),
    // and a pill: "Feed-driven" when the field is non-empty, "Manual" when blank.
    renderLiveDataMapping(template, ds) {
        const properties = template.manifest.schema.properties || {};
        const keys = Object.keys(properties);

        if (keys.length === 0) {
            return `
                <div class="live-data-mapping">
                    <p class="data-input-empty">Add a data input first, then map it to a feed field.</p>
                </div>
            `;
        }

        let fieldPlaceholder;
        if (ds.type === 'json') {
            fieldPlaceholder = 'key (e.g. headline)';
        } else if (ds.type === 'rss') {
            fieldPlaceholder = 'item field (e.g. title) or 1.title';
        } else {
            fieldPlaceholder = 'column name or number';
        }

        const rows = keys.map(key => {
            const prop = properties[key];
            const label = prop.title || key;
            const mapped = typeof ds.mapping[key] === 'string' ? ds.mapping[key] : '';
            const isFed = mapped !== '';
            const pill = isFed
                ? `<span class="live-data-pill live-data-pill-fed">Feed-driven</span>`
                : `<span class="live-data-pill live-data-pill-manual">Manual</span>`;
            const inputId = `live-data-map-${this.escapeAttr(key)}`;
            return `
                <div class="live-data-map-row" role="group" aria-label="Mapping for ${this.escapeHtml(key)}">
                    <label for="${inputId}">${this.escapeHtml(label)} ({{${this.escapeHtml(key)}}})</label>
                    <div class="live-data-map-controls">
                        <input type="text" id="${inputId}" class="property-input" data-live-data-map-key="${this.escapeAttr(key)}" value="${this.escapeAttr(mapped)}" placeholder="${this.escapeAttr(fieldPlaceholder)}" autocomplete="off" spellcheck="false">
                        ${pill}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="live-data-mapping">
                <p class="section-description">Map each data input to a feed field. Leave a field blank to keep that input manual.</p>
                ${rows}
            </div>
        `;
    }

    // Wire the Live data controls. Enable toggle, source type, URL, interval,
    // Test connection, and the per-input mapping fields. Every binding change
    // regenerates the component and reloads the preview so the graphic reflects
    // the new feed wiring immediately.
    setupLiveDataEventListeners() {
        const container = this.container;

        const fields = container.querySelectorAll('[data-live-data-field]');
        fields.forEach(input => {
            const field = input.dataset.liveDataField;
            if (field === 'enabled') {
                input.addEventListener('change', (e) => {
                    this.updateLiveData({ enabled: e.target.checked });
                    // Toggling shows/hides the whole body, so re-render the panel.
                    this.render();
                });
                return;
            }
            if (field === 'type') {
                input.addEventListener('change', (e) => {
                    this.updateLiveData({ type: e.target.value });
                    // Placeholders + mapping hints depend on type; re-render.
                    this.render();
                });
                return;
            }
            if (field === 'url') {
                input.addEventListener('input', (e) => {
                    this.updateLiveData({ url: e.target.value });
                });
                return;
            }
            if (field === 'interval') {
                input.addEventListener('change', (e) => {
                    // Clamp to the 1 second minimum rather than rejecting bad
                    // input, and reflect the clamped value back in the field so
                    // it never keeps showing 0 or a negative the editor ignored.
                    let sec = Number(e.target.value);
                    if (!Number.isFinite(sec) || sec < 1) sec = 1;
                    e.target.value = String(sec);
                    // Store the floored millisecond value (>= 1000).
                    this.updateLiveData({ intervalMs: Math.max(1000, Math.round(sec * 1000)) });
                });
            }
        });

        // Mapping fields. Commit on change/blur (not per keystroke) so a
        // half-typed field name does not thrash the preview; the Feed-driven /
        // Manual pill flips on commit via a re-render.
        const mapInputs = container.querySelectorAll('[data-live-data-map-key]');
        mapInputs.forEach(input => {
            const key = input.dataset.liveDataMapKey;
            const commit = () => {
                if (!input.isConnected) return;
                this.updateLiveDataMapping(key, input.value);
                this.render();
            };
            input.addEventListener('change', commit);
        });

        // Example feed picker. Sets type + url, auto-maps the primary field to
        // the first unmapped text input, then re-renders so the URL, fields
        // hint, and mapping pills all reflect the chosen example.
        const examplePicker = container.querySelector('[data-live-data-example]');
        if (examplePicker) {
            examplePicker.addEventListener('change', (e) => {
                const feed = getExampleFeed(e.target.value);
                if (!feed) return;
                this.applyExampleFeed(feed);
            });
        }

        // Test connection.
        const testBtn = container.querySelector('[data-live-data-test]');
        if (testBtn) {
            testBtn.addEventListener('click', () => this.testLiveDataConnection(testBtn));
        }
    }

    // Apply a catalog example: set the source type + URL, then auto-map the
    // example's primary field to the first currently-unmapped text data input
    // for instant gratification. If no suitable input exists we leave mapping
    // empty (the fields hint still tells the operator what they can map). All
    // changes go through the same update path as manual edits, then re-render.
    applyExampleFeed(feed) {
        const template = this.templateManager.getCurrentTemplate();
        if (!template) return;

        template.updateDataSource({ type: feed.type, url: feed.url });

        const properties = template.manifest.schema.properties || {};
        const ds = template.getDataSource();
        const firstUnmappedText = Object.keys(properties).find(key => {
            const prop = properties[key] || {};
            const isText = prop.type === 'string' || prop.type === undefined;
            const alreadyMapped = typeof ds.mapping[key] === 'string' && ds.mapping[key] !== '';
            return isText && !alreadyMapped;
        });
        if (firstUnmappedText) {
            template.setDataSourceMapping(firstUnmappedText, feed.primaryField);
        }

        this.templateManager.saveToStorage();
        template.generateWebComponent();
        if (this.previewEngine) {
            this.previewEngine.reloadComponent();
        }
        this.render();
    }

    updateLiveData(patch) {
        const template = this.templateManager.getCurrentTemplate();
        if (!template) return;
        template.updateDataSource(patch);
        this.templateManager.saveToStorage();
        template.generateWebComponent();
        if (this.previewEngine) {
            this.previewEngine.reloadComponent();
        }
    }

    updateLiveDataMapping(key, feedField) {
        const template = this.templateManager.getCurrentTemplate();
        if (!template) return;
        template.setDataSourceMapping(key, feedField);
        this.templateManager.saveToStorage();
        template.generateWebComponent();
        if (this.previewEngine) {
            this.previewEngine.reloadComponent();
        }
    }

    // Test the configured feed from the editor using the SAME fetch+parse+map
    // logic the generated component runs, then report detected fields/columns to
    // help mapping. On failure show a calm, plain message that names CORS and
    // reassures the operator that last-good data keeps showing on air.
    async testLiveDataConnection(button) {
        const template = this.templateManager.getCurrentTemplate();
        if (!template) return;
        const ds = template.getDataSource();
        const statusEl = this.container.querySelector('[data-live-data-status]');
        const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };

        if (!ds.url) {
            setStatus('Enter a feed URL first.');
            return;
        }

        button.setAttribute('aria-busy', 'true');
        button.disabled = true;
        setStatus('Testing connection...');

        try {
            const res = await fetch(ds.url);
            if (!res.ok) {
                setStatus(`The feed responded with HTTP ${res.status}. The last good data stays on air.`);
                return;
            }
            const text = await res.text();
            let fields;
            if (ds.type === 'json') {
                const parsed = JSON.parse(text);
                fields = (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
                    ? Object.keys(parsed)
                    : [];
            } else if (ds.type === 'rss') {
                fields = this.parseRssFields(text);
            } else {
                fields = this.parseCsvHeaders(text);
            }
            const now = new Date().toLocaleTimeString();
            const noun = ds.type === 'csv' || ds.type === 'gsheet' ? 'columns' : 'fields';
            const detected = fields.length
                ? ` Detected ${noun}: ${fields.slice(0, 20).join(', ')}.`
                : ' No fields detected; check the feed format.';
            setStatus(`Connected. Updated ${now}.${detected}`);
        } catch (error) {
            // A fetch TypeError is the usual CORS/network signature. Keep it calm
            // and actionable, and always reassure about last-good data.
            setStatus(
                'Could not reach the feed. If the URL is correct, the URL must allow cross-origin requests (CORS); ' +
                'host it somewhere that sends CORS headers, or use a feed that already does. ' +
                'The last good data stays on air.'
            );
        } finally {
            button.removeAttribute('aria-busy');
            button.disabled = false;
        }
    }

    // Minimal CSV header read for the Test-connection preview: first line, split
    // on commas, honoring simple double-quoted fields. The generated component
    // owns the full parser; this is only for showing column names to map.
    parseCsvHeaders(text) {
        const firstLine = String(text).split(/\r?\n/)[0] || '';
        const headers = [];
        let field = '';
        let inQuotes = false;
        for (let i = 0; i < firstLine.length; i++) {
            const c = firstLine[i];
            if (inQuotes) {
                if (c === '"') {
                    if (firstLine[i + 1] === '"') { field += '"'; i++; }
                    else inQuotes = false;
                } else field += c;
            } else if (c === '"') {
                inQuotes = true;
            } else if (c === ',') {
                headers.push(field); field = '';
            } else field += c;
        }
        headers.push(field);
        return headers.filter(h => h !== '');
    }

    // Read the field names of the first item/entry of an RSS or Atom feed for the
    // Test-connection preview, so the operator sees what they can map (title,
    // description, link, pubDate, ...). The generated component owns the full
    // parser; this only surfaces names. Returns [] on a malformed/empty feed.
    parseRssFields(text) {
        if (typeof DOMParser !== 'function') return [];
        let doc;
        try {
            doc = new DOMParser().parseFromString(String(text), 'application/xml');
        } catch (e) {
            return [];
        }
        if (!doc || doc.getElementsByTagName('parsererror').length > 0) return [];
        let nodes = doc.getElementsByTagName('item');
        if (nodes.length === 0) nodes = doc.getElementsByTagName('entry');
        if (nodes.length === 0) return [];
        const children = nodes[0].children || [];
        const names = [];
        for (let i = 0; i < children.length; i++) {
            const name = children[i].localName;
            if (name && !names.includes(name)) names.push(name);
        }
        return names;
    }

    renderElementProperties(container, element) {
        container.innerHTML = `
            <div class="property-section">
                <button type="button" class="back-to-template" data-back-to-template>
                    <span aria-hidden="true">&larr;</span> Template settings
                </button>
                <div class="element-properties-header">
                    <h4>Element Properties</h4>
                    <button type="button" class="btn-delete-element" data-delete-element title="Delete element" aria-label="Delete element">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M3 6h18" />
                            <path d="M8 6V4h8v2" />
                            <path d="M6 6l1 14h10l1-14" />
                        </svg>
                    </button>
                </div>

                <div class="property-group">
                    <label for="element-id-input">Element ID</label>
                    <input type="text" id="element-id-input" class="property-input element-id-input" data-element-id-input value="${escapeHtml(element.id)}" autocomplete="off" spellcheck="false" aria-describedby="element-id-help">
                    <p class="data-input-error" data-element-id-error role="alert" hidden></p>
                    <small id="element-id-help" class="help-text">Lowercase letters, numbers and hyphens. Must be unique. Used for styling and animation.</small>
                </div>

                <div class="property-group">
                    <label>Type</label>
                    <select class="property-input" data-property="type">
                        <option value="text" ${element.type === 'text' ? 'selected' : ''}>Text</option>
                        <option value="image" ${element.type === 'image' ? 'selected' : ''}>Image</option>
                        <option value="rect" ${element.type === 'rect' ? 'selected' : ''}>Rectangle</option>
                        <option value="circle" ${element.type === 'circle' ? 'selected' : ''}>Circle</option>
                    </select>
                </div>

                <div class="property-group">
                    <label>Position & Size</label>
                    <div class="input-row">
                        <div class="input-col">
                            <label class="input-label">X</label>
                            <input type="number" class="property-input" data-property="x" value="${element.x}">
                        </div>
                        <div class="input-col">
                            <label class="input-label">Y</label>
                            <input type="number" class="property-input" data-property="y" value="${element.y}">
                        </div>
                    </div>
                    <div class="input-row">
                        <div class="input-col">
                            <label class="input-label">Width</label>
                            <input type="number" class="property-input" data-property="width" value="${element.width}">
                        </div>
                        <div class="input-col">
                            <label class="input-label">Height</label>
                            <input type="number" class="property-input" data-property="height" value="${element.height}">
                        </div>
                    </div>
                </div>

                ${this.renderContentProperties(element)}
                ${this.renderStyleProperties(element)}
            </div>
        `;

        this.setupPropertyEventListeners(container);

        // The panel re-renders via innerHTML after a successful id rename, which
        // detaches the id input. Restore focus + selection so the keyboard user
        // keeps their place on the (now renamed) field.
        if (this.elementIdFocus) {
            this.elementIdFocus = false;
            const idInput = container.querySelector('[data-element-id-input]');
            if (idInput) {
                idInput.focus();
                if (typeof idInput.select === 'function') idInput.select();
            }
        }
    }

    setupAnimationEventListeners() {
        const container = this.container;
        
        // Animation property inputs
        const animationInputs = container.querySelectorAll('[data-animation-property]');
        animationInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                this.updateAnimationProperty(e.target.dataset.animationProperty, e.target.value);
            });
        });

        // Template property inputs
        const templateInputs = container.querySelectorAll('[data-template-property]');
        templateInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                this.updateTemplateProperty(e.target.dataset.templateProperty, e.target.value);
            });
        });

        // Preset chips: set both in/out preset and regenerate the timeline.
        const presetChips = container.querySelectorAll('[data-animation-preset]');
        presetChips.forEach(chip => {
            chip.addEventListener('click', () => {
                this.applyPreset(chip.dataset.animationPreset);
            });
        });

        // Animation preview buttons
        const slideInBtn = container.querySelector('#preview-slide-in');
        const slideOutBtn = container.querySelector('#preview-slide-out');
        
        if (slideInBtn) {
            slideInBtn.addEventListener('click', () => {
                this.previewAnimation('slideIn');
            });
        }
        
        if (slideOutBtn) {
            slideOutBtn.addEventListener('click', () => {
                this.previewAnimation('slideOut');
            });
        }
    }

    // Wire only the Data Inputs controls. Kept separate from the generic
    // animation/template listeners so neither widens to catch the other's
    // inputs (the data-input controls use their own data-* attributes).
    setupDataInputEventListeners() {
        const container = this.container;

        // Label / Type / Default value commit on change. Text + number default
        // also commit on input so the preview stays live as you type.
        const fieldInputs = container.querySelectorAll('[data-data-input-field]');
        fieldInputs.forEach(input => {
            const field = input.dataset.dataInputField;
            const key = input.dataset.dataInputKey;

            if (field === 'key') {
                // Key commits on change/blur only, never per keystroke, so a
                // half-typed name is not treated as a rename. Clear any error
                // while the user is editing.
                input.addEventListener('input', () => {
                    this.clearDataInputError(key);
                    input.removeAttribute('aria-invalid');
                });
                const commitKey = () => this.commitDataInputKey(key, input);
                input.addEventListener('change', commitKey);
                input.addEventListener('blur', commitKey);
                return;
            }

            if (field === 'default') {
                input.addEventListener('change', (e) => {
                    this.updateDataInputField(key, 'default', this.readDefaultValue(e.target));
                });
                // Live preview for free-text and number defaults.
                if (input.type === 'text' || input.type === 'number') {
                    input.addEventListener('input', (e) => {
                        this.updateDataInputField(key, 'default', this.readDefaultValue(e.target));
                    });
                }
                return;
            }

            if (field === 'label') {
                input.addEventListener('change', (e) => {
                    this.updateDataInputField(key, 'label', e.target.value);
                });
                input.addEventListener('input', (e) => {
                    this.updateDataInputField(key, 'label', e.target.value);
                });
                return;
            }

            if (field === 'type') {
                input.addEventListener('change', (e) => {
                    this.updateDataInputField(key, 'type', e.target.value);
                });
            }
        });

        // Remove buttons.
        const removeBtns = container.querySelectorAll('[data-remove-data-input]');
        removeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.removeDataInput(btn.dataset.removeDataInput);
            });
        });

        // Add button.
        const addBtn = container.querySelector('[data-add-data-input]');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.addDataInput());
        }
    }

    // Read a default-value control into a stored value. number coerces via
    // Number() (empty stays ''), boolean stores a real true/false, text stays
    // a string.
    readDefaultValue(target) {
        if (target.type === 'checkbox') {
            return target.checked;
        }
        if (target.type === 'number') {
            if (target.value === '') return '';
            const num = Number(target.value);
            return Number.isNaN(num) ? '' : num;
        }
        return target.value;
    }

    // The panel re-renders via innerHTML, so element refs die. We stash a focus
    // target before re-render and reapply it here so keyboard focus survives
    // add / remove / rename.
    restoreDataInputFocus() {
        const target = this.dataInputFocusTarget;
        this.dataInputFocusTarget = null;
        if (!target) return;

        let el = null;
        if (target.add) {
            el = this.container.querySelector('[data-add-data-input]');
        } else if (target.field === 'remove') {
            el = this.container.querySelector(`[data-remove-data-input="${CSS.escape(target.key)}"]`);
        } else {
            const idBase = `data-input-${target.key}`;
            el = this.container.querySelector(`#${CSS.escape(idBase)}-${target.field}`);
        }

        if (el) {
            el.focus();
            if (target.field === 'key' && typeof el.select === 'function') {
                el.select();
            }
        }
    }

    addDataInput() {
        const template = this.templateManager.getCurrentTemplate();
        if (!template) return;

        // First non-colliding fieldN key.
        const properties = template.manifest.schema.properties || {};
        let index = 1;
        let key = `field${index}`;
        while (key in properties) {
            index += 1;
            key = `field${index}`;
        }

        template.addProperty(key, 'string', '', '');
        this.templateManager.saveToStorage();
        template.generateWebComponent();
        if (this.previewEngine) {
            this.previewEngine.reloadComponent();
        }

        // Focus + select the new row's Key input after re-render.
        this.dataInputFocusTarget = { key, field: 'key' };
        this.render();
    }

    commitDataInputKey(oldKey, input) {
        // The Key input commits on both 'change' and 'blur'. A successful
        // rename re-renders the panel via innerHTML, detaching this input;
        // the trailing blur then fires against the stale, detached node and
        // would re-commit against gone state and focus a detached element.
        // No-op once the input is no longer in the document.
        if (input && !input.isConnected) return;

        const template = this.templateManager.getCurrentTemplate();
        if (!template) return;

        const newKey = input.value;

        // No change: nothing to do.
        if (newKey === oldKey) {
            this.clearDataInputError(oldKey);
            return;
        }

        // Pattern must match the \w interpolation regex and not start with a digit.
        const pattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
        if (!pattern.test(newKey)) {
            this.showDataInputError(oldKey, input, 'Use letters, numbers and underscore. Cannot start with a number.');
            return;
        }

        // Unique, case-sensitive.
        if (newKey in (template.manifest.schema.properties || {})) {
            this.showDataInputError(oldKey, input, 'That name is already used. Pick a different one.');
            return;
        }

        // If the old key is referenced, ask before renaming so references are
        // never silently broken.
        const referencing = template.findElementsReferencingProperty(oldKey);
        if (referencing.length > 0) {
            const update = confirm(
                `${oldKey} is used in ${referencing.length} element(s). Update those references to ${newKey} too?\n\nOK: update references. Cancel: leave them.`
            );
            if (update) {
                const oldToken = `{{${oldKey}}}`;
                const newToken = `{{${newKey}}}`;
                referencing.forEach(el => {
                    el.content = el.content.split(oldToken).join(newToken);
                });
            }
        }

        template.renameProperty(oldKey, newKey);
        this.templateManager.saveToStorage();
        template.generateWebComponent();
        this.visualEditor.render();
        if (this.previewEngine) {
            this.previewEngine.reloadComponent();
        }

        // Keep focus on the (now renamed) Key input.
        this.dataInputFocusTarget = { key: newKey, field: 'key' };
        this.render();
    }

    updateDataInputField(key, field, value) {
        const template = this.templateManager.getCurrentTemplate();
        if (!template) return;
        const prop = template.manifest.schema.properties[key];
        if (!prop) return;

        if (field === 'label') {
            prop.title = value;
        } else if (field === 'default') {
            prop.default = value;
        } else if (field === 'type') {
            prop.type = value;
            // Re-coerce the stored default to the new type so we never keep a
            // value the control can no longer represent.
            if (value === 'number') {
                const num = Number(prop.default);
                prop.default = (prop.default === '' || Number.isNaN(num)) ? '' : num;
            } else if (value === 'boolean') {
                prop.default = prop.default === true;
            } else {
                prop.default = (prop.default === undefined || prop.default === null)
                    ? ''
                    : String(prop.default);
            }
        }

        this.templateManager.saveToStorage();
        template.generateWebComponent();
        this.visualEditor.render();
        if (this.previewEngine) {
            this.previewEngine.reloadComponent();
        }

        // Changing the type swaps the default-value control, so re-render and
        // keep focus on the Type select.
        if (field === 'type') {
            this.dataInputFocusTarget = { key, field: 'type' };
            this.render();
        }
    }

    removeDataInput(key) {
        const template = this.templateManager.getCurrentTemplate();
        if (!template) return;

        const referencing = template.findElementsReferencingProperty(key);
        if (referencing.length > 0) {
            const ok = confirm(
                `${key} is used in ${referencing.length} element(s). Removing it will leave {{${key}}} showing as raw text on air. Remove anyway?`
            );
            if (!ok) return;
        }

        // Work out the previous row's key so focus lands somewhere sensible.
        const keys = Object.keys(template.manifest.schema.properties || {});
        const removedIndex = keys.indexOf(key);
        const previousKey = removedIndex > 0 ? keys[removedIndex - 1] : null;

        template.removeProperty(key);
        this.templateManager.saveToStorage();
        template.generateWebComponent();
        this.visualEditor.render();
        if (this.previewEngine) {
            this.previewEngine.reloadComponent();
        }

        // Focus the previous row's Key input, or the Add button if none remain.
        this.dataInputFocusTarget = previousKey
            ? { key: previousKey, field: 'key' }
            : { add: true };
        this.render();
    }

    showDataInputError(key, input, message) {
        input.setAttribute('aria-invalid', 'true');
        const errorEl = this.container.querySelector(`[data-data-input-error="${CSS.escape(key)}"]`);
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.hidden = false;
        }
        // Keep focus on the offending input; do not write.
        input.focus();
        if (typeof input.select === 'function') {
            input.select();
        }
    }

    clearDataInputError(key) {
        const errorEl = this.container.querySelector(`[data-data-input-error="${CSS.escape(key)}"]`);
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.hidden = true;
        }
    }

    // ---- Multi-step authoring (GAP-C) -------------------------------------

    // Build the "Steps" section. With no steps the graphic is single-step and we
    // show a one-line invitation to add one. With N steps we show a reorderable
    // list, an editor for the selected step (rename, per-element visibility,
    // per-data-input overrides), and a Prev/Next navigator that drives the live
    // Preview. this.selectedStepIndex is the step being edited (panel state).
    renderStepsSection(template) {
        const steps = template.getSteps().steps;
        const n = steps.length;

        if (n === 0) {
            this.selectedStepIndex = null;
        } else if (this.selectedStepIndex == null || this.selectedStepIndex >= n) {
            this.selectedStepIndex = Math.min(this.selectedStepIndex == null ? 0 : this.selectedStepIndex, n - 1);
            if (this.selectedStepIndex < 0) this.selectedStepIndex = 0;
        }

        const list = n === 0
            ? `<p class="data-input-empty">Single-step graphic. Add a step to make it click-through (bullet builds, reveals, rundown steps).</p>`
            : steps.map((step, i) => `
                <div class="step-row ${i === this.selectedStepIndex ? 'active' : ''}" role="group" aria-label="Step ${i + 1}">
                    <button type="button" class="step-select" data-step-select="${i}" aria-pressed="${i === this.selectedStepIndex}"><span class="step-index">${i + 1}</span> ${this.escapeHtml(step.name)}</button>
                    <span class="step-row-actions">
                        <button type="button" class="step-btn" data-step-up="${i}" ${i === 0 ? 'disabled' : ''} title="Move up" aria-label="Move step ${i + 1} up">&#9650;</button>
                        <button type="button" class="step-btn" data-step-down="${i}" ${i === n - 1 ? 'disabled' : ''} title="Move down" aria-label="Move step ${i + 1} down">&#9660;</button>
                        <button type="button" class="step-btn step-btn-danger" data-step-remove="${i}" title="Remove" aria-label="Remove step ${i + 1}">&times;</button>
                    </span>
                </div>
            `).join('');

        const editor = (n > 0 && this.selectedStepIndex != null)
            ? this.renderStepEditor(template, steps[this.selectedStepIndex], this.selectedStepIndex)
            : '';

        const nav = n > 0
            ? `
                <div class="step-nav" role="group" aria-label="Preview steps">
                    <button type="button" class="btn btn-secondary step-nav-btn" data-step-nav="prev">Prev</button>
                    <span class="step-nav-indicator" data-step-nav-indicator aria-live="polite">Step ${this.selectedStepIndex + 1} of ${n}</span>
                    <button type="button" class="btn btn-secondary step-nav-btn" data-step-nav="next">Next</button>
                </div>
                <small class="help-text">Prev/Next drive the live Preview. The graphic transitions to the end after the last step.</small>
            `
            : '';

        return `
            <div class="property-section collapsible" data-section="steps">
                <button type="button" class="property-section-header" aria-expanded="false"><span class="section-caret" aria-hidden="true">&#9662;</span>Steps</button>
                <div class="steps-body" role="group" aria-label="Steps">
                    <p class="section-description">Author a multi-step graphic: each step shows or hides elements and can override data inputs. Stop returns to the start.</p>
                    <div class="property-group">
                        <button type="button" class="btn btn-secondary" data-step-add>Add step</button>
                    </div>
                    <div class="step-list">${list}</div>
                    ${editor}
                    ${nav}
                </div>
            </div>
        `;
    }

    renderStepEditor(template, step, index) {
        const elements = template.elements || [];
        const properties = template.manifest.schema.properties || {};
        const dataKeys = Object.keys(properties);

        const visRows = elements.length === 0
            ? `<p class="data-input-empty">No elements to show/hide yet.</p>`
            : elements.map(el => {
                const visible = step.visible[el.id] !== false;
                return `
                    <label class="data-input-checkbox-label step-visible-row">
                        <input type="checkbox" data-step-visible="${this.escapeAttr(el.id)}" ${visible ? 'checked' : ''}>
                        <span>${this.escapeHtml(el.id)}</span>
                    </label>
                `;
            }).join('');

        const dataRows = dataKeys.length === 0
            ? `<p class="data-input-empty">No data inputs to override.</p>`
            : dataKeys.map(key => {
                const prop = properties[key];
                const label = prop.title || key;
                const val = typeof step.data[key] === 'string' ? step.data[key] : '';
                const base = prop.default != null ? String(prop.default) : '';
                const id = `step-data-${this.escapeAttr(key)}`;
                return `
                    <div class="property-group">
                        <label for="${id}">${this.escapeHtml(label)} ({{${this.escapeHtml(key)}}})</label>
                        <input type="text" id="${id}" class="property-input" data-step-data="${this.escapeAttr(key)}" value="${this.escapeAttr(val)}" placeholder="${this.escapeAttr(base)}" autocomplete="off">
                    </div>
                `;
            }).join('');

        return `
            <div class="step-editor" role="group" aria-label="Edit step ${index + 1}">
                <div class="property-group">
                    <label for="step-rename-input">Step name</label>
                    <input type="text" id="step-rename-input" class="property-input" data-step-rename value="${this.escapeAttr(step.name)}" autocomplete="off">
                </div>
                <div class="property-group">
                    <label>Visible elements</label>
                    <div class="step-visible-list">${visRows}</div>
                    <small class="help-text">Unchecked elements are hidden at this step.</small>
                </div>
                <div class="property-group">
                    <label>Data overrides for this step</label>
                    ${dataRows}
                    <small class="help-text">Leave blank to use the base / operator value.</small>
                </div>
            </div>
        `;
    }

    // Persist + regenerate + reload after a step change, mirroring updateLiveData.
    regenerateStepsAndReload(template) {
        this.templateManager.saveToStorage();
        template.generateWebComponent();
        if (this.previewEngine) {
            this.previewEngine.reloadComponent();
        }
    }

    setupStepsEventListeners() {
        const container = this.container;
        const template = () => this.templateManager.getCurrentTemplate();

        const addBtn = container.querySelector('[data-step-add]');
        if (addBtn) addBtn.addEventListener('click', () => {
            const t = template();
            if (!t) return;
            t.addStep();
            this.selectedStepIndex = t.getSteps().steps.length - 1;
            this.regenerateStepsAndReload(t);
            this.render();
        });

        container.querySelectorAll('[data-step-select]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectedStepIndex = Number(btn.dataset.stepSelect);
                this.render();
            });
        });

        const reorder = (attr, offset) => {
            container.querySelectorAll(`[data-step-${attr}]`).forEach(btn => {
                btn.addEventListener('click', () => {
                    const t = template();
                    if (!t) return;
                    const i = Number(btn.dataset[attr === 'up' ? 'stepUp' : 'stepDown']);
                    const dest = t.moveStep(i, i + offset);
                    if (this.selectedStepIndex === i && dest >= 0) this.selectedStepIndex = dest;
                    this.regenerateStepsAndReload(t);
                    this.render();
                });
            });
        };
        reorder('up', -1);
        reorder('down', 1);

        container.querySelectorAll('[data-step-remove]').forEach(btn => {
            btn.addEventListener('click', () => {
                const t = template();
                if (!t) return;
                t.removeStep(Number(btn.dataset.stepRemove));
                this.regenerateStepsAndReload(t);
                this.render();
            });
        });

        const rename = container.querySelector('[data-step-rename]');
        if (rename) {
            rename.addEventListener('change', () => {
                if (!rename.isConnected) return;
                const t = template();
                if (!t || this.selectedStepIndex == null) return;
                t.renameStep(this.selectedStepIndex, rename.value);
                this.regenerateStepsAndReload(t);
                this.render();
            });
        }

        container.querySelectorAll('[data-step-visible]').forEach(cb => {
            cb.addEventListener('change', () => {
                const t = template();
                if (!t || this.selectedStepIndex == null) return;
                t.setStepVisibility(this.selectedStepIndex, cb.dataset.stepVisible, cb.checked);
                this.regenerateStepsAndReload(t);
            });
        });

        container.querySelectorAll('[data-step-data]').forEach(input => {
            input.addEventListener('change', () => {
                if (!input.isConnected) return;
                const t = template();
                if (!t || this.selectedStepIndex == null) return;
                t.setStepData(this.selectedStepIndex, input.dataset.stepData, input.value);
                this.regenerateStepsAndReload(t);
            });
        });

        container.querySelectorAll('[data-step-nav]').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!this.previewEngine) return;
                const dir = btn.dataset.stepNav;
                const result = await this.previewEngine.step({ delta: dir === 'prev' ? -1 : 1 });
                const indicator = container.querySelector('[data-step-nav-indicator]');
                const t = template();
                const n = t ? t.getSteps().steps.length : 0;
                if (indicator) {
                    const cs = result && typeof result.currentStep === 'number' ? result.currentStep : null;
                    indicator.textContent = cs == null ? `Ended (${n} steps)` : `Step ${cs + 1} of ${n}`;
                }
            });
        });
    }

    escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    escapeAttr(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;');
    }

    renderContentProperties(element) {
        if (element.type === 'text') {
            const safeContent = escapeHtml(element.content || '');
            return `
                <div class="property-group">
                    <label>Text Content</label>
                    <textarea class="property-input" data-property="content" rows="3">${safeContent}</textarea>
                </div>
                ${this.renderInsertDataInputControl()}
            `;
        }

        if (element.type === 'image') {
            const safeContent = escapeHtml(element.content || '');
            // Two ways to set the image: paste a URL / data URI in the text
            // field, or pick a local file which is read as a data: URI and
            // embedded so the exported template is self-contained. The hidden
            // file input is triggered by a real <button> so it stays keyboard
            // operable and carries an accessible name; the visible label is
            // associated with the URL field via id/for.
            return `
                <div class="property-group">
                    <label for="image-url-input">Image source</label>
                    <input type="url" id="image-url-input" class="property-input" data-property="content" value="${safeContent}" placeholder="Paste an image URL or data URI">
                    <small class="help-text">Paste a URL or data URI, or choose a local file to embed it in the template.</small>
                    <div class="image-file-row">
                        <button type="button" class="btn-choose-image-file" data-choose-image-file>Choose image file</button>
                        <input type="file" class="image-file-input" data-image-file-input accept="image/*" aria-label="Choose image file to embed">
                    </div>
                    <p class="image-file-note" data-image-file-note role="status"></p>
                </div>
            `;
        }
        return '';
    }

    // The canvas link: lets the designer drop a {{token}} into the selected text
    // element from the schema, without typing the braces. Append-to-end is the
    // v1 behaviour (cursor-position insertion is deferred).
    renderInsertDataInputControl() {
        const template = this.templateManager.getCurrentTemplate();
        const properties = (template && template.manifest.schema.properties) || {};
        const keys = Object.keys(properties);

        if (keys.length === 0) {
            return `
                <div class="property-group">
                    <p class="help-text">No data inputs yet. Add one in the template properties (deselect this element).</p>
                </div>
            `;
        }

        const options = keys
            .map(key => {
                const label = properties[key].title || key;
                return `<option value="${this.escapeAttr(key)}">${this.escapeHtml(label)} ({{${this.escapeHtml(key)}}})</option>`;
            })
            .join('');

        return `
            <div class="property-group">
                <label for="insert-data-input-select">Insert data input</label>
                <div class="insert-data-input-row">
                    <select id="insert-data-input-select" class="property-input" data-insert-data-input-select>
                        ${options}
                    </select>
                    <button type="button" class="btn-insert-data-input" data-insert-data-input>Insert</button>
                </div>
            </div>
        `;
    }

    renderStyleProperties(element) {
        const style = element.style || {};
        
        let styleHtml = '<div class="property-group"><label>Style Properties</label>';

        if (element.type === 'text') {
            styleHtml += `
                <div class="style-property">
                    <label class="input-label">Font Size</label>
                    <input type="text" class="property-input" data-style-property="fontSize" value="${escapeHtml(style.fontSize || '20px')}">
                </div>
                <div class="style-property">
                    <label class="input-label">Font Family</label>
                    <input type="text" class="property-input" data-style-property="fontFamily" value="${escapeHtml(style.fontFamily || 'Arial, sans-serif')}">
                </div>
                <div class="style-property">
                    <label class="input-label">Font Weight</label>
                    <select class="property-input" data-style-property="fontWeight">
                        <option value="normal" ${style.fontWeight === 'normal' ? 'selected' : ''}>Normal</option>
                        <option value="bold" ${style.fontWeight === 'bold' ? 'selected' : ''}>Bold</option>
                        <option value="lighter" ${style.fontWeight === 'lighter' ? 'selected' : ''}>Lighter</option>
                    </select>
                </div>
                <div class="style-property">
                    <label class="input-label">Text Align</label>
                    <select class="property-input" data-style-property="textAlign">
                        <option value="left" ${style.textAlign === 'left' ? 'selected' : ''}>Left</option>
                        <option value="center" ${style.textAlign === 'center' ? 'selected' : ''}>Center</option>
                        <option value="right" ${style.textAlign === 'right' ? 'selected' : ''}>Right</option>
                    </select>
                </div>
                <div class="style-property">
                    <label class="input-label">Color</label>
                    <div class="color-input-group">
                        <input type="color" class="color-picker" data-style-property="color" value="${this.colorToHex(style.color) || '#ffffff'}">
                        <input type="text" class="property-input color-text" data-style-property="color" value="${escapeHtml(style.color || '#ffffff')}">
                    </div>
                </div>
            `;
        }

        if (element.type === 'image') {
            styleHtml += `
                <div class="style-property">
                    <label class="input-label">Object Fit</label>
                    <select class="property-input" data-style-property="objectFit">
                        <option value="contain" ${style.objectFit === 'contain' ? 'selected' : ''}>Contain</option>
                        <option value="cover" ${style.objectFit === 'cover' ? 'selected' : ''}>Cover</option>
                        <option value="fill" ${style.objectFit === 'fill' ? 'selected' : ''}>Fill</option>
                        <option value="none" ${style.objectFit === 'none' ? 'selected' : ''}>None</option>
                    </select>
                </div>
            `;
        }

        // Common style properties
        styleHtml += `
            <div class="style-property">
                <label class="input-label">Background Color</label>
                <div class="color-input-group">
                    <input type="color" class="color-picker" data-style-property="backgroundColor" value="${this.colorToHex(style.backgroundColor) || '#000000'}">
                    <input type="text" class="property-input color-text" data-style-property="backgroundColor" value="${escapeHtml(style.backgroundColor || 'transparent')}">
                </div>
            </div>
            <div class="style-property">
                <label class="input-label">Border</label>
                <input type="text" class="property-input" data-style-property="border" value="${escapeHtml(style.border || 'none')}" placeholder="e.g., 2px solid #ffffff">
            </div>
            <div class="style-property">
                <label class="input-label">Border Radius</label>
                <input type="text" class="property-input" data-style-property="borderRadius" value="${escapeHtml(style.borderRadius || '0px')}" placeholder="e.g., 4px">
            </div>
            <div class="style-property">
                <label class="input-label">Opacity</label>
                <input type="range" class="property-input range-input" data-style-property="opacity" min="0" max="1" step="0.1" value="${escapeHtml(style.opacity || '1')}">
                <span class="range-value">${escapeHtml(style.opacity || '1')}</span>
            </div>
        `;

        styleHtml += '</div>';
        return styleHtml;
    }

    setupPropertyEventListeners(container) {
        // Back to template settings: deselect the element so the panel shows the
        // template-level sections (Data Inputs, Live Data, Steps). These live in
        // the same panel and are otherwise only reachable by guessing to click
        // empty canvas, so give them an explicit way back.
        const backBtn = container.querySelector('[data-back-to-template]');
        if (backBtn) {
            backBtn.addEventListener('click', () => this.visualEditor.deselectElement());
        }

        // Delete element: a visible alternative to the Delete key, which is the
        // only way to remove an element otherwise. Routes through the visual
        // editor so it shares the same removal + save + event path.
        const deleteBtn = container.querySelector('[data-delete-element]');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                this.visualEditor.selectedElement = this.currentElement;
                this.visualEditor.deleteSelectedElement();
            });
        }

        // Element ID. Editable, but commits on change/blur only, never per
        // keystroke, so a half-typed id is not treated as a rename. The id is a
        // CSS class segment and the timeline-lane key, not a data token, so a
        // rename never rewrites {{token}} content. Clear any error while editing.
        const idInput = container.querySelector('[data-element-id-input]');
        if (idInput) {
            idInput.addEventListener('input', () => {
                this.clearElementIdError(idInput);
            });
            const commitId = () => this.commitElementId(idInput);
            idInput.addEventListener('change', commitId);
            idInput.addEventListener('blur', commitId);
        }

        // Basic property inputs
        const propertyInputs = container.querySelectorAll('.property-input[data-property]');
        propertyInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                this.updateElementProperty(e.target.dataset.property, e.target.value);
            });

            input.addEventListener('change', (e) => {
                this.updateElementProperty(e.target.dataset.property, e.target.value);
            });
        });

        // Style property inputs
        const styleInputs = container.querySelectorAll('.property-input[data-style-property]');
        styleInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                this.updateElementStyleProperty(e.target.dataset.styleProperty, e.target.value);
            });

            input.addEventListener('change', (e) => {
                this.updateElementStyleProperty(e.target.dataset.styleProperty, e.target.value);
            });
        });

        // Color picker synchronization.
        //
        // The native <input type=color> swatch can only hold an opaque
        // #rrggbb. The text field is the source of truth and may hold values
        // the swatch cannot represent (rgba with alpha, 'transparent', named
        // colors). The swatch only writes its hex into the text field on an
        // EXPLICIT user interaction: the browser fires this 'input'/'change'
        // event only from real user input, never from our programmatic
        // picker.value assignment during render. That is what keeps the
        // initial render from silently overwriting an authored rgba/alpha or
        // 'transparent' value with the swatch's #000000 fallback. Writing the
        // hex on a deliberate swatch pick (which does drop alpha) is the
        // accepted convenience tradeoff.
        const colorPickers = container.querySelectorAll('.color-picker');
        colorPickers.forEach(picker => {
            const writeFromSwatch = (e) => {
                const textInput = picker.nextElementSibling;
                if (textInput && textInput.classList.contains('color-text')) {
                    textInput.value = e.target.value;
                    textInput.dispatchEvent(new Event('input'));
                }
            };
            picker.addEventListener('input', writeFromSwatch);
            picker.addEventListener('change', writeFromSwatch);
        });

        const colorTextInputs = container.querySelectorAll('.color-text');
        colorTextInputs.forEach(textInput => {
            textInput.addEventListener('input', (e) => {
                const picker = textInput.previousElementSibling;
                if (picker && picker.classList.contains('color-picker')) {
                    const hexColor = this.colorToHex(e.target.value);
                    // null means the authored value (rgba/alpha/transparent/
                    // unknown) cannot be shown in the swatch. Leave the swatch
                    // alone rather than coercing it to a wrong color; the text
                    // field remains the source of truth.
                    if (hexColor) {
                        picker.value = hexColor;
                    }
                }
            });
        });

        // Range input value display
        const rangeInputs = container.querySelectorAll('.range-input');
        rangeInputs.forEach(range => {
            const valueSpan = range.nextElementSibling;
            if (valueSpan && valueSpan.classList.contains('range-value')) {
                range.addEventListener('input', (e) => {
                    valueSpan.textContent = e.target.value;
                });
            }
        });

        // Insert data input: append {{key}} to the selected text element's
        // content through the same path the content textarea uses.
        const insertBtn = container.querySelector('[data-insert-data-input]');
        if (insertBtn) {
            insertBtn.addEventListener('click', () => {
                const select = container.querySelector('[data-insert-data-input-select]');
                if (!select || !select.value) return;
                this.insertDataInputToken(select.value);
            });
        }

        // Image file picker. The button opens the hidden file input; picking a
        // file reads it as a data: URI and commits it through the same content
        // path the URL field uses, so preview/canvas/export all update.
        const chooseImageBtn = container.querySelector('[data-choose-image-file]');
        const imageFileInput = container.querySelector('[data-image-file-input]');
        if (chooseImageBtn && imageFileInput) {
            chooseImageBtn.addEventListener('click', () => imageFileInput.click());
            imageFileInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (file) {
                    this.handleImageFile(file);
                }
                // Clear the input so picking the same file again re-fires change.
                e.target.value = '';
            });
        }
    }

    // Maximum embedded image size. data: URIs inflate the template JSON and the
    // localStorage autosave (the base64 encoding is ~33% larger than the file),
    // so we warn above this threshold but still embed; only non-image types are
    // rejected outright.
    static IMAGE_SIZE_WARN_BYTES = 2 * 1024 * 1024;

    // Read a picked image file as a data: URI and commit it as the element's
    // content. Rejects non-image types with a clear message; warns (but still
    // embeds) when the file is large enough to bloat the template/storage.
    handleImageFile(file) {
        if (!this.currentElement) return;

        // Only accept images. accept="image/*" is a hint the file dialog may
        // not enforce (and drag-drop bypasses it), so check the type here too.
        if (!file.type || !file.type.startsWith('image/')) {
            this.setImageFileNote('That file is not an image. Choose a PNG, JPG, SVG, GIF or WebP.', 'error');
            this.notifyError('That file is not an image. Choose an image file (PNG, JPG, SVG, GIF or WebP).');
            return;
        }

        const overLimit = file.size > PropertyPanel.IMAGE_SIZE_WARN_BYTES;

        const reader = new FileReader();
        reader.onerror = () => {
            this.setImageFileNote('Could not read that file. Try another image.', 'error');
            this.notifyError('Could not read that image file. Try another one.');
        };
        reader.onload = () => {
            const dataUri = reader.result;
            if (typeof dataUri !== 'string' || !dataUri.startsWith('data:image/')) {
                this.setImageFileNote('That file could not be embedded as an image.', 'error');
                this.notifyError('That file could not be embedded as an image.');
                return;
            }

            // Commit through the same content path the URL field uses, so the
            // canvas, preview and export all pick it up.
            this.visualEditor.updateSelectedElement({ content: dataUri });

            const sizeKb = Math.round(file.size / 1024);
            if (overLimit) {
                const msg = `Embedded ${file.name} (${sizeKb} KB). This is large; it will bloat the template file and may slow autosave.`;
                this.setImageFileNote(msg, 'warn');
                this.notifyError(`Embedded a large image (${sizeKb} KB). Large images bloat the template and may slow autosave.`);
            } else {
                this.setImageFileNote(`Embedded ${file.name} (${sizeKb} KB).`, 'ok');
            }

            // Re-render so the URL field shows the new data URI value.
            this.render();
        };
        reader.readAsDataURL(file);
    }

    // Show an inline status under the file picker. The element has
    // role="status" so the message is announced to assistive tech.
    setImageFileNote(message, kind) {
        const note = this.container.querySelector('[data-image-file-note]');
        if (!note) return;
        note.textContent = message;
        note.classList.remove('image-file-note-error', 'image-file-note-warn', 'image-file-note-ok');
        if (kind === 'error') note.classList.add('image-file-note-error');
        else if (kind === 'warn') note.classList.add('image-file-note-warn');
        else if (kind === 'ok') note.classList.add('image-file-note-ok');
    }

    // Surface a transient toast through the app shell's error-message channel
    // (the same window.ografEditor instance refreshTimelinePanel uses). Safe to
    // call when the shell is absent (e.g. in unit tests).
    notifyError(message) {
        const app = window.ografEditor;
        if (app && typeof app.showErrorMessage === 'function') {
            app.showErrorMessage(message);
        }
    }

    insertDataInputToken(key) {
        if (!this.currentElement) return;
        const template = this.templateManager.getCurrentTemplate();
        const element = template && template.getElementById(this.currentElement);
        if (!element) return;

        const existing = element.content || '';
        const updated = `${existing}{{${key}}}`;
        this.visualEditor.updateSelectedElement({ content: updated });
        this.render();
    }

    // Commit an element-id rename. Validates here for an inline error (mirrors
    // the data-input Key validation pattern), then delegates the atomic mutation
    // (element.id, timeline lane migration, regenerate) to the model. On success
    // it preserves selection under the new id across the VisualEditor, this
    // panel, the canvas, the timeline panel, and the preview.
    commitElementId(input) {
        // The input commits on both 'change' and 'blur'. A successful rename
        // re-renders this panel via innerHTML, detaching the input; the trailing
        // blur then fires against the stale node. No-op once detached.
        if (input && !input.isConnected) return;
        if (!this.currentElement) return;

        const template = this.templateManager.getCurrentTemplate();
        if (!template) return;

        const oldId = this.currentElement;
        const newId = input.value.trim();

        // No change: clear any error, do nothing.
        if (newId === oldId) {
            this.clearElementIdError(input);
            return;
        }

        if (newId === '') {
            this.showElementIdError(input, 'Enter an id. It cannot be empty.');
            return;
        }

        // slug-safe: lowercase letters, numbers, hyphens only.
        if (!/^[a-z0-9-]+$/.test(newId) || OGrafTemplate.slugifyId(newId) !== newId) {
            this.showElementIdError(input, 'Use lowercase letters, numbers and hyphens only.');
            return;
        }

        // Unique among the template's elements.
        if (template.elements.some(el => el.id === newId)) {
            this.showElementIdError(input, 'That id is already used. Pick a different one.');
            return;
        }

        const result = template.renameElementId(oldId, newId);
        if (!result.ok) {
            // The model rejected it for the same reasons we checked; surface a
            // generic message rather than silently dropping the edit.
            this.showElementIdError(input, 'That id cannot be used. Pick a different one.');
            return;
        }

        // Persist and keep every surface that keys off the element id in sync.
        this.templateManager.saveToStorage();

        // The selection in both the panel and the visual editor tracks the id,
        // so move it to the new id or selection is lost on the next render.
        this.currentElement = result.id;
        // Keep focus on the (now renamed) id input across the re-render that the
        // elementSelected dispatch below triggers on this panel.
        this.elementIdFocus = true;
        if (this.visualEditor) {
            this.visualEditor.selectedElement = result.id;
            this.visualEditor.render();
            // Re-announce selection so this panel re-renders under the new id and
            // the timeline panel (and any other listener) re-keys to it and keeps
            // the track highlighted. This panel's elementSelected handler calls
            // render(), which consumes elementIdFocus and restores focus.
            this.visualEditor.dispatchEvent('elementSelected', { elementId: result.id });
        } else {
            this.render();
        }
        // The timeline panel re-keys to the new id via its own elementSelected
        // listener; refresh it explicitly too in case the dispatch path changes.
        this.refreshTimelinePanel();
        if (this.previewEngine) {
            this.previewEngine.reloadComponent();
        }
    }

    showElementIdError(input, message) {
        input.setAttribute('aria-invalid', 'true');
        const errorEl = this.container.querySelector('[data-element-id-error]');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.hidden = false;
            // Point the input at both the help text and the error for AT users.
            input.setAttribute('aria-describedby', 'element-id-help element-id-error');
            errorEl.id = 'element-id-error';
        }
        input.focus();
        if (typeof input.select === 'function') {
            input.select();
        }
    }

    clearElementIdError(input) {
        if (input) {
            input.removeAttribute('aria-invalid');
            input.setAttribute('aria-describedby', 'element-id-help');
        }
        const errorEl = this.container.querySelector('[data-element-id-error]');
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.hidden = true;
        }
    }

    updateElementProperty(property, value) {
        if (!this.currentElement) return;

        const updates = {};
        
        // Convert string values to appropriate types
        if (property === 'x' || property === 'y' || property === 'width' || property === 'height') {
            updates[property] = parseInt(value) || 0;
        } else {
            updates[property] = value;
        }

        this.visualEditor.updateSelectedElement(updates);
        
        // If type changed, re-render properties to show appropriate options
        if (property === 'type') {
            setTimeout(() => this.render(), 50);
        }
    }

    updateAnimationProperty(property, value) {
        const template = this.templateManager.getCurrentTemplate();
        if (!template) return;

        // Initialize animation settings if they don't exist (this should normally be done during panel rendering)
        if (!template.animationSettings) {
            template.animationSettings = {};
        }

        // Update the specific animation property. Number inputs deliver strings,
        // so coerce duration fields to numbers (the generated component and the
        // manifest actionDurations expect numeric ms).
        const isDuration = property === 'slideInDuration' || property === 'slideOutDuration';
        if (isDuration) {
            // An empty/blank field gives Number('') === 0, which would build a
            // 0ms animation. Treat empty as "no change" so a mid-edit cleared
            // field never overwrites the stored duration with 0; the value is
            // recommitted once the user types a real number.
            if (String(value).trim() === '') return;
            const ms = Number(value);
            if (!Number.isFinite(ms)) return;
            template.animationSettings[property] = ms;
        } else {
            template.animationSettings[property] = value;
        }

        // A duration/easing/direction change is a Simple-path edit: regenerate
        // the timeline keyframes from the preset so the change actually takes
        // effect (the animation is driven by the timeline, not these settings
        // directly). The custom-lock guardrail leaves hand-tuned lanes alone.
        const skipped = template.applyPresetToTimeline(false);
        template.updateActionDurations();

        // Save changes
        this.templateManager.saveToStorage();

        // Regenerate web component with new animation settings
        template.generateWebComponent();

        // Reload the preview component to use new animation settings
        if (this.previewEngine) {
            this.previewEngine.reloadComponent();
        }

        // Refresh the bottom timeline panel so its lanes/durations stay in sync.
        this.refreshTimelinePanel();

        // If a setting changed but some lanes were skipped because they are
        // custom (hand-tuned in the Timeline panel), re-render so the panel
        // reflects the unchanged state.
        if (skipped.length > 0) {
            this.render();
        }
    }

    // Apply a Simple preset (None / Fade / Slide / Pop) to every element's in
    // and out lanes. This is the one-directional guardrail: if any lane is
    // custom (hand-tuned in the Timeline panel), ask for explicit confirmation
    // before replacing it. Confirm -> force-apply (clears custom). Cancel ->
    // apply only to non-custom lanes, leaving the hand-tuned ones intact.
    applyPreset(preset) {
        const template = this.templateManager.getCurrentTemplate();
        if (!template) return;

        if (!template.animationSettings) template.animationSettings = {};
        template.animationSettings.slideInPreset = preset;
        template.animationSettings.slideOutPreset = preset;

        // Detect custom lanes up front so we can ask before clobbering them.
        const timeline = template.getTimeline();
        const hasCustom = Object.values(timeline.elements || {})
            .some(entry => (entry.in && entry.in.custom) || (entry.out && entry.out.custom));

        let force = false;
        if (hasCustom) {
            const presetLabel = preset.charAt(0).toUpperCase() + preset.slice(1);
            force = confirm(
                `Replace your custom keyframes with the ${presetLabel} preset? This cannot be undone.`
            );
        }

        template.applyPresetToTimeline(force);
        template.updateActionDurations();
        this.templateManager.saveToStorage();
        template.generateWebComponent();
        if (this.previewEngine) {
            this.previewEngine.reloadComponent();
        }
        this.refreshTimelinePanel();
        this.render();
    }

    // The bottom Timeline panel is owned by the app shell, not this panel. Reach
    // it through the global app instance (the same channel used elsewhere) and
    // re-render so its lanes/diamonds/durations reflect a Simple-path edit.
    refreshTimelinePanel() {
        const app = window.ografEditor;
        if (app && app.timelinePanel) {
            app.timelinePanel.render();
        }
    }

    updateTemplateProperty(property, value) {
        const template = this.templateManager.getCurrentTemplate();
        if (!template) return;

        // Update template manifest property
        template.manifest[property] = value;

        // Save changes
        this.templateManager.saveToStorage();

        // The sidebar list shows the name and description, so it must refresh
        // when either changes. The panel has no direct reference to the list, so
        // notify the app via a DOM event on the visual-editor container (the same
        // channel used for element updates).
        this.visualEditor.container.dispatchEvent(
            new CustomEvent('templateMetaUpdated')
        );
    }

    previewAnimation(animationType) {
        // Get the preview engine from the main app (we'll need to pass this in or find it)
        const previewContainer = document.querySelector('#preview-editor');
        if (previewContainer) {
            // Find the preview engine instance - this is a simplified approach
            // In a real implementation, you'd want proper component communication
            const event = new CustomEvent('previewAnimation', { 
                detail: { animationType } 
            });
            previewContainer.dispatchEvent(event);
        }
    }

    updateElementStyleProperty(property, value) {
        if (!this.currentElement) return;

        const template = this.templateManager.getCurrentTemplate();
        const element = template.getElementById(this.currentElement);
        
        if (element) {
            if (!element.style) {
                element.style = {};
            }
            
            element.style[property] = value;
            this.visualEditor.render();
            this.templateManager.saveToStorage();
        }
    }

    // Reduce an authored color value to the 6-digit #rrggbb the native
    // <input type=color> swatch can hold. The swatch cannot represent alpha or
    // named keywords, so anything it cannot show (rgba with alpha, transparent)
    // returns null. Callers MUST treat null as "the swatch is only a preview;
    // do not write its value back" so authored rgba/alpha/transparent is never
    // clobbered. Accepts 3/4/6/8-digit hex (alpha digits are dropped for the
    // swatch), rgb()/rgba() (alpha < 1 returns null), and a small named set.
    colorToHex(color) {
        if (!color) return null;

        const value = String(color).trim();

        // Hex: accept #rgb, #rgba, #rrggbb, #rrggbbaa. Expand short form and
        // drop any alpha component for the swatch value.
        if (value.startsWith('#')) {
            const hex = value.slice(1);
            if (/^[0-9a-fA-F]{3}$/.test(hex)) {
                const [r, g, b] = hex.split('');
                return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
            }
            if (/^[0-9a-fA-F]{4}$/.test(hex)) {
                // #rgba: expand rgb, ignore alpha.
                const [r, g, b] = hex.split('');
                return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
            }
            if (/^[0-9a-fA-F]{6}$/.test(hex)) {
                return `#${hex.toLowerCase()}`;
            }
            if (/^[0-9a-fA-F]{8}$/.test(hex)) {
                // #rrggbbaa: drop alpha for the swatch.
                return `#${hex.slice(0, 6).toLowerCase()}`;
            }
            return null;
        }

        // rgb() and rgba(). Capture an optional alpha; if the color is
        // meaningfully transparent (alpha < 1) the swatch cannot represent it,
        // so return null and let the authored value stand.
        const rgbMatch = value.match(
            /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i
        );
        if (rgbMatch) {
            const alpha = rgbMatch[4] === undefined ? 1 : parseFloat(rgbMatch[4]);
            if (Number.isFinite(alpha) && alpha < 1) {
                return null;
            }
            const clamp = n => Math.max(0, Math.min(255, parseInt(n, 10)));
            const r = clamp(rgbMatch[1]);
            const g = clamp(rgbMatch[2]);
            const b = clamp(rgbMatch[3]);
            const hex = n => n.toString(16).padStart(2, '0');
            return `#${hex(r)}${hex(g)}${hex(b)}`;
        }

        // Named colors (basic set). 'transparent' has no opaque hex equivalent,
        // so it is intentionally absent: the swatch falls back to its neutral
        // default and the authored 'transparent' value is preserved.
        const namedColors = {
            'white': '#ffffff',
            'black': '#000000',
            'red': '#ff0000',
            'green': '#00ff00',
            'blue': '#0000ff',
            'yellow': '#ffff00',
            'cyan': '#00ffff',
            'magenta': '#ff00ff'
        };

        return namedColors[value.toLowerCase()] || null;
    }
}