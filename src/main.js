import { TemplateManager } from './services/TemplateManager.js';
import { ExportImportService } from './services/ExportImportService.js';
import { VisualEditor } from './components/VisualEditor.js';
import { PropertyPanel } from './components/PropertyPanel.js';
import { PreviewEngine } from './components/PreviewEngine.js';
import { CodeEditor } from './components/CodeEditor.js';
import { escapeHtml } from './utils/escapeHtml.js';

class OGrafEditor {
    constructor() {
        this.templateManager = new TemplateManager();
        this.exportImportService = new ExportImportService(this.templateManager);
        this.currentView = 'visual';
        
        this.init();
    }

    init() {
        this.initializeComponents();
        this.setupEventListeners();
        this.loadInitialState();
    }

    initializeComponents() {
        // Initialize Visual Editor
        const visualEditorContainer = document.querySelector('#visual-editor');
        if (visualEditorContainer) {
            this.visualEditor = new VisualEditor(visualEditorContainer, this.templateManager);
        }

        // Initialize Property Panel
        const propertiesContainer = document.querySelector('.properties-content');
        if (propertiesContainer && this.visualEditor) {
            this.propertyPanel = new PropertyPanel(propertiesContainer, this.visualEditor, this.templateManager);
        }

        // Initialize Preview Engine
        const previewContainer = document.querySelector('#preview-editor');
        if (previewContainer) {
            this.previewEngine = new PreviewEngine(previewContainer, this.templateManager);
            
            // Connect PropertyPanel to PreviewEngine for animation updates
            if (this.propertyPanel) {
                this.propertyPanel.setPreviewEngine(this.previewEngine);
            }
        }

        // Initialize Code Editor
        const codeEditorContainer = document.querySelector('#code-editor');
        if (codeEditorContainer) {
            this.codeEditor = new CodeEditor(codeEditorContainer, this.templateManager);
        }

        // Setup cross-component communication
        this.setupComponentListeners();
    }

    setupEventListeners() {
        this.setupHeaderActions();
        this.setupTabSwitching();
        this.setupModalEvents();
        this.setupTemplateList();
        this.setupToolbar();
        this.setupSidebarResizer();
        this.setupPanelResizer();
    }

    // Draggable divider between the Templates and Properties panels so the user
    // can give either one more room. Sets the templates panel height; the
    // properties panel takes the rest. Remembered across sessions.
    setupPanelResizer() {
        const sidebar = document.querySelector('.sidebar');
        const panel = document.querySelector('.sidebar .template-list');
        const resizer = document.querySelector('.panel-resizer');
        if (!sidebar || !panel || !resizer) return;

        const MIN = 120;
        const STORAGE_KEY = 'ograf-templates-panel-height';
        const maxHeight = () => Math.max(MIN, sidebar.clientHeight - 160);
        const clamp = (h) => Math.max(MIN, Math.min(maxHeight(), h));

        const applyHeight = (h, persist) => {
            const height = clamp(h);
            panel.style.flex = `0 0 ${height}px`;
            panel.style.maxHeight = 'none';
            resizer.setAttribute('aria-valuenow', String(height));
            if (persist) {
                try { localStorage.setItem(STORAGE_KEY, String(height)); } catch (e) { /* ignore */ }
            }
        };

        const saved = (() => {
            try { return parseInt(localStorage.getItem(STORAGE_KEY), 10); } catch (e) { return NaN; }
        })();
        if (Number.isFinite(saved)) applyHeight(saved, false);

        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const startY = e.clientY;
            const startHeight = panel.offsetHeight;
            resizer.classList.add('dragging');
            document.body.classList.add('panel-resizing');

            const onMove = (moveEvent) => applyHeight(startHeight + (moveEvent.clientY - startY), false);
            const onUp = () => {
                resizer.classList.remove('dragging');
                document.body.classList.remove('panel-resizing');
                applyHeight(panel.offsetHeight, true);
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        resizer.addEventListener('keydown', (e) => {
            const step = 20;
            if (e.key === 'ArrowUp') {
                applyHeight(panel.offsetHeight - step, true);
                e.preventDefault();
            } else if (e.key === 'ArrowDown') {
                applyHeight(panel.offsetHeight + step, true);
                e.preventDefault();
            }
        });
    }

    // Let the user widen the sidebar by dragging the divider (or arrow keys when
    // focused), since the Data Inputs panel needs more room than the default
    // 300px. The chosen width is remembered across sessions.
    setupSidebarResizer() {
        const sidebar = document.querySelector('.sidebar');
        const resizer = document.querySelector('.sidebar-resizer');
        if (!sidebar || !resizer) return;

        const MIN = 260;
        const MAX = 640;
        const STORAGE_KEY = 'ograf-sidebar-width';
        const clamp = (w) => Math.max(MIN, Math.min(MAX, w));

        const applyWidth = (w, persist) => {
            const width = clamp(w);
            sidebar.style.width = `${width}px`;
            resizer.setAttribute('aria-valuenow', String(width));
            if (persist) {
                try { localStorage.setItem(STORAGE_KEY, String(width)); } catch (e) { /* ignore */ }
            }
        };

        resizer.setAttribute('aria-valuemin', String(MIN));
        resizer.setAttribute('aria-valuemax', String(MAX));
        const saved = (() => {
            try { return parseInt(localStorage.getItem(STORAGE_KEY), 10); } catch (e) { return NaN; }
        })();
        applyWidth(Number.isFinite(saved) ? saved : sidebar.offsetWidth, false);

        // Drag with the mouse.
        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = sidebar.offsetWidth;
            resizer.classList.add('dragging');
            document.body.classList.add('sidebar-resizing');

            const onMove = (moveEvent) => applyWidth(startWidth + (moveEvent.clientX - startX), false);
            const onUp = () => {
                resizer.classList.remove('dragging');
                document.body.classList.remove('sidebar-resizing');
                applyWidth(sidebar.offsetWidth, true);
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        // Keyboard adjustment when the divider is focused.
        resizer.addEventListener('keydown', (e) => {
            const step = 20;
            if (e.key === 'ArrowLeft') {
                applyWidth(sidebar.offsetWidth - step, true);
                e.preventDefault();
            } else if (e.key === 'ArrowRight') {
                applyWidth(sidebar.offsetWidth + step, true);
                e.preventDefault();
            }
        });
    }

    setupHeaderActions() {
        // New Template
        const newTemplateBtn = document.querySelector('#new-template');
        if (newTemplateBtn) {
            newTemplateBtn.addEventListener('click', () => this.showNewTemplateModal());
        }

        const createFirstTemplateBtn = document.querySelector('#create-first-template');
        if (createFirstTemplateBtn) {
            createFirstTemplateBtn.addEventListener('click', () => this.showNewTemplateModal());
        }

        // Import Template
        const importBtn = document.querySelector('#import-template');
        if (importBtn) {
            importBtn.addEventListener('click', () => this.showImportDialog());
        }

        // Export Template
        const exportBtn = document.querySelector('#export-template');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportCurrentTemplate());
        }
    }

    setupTabSwitching() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchView(e.target.dataset.tab);
            });
        });
    }

    setupModalEvents() {
        const modal = document.querySelector('#template-modal');
        const closeBtn = modal?.querySelector('.modal-close');
        const cancelBtn = modal?.querySelector('#cancel-template');
        const createBtn = modal?.querySelector('#create-template');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideNewTemplateModal());
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.hideNewTemplateModal());
        }

        if (createBtn) {
            createBtn.addEventListener('click', () => this.createNewTemplate());
        }

        // Close modal on background click
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideNewTemplateModal();
                }
            });
        }
    }

    setupTemplateList() {
        // Bind the list's click handler ONCE via delegation. updateTemplateList
        // only rewrites innerHTML, so re-binding per render (previously every
        // second via setInterval) stacked duplicate listeners and made a single
        // click run dozens of selectTemplate/refresh cycles, locking up the UI.
        const listContainer = document.querySelector('#template-list');
        if (listContainer) {
            listContainer.addEventListener('click', (e) => {
                // Empty-state "Create Your First Template" button.
                if (e.target.closest('#create-first-template')) {
                    this.showNewTemplateModal();
                    return;
                }
                // Delete action.
                if (e.target.classList.contains('delete-btn')) {
                    const item = e.target.closest('.template-item');
                    if (item) this.deleteTemplate(item.dataset.templateId);
                    return;
                }
                // Select a template.
                const templateItem = e.target.closest('.template-item');
                if (templateItem && !e.target.classList.contains('template-action-btn')) {
                    this.selectTemplate(templateItem.dataset.templateId);
                }
            });
        }

        // Templates change only via create/select/delete/import, each of which
        // refreshes the list explicitly, so no polling is needed.
        this.updateTemplateList();
    }

    setupToolbar() {
        // Element toolbar buttons
        const toolButtons = document.querySelectorAll('.tool-btn');
        toolButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const elementType = e.target.dataset.element || e.target.parentElement.dataset.element;
                if (elementType && this.visualEditor) {
                    this.visualEditor.addElement(elementType);
                }
            });
        });
    }

    setupComponentListeners() {
        const visualEditorContainer = document.querySelector('#visual-editor');
        if (!visualEditorContainer) return;

        // Listen for element updates from visual editor to refresh preview
        if (this.previewEngine) {
            visualEditorContainer.addEventListener('elementUpdated', () => {
                // Update preview if it's currently visible or active
                if (this.currentView === 'preview' || this.previewEngine.isPlaying) {
                    this.previewEngine.update();
                }
            });
        }

        // Refresh the sidebar list when the template name or description is
        // edited in the property panel (the list shows both).
        visualEditorContainer.addEventListener('templateMetaUpdated', () => {
            this.updateTemplateList();
        });
    }

    switchView(viewName) {
        this.currentView = viewName;

        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === viewName);
        });

        // Update editor tabs
        document.querySelectorAll('.editor-tab').forEach(tab => {
            tab.classList.toggle('active', tab.id === `${viewName}-editor`);
        });

        // Update components based on view
        if (viewName === 'visual' && this.visualEditor) {
            this.visualEditor.render();
        } else if (viewName === 'code' && this.codeEditor) {
            this.codeEditor.render();
        } else if (viewName === 'preview' && this.previewEngine) {
            this.previewEngine.render();
        }
    }

    showNewTemplateModal() {
        const modal = document.querySelector('#template-modal');
        if (modal) {
            modal.classList.remove('hidden');
            
            // Clear form
            const form = modal.querySelector('#template-form');
            if (form) {
                form.reset();
            }
        }
    }

    hideNewTemplateModal() {
        const modal = document.querySelector('#template-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    createNewTemplate() {
        const form = document.querySelector('#template-form');
        if (!form) return;

        const formData = new FormData(form);
        const id = formData.get('id');
        const name = formData.get('name');
        const description = formData.get('description');
        const type = formData.get('type');

        if (!id || !name) {
            alert('Please fill in all required fields');
            return;
        }

        try {
            const template = this.templateManager.createTemplate(type, id, name, description);
            this.hideNewTemplateModal();
            this.updateTemplateList();
            // Select by the template's actual (slugified) id, not the raw form
            // input. createTemplate slugifies the id (e.g. "My Title" ->
            // "my-title"), so selecting by the raw id misses the Map key,
            // setCurrentTemplate fails, and the editor views never refresh to
            // show the new template until it is clicked manually.
            this.selectTemplate(template.manifest.id);
            this.showSuccessMessage(`Template "${name}" created successfully`);
        } catch (error) {
            alert(`Error creating template: ${error.message}`);
        }
    }

    updateTemplateList() {
        const listContainer = document.querySelector('#template-list');
        if (!listContainer) return;

        const templates = this.templateManager.getAllTemplates();
        const currentTemplate = this.templateManager.getCurrentTemplate();

        if (templates.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <p>No templates created yet</p>
                    <button id="create-first-template" class="btn btn-primary">Create Your First Template</button>
                </div>
            `;
        } else {
            const templateItems = templates.map(template => {
                const isActive = currentTemplate && currentTemplate.manifest.id === template.manifest.id;
                // manifest fields can come from an imported file, so escape every
                // one before it lands in this innerHTML (both attribute and text).
                const safeId = escapeHtml(template.manifest.id);
                const safeName = escapeHtml(template.manifest.name);
                const safeDescription = escapeHtml(template.manifest.description || 'No description');
                return `
                    <div class="template-item ${isActive ? 'active' : ''}" data-template-id="${safeId}">
                        <div class="template-item-actions">
                            <button class="template-action-btn delete-btn" title="Delete">🗑️</button>
                        </div>
                        <h4>${safeName}</h4>
                        <p>${safeDescription}</p>
                        <div class="template-meta">
                            ID: ${safeId} | Elements: ${template.elements?.length || 0}
                        </div>
                    </div>
                `;
            }).join('');

            listContainer.innerHTML = `<div class="template-list-container">${templateItems}</div>`;
            // Click handling is delegated once in setupTemplateList.
        }
    }

    selectTemplate(templateId) {
        if (this.templateManager.setCurrentTemplate(templateId)) {
            this.updateTemplateList();
            this.refreshAllViews();
        }
    }

    deleteTemplate(templateId) {
        const template = this.templateManager.getTemplate(templateId);
        if (!template) return;

        if (confirm(`Are you sure you want to delete "${template.manifest.name}"?`)) {
            this.templateManager.deleteTemplate(templateId);
            this.updateTemplateList();
            this.refreshAllViews();
            this.showSuccessMessage('Template deleted');
        }
    }

    refreshAllViews() {
        if (this.visualEditor) {
            this.visualEditor.render();
        }
        if (this.propertyPanel) {
            this.propertyPanel.render();
        }
        if (this.previewEngine) {
            this.previewEngine.render();
        }
        if (this.codeEditor) {
            this.codeEditor.render();
        }
    }

    showImportDialog() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.display = 'none';
        
        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const template = await this.exportImportService.importTemplate(file);
                this.updateTemplateList();
                this.selectTemplate(template.manifest.id);
                this.showSuccessMessage(`Template "${template.manifest.name}" imported successfully`);
            } catch (error) {
                alert(`Import failed: ${error.message}`);
            }
        });

        document.body.appendChild(input);
        input.click();
        document.body.removeChild(input);
    }

    async exportCurrentTemplate() {
        const currentTemplate = this.templateManager.getCurrentTemplate();
        if (!currentTemplate) {
            alert('No template selected for export');
            return;
        }

        try {
            await this.exportImportService.exportTemplate(currentTemplate.manifest.id, 'json');
            this.showSuccessMessage('Template exported successfully');
        } catch (error) {
            alert(`Export failed: ${error.message}`);
        }
    }

    loadInitialState() {
        // Load the last selected template if any
        this.updateTemplateList();
        this.refreshAllViews();
        
        // Clean up any existing templates that might have old component code
        this.cleanupLegacyTemplates();
        
        // Default to visual editor
        this.switchView('visual');
    }

    cleanupLegacyTemplates() {
        // Fix any templates that might have old export statements or missing methods
        const templates = this.templateManager.getAllTemplates();
        let needsSave = false;
        
        templates.forEach(template => {
            const needsRegeneration = template.webComponent && (
                template.webComponent.includes('export default') ||
                template.webComponent.includes('this.generateElementStyles()') ||
                !template.webComponent.includes('this.elements =')
            );
            
            if (needsRegeneration) {
                template.webComponent = null; // Force regeneration
                template.generateWebComponent();
                needsSave = true;
            }
        });
        
        if (needsSave) {
            this.templateManager.saveToStorage();
        }
    }

    showSuccessMessage(message) {
        // Create and show a temporary success message
        const messageDiv = document.createElement('div');
        messageDiv.className = 'success-message';
        messageDiv.textContent = message;
        messageDiv.style.position = 'fixed';
        messageDiv.style.top = '20px';
        messageDiv.style.right = '20px';
        messageDiv.style.zIndex = '2000';
        messageDiv.style.padding = '10px 20px';
        messageDiv.style.backgroundColor = '#28a745';
        messageDiv.style.color = 'white';
        messageDiv.style.borderRadius = '4px';
        messageDiv.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';

        document.body.appendChild(messageDiv);

        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.remove();
            }
        }, 3000);
    }

    showErrorMessage(message) {
        // Create and show a temporary error message
        const messageDiv = document.createElement('div');
        messageDiv.className = 'error-message';
        messageDiv.textContent = message;
        messageDiv.style.position = 'fixed';
        messageDiv.style.top = '20px';
        messageDiv.style.right = '20px';
        messageDiv.style.zIndex = '2000';
        messageDiv.style.padding = '10px 20px';
        messageDiv.style.backgroundColor = '#dc3545';
        messageDiv.style.color = 'white';
        messageDiv.style.borderRadius = '4px';
        messageDiv.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';

        document.body.appendChild(messageDiv);

        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.remove();
            }
        }, 3000);
    }

    // Keyboard shortcuts
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + S: Save (export)
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.exportCurrentTemplate();
            }

            // Ctrl/Cmd + O: Open (import)
            if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
                e.preventDefault();
                this.showImportDialog();
            }

            // Ctrl/Cmd + N: New template
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                this.showNewTemplateModal();
            }

            // Tab switching: 1, 2, 3
            if (e.key === '1' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    this.switchView('visual');
                }
            }
            if (e.key === '2' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    this.switchView('code');
                }
            }
            if (e.key === '3' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    this.switchView('preview');
                }
            }
        });
    }

    destroy() {
        // Clean up all components
        if (this.visualEditor) {
            this.visualEditor.destroy();
        }
        if (this.codeEditor) {
            this.codeEditor.destroy();
        }
        if (this.previewEngine) {
            this.previewEngine.destroy();
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.ografEditor = new OGrafEditor();
    
    // Setup keyboard shortcuts
    window.ografEditor.setupKeyboardShortcuts();
    
});

// Add additional CSS for simple code editor
const additionalStyles = `
.simple-code-editor {
    width: 100%;
    height: 100%;
    min-height: 400px;
    padding: 15px;
    border: none;
    background-color: #1e1e1e;
    color: #e0e0e0;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 14px;
    line-height: 1.5;
    resize: none;
    outline: none;
    white-space: pre;
    overflow-wrap: normal;
    overflow-x: auto;
}

.simple-code-editor::placeholder {
    color: #666;
}

.validation-message {
    padding: 8px 12px;
    margin: 10px;
    border-radius: 4px;
    font-size: 0.8rem;
    border-left: 4px solid;
}

.error-message {
    background-color: #2d1b1b;
    color: #ffcdd2;
    border-left-color: #f44336;
}

.success-message {
    background-color: #1b2d1b;
    color: #c8e6c9;
    border-left-color: #4caf50;
}

.warning-message {
    background-color: #2d2a1b;
    color: #fff3cd;
    border-left-color: #ff9800;
}
`;

// Inject additional styles
const styleElement = document.createElement('style');
styleElement.textContent = additionalStyles;
document.head.appendChild(styleElement);