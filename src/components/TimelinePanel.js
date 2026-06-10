import { OGrafTemplate } from '../models/OGrafTemplate.js';

// GAP-B.2: the Advanced authoring UI for the keyframe timeline.
//
// This panel is docked at the BOTTOM of .editor-area, a flex sibling AFTER
// .editor-content (not inside any .editor-tab). It edits the SAME timeline the
// Simple "Animation (quick presets)" sidebar section drives, through the shared
// model API on OGrafTemplate (getLane / addKeyframe / moveKeyframe / ...). It
// never forks or duplicates the timeline model.
//
// Layout contract: collapsed it is a ~36px header bar (operable in every tab);
// expanded (~220-260px) it shows a per-element track list with In/Out lanes,
// keyframe diamonds on a ms ruler, a draggable playhead, keyframe edit fields,
// and local Play / Stop / Snap to end controls that animate the live
// VisualEditor canvas nodes via the same WAAPI keyframes the component uses.
//
// Guardrail: any edit here marks the lane custom (model side), so re-applying a
// Simple preset to it requires the explicit confirm handled in PropertyPanel.

const STORAGE_HEIGHT = 'ograf-timeline-panel-height';
const STORAGE_COLLAPSED = 'ograf-timeline-panel-collapsed';
const MIN_HEIGHT = 180;
const HEADER_HEIGHT = 36;
const DEFAULT_HEIGHT = 240;
const PX_PER_MS = 0.25; // ruler scale: 4ms per px (so 2000ms -> 500px)
const KF_STEP = 10;     // arrow-key move step (ms)
const KF_STEP_BIG = 100; // shift+arrow move step (ms)

export class TimelinePanel {
    constructor(containerElement, templateManager, visualEditor) {
        this.container = containerElement; // .editor-area
        this.templateManager = templateManager;
        this.visualEditor = visualEditor;
        // Set via setPreviewEngine() after construction (mirrors PropertyPanel).
        // A keyframe edit calls previewEngine.reloadComponent() so the live
        // preview rebuilds and re-plays without a manual Stop/Play.
        this.previewEngine = null;

        this.panel = null;
        this.collapsed = this.readCollapsed();
        this.height = this.readHeight();

        // Authoring selection state.
        this.selectedElementId = null;
        this.selectedLane = 'in';       // 'in' | 'out'
        this.selectedKeyframeIndex = null;
        this.playhead = 0;              // ms

        // Live local-preview animations running on the canvas nodes.
        this.runningAnimations = [];

        this.init();
    }

    // Connect the live Preview tab so a keyframe edit refreshes it the same way
    // PropertyPanel's Simple-path edits do (recreate + re-play when playing).
    setPreviewEngine(previewEngine) {
        this.previewEngine = previewEngine;
    }

    init() {
        this.buildPanel();
        this.setupResizer();
        this.render();

        // Highlight / scroll the matching track when an element is selected in
        // the canvas. PropertyPanel listens to the same event; we share it.
        this.visualEditor.container.addEventListener('elementSelected', (e) => {
            this.selectedElementId = e.detail.elementId;
            this.selectedKeyframeIndex = null;
            this.render();
            this.scrollSelectedIntoView();
        });
        this.visualEditor.container.addEventListener('elementDeselected', () => {
            // Keep the track list, just drop the highlight.
            this.selectedElementId = null;
            this.render();
        });
        // Element add/remove changes the track list.
        ['elementAdded', 'elementDeleted', 'elementUpdated'].forEach(name => {
            this.visualEditor.container.addEventListener(name, () => this.render());
        });
    }

    // ---- persistence -------------------------------------------------------

    readCollapsed() {
        try { return localStorage.getItem(STORAGE_COLLAPSED) === '1'; } catch (e) { return false; }
    }
    writeCollapsed() {
        try { localStorage.setItem(STORAGE_COLLAPSED, this.collapsed ? '1' : '0'); } catch (e) { /* ignore */ }
    }
    readHeight() {
        try {
            const v = parseInt(localStorage.getItem(STORAGE_HEIGHT), 10);
            return Number.isFinite(v) ? v : DEFAULT_HEIGHT;
        } catch (e) { return DEFAULT_HEIGHT; }
    }
    writeHeight() {
        try { localStorage.setItem(STORAGE_HEIGHT, String(this.height)); } catch (e) { /* ignore */ }
    }

    // ---- panel scaffold ----------------------------------------------------

    buildPanel() {
        const panel = document.createElement('section');
        panel.className = 'timeline-panel';
        panel.setAttribute('aria-label', 'Timeline');
        // Inserted after .editor-content so it does not overlap the absolutely
        // positioned tab panes; .editor-content flex-shrinks to make room.
        this.container.appendChild(panel);
        this.panel = panel;
    }

    // The top drag handle reuses the setupPanelResizer pattern: mouse drag +
    // ArrowUp/ArrowDown, role=separator, persisted height. Dragging up grows the
    // panel (the editor content shrinks); dragging down shrinks it.
    setupResizer() {
        const resizer = document.createElement('div');
        resizer.className = 'timeline-resizer panel-resizer';
        resizer.setAttribute('role', 'separator');
        resizer.setAttribute('aria-orientation', 'horizontal');
        resizer.setAttribute('aria-label', 'Resize timeline panel');
        resizer.setAttribute('tabindex', '0');
        resizer.setAttribute('aria-valuemin', String(MIN_HEIGHT));
        this.resizer = resizer;

        const maxHeight = () => Math.max(MIN_HEIGHT, this.container.clientHeight - 120);
        const clamp = (h) => Math.max(MIN_HEIGHT, Math.min(maxHeight(), h));

        const apply = (h, persist) => {
            this.height = clamp(h);
            this.applyPanelSize();
            resizer.setAttribute('aria-valuenow', String(this.height));
            if (persist) this.writeHeight();
        };
        this.applyHeight = apply;

        resizer.addEventListener('mousedown', (e) => {
            if (this.collapsed) return;
            e.preventDefault();
            const startY = e.clientY;
            const startHeight = this.height;
            resizer.classList.add('dragging');
            document.body.classList.add('panel-resizing');
            const onMove = (me) => apply(startHeight - (me.clientY - startY), false);
            const onUp = () => {
                resizer.classList.remove('dragging');
                document.body.classList.remove('panel-resizing');
                this.writeHeight();
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        resizer.addEventListener('keydown', (e) => {
            if (this.collapsed) return;
            const step = 20;
            if (e.key === 'ArrowUp') { apply(this.height + step, true); e.preventDefault(); }
            else if (e.key === 'ArrowDown') { apply(this.height - step, true); e.preventDefault(); }
        });
    }

    applyPanelSize() {
        if (!this.panel) return;
        if (this.collapsed) {
            this.panel.style.height = `${HEADER_HEIGHT}px`;
        } else {
            this.panel.style.height = `${this.height}px`;
        }
    }

    // ---- helpers -----------------------------------------------------------

    template() {
        return this.templateManager.getCurrentTemplate();
    }

    // Persist + regenerate after a timeline edit. The engine recomputes
    // actionDurations on generate (see generateWebComponent), so the declared
    // timing always matches what plays.
    persist() {
        const template = this.template();
        if (!template) return;
        template.updateActionDurations();
        template.generateWebComponent();
        this.templateManager.saveToStorage();

        // Refresh the live Preview tab so a keyframe edit is visible without a
        // manual Stop/Play. reloadComponent() rebuilds the generated component
        // (the timeline is baked at generateWebComponent() time) and re-plays it
        // when the preview was already playing. Mirrors the PropertyPanel
        // Simple-path. Fall back to the global app instance if no engine was
        // wired directly.
        const engine = this.previewEngine
            || (typeof window !== 'undefined' && window.ografEditor
                ? window.ografEditor.previewEngine
                : null);
        if (engine && typeof engine.reloadComponent === 'function') {
            engine.reloadComponent();
        }
    }

    totalDuration(action) {
        const template = this.template();
        return template ? template.computeActionDuration(action) : 0;
    }

    summaryText() {
        const inMs = this.totalDuration('in');
        const outMs = this.totalDuration('out');
        if (inMs === 0 && outMs === 0) return 'No animation';
        return `In ${inMs} ms, out ${outMs} ms`;
    }

    // The ruler width in ms: a little past the longest lane so there is room to
    // drag a keyframe out, with a sensible minimum.
    rulerMs() {
        const max = Math.max(this.totalDuration('in'), this.totalDuration('out'), 1000);
        return Math.ceil((max * 1.25) / 100) * 100;
    }

    msToPx(ms) { return ms * PX_PER_MS; }
    pxToMs(px) { return px / PX_PER_MS; }

    // ---- render ------------------------------------------------------------

    // Drop a stale selection that points at an element not in the current
    // template (e.g. after switching templates). Leaving it set would make
    // getLane lazily create a phantom lane for a non-existent element and
    // wrongly enable Add keyframe.
    validateSelection() {
        const template = this.template();
        const ids = template && Array.isArray(template.elements)
            ? template.elements.map(el => el.id)
            : [];
        if (this.selectedElementId !== null && !ids.includes(this.selectedElementId)) {
            this.selectedElementId = null;
            this.selectedLane = 'in';
            this.selectedKeyframeIndex = null;
        }
    }

    render() {
        if (!this.panel) return;
        this.validateSelection();
        this.applyPanelSize();
        this.panel.classList.toggle('collapsed', this.collapsed);

        const template = this.template();
        const caret = this.collapsed ? '&#9656;' : '&#9662;'; // right / down triangle
        const summary = template ? this.summaryText() : 'No template';

        // Header is always present (operable in every tab). Body is built only
        // when expanded and a template exists.
        let bodyHtml = '';
        if (!this.collapsed) {
            bodyHtml = template ? this.renderBody(template) : `
                <div class="timeline-empty">Select or create a template to edit its animation timeline.</div>
            `;
        }

        this.panel.innerHTML = `
            <div class="timeline-header">
                <button type="button" class="timeline-toggle" aria-expanded="${!this.collapsed}" aria-controls="timeline-body">
                    <span class="timeline-caret" aria-hidden="true">${caret}</span>
                    <span class="timeline-title">Timeline</span>
                </button>
                <span class="timeline-summary" aria-live="polite">${this.escapeHtml(summary)}</span>
                ${this.collapsed ? '' : this.renderTransport()}
            </div>
            <div id="timeline-body" class="timeline-body" ${this.collapsed ? 'hidden' : ''}>
                ${bodyHtml}
            </div>
        `;

        // The resizer sits at the very top of the panel, above the header.
        if (this.resizer && this.resizer.parentNode !== this.panel) {
            this.panel.insertBefore(this.resizer, this.panel.firstChild);
        }
        this.resizer.setAttribute('aria-valuenow', String(this.height));

        this.bindHeader();
        if (!this.collapsed && template) {
            this.bindBody();
        }
        this.restoreInspectorFocus();
    }

    renderTransport() {
        return `
            <div class="timeline-transport" role="group" aria-label="Timeline playback">
                <button type="button" class="btn btn-secondary timeline-btn" data-transport="play">Play</button>
                <button type="button" class="btn btn-secondary timeline-btn" data-transport="stop">Stop</button>
                <button type="button" class="btn btn-secondary timeline-btn" data-transport="snap">Snap to end</button>
            </div>
        `;
    }

    renderBody(template) {
        const elements = template.elements || [];
        if (elements.length === 0) {
            return `<div class="timeline-empty">This graphic has no elements yet. Add one to animate it.</div>`;
        }
        const rulerMs = this.rulerMs();
        const rulerPx = this.msToPx(rulerMs);

        // Track list is in z-order (array order = paint order = z-order).
        const tracksHtml = elements.map(el => this.renderTrack(template, el, rulerPx)).join('');

        return `
            <div class="timeline-grid" role="group" aria-label="Animation timeline">
                <div class="timeline-ruler-row">
                    <div class="timeline-track-label timeline-ruler-spacer" aria-hidden="true"></div>
                    <div class="timeline-lanes-area">
                        <span class="timeline-lane-tag timeline-ruler-lane-spacer" aria-hidden="true"></span>
                        <div class="timeline-ruler-track">
                            ${this.renderRuler(rulerMs, rulerPx)}
                            ${this.renderPlayhead()}
                        </div>
                    </div>
                </div>
                <div class="timeline-tracks">
                    ${tracksHtml}
                </div>
            </div>
            ${this.renderInspector(template)}
        `;
    }

    renderRuler(rulerMs, rulerPx) {
        const ticks = [];
        const stepMs = rulerMs > 3000 ? 500 : 250;
        for (let t = 0; t <= rulerMs; t += stepMs) {
            ticks.push(`<span class="timeline-tick" style="left:${this.msToPx(t)}px">${t}</span>`);
        }
        return `<div class="timeline-ruler" style="width:${rulerPx}px">${ticks.join('')}</div>`;
    }

    renderPlayhead() {
        const rulerMs = this.rulerMs();
        return `
            <div class="timeline-playhead" role="slider" tabindex="0"
                 aria-label="Playhead"
                 aria-valuemin="0" aria-valuemax="${rulerMs}" aria-valuenow="${this.playhead}"
                 aria-valuetext="${this.playhead} milliseconds"
                 style="left:${this.msToPx(this.playhead)}px"></div>
        `;
    }

    renderTrack(template, element, rulerPx) {
        const isSelected = element.id === this.selectedElementId;
        const label = this.escapeHtml(element.id);
        return `
            <div class="timeline-track ${isSelected ? 'selected' : ''}" role="group"
                 aria-label="Track: ${label}" data-track="${this.escapeAttr(element.id)}">
                <div class="timeline-track-label" title="${label}">${label}</div>
                <div class="timeline-lanes-area">
                    ${this.renderLane(template, element, 'in', rulerPx)}
                    ${this.renderLane(template, element, 'out', rulerPx)}
                </div>
            </div>
        `;
    }

    renderLane(template, element, action, rulerPx) {
        const lane = template.getLane(element.id, action);
        const laneLabel = action === 'in' ? 'In animation' : 'Out animation';
        const isActiveLane = element.id === this.selectedElementId && this.selectedLane === action;
        const custom = lane.custom ? '<span class="timeline-custom-badge" title="Hand-tuned keyframes">Custom</span>' : '';

        const empty = lane.keyframes.length === 0
            ? `<span class="timeline-lane-empty">No keyframes. Move the playhead and add one.</span>`
            : '';

        const diamonds = lane.keyframes.map((kf, i) => {
            const selected = isActiveLane && this.selectedKeyframeIndex === i;
            const name = `${this.keyframeName(kf)} keyframe at ${kf.t} milliseconds, ${element.id}`;
            return `<button type="button" class="timeline-kf ${selected ? 'selected' : ''}"
                        style="left:${this.msToPx(kf.t)}px"
                        data-kf-element="${this.escapeAttr(element.id)}"
                        data-kf-action="${action}" data-kf-index="${i}"
                        aria-label="${this.escapeAttr(name)}"></button>`;
        }).join('');

        return `
            <div class="timeline-lane ${isActiveLane ? 'active' : ''} ${action}" role="group"
                 aria-label="${laneLabel}"
                 data-lane-element="${this.escapeAttr(element.id)}" data-lane-action="${action}">
                <span class="timeline-lane-tag">${action === 'in' ? 'In' : 'Out'}${custom}</span>
                <div class="timeline-lane-track" style="width:${rulerPx}px">
                    ${empty}
                    ${diamonds}
                </div>
            </div>
        `;
    }

    keyframeName(kf) {
        const p = kf.props || {};
        if (p.opacity !== undefined) return 'Opacity';
        if (p.scale !== undefined) return 'Scale';
        if (p.tx !== undefined || p.ty !== undefined) return 'Offset';
        return 'Keyframe';
    }

    // The inspector: Add keyframe + the numeric edit fields for the selected
    // keyframe, plus the per-lane Delay field. Numeric fields are the keyboard
    // equivalent for every drag (drag-on-canvas is deferred).
    renderInspector(template) {
        const hasLane = !!this.selectedElementId;
        const lane = hasLane ? template.getLane(this.selectedElementId, this.selectedLane) : null;
        const kf = (lane && this.selectedKeyframeIndex !== null)
            ? lane.keyframes[this.selectedKeyframeIndex]
            : null;
        const p = (kf && kf.props) || {};
        const delay = lane ? (lane.delay || 0) : 0;

        const laneSummary = hasLane
            ? `${this.escapeHtml(this.selectedElementId)} / ${this.selectedLane === 'in' ? 'In animation' : 'Out animation'}`
            : 'Select a track lane';

        const easingOptions = OGrafTemplate.EASING_PRESETS.map(e =>
            `<option value="${e}" ${kf && kf.easing === e ? 'selected' : ''}>${e}</option>`
        ).join('');

        const fieldsDisabled = kf ? '' : 'disabled';

        return `
            <div class="timeline-inspector" role="group" aria-label="Keyframe editor">
                <div class="timeline-inspector-head">
                    <span class="timeline-inspector-lane">${laneSummary}</span>
                    <button type="button" class="btn btn-primary timeline-btn" data-add-keyframe ${hasLane ? '' : 'disabled'}>Add keyframe</button>
                </div>
                <div class="timeline-inspector-fields">
                    <label class="timeline-field">
                        <span>Opacity</span>
                        <input type="number" data-kf-prop="opacity" min="0" max="1" step="0.1" value="${this.numVal(p.opacity)}" ${fieldsDisabled}>
                    </label>
                    <label class="timeline-field">
                        <span>Offset X</span>
                        <input type="number" data-kf-prop="tx" step="1" value="${this.numVal(p.tx)}" ${fieldsDisabled}>
                    </label>
                    <label class="timeline-field">
                        <span>Offset Y</span>
                        <input type="number" data-kf-prop="ty" step="1" value="${this.numVal(p.ty)}" ${fieldsDisabled}>
                    </label>
                    <label class="timeline-field">
                        <span>Scale</span>
                        <input type="number" data-kf-prop="scale" step="0.1" value="${this.numVal(p.scale)}" ${fieldsDisabled}>
                    </label>
                    <label class="timeline-field">
                        <span>Easing</span>
                        <select data-kf-easing ${fieldsDisabled}>${easingOptions}</select>
                    </label>
                    <label class="timeline-field">
                        <span>Delay (ms)</span>
                        <input type="number" data-lane-delay min="0" step="10" value="${delay}" ${hasLane ? '' : 'disabled'}>
                    </label>
                    <button type="button" class="btn btn-secondary timeline-btn timeline-remove-kf" data-remove-keyframe ${kf ? '' : 'disabled'}>Remove keyframe</button>
                </div>
            </div>
        `;
    }

    numVal(v) {
        return (v === undefined || v === null) ? '' : String(v);
    }

    // ---- event binding -----------------------------------------------------

    bindHeader() {
        const toggle = this.panel.querySelector('.timeline-toggle');
        if (toggle) {
            toggle.addEventListener('click', () => {
                this.collapsed = !this.collapsed;
                this.writeCollapsed();
                this.render();
            });
        }
        const transport = this.panel.querySelectorAll('[data-transport]');
        transport.forEach(btn => {
            btn.addEventListener('click', () => this.runLocalPreview(btn.dataset.transport));
        });
    }

    bindBody() {
        // Lane selection (click a lane to make it the active edit target).
        this.panel.querySelectorAll('[data-lane-element]').forEach(laneEl => {
            laneEl.addEventListener('click', (e) => {
                if (e.target.closest('.timeline-kf')) return; // handled below
                this.selectedElementId = laneEl.dataset.laneElement;
                this.selectedLane = laneEl.dataset.laneAction;
                this.selectedKeyframeIndex = null;
                this.render();
            });
        });

        // Keyframe diamonds: select, drag, and keyboard move/edit/remove.
        this.panel.querySelectorAll('.timeline-kf').forEach(kfEl => {
            this.bindKeyframe(kfEl);
        });

        // Playhead drag + keyboard.
        const playhead = this.panel.querySelector('.timeline-playhead');
        if (playhead) this.bindPlayhead(playhead);

        // Inspector: Add keyframe / Remove / numeric props / easing / delay.
        const addBtn = this.panel.querySelector('[data-add-keyframe]');
        if (addBtn) addBtn.addEventListener('click', () => this.addKeyframeAtPlayhead());

        const removeBtn = this.panel.querySelector('[data-remove-keyframe]');
        if (removeBtn) removeBtn.addEventListener('click', () => this.removeSelectedKeyframe());

        this.panel.querySelectorAll('[data-kf-prop]').forEach(input => {
            input.addEventListener('change', () => this.commitKeyframeProp(input.dataset.kfProp, input.value));
        });
        const easingSel = this.panel.querySelector('[data-kf-easing]');
        if (easingSel) easingSel.addEventListener('change', () => this.commitKeyframeProp('easing', easingSel.value));

        const delayInput = this.panel.querySelector('[data-lane-delay]');
        if (delayInput) delayInput.addEventListener('change', () => this.commitLaneDelay(delayInput.value));

        // Body-level "K" shortcut to add a keyframe when focus is inside the panel.
        if (!this._keyHandlerBound) {
            this.panel.addEventListener('keydown', (e) => {
                if ((e.key === 'k' || e.key === 'K') && !this.isTextEntry(e.target)) {
                    if (this.selectedElementId) {
                        this.addKeyframeAtPlayhead();
                        e.preventDefault();
                    }
                }
            });
            this._keyHandlerBound = true;
        }
    }

    isTextEntry(el) {
        return el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
    }

    bindKeyframe(kfEl) {
        const elementId = kfEl.dataset.kfElement;
        const action = kfEl.dataset.kfAction;
        const index = parseInt(kfEl.dataset.kfIndex, 10);

        const select = () => {
            this.selectedElementId = elementId;
            this.selectedLane = action;
            this.selectedKeyframeIndex = index;
            this.render();
            // Keep focus on the (re-rendered) keyframe.
            const again = this.panel.querySelector(
                `.timeline-kf[data-kf-element="${CSS.escape(elementId)}"][data-kf-action="${action}"][data-kf-index="${index}"]`
            );
            if (again) again.focus({ preventScroll: true });
        };

        kfEl.addEventListener('click', (e) => { e.stopPropagation(); select(); });

        // Keyboard: Arrow=move (10ms / shift 100ms), Delete=remove, Enter=edit.
        kfEl.addEventListener('keydown', (e) => {
            const template = this.template();
            if (!template) return;
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                const step = e.shiftKey ? KF_STEP_BIG : KF_STEP;
                const lane = template.getLane(elementId, action);
                const kf = lane.keyframes[index];
                const newT = kf.t + (e.key === 'ArrowRight' ? step : -step);
                const newIndex = template.moveKeyframe(elementId, action, index, newT);
                this.persist();
                this.selectedElementId = elementId;
                this.selectedLane = action;
                this.selectedKeyframeIndex = newIndex;
                this.render();
                const moved = this.panel.querySelector(
                    `.timeline-kf[data-kf-element="${CSS.escape(elementId)}"][data-kf-action="${action}"][data-kf-index="${newIndex}"]`
                );
                if (moved) moved.focus({ preventScroll: true });
                e.preventDefault();
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                this.selectedElementId = elementId;
                this.selectedLane = action;
                this.selectedKeyframeIndex = index;
                this.removeSelectedKeyframe();
                e.preventDefault();
            } else if (e.key === 'Enter') {
                select();
                const opacityInput = this.panel.querySelector('[data-kf-prop="opacity"]');
                if (opacityInput) opacityInput.focus({ preventScroll: true });
                e.preventDefault();
            }
        });

        // Mouse drag in time.
        kfEl.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            select();
            const lane = this.template().getLane(elementId, action);
            const startX = e.clientX;
            const startT = lane.keyframes[index].t;
            let currentIndex = index;
            const onMove = (me) => {
                const dMs = this.pxToMs(me.clientX - startX);
                currentIndex = this.template().moveKeyframe(elementId, action, currentIndex, startT + dMs);
                this.persist();
                this.render();
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                this.selectedKeyframeIndex = currentIndex;
                this.render();
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    bindPlayhead(playhead) {
        const setFromPx = (px) => {
            const ms = Math.max(0, Math.min(this.rulerMs(), Math.round(this.pxToMs(px))));
            this.playhead = ms;
            playhead.style.left = `${this.msToPx(ms)}px`;
            playhead.setAttribute('aria-valuenow', String(ms));
            playhead.setAttribute('aria-valuetext', `${ms} milliseconds`);
        };

        playhead.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const track = playhead.parentElement;
            const rect = track.getBoundingClientRect();
            const onMove = (me) => setFromPx(me.clientX - rect.left);
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        playhead.addEventListener('keydown', (e) => {
            const step = e.shiftKey ? KF_STEP_BIG : KF_STEP;
            if (e.key === 'ArrowLeft') { setFromPx(this.msToPx(this.playhead - step)); e.preventDefault(); }
            else if (e.key === 'ArrowRight') { setFromPx(this.msToPx(this.playhead + step)); e.preventDefault(); }
            else if (e.key === 'Home') { setFromPx(0); e.preventDefault(); }
            else if (e.key === 'End') { setFromPx(this.msToPx(this.rulerMs())); e.preventDefault(); }
        });
    }

    // ---- edit actions ------------------------------------------------------

    // Add a keyframe at the playhead. Seed its props by sampling the lane's
    // existing animation at the playhead time (linear interpolation between the
    // surrounding keyframes) so adding a frame mid-slide does not introduce a
    // kink: the new frame lies exactly on the current curve. For a fresh lane we
    // seed sensible props from the element (opacity from style, no offset,
    // scale 1).
    addKeyframeAtPlayhead() {
        const template = this.template();
        if (!template || !this.selectedElementId) return;
        const element = template.getElementById(this.selectedElementId);
        if (!element) return;

        const lane = template.getLane(this.selectedElementId, this.selectedLane);
        const props = this.sampleLaneAt(lane, this.playhead, element);
        const kf = template.addKeyframe(this.selectedElementId, this.selectedLane, this.playhead, props);
        this.selectedKeyframeIndex = lane.keyframes.indexOf(kf);
        this.persist();
        this.render();
    }

    // Interpolate a lane's animated props at time t. Linearly blends between the
    // surrounding keyframes; before the first / after the last keyframe it holds
    // the nearest neighbour's value (no extrapolation). On an empty lane it
    // falls back to the element's resting state. Returns { opacity, tx, ty, scale }.
    sampleLaneAt(lane, t, element) {
        const fallback = () => ({
            opacity: element && element.style && element.style.opacity !== undefined
                ? Number(element.style.opacity)
                : 1,
            tx: 0,
            ty: 0,
            scale: 1
        });

        const kfs = (lane && Array.isArray(lane.keyframes)) ? lane.keyframes : [];
        if (kfs.length === 0) return fallback();

        const sorted = kfs.slice().sort((a, b) => (a.t || 0) - (b.t || 0));
        const base = fallback();
        // Resolve one prop at time t across the sorted keyframes.
        const resolve = (key) => {
            // Keyframes that actually define this prop.
            const defined = sorted.filter(kf => kf.props && kf.props[key] !== undefined && kf.props[key] !== null);
            if (defined.length === 0) return base[key];
            if (t <= defined[0].t) return Number(defined[0].props[key]);
            if (t >= defined[defined.length - 1].t) return Number(defined[defined.length - 1].props[key]);
            for (let i = 0; i < defined.length - 1; i++) {
                const a = defined[i];
                const b = defined[i + 1];
                if (t >= a.t && t <= b.t) {
                    const span = (b.t - a.t) || 1;
                    const frac = (t - a.t) / span;
                    const av = Number(a.props[key]);
                    const bv = Number(b.props[key]);
                    return av + (bv - av) * frac;
                }
            }
            return base[key];
        };

        const round = (n) => Math.round(n * 1000) / 1000;
        return {
            opacity: round(resolve('opacity')),
            tx: round(resolve('tx')),
            ty: round(resolve('ty')),
            scale: round(resolve('scale'))
        };
    }

    removeSelectedKeyframe() {
        const template = this.template();
        if (!template || this.selectedElementId === null || this.selectedKeyframeIndex === null) return;
        template.removeKeyframe(this.selectedElementId, this.selectedLane, this.selectedKeyframeIndex);
        this.selectedKeyframeIndex = null;
        this.persist();
        this.render();
    }

    commitKeyframeProp(prop, value) {
        const template = this.template();
        if (!template || this.selectedKeyframeIndex === null) return;
        template.updateKeyframe(this.selectedElementId, this.selectedLane, this.selectedKeyframeIndex, { [prop]: value });
        this.persist();
        // The panel re-renders via innerHTML so the committed control's element
        // ref dies and focus is lost. Stash which field had focus and restore it
        // after the re-render (mirrors PropertyPanel.restoreDataInputFocus).
        this.inspectorFocusTarget = prop === 'easing' ? { easing: true } : { prop };
        // Re-render so summary/durations update.
        this.render();
    }

    commitLaneDelay(value) {
        const template = this.template();
        if (!template || !this.selectedElementId) return;
        template.setLaneDelay(this.selectedElementId, this.selectedLane, value);
        this.persist();
        this.inspectorFocusTarget = { delay: true };
        this.render();
    }

    // Reapply focus to the inspector control the user just edited, after the
    // innerHTML re-render replaced it.
    restoreInspectorFocus() {
        const target = this.inspectorFocusTarget;
        this.inspectorFocusTarget = null;
        if (!target) return;
        let el = null;
        if (target.easing) {
            el = this.panel.querySelector('[data-kf-easing]');
        } else if (target.delay) {
            el = this.panel.querySelector('[data-lane-delay]');
        } else if (target.prop) {
            el = this.panel.querySelector(`[data-kf-prop="${target.prop}"]`);
        }
        if (el) el.focus({ preventScroll: true });
    }

    // ---- local preview on the live canvas nodes ----------------------------

    // Animate the VisualEditor canvas DOM nodes directly with the same WAAPI
    // keyframes the generated component uses. This is the in-panel preview; the
    // Preview tab's Play/Stop still drives the timeline via the engine and is
    // untouched. "Snap to end" uses the skipAnimation path (finish() instantly).
    runLocalPreview(mode) {
        const template = this.template();
        if (!template) return;
        const canvas = this.visualEditor.canvas;
        if (!canvas) return;

        this.cancelLocalPreview();

        if (mode === 'stop') {
            return; // already cancelled above; nodes return to resting state
        }

        const action = 'in'; // Play / Snap run the in-animation; Stop clears it.
        const reducedMotion = window.matchMedia
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const skip = mode === 'snap';

        if (typeof Element.prototype.animate !== 'function') return;

        template.elements.forEach(element => {
            const lane = template.getLane(element.id, action);
            const effect = this.buildLaneEffect(lane);
            if (!effect) return;
            const node = canvas.querySelector(`.graphics-element[data-element-id="${CSS.escape(element.id)}"]`);
            if (!node) return;
            const anim = node.animate(effect.keyframes, effect.timing);
            this.runningAnimations.push(anim);
            if (skip || reducedMotion) {
                try { anim.finish(); } catch (e) { /* ignore */ }
            }
        });
    }

    cancelLocalPreview() {
        this.runningAnimations.forEach(a => { try { a.cancel(); } catch (e) { /* ignore */ } });
        this.runningAnimations = [];
    }

    // Mirror of the generated component's buildLaneEffect so the local preview
    // matches exactly what the renderer will run. Kept small and local; the
    // authoritative copy lives in the generated component.
    buildLaneEffect(lane) {
        if (!lane || !Array.isArray(lane.keyframes) || lane.keyframes.length === 0) return null;
        const sorted = lane.keyframes.slice().sort((a, b) => (a.t || 0) - (b.t || 0));
        const delay = Number(lane.delay) || 0;
        const last = sorted.reduce((m, kf) => Math.max(m, Number(kf.t) || 0), 0);
        const span = last > 0 ? last : 1;
        const toWAAPI = (kf, offset) => {
            const props = (kf && kf.props) || {};
            const tx = Number(props.tx) || 0;
            const ty = Number(props.ty) || 0;
            const hasScale = props.scale !== undefined && props.scale !== null;
            const scale = hasScale ? Number(props.scale) : 1;
            const out = { offset, transform: `translate(${tx}px, ${ty}px) scale(${scale})` };
            if (props.opacity !== undefined && props.opacity !== null) out.opacity = Number(props.opacity);
            if (kf && typeof kf.easing === 'string' && kf.easing) out.easing = kf.easing;
            return out;
        };
        const keyframes = sorted.map(kf => toWAAPI(kf, (Number(kf.t) || 0) / span));
        // Always hold the earliest authored value at offset 0 (mirrors the
        // generated component's buildLaneEffect; see the note there). A
        // first-keyframe-at-t>0 lane treats the gap as a lead-in hold instead of
        // letting WAAPI synthesize the 0-offset from underlying style.
        if (keyframes.length === 0 || keyframes[0].offset !== 0) {
            keyframes.unshift({ ...keyframes[0], offset: 0 });
        }
        return { keyframes, timing: { duration: span, delay, fill: 'both', easing: 'linear' } };
    }

    // ---- misc --------------------------------------------------------------

    scrollSelectedIntoView() {
        if (this.collapsed || !this.selectedElementId) return;
        const track = this.panel.querySelector(`.timeline-track[data-track="${CSS.escape(this.selectedElementId)}"]`);
        if (track && typeof track.scrollIntoView === 'function') {
            // nearest on both axes so revealing a track never scrolls the page.
            track.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
        return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    }
}
