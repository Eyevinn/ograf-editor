// Wire Monaco's web workers (via Vite) before any Monaco code loads, so the
// language services don't throw "Unexpected usage".
import '../monaco-environment.js';
import { getSchemaValidator } from '../services/SchemaValidator.js';

export class CodeEditor {
    constructor(containerElement, templateManager) {
        this.container = containerElement;
        this.templateManager = templateManager;
        this.monaco = null;
        this.manifestEditor = null;
        this.componentEditor = null;
        this.currentTab = 'manifest';
        // True while we are programmatically setting the manifest editor value.
        // Monaco fires onDidChangeModelContent synchronously on setValue, which
        // would otherwise re-save the manifest and flash a success (or, for the
        // "select a template" placeholder, a false "Invalid JSON") message on
        // every template switch or tab open. Only genuine user edits should run
        // onManifestChange.
        this.suppressManifestChange = false;

        this.init();
    }

    async init() {
        this.setupTabs();
        await this.initializeMonaco();
        this.render();
    }

    setupTabs() {
        // this.container IS the #code-editor div
        const codeEditorDiv = this.container;

        // Clear existing content first
        codeEditorDiv.innerHTML = '';

        // Create tabs if they don't exist
        let tabsContainer = codeEditorDiv.querySelector('.code-editor-tabs');
        if (!tabsContainer) {
            tabsContainer = document.createElement('div');
            tabsContainer.className = 'code-editor-tabs';
            tabsContainer.innerHTML = `
                <button class="code-tab-btn active" data-tab="manifest">Manifest</button>
                <button class="code-tab-btn" data-tab="component">Component</button>
                <span class="manifest-validity-badge" data-state="unknown" title="OGraf schema validation status">No template</span>
            `;
            codeEditorDiv.appendChild(tabsContainer);
        }

        // Create content container
        let contentContainer = codeEditorDiv.querySelector('.code-content');
        if (!contentContainer) {
            contentContainer = document.createElement('div');
            contentContainer.className = 'code-content';
            contentContainer.innerHTML = `
                <div class="code-tab-content active" data-tab="manifest">
                    <div id="manifest-editor"></div>
                </div>
                <div class="code-tab-content" data-tab="component">
                    <div id="component-editor"></div>
                </div>
            `;
            codeEditorDiv.appendChild(contentContainer);
        }

        // Setup tab event listeners
        tabsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('code-tab-btn')) {
                this.switchTab(e.target.dataset.tab);
            }
        });
    }

    async initializeMonaco() {
        try {
            // Import Monaco Editor
            const monaco = await import('monaco-editor');
            this.monaco = monaco;
            
            // Set up Monaco Editor
            this.setupMonacoEditors();
        } catch (error) {
            console.warn('Failed to load Monaco Editor, falling back to simple editor:', error);
            this.setupSimpleEditor();
        }
    }

    setupMonacoEditors() {
        // Wait a bit to ensure DOM is fully created
        setTimeout(() => {
            const manifestContainer = document.querySelector('#manifest-editor');
            const componentContainer = document.querySelector('#component-editor');
            
            if (!manifestContainer || !componentContainer) {
                console.warn('Monaco editor containers not found, falling back to simple editor');
                this.setupSimpleEditor();
                return;
            }
            
            this.createMonacoEditors(manifestContainer, componentContainer);
        }, 100);
    }

    createMonacoEditors(manifestContainer, componentContainer) {
        if (manifestContainer && this.monaco) {
            // Clear container
            manifestContainer.innerHTML = '';
            
            // Create Monaco Editor for manifest
            this.manifestEditor = this.monaco.editor.create(manifestContainer, {
                value: '{\n  "loading": "template..."\n}',
                language: 'json',
                theme: 'vs-dark',
                automaticLayout: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on'
            });
            
            // Listen for changes
            this.manifestEditor.onDidChangeModelContent(() => {
                this.onManifestChange();
            });
        }

        if (componentContainer && this.monaco) {
            // Clear container  
            componentContainer.innerHTML = '';
            
            // Create Monaco Editor for component
            this.componentEditor = this.monaco.editor.create(componentContainer, {
                value: '// Component code will appear here...',
                language: 'javascript',
                theme: 'vs-dark',
                automaticLayout: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                readOnly: true
            });
        }
    }

    setupSimpleEditor() {
        // Simple textarea-based editor as fallback
        const manifestContainer = this.container.querySelector('#manifest-editor');
        const componentContainer = this.container.querySelector('#component-editor');

        if (manifestContainer) {
            manifestContainer.innerHTML = `
                <textarea class="simple-code-editor" id="manifest-textarea" placeholder="Template manifest JSON will appear here..."></textarea>
            `;
            this.manifestEditor = manifestContainer.querySelector('textarea');
            this.manifestEditor.addEventListener('input', () => this.onManifestChange());
        }

        if (componentContainer) {
            componentContainer.innerHTML = `
                <textarea class="simple-code-editor" id="component-textarea" placeholder="Web component code will appear here..."></textarea>
            `;
            this.componentEditor = componentContainer.querySelector('textarea');
            this.componentEditor.addEventListener('input', () => this.onComponentChange());
        }
    }

    switchTab(tabName) {
        this.currentTab = tabName;

        // Update tab buttons
        this.container.querySelectorAll('.code-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update content
        this.container.querySelectorAll('.code-tab-content').forEach(content => {
            content.classList.toggle('active', content.dataset.tab === tabName);
        });

        // Update editor content
        this.updateEditorContent();
    }

    render() {
        this.updateEditorContent();
    }

    updateEditorContent() {
        const template = this.templateManager.getCurrentTemplate();
        if (!template) {
            this.clearEditors();
            return;
        }

        if (this.currentTab === 'manifest') {
            this.updateManifestEditor(template);
        } else if (this.currentTab === 'component') {
            this.updateComponentEditor(template);
        }
    }

    updateManifestEditor(template) {
        if (this.manifestEditor) {
            const manifestJson = JSON.stringify(template.manifest, null, 2);
            
            if (this.monaco && this.manifestEditor.setValue) {
                // Monaco Editor. Suppress the change handler for this
                // programmatic update so it does not re-save and toast.
                this.suppressManifestChange = true;
                this.manifestEditor.setValue(manifestJson);
                this.suppressManifestChange = false;
            } else {
                // Simple textarea
                this.manifestEditor.value = manifestJson;
            }
            // Refresh the persistent badge for the freshly loaded manifest.
            this.updateValidationBadge(this.getManifestValidation());
        }
    }

    updateComponentEditor(template) {
        if (this.componentEditor) {
            // Generate component if not exists
            if (!template.webComponent) {
                template.generateWebComponent();
            }
            
            const componentCode = template.webComponent || '// Component code will be generated here';
            
            if (this.monaco && this.componentEditor.setValue) {
                // Monaco Editor
                this.componentEditor.setValue(componentCode);
            } else {
                // Simple textarea
                this.componentEditor.value = componentCode;
            }
        }
    }

    clearEditors() {
        const manifestMessage = '// Select a template to view its manifest';
        const componentMessage = '// Select a template to view its component code';
        
        if (this.manifestEditor) {
            if (this.monaco && this.manifestEditor.setValue) {
                // Placeholder text is not valid JSON; suppress the change
                // handler so it does not flash a false "Invalid JSON" error.
                this.suppressManifestChange = true;
                this.manifestEditor.setValue(manifestMessage);
                this.suppressManifestChange = false;
            } else {
                this.manifestEditor.value = manifestMessage;
            }
        }
        
        if (this.componentEditor) {
            if (this.monaco && this.componentEditor.setValue) {
                this.componentEditor.setValue(componentMessage);
            } else {
                this.componentEditor.value = componentMessage;
            }
        }

        // No template selected: reset the badge to its neutral state.
        this.updateValidationBadge(null);
    }

    onManifestChange() {
        if (!this.manifestEditor) return;
        // Ignore changes we triggered ourselves via setValue.
        if (this.suppressManifestChange) return;

        try {
            // Get value from either Monaco or textarea
            const manifestJson = this.monaco && this.manifestEditor.getValue 
                ? this.manifestEditor.getValue() 
                : this.manifestEditor.value;
            const manifest = JSON.parse(manifestJson);
            
            const template = this.templateManager.getCurrentTemplate();
            if (template) {
                template.manifest = manifest;
                this.templateManager.saveToStorage();
                // The persistent badge is the honest signal; refresh it on every
                // edit. The transient toast stays for quick confirmation.
                this.updateValidationBadge(this.getManifestValidation());
                this.showValidationMessage('Manifest updated successfully', 'success');
            }
        } catch (error) {
            this.updateValidationBadge({ parseError: error.message });
            this.showValidationMessage(`Invalid JSON: ${error.message}`, 'error');
        }
    }

    onComponentChange() {
        if (!this.componentEditor) return;

        const template = this.templateManager.getCurrentTemplate();
        if (template) {
            template.webComponent = this.componentEditor.value;
            this.templateManager.saveToStorage();
            this.showValidationMessage('Component code updated', 'success');
        }
    }

    showValidationMessage(message, type) {
        // Remove existing messages
        const existingMessage = this.container.querySelector('.validation-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // Create new message
        const messageDiv = document.createElement('div');
        messageDiv.className = `validation-message ${type}-message`;
        messageDiv.textContent = message;
        
        // Insert message
        const activeTab = this.container.querySelector('.code-tab-content.active');
        if (activeTab) {
            activeTab.insertBefore(messageDiv, activeTab.firstChild);
            
            // Auto-remove after 3 seconds
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.remove();
                }
            }, 3000);
        }
    }

    formatCode() {
        if (this.currentTab === 'manifest' && this.manifestEditor) {
            try {
                const manifest = JSON.parse(this.manifestEditor.value);
                this.manifestEditor.value = JSON.stringify(manifest, null, 2);
                this.showValidationMessage('Code formatted', 'success');
            } catch (error) {
                this.showValidationMessage('Cannot format invalid JSON', 'error');
            }
        }
    }

    // Read the current manifest editor text and validate it against the OGraf
    // schema. Returns null when there is no template / the text is not JSON yet,
    // otherwise the SchemaValidator result plus a parse flag.
    getManifestValidation() {
        const template = this.templateManager.getCurrentTemplate();
        if (!template) return null;
        if (!this.manifestEditor) return null;

        const manifestJson = this.monaco && this.manifestEditor.getValue
            ? this.manifestEditor.getValue()
            : this.manifestEditor.value;

        let manifest;
        try {
            manifest = JSON.parse(manifestJson);
        } catch (error) {
            return { parseError: error.message };
        }

        const componentSource = this.monaco && this.componentEditor && this.componentEditor.getValue
            ? this.componentEditor.getValue()
            : (template.webComponent || (this.componentEditor && this.componentEditor.value) || '');

        const result = getSchemaValidator().validateManifest(manifest, {
            componentSource
        });
        return { ...result, parseError: null };
    }

    // The persistent, honest valid/invalid badge in the editor tab bar. The
    // schema result is the source of truth; warnings do not flip it to invalid.
    updateValidationBadge(validation) {
        const badge = this.container.querySelector('.manifest-validity-badge');
        if (!badge) return;

        if (!validation) {
            badge.dataset.state = 'unknown';
            badge.textContent = 'No template';
            badge.title = 'Select a template to validate its manifest';
            return;
        }
        if (validation.parseError) {
            badge.dataset.state = 'invalid';
            badge.textContent = 'Invalid JSON';
            badge.title = validation.parseError;
            return;
        }
        if (!validation.valid) {
            const count = validation.errors.length;
            badge.dataset.state = 'invalid';
            badge.textContent = `${count} schema ${count === 1 ? 'error' : 'errors'}`;
            badge.title = validation.errors.map((e) => (e.path ? `${e.path}: ${e.message}` : e.message)).join('\n');
            return;
        }
        const warnCount = validation.warnings.length;
        if (warnCount > 0) {
            badge.dataset.state = 'warning';
            badge.textContent = `Valid, ${warnCount} ${warnCount === 1 ? 'warning' : 'warnings'}`;
            badge.title = validation.warnings.map((w) => (w.path ? `${w.path}: ${w.message}` : w.message)).join('\n');
            return;
        }
        badge.dataset.state = 'valid';
        badge.textContent = 'Valid OGraf';
        badge.title = 'Manifest is valid against the EBU OGraf v1 schema';
    }

    validateCode() {
        const validation = this.getManifestValidation();
        this.updateValidationBadge(validation);

        if (!validation) {
            this.showValidationMessage('Select a template to validate', 'warning');
            return false;
        }
        if (validation.parseError) {
            this.showValidationMessage(`Invalid JSON: ${validation.parseError}`, 'error');
            return false;
        }
        if (!validation.valid) {
            const detail = validation.errors
                .map((e) => (e.path ? `${e.path}: ${e.message}` : e.message))
                .join('; ');
            this.showValidationMessage(`Schema errors: ${detail}`, 'error');
            return false;
        }
        if (validation.warnings.length > 0) {
            const detail = validation.warnings
                .map((w) => (w.path ? `${w.path}: ${w.message}` : w.message))
                .join('; ');
            this.showValidationMessage(`Valid, with warnings: ${detail}`, 'warning');
            return true;
        }
        this.showValidationMessage('Manifest is valid against the OGraf schema', 'success');
        return true;
    }

    insertSnippet(snippetName) {
        const snippets = {
            'basic-element': `{
    "id": "element_${Date.now()}",
    "type": "text",
    "x": 100,
    "y": 100,
    "width": 200,
    "height": 50,
    "content": "New Element",
    "style": {
        "fontSize": "20px",
        "color": "#ffffff"
    }
}`,
            'schema-property': `"newProperty": {
    "type": "string",
    "title": "New Property",
    "default": "Default Value"
}`,
            'component-method': `async customAction(action, data) {
    switch (action) {
        case 'fadeIn':
            // Implement fade in animation
            break;
        case 'slideUp':
            // Implement slide up animation
            break;
        default:
    }
    return Promise.resolve();
}`
        };

        const snippet = snippets[snippetName];
        if (!snippet) return;

        const activeEditor = this.currentTab === 'manifest' ? this.manifestEditor : this.componentEditor;
        if (activeEditor) {
            const cursorPos = activeEditor.selectionStart;
            const textBefore = activeEditor.value.substring(0, cursorPos);
            const textAfter = activeEditor.value.substring(activeEditor.selectionEnd);
            
            activeEditor.value = textBefore + snippet + textAfter;
            activeEditor.selectionStart = activeEditor.selectionEnd = cursorPos + snippet.length;
            activeEditor.focus();
        }
    }

    exportCode() {
        const template = this.templateManager.getCurrentTemplate();
        if (!template) return;

        let content = '';
        let filename = '';

        if (this.currentTab === 'manifest') {
            content = JSON.stringify(template.manifest, null, 2);
            filename = `${template.manifest.id}.ograf.json`;
        } else if (this.currentTab === 'component') {
            content = template.webComponent || '';
            filename = template.manifest.main || `${template.manifest.id}.mjs`;
        }

        if (content) {
            const blob = new Blob([content], { 
                type: this.currentTab === 'manifest' ? 'application/json' : 'text/javascript' 
            });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    }

    getCurrentTabContent() {
        const activeEditor = this.currentTab === 'manifest' ? this.manifestEditor : this.componentEditor;
        return activeEditor ? activeEditor.value : '';
    }

    setCurrentTabContent(content) {
        const activeEditor = this.currentTab === 'manifest' ? this.manifestEditor : this.componentEditor;
        if (activeEditor) {
            activeEditor.value = content;
            
            // Trigger change event
            if (this.currentTab === 'manifest') {
                this.onManifestChange();
            } else {
                this.onComponentChange();
            }
        }
    }

    destroy() {
        // Clean up editors if using Monaco
        if (this.manifestEditor && this.manifestEditor.dispose) {
            this.manifestEditor.dispose();
        }
        if (this.componentEditor && this.componentEditor.dispose) {
            this.componentEditor.dispose();
        }
    }
}