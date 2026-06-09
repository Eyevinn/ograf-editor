import { escapeHtml } from '../utils/escapeHtml.js';

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
                ${this.renderCustomBadgeNote(template)}

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
        `;

        this.setupAnimationEventListeners();
        this.setupDataInputEventListeners();
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

    // Show which elements carry hand-tuned (custom) lanes, so the operator knows
    // a Simple preset will not silently overwrite them.
    renderCustomBadgeNote(template) {
        const timeline = template.getTimeline();
        const customIds = Object.entries(timeline.elements || {})
            .filter(([, entry]) => (entry.in && entry.in.custom) || (entry.out && entry.out.custom))
            .map(([id]) => id);
        if (customIds.length === 0) return '';
        const badges = customIds
            .map(id => `<span class="custom-badge" title="Hand-tuned in the Timeline panel">${this.escapeHtml(id)} <strong>Custom</strong></span>`)
            .join('');
        return `
            <div class="property-group custom-lane-note">
                <p class="help-text">These elements have custom keyframes. A preset will ask before replacing them.</p>
                <div class="custom-badges">${badges}</div>
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
            this.collapsedSections = new Set(['animation']);
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

        // Default-value control follows the type.
        let defaultControl;
        if (type === 'number') {
            const numVal = (defaultValue === '' || defaultValue === undefined || defaultValue === null)
                ? ''
                : this.escapeAttr(String(defaultValue));
            defaultControl = `<input type="number" id="${idBase}-default" class="property-input" data-data-input-field="default" data-data-input-key="${this.escapeAttr(key)}" value="${numVal}">`;
        } else if (type === 'boolean') {
            const checked = defaultValue === true ? 'checked' : '';
            defaultControl = `
                <label class="data-input-checkbox-label">
                    <input type="checkbox" id="${idBase}-default" data-data-input-field="default" data-data-input-key="${this.escapeAttr(key)}" ${checked}>
                    <span>Yes</span>
                </label>
            `;
        } else {
            const textVal = (defaultValue === undefined || defaultValue === null)
                ? ''
                : this.escapeAttr(String(defaultValue));
            defaultControl = `<input type="text" id="${idBase}-default" class="property-input" data-data-input-field="default" data-data-input-key="${this.escapeAttr(key)}" value="${textVal}">`;
        }

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
                    <label for="${idBase}-default">Default value</label>
                    ${defaultControl}
                </div>
                <button type="button" class="btn-remove-data-input" data-remove-data-input="${this.escapeAttr(key)}" aria-label="Remove data input ${safeKey}">Remove</button>
                ${notUsedNote}
            </div>
        `;
    }

    renderElementProperties(container, element) {
        container.innerHTML = `
            <div class="property-section">
                <h4>Element Properties</h4>
                
                <div class="property-group">
                    <label>Element ID</label>
                    <input type="text" class="property-input" data-property="id" value="${escapeHtml(element.id)}" readonly>
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
        if (element.type === 'text' || element.type === 'image') {
            const label = element.type === 'text' ? 'Text Content' : 'Image URL';
            const inputType = element.type === 'text' ? 'textarea' : 'input';
            const safeContent = escapeHtml(element.content || '');
            const inputElement = element.type === 'text' ?
                `<textarea class="property-input" data-property="content" rows="3">${safeContent}</textarea>` :
                `<input type="url" class="property-input" data-property="content" value="${safeContent}" placeholder="Enter image URL">`;

            const insertControl = element.type === 'text'
                ? this.renderInsertDataInputControl()
                : '';

            return `
                <div class="property-group">
                    <label>${label}</label>
                    ${inputElement}
                </div>
                ${insertControl}
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

        // Color picker synchronization
        const colorPickers = container.querySelectorAll('.color-picker');
        colorPickers.forEach(picker => {
            picker.addEventListener('input', (e) => {
                const textInput = picker.nextElementSibling;
                if (textInput && textInput.classList.contains('color-text')) {
                    textInput.value = e.target.value;
                    textInput.dispatchEvent(new Event('input'));
                }
            });
        });

        const colorTextInputs = container.querySelectorAll('.color-text');
        colorTextInputs.forEach(textInput => {
            textInput.addEventListener('input', (e) => {
                const picker = textInput.previousElementSibling;
                if (picker && picker.classList.contains('color-picker')) {
                    const hexColor = this.colorToHex(e.target.value);
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
        template.animationSettings[property] = isDuration ? Number(value) : value;

        // A duration/easing/direction change is a Simple-path edit: regenerate
        // the timeline keyframes from the preset so the change actually takes
        // effect (the animation is driven by the timeline, not these settings
        // directly). The custom-lock guardrail leaves hand-tuned lanes alone;
        // changing a non-preset setting on a custom-only template is a no-op on
        // those lanes, which is the intended "do not clobber" behaviour.
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
        // custom, let the user know (and re-render to show the Custom badges).
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

    colorToHex(color) {
        if (!color) return null;
        
        // If already hex, return as is
        if (color.startsWith('#')) {
            return color.length === 7 ? color : null;
        }
        
        // Handle rgb() format
        const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (rgbMatch) {
            const r = parseInt(rgbMatch[1]);
            const g = parseInt(rgbMatch[2]);
            const b = parseInt(rgbMatch[3]);
            return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
        }
        
        // Handle named colors (basic set)
        const namedColors = {
            'white': '#ffffff',
            'black': '#000000',
            'red': '#ff0000',
            'green': '#00ff00',
            'blue': '#0000ff',
            'yellow': '#ffff00',
            'cyan': '#00ffff',
            'magenta': '#ff00ff',
            'transparent': '#000000'
        };
        
        return namedColors[color.toLowerCase()] || null;
    }
}