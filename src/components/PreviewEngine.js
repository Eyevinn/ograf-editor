export class PreviewEngine {
    constructor(containerElement, templateManager) {
        this.container = containerElement;
        this.templateManager = templateManager;
        this.previewFrame = null;
        this.currentTemplate = null;
        this.previewData = {};
        this.isPlaying = false;
        
        this.init();
    }

    init() {
        // Check for modern browser support
        if (!this.checkBrowserCompatibility()) {
            this.showBrowserCompatibilityError();
            return;
        }
        
        this.setupPreviewFrame();
        this.setupEventListeners();
        this.render();
    }

    checkBrowserCompatibility() {
        // Check for Custom Elements support
        if (!window.customElements) {
            return false;
        }
        
        // Check for Shadow DOM support
        if (!Element.prototype.attachShadow) {
            return false;
        }
        
        // Check for ES6 features we use
        try {
            new Function('class Test {}')();
            new Function('const test = () => {}')();
        } catch (e) {
            return false;
        }
        
        return true;
    }

    showBrowserCompatibilityError() {
        const previewContainer = this.container.querySelector('.preview-frame');
        if (!previewContainer) return;

        previewContainer.innerHTML = `
            <div class="browser-error">
                <h3>❌ Browser Not Supported</h3>
                <p>This preview requires a modern web browser with support for:</p>
                <ul>
                    <li>Custom Elements (Web Components)</li>
                    <li>Shadow DOM</li>
                    <li>ES6 Classes and Arrow Functions</li>
                </ul>
                <p>Please update to a recent version of Chrome, Firefox, Safari, or Edge.</p>
            </div>
        `;
    }

    setupPreviewFrame() {
        const previewContainer = this.container.querySelector('.preview-frame');
        if (!previewContainer) return;

        // Create preview div instead of iframe to avoid security issues
        this.previewFrame = document.createElement('div');
        this.previewFrame.className = 'preview-container-div';
        this.previewFrame.style.width = '100%';
        this.previewFrame.style.height = '100%';
        this.previewFrame.style.backgroundColor = '#000000';
        this.previewFrame.style.position = 'relative';
        this.previewFrame.style.overflow = 'hidden';
        
        previewContainer.innerHTML = '';
        previewContainer.appendChild(this.previewFrame);
    }

    setupEventListeners() {
        // Preview control buttons
        const playBtn = this.container.querySelector('#play-preview');
        const stopBtn = this.container.querySelector('#stop-preview');

        if (playBtn) {
            playBtn.addEventListener('click', () => this.play());
        }

        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stop());
        }
        // No manual Update button: data-input edits update the preview live
        // (see renderDataInputs), and element edits update it via the
        // elementUpdated event.
    }

    render() {
        try {
            // Cancel any setup scheduled by a previous render so it cannot fire
            // against a stale frame after a fast template switch.
            if (this.setupTimeoutId) {
                clearTimeout(this.setupTimeoutId);
                this.setupTimeoutId = null;
            }

            const template = this.templateManager.getCurrentTemplate();
            if (!template) {
                this.teardownComponent();
                this.updateControlButtons();
                this.currentTemplate = null;
                this.renderEmptyState();
                return;
            }

            // When the selected template actually changes, drop the previous
            // template's preview data so its keys do not leak into the new one.
            // renderDataInputs repopulates from the new template's schema.
            const previousId = this.currentTemplate && this.currentTemplate.manifest.id;
            if (previousId !== template.manifest.id) {
                this.previewData = {};
            }

            // Tear down the previous template's component synchronously, before
            // scheduling setup, so play state and the old component never
            // straddle a template switch.
            this.teardownComponent();
            this.updateControlButtons();

            this.currentTemplate = template;
            this.renderDataInputs();

            // Add a small delay to ensure DOM is ready. Store the handle and
            // clear any previously scheduled setup so a fast template switch
            // (or select-then-play) cannot run setup against a stale template.
            if (this.setupTimeoutId) {
                clearTimeout(this.setupTimeoutId);
            }
            const scheduledForId = template.manifest.id;
            this.setupTimeoutId = setTimeout(() => {
                this.setupTimeoutId = null;
                // Bail if the selected template changed while we were waiting.
                if (!this.currentTemplate || this.currentTemplate.manifest.id !== scheduledForId) {
                    return;
                }
                this.setupPreviewDocument();
            }, 50);

        } catch (error) {
            this.showPreviewError('Failed to render preview');
        }
    }

    renderEmptyState() {
        if (this.previewFrame) {
            // Use the existing previewFrame instead of overwriting the container
            this.previewFrame.innerHTML = `
                <div class="preview-placeholder">
                    <p>Select a template to preview</p>
                </div>
            `;
        }
    }

    renderDataInputs() {
        const controlsContainer = this.container.querySelector('.preview-controls');
        if (!controlsContainer || !this.currentTemplate) return;

        // Create data inputs container if it doesn't exist
        let dataInputsContainer = this.container.querySelector('.preview-data-inputs');
        if (!dataInputsContainer) {
            dataInputsContainer = document.createElement('div');
            dataInputsContainer.className = 'preview-data-inputs';
            controlsContainer.insertAdjacentElement('afterend', dataInputsContainer);
        }

        const schema = this.currentTemplate.manifest.schema;
        if (!schema || !schema.properties) {
            dataInputsContainer.innerHTML = '<p>No data inputs available</p>';
            return;
        }

        // Initialize preview data with default values. Use a presence check so
        // falsy defaults (0, false, '') survive instead of collapsing to ''.
        Object.entries(schema.properties).forEach(([key, prop]) => {
            if (this.previewData[key] === undefined) {
                this.previewData[key] = (prop.default !== undefined && prop.default !== null)
                    ? prop.default
                    : '';
            }
        });


        // Build inputs via the DOM API rather than an innerHTML template string.
        // Operator-typed previewData and manifest title/default are untrusted text;
        // setting .textContent / .value / .placeholder / .dataset as properties
        // removes the attribute-injection vector an innerHTML template would allow.
        dataInputsContainer.innerHTML = '';

        Object.entries(schema.properties).forEach(([key, prop]) => {
            // Only fall back to the default when the key is truly absent, so a
            // falsy current value (0/false/'') is not silently replaced.
            let currentValue;
            if (this.previewData[key] !== undefined && this.previewData[key] !== null) {
                currentValue = this.previewData[key];
            } else if (prop.default !== undefined && prop.default !== null) {
                currentValue = prop.default;
            } else {
                currentValue = '';
            }

            const group = document.createElement('div');
            group.className = 'data-input-group';

            const label = document.createElement('label');
            label.textContent = `${prop.title || key}:`;

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'data-input';
            input.dataset.property = key;
            input.value = currentValue;
            input.placeholder = (prop.default !== undefined && prop.default !== null)
                ? prop.default
                : '';

            // Re-bind the change/input listener on the created input.
            input.addEventListener('input', (e) => {
                this.previewData[e.target.dataset.property] = e.target.value;
                this.updatePreviewData();
            });

            group.appendChild(label);
            group.appendChild(input);
            dataInputsContainer.appendChild(group);
        });
    }

    // Stop, dispose, and forget the current component, and reset playback
    // state. Called whenever the preview frame is rebuilt (template switch or
    // re-render), so the preview never keeps a previous template's component,
    // "Playing..." button, or play flag.
    teardownComponent() {
        // Cancel any pending setup so it cannot run against a torn-down frame.
        if (this.setupTimeoutId) {
            clearTimeout(this.setupTimeoutId);
            this.setupTimeoutId = null;
        }
        if (this.currentComponent) {
            try {
                if (this.isPlaying && typeof this.currentComponent.stopAction === 'function') {
                    this.currentComponent.stopAction({ skipAnimation: true });
                }
                if (typeof this.currentComponent.dispose === 'function') {
                    this.currentComponent.dispose({});
                }
            } catch (error) {
                // Ignore teardown errors; the component is being discarded.
            }
        }
        this.currentComponent = null;
        this.isPlaying = false;
        this.previewContentCreated = false;
    }

    setupPreviewDocument() {
        if (!this.previewFrame || !this.currentTemplate) return;

        try {
            // Tear down any component from the previous render before wiping the
            // frame, then reflect the stopped state in the controls.
            this.teardownComponent();
            this.updateControlButtons();

            // Clear previous content first
            this.previewFrame.innerHTML = '';
            
            // Create a scaled container for the graphics
            const scaledContainer = document.createElement('div');
            scaledContainer.style.width = '1920px';
            scaledContainer.style.height = '1080px';
            scaledContainer.style.transform = 'scale(0.5)';
            scaledContainer.style.transformOrigin = 'top left';
            scaledContainer.style.position = 'absolute';
            scaledContainer.style.top = '0';
            scaledContainer.style.left = '0';
            scaledContainer.style.backgroundColor = '#000000';
            scaledContainer.style.border = '1px solid #333333';
            

            // The component module is generated and imported in createPreviewComponent
            // when Play is pressed, so it always reflects the latest elements/styles.
            if (typeof this.currentTemplate.generateWebComponent !== 'function') {
                this.showWebComponentError('Template does not support web components',
                    new Error('generateWebComponent method not available'));
                return;
            }

            // Add to preview frame immediately (empty black container)
            this.previewFrame.appendChild(scaledContainer);
            
            // Store container reference for later use during play
            this.scaledContainer = scaledContainer;
            
            // Reset content creation flag
            this.previewContentCreated = false;
            
            // Don't create content yet - wait for play button
            
        } catch (error) {
            this.showPreviewError('Failed to load preview');
        }
    }

    // Load the exact ES module that export produces. We build a Blob from the
    // generated component code, import() it, take the default export (the
    // Graphic class), and register it under a unique tag per load so reloading
    // never hits "this name has already been used with this registry".
    async createPreviewComponent(container) {
        const template = this.currentTemplate;

        // Always regenerate to pick up the latest elements/styles.
        const componentCode = template.generateWebComponent();

        let blobUrl;
        let GraphicClass;
        try {
            const blob = new Blob([componentCode], { type: 'text/javascript' });
            blobUrl = URL.createObjectURL(blob);
            const module = await import(/* @vite-ignore */ blobUrl);
            GraphicClass = module.default;
        } catch (error) {
            this.showWebComponentError('Failed to load template module', error);
            return;
        } finally {
            if (blobUrl) {
                URL.revokeObjectURL(blobUrl);
            }
        }

        if (typeof GraphicClass !== 'function') {
            this.showWebComponentError('Template module has no default export',
                new Error('The generated module did not export a Graphic class as default'));
            return;
        }

        // Unique tag per load avoids re-definition errors on reload.
        PreviewEngine.componentCounter = (PreviewEngine.componentCounter || 0) + 1;
        const uniqueTag = `ograf-preview-${PreviewEngine.componentCounter}`;

        try {
            customElements.define(uniqueTag, GraphicClass);
        } catch (error) {
            this.showWebComponentError('Failed to register custom element', error);
            return;
        }

        const customElement = document.createElement(uniqueTag);
        customElement.id = 'graphic-component';
        customElement.style.position = 'absolute';
        customElement.style.top = '0';
        customElement.style.left = '0';
        customElement.style.width = '100%';
        customElement.style.height = '100%';
        customElement.style.zIndex = '10';

        container.appendChild(customElement);

        // Store reference for later use
        this.currentComponent = customElement;
    }

    showPreviewError(message) {
        const previewContainer = this.container.querySelector('.preview-frame');
        if (previewContainer) {
            previewContainer.innerHTML = `
                <div class="preview-placeholder">
                    <p style="color: #ff6b6b;">⚠️ ${message}</p>
                    <button id="retry-preview-btn" style="margin-top: 10px; padding: 5px 10px; background: #007acc; color: white; border: none; border-radius: 3px; cursor: pointer;">Retry</button>
                </div>
            `;
            
            // Setup retry button event listener
            const retryBtn = previewContainer.querySelector('#retry-preview-btn');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                    this.render();
                });
            }
        }
    }


    // Drive the OGraf load lifecycle: apply current preview data at load.
    async initializePreviewComponent() {
        if (!this.currentComponent) {
            this.showWebComponentError('No preview component found',
                new Error('currentComponent is not available'));
            return;
        }

        try {
            if (typeof this.currentComponent.load === 'function') {
                await this.currentComponent.load({
                    data: this.previewData,
                    renderType: 'realtime',
                    renderCharacteristics: {}
                });
            }
            // Loaded but not yet playing; elements only show on Play.
            this.currentComponent.isVisible = false;
        } catch (error) {
            this.showWebComponentError('Failed to initialize preview component', error);
        }
    }

    async createPreviewContent() {
        if (!this.scaledContainer || !this.currentTemplate) return;

        try {
            // Build, import, and register the exact module that export produces.
            await this.createPreviewComponent(this.scaledContainer);

            if (!this.currentComponent) {
                // createPreviewComponent already surfaced the error.
                return;
            }

            await this.initializePreviewComponent();
        } catch (error) {
            this.showWebComponentError('Failed to create web component preview', error);
        }
    }

    // Escape text before it is placed into innerHTML. An error's message/stack
    // can contain data-derived content (e.g. an interpolated value that broke a
    // generated module), so it is untrusted.
    escapeHtml(value) {
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

    showWebComponentError(message, error) {
        // Always log so the failure is observable even when there is no surface
        // to render it into.
        console.error('Web component error:', message, error);

        // No scaled container means there is nowhere to render the error (e.g.
        // setup has not built the frame yet); logging above is the fallback.
        if (!this.scaledContainer) return;

        const safeMessage = this.escapeHtml(error?.message || 'Unknown error');
        const safeStack = error?.stack ? `<pre>${this.escapeHtml(error.stack)}</pre>` : '';
        this.scaledContainer.innerHTML = `
            <div class="web-component-error">
                <h3>⚠️ Web Component Error</h3>
                <p>${this.escapeHtml(message)}</p>
                <details>
                    <summary>Error Details</summary>
                    <pre>${safeMessage}</pre>
                    ${safeStack}
                </details>
                <p>Please check your template code generation or try regenerating the template.</p>
            </div>
        `;
    }

    async play() {
        if (!this.previewFrame || !this.currentTemplate) return;

        try {
            // First time playing - create the preview content
            if (!this.previewContentCreated) {
                await this.createPreviewContent();
                this.previewContentCreated = true;
            }

            if (this.currentComponent && typeof this.currentComponent.playAction === 'function') {
                await this.currentComponent.playAction({});
                this.isPlaying = true;
                this.updateControlButtons();
            } else {
                this.showWebComponentError('Web component not properly initialized',
                    new Error('playAction method not available on component'));
            }
        } catch (error) {
            this.showWebComponentError('Failed to play preview', error);
        }
    }

    async stop() {
        if (!this.previewFrame || !this.currentTemplate) return;

        try {
            // Set playing state to false first
            this.isPlaying = false;
            this.updateControlButtons();

            // No component is a normal state (e.g. Stop before Play, or after a
            // template switch). Treat it as a silent no-op: state is already
            // reset above, so there is nothing to do and nothing to warn about.
            if (!this.currentComponent) {
                return;
            }

            if (typeof this.currentComponent.stopAction === 'function') {
                await this.currentComponent.stopAction({});
            } else {
                this.showWebComponentError('Web component not properly initialized',
                    new Error('stopAction method not available on component'));
            }

        } catch (error) {
            this.showWebComponentError('Failed to stop preview', error);
        }
    }

    async update() {
        if (!this.previewFrame || !this.currentTemplate) return;

        try {
            if (this.currentComponent && typeof this.currentComponent.updateAction === 'function') {
                await this.currentComponent.updateAction({ data: this.previewData });
            } else {
                this.showWebComponentError('Web component not properly initialized',
                    new Error('updateAction method not available on component'));
            }
        } catch (error) {
            this.showWebComponentError('Failed to update preview', error);
        }
    }

    async updatePreviewData() {
        if (!this.previewFrame || !this.currentTemplate) return;

        try {
            // Update the custom component
            if (this.currentComponent && typeof this.currentComponent.updateAction === 'function') {
                await this.currentComponent.updateAction({ data: this.previewData });
            }

        } catch (error) {
            this.showWebComponentError('Failed to update preview data', error);
        }
    }

    // Recreate the live preview from the latest template. The generated
    // component bakes elements/styles/timeline at generateWebComponent() time
    // and never reads animationSettings, so the only way to reflect an edit is
    // to rebuild the component. We always go through the recreate path; there is
    // no live-mutation shortcut.
    reloadComponent() {
        if (!this.currentTemplate) return;

        // Was the user watching the graphic when the edit landed? If so we must
        // rebuild and resume playback so the preview stays live.
        const wasPlaying = this.isPlaying;

        // Force recreation on next play and drop the current component.
        this.previewContentCreated = false;
        if (this.scaledContainer) {
            this.scaledContainer.innerHTML = '';
        }
        this.currentComponent = null;
        this.isPlaying = false;

        if (!wasPlaying) {
            // Not playing: leave it torn down; the next Play recreates content.
            this.updateControlButtons();
            return;
        }

        // Was playing: recreate the content and resume playback.
        this.createPreviewContent().then(async () => {
            this.previewContentCreated = true;
            if (this.currentComponent && typeof this.currentComponent.playAction === 'function') {
                this.isPlaying = true;
                this.updateControlButtons();
                await this.currentComponent.playAction({});
            } else {
                this.updateControlButtons();
            }
        }).catch((error) => {
            this.isPlaying = false;
            this.updateControlButtons();
            this.showWebComponentError('Failed to reload preview', error);
        });
    }


    updateControlButtons() {
        const playBtn = this.container.querySelector('#play-preview');
        const stopBtn = this.container.querySelector('#stop-preview');

        if (playBtn) {
            playBtn.disabled = this.isPlaying;
            playBtn.textContent = this.isPlaying ? 'Playing...' : 'Play';
        }

        if (stopBtn) {
            stopBtn.disabled = !this.isPlaying;
        }
    }

    refreshPreview() {
        this.render();
    }

    // Method to handle custom actions
    async executeCustomAction(actionName, data = {}) {
        if (!this.previewFrame || !this.currentTemplate) return;

        try {
            if (this.currentComponent && typeof this.currentComponent.customAction === 'function') {
                await this.currentComponent.customAction({ id: actionName, payload: data });
            }
        } catch (error) {
            // Error executing custom action
        }
    }

    // Method to get current preview state
    getPreviewState() {
        return {
            isPlaying: this.isPlaying,
            data: this.previewData,
            template: this.currentTemplate ? this.currentTemplate.manifest.id : null
        };
    }

    // Method to set preview data programmatically
    setPreviewData(data) {
        this.previewData = { ...this.previewData, ...data };
        
        // Update input fields
        const dataInputsContainer = this.container.querySelector('.preview-data-inputs');
        if (dataInputsContainer) {
            Object.entries(data).forEach(([key, value]) => {
                const input = dataInputsContainer.querySelector(`[data-property="${key}"]`);
                if (input) {
                    input.value = value;
                }
            });
        }
        
        this.updatePreviewData();
    }

    // Method to clear preview data
    clearPreviewData() {
        this.previewData = {};
        this.renderDataInputs();
        this.updatePreviewData();
    }

    // Method to export preview as image (basic implementation)
    async exportPreviewImage() {
        if (!this.previewFrame) return null;

        try {
            const canvas = document.createElement('canvas');
            canvas.width = 1920;
            canvas.height = 1080;
            
            const ctx = canvas.getContext('2d');
            
            // This is a simplified approach - in a real implementation,
            // you might use libraries like html2canvas or puppeteer for better rendering
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Add text indicating this is a preview export
            ctx.fillStyle = '#ffffff';
            ctx.font = '48px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('OGraf Preview Export', canvas.width / 2, canvas.height / 2);
            
            if (this.currentTemplate) {
                ctx.font = '24px Arial';
                ctx.fillText(this.currentTemplate.manifest.name, canvas.width / 2, canvas.height / 2 + 60);
            }
            
            return canvas.toDataURL('image/png');
        } catch (error) {
            return null;
        }
    }

    destroy() {
        // Cancel any pending setup before tearing down the frame.
        if (this.setupTimeoutId) {
            clearTimeout(this.setupTimeoutId);
            this.setupTimeoutId = null;
        }

        // Clean up event listeners and iframe
        if (this.previewFrame) {
            this.previewFrame.remove();
        }
    }
}