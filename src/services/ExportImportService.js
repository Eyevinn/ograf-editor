import { saveAs } from 'file-saver';
import { OGrafTemplate } from '../models/OGrafTemplate.js';
import { createZip, readZip } from '../utils/zip.js';

export class ExportImportService {
    constructor(templateManager) {
        this.templateManager = templateManager;
    }

    /**
     * Export a template as OGraf-compatible files
     */
    async exportTemplate(templateId, format = 'zip') {
        const template = this.templateManager.getTemplate(templateId);
        if (!template) {
            throw new Error(`Template with id "${templateId}" not found`);
        }

        try {
            const files = this.templateManager.exportTemplate(templateId);
            
            switch (format) {
                case 'zip':
                    return await this.exportAsZip(files, templateId);
                case 'json':
                    return this.exportAsJSON(template);
                case 'folder':
                    return this.downloadFiles(files);
                default:
                    throw new Error(`Unsupported export format: ${format}`);
            }
        } catch (error) {
            throw new Error(`Export failed: ${error.message}`);
        }
    }

    /**
     * Export the OGraf Graphic as a single .zip bundle containing the spec files
     * (the <id>.ograf.json manifest and the .mjs component). `files` is the
     * { filename: content } map from TemplateManager.exportTemplate.
     */
    async exportAsZip(files, templateId) {
        const blob = createZip(files);
        saveAs(blob, `${templateId}.ograf.zip`);
        return blob;
    }

    /**
     * Export template as JSON
     */
    exportAsJSON(template) {
        const exportData = {
            format: 'ograf-editor-template',
            version: '1.0.0',
            exportDate: new Date().toISOString(),
            template: template.toJSON()
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json'
        });
        
        saveAs(blob, `${template.manifest.id}-template.json`);
        return blob;
    }

    /**
     * Download individual files
     */
    downloadFiles(files) {
        Object.entries(files).forEach(([filename, content]) => {
            const blob = new Blob([content], {
                type: filename.endsWith('.json') ? 'application/json' : 'text/javascript'
            });
            saveAs(blob, filename);
        });
    }

    /**
     * Import template from file
     */
    async importTemplate(file) {
        try {
            const name = (file.name || '').toLowerCase();
            const isZip = name.endsWith('.zip') || file.type === 'application/zip';
            if (isZip) {
                return await this.importFromZip(file);
            }

            const content = await this.readFile(file);
            if (name.endsWith('.json')) {
                // Handles both a raw <id>.ograf.json manifest and the editor JSON
                // bundle (importFromJSON detects the shape).
                return this.importFromJSON(content);
            }
            if (name.endsWith('.mjs') || name.endsWith('.js')) {
                throw new Error('Import the .ograf.json manifest or the .ograf.zip, not the component module on its own.');
            }
            throw new Error('Unsupported file. Import a .ograf.zip bundle or a .ograf.json manifest.');
        } catch (error) {
            throw new Error(`Import failed: ${error.message}`);
        }
    }

    // Import several files chosen together: the .ograf.json manifest plus its
    // .mjs component (or a .zip among the selection). Mirrors the zip path, the
    // manifest carries the authored elements/timeline; the .mjs is kept verbatim.
    // Choose the component file from a list of names using the manifest's "main"
    // field (matched by exact name or basename), falling back to the first
    // .mjs/.js. Reading "main" avoids grabbing a lib/*.js by mistake.
    pickComponentName(names, mainField) {
        if (mainField) {
            const m = String(mainField).toLowerCase();
            const hit = names.find(n => {
                const ln = n.toLowerCase();
                return ln === m || ln.endsWith('/' + m) || ln.split('/').pop() === m;
            });
            if (hit) return hit;
        }
        return names.find(n => /\.(mjs|js)$/i.test(n));
    }

    async importFromFiles(files) {
        const list = Array.from(files);
        const byExt = (re) => list.find(f => re.test((f.name || '').toLowerCase()));

        const zip = byExt(/\.zip$/);
        if (zip) return this.importFromZip(zip);

        const manifestFile = byExt(/\.ograf\.json$/) || byExt(/\.json$/);
        if (!manifestFile) {
            throw new Error('Select the .ograf.json manifest (optionally with its .mjs component).');
        }
        const manifestText = await this.readFile(manifestFile);
        const template = this.importFromJSON(manifestText);

        let mainField;
        try { mainField = JSON.parse(manifestText).main; } catch (e) { /* ignore */ }
        const compName = this.pickComponentName(list.map(f => f.name || ''), mainField);
        const compFile = compName ? list.find(f => (f.name || '') === compName) : null;
        if (compFile) {
            template.webComponent = await this.readFile(compFile);
            this.templateManager.saveToStorage();
        }
        return template;
    }

    // Import the .ograf.zip we export: unzip, read the <id>.ograf.json manifest
    // (which carries the authored elements/timeline under v_ vendor keys), and
    // keep the exact .mjs component if present.
    async importFromZip(file) {
        const buf = await this.readFileAsArrayBuffer(file);
        const entries = await readZip(buf);
        const names = Object.keys(entries);
        const manifestName = names.find(n => n.toLowerCase().endsWith('.ograf.json'))
            || names.find(n => n.toLowerCase().endsWith('.json'));
        if (!manifestName) {
            throw new Error('No .ograf.json manifest found in the zip.');
        }
        const manifestText = entries[manifestName];
        const template = this.importFromJSON(manifestText);

        let mainField;
        try { mainField = JSON.parse(manifestText).main; } catch (e) { /* ignore */ }
        const compName = this.pickComponentName(names, mainField);
        if (compName && entries[compName]) {
            template.webComponent = entries[compName];
            this.templateManager.saveToStorage();
        }
        return template;
    }

    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Import from JSON file
     */
    importFromJSON(content) {
        const data = JSON.parse(content);
        
        // Check if it's an OGraf editor export
        if (data.format === 'ograf-editor-template') {
            return this.importEditorTemplate(data.template);
        }
        
        // Check if it's an OGraf export bundle
        if (data.templateId && data.files) {
            return this.importOGrafBundle(data);
        }
        
        // Try to import as raw manifest
        if (data.$schema && data.id) {
            return this.importRawManifest(data);
        }
        
        throw new Error('Invalid file format. Please upload a valid OGraf template file.');
    }

    /**
     * Import from editor template format
     */
    importEditorTemplate(templateData) {
        const template = this.templateManager.importTemplate(
            JSON.stringify(templateData.manifest),
            templateData.webComponent
        );
        
        // Restore elements if available. Sanitize each element id: it is spliced
        // into an `element-<id>` class attribute and a generated `<style>` block,
        // so an imported id like `" onmouseover=...` could otherwise break out of
        // that context. slugifyId restricts it to [a-z0-9-].
        if (templateData.elements) {
            template.elements = templateData.elements.map(element => ({
                ...element,
                id: OGrafTemplate.slugifyId(element.id)
            }));
        }

        // Restore the authored timeline if it was persisted in the editor export.
        if (templateData.timeline !== undefined) {
            template.timeline = templateData.timeline;
        }

        return template;
    }

    /**
     * Import from OGraf bundle
     */
    importOGrafBundle(bundleData) {
        const manifestFile = Object.keys(bundleData.files).find(name => 
            name.endsWith('.ograf.json')
        );
        
        const componentFile = Object.keys(bundleData.files).find(name => 
            name.endsWith('.mjs') || name.endsWith('.js')
        );
        
        if (!manifestFile) {
            throw new Error('No manifest file found in bundle');
        }
        
        const manifest = bundleData.files[manifestFile];
        const component = componentFile ? bundleData.files[componentFile] : '';
        
        return this.templateManager.importTemplate(manifest, component);
    }

    /**
     * Import from raw manifest file
     */
    importRawManifest(manifest) {
        // Normalize the manifest to match our expected format
        const normalizedManifest = this.normalizeManifest(manifest);
        
        // Create a basic web component if none exists
        const basicComponent = this.generateBasicComponent(normalizedManifest);
        
        return this.templateManager.importTemplate(
            JSON.stringify(normalizedManifest),
            basicComponent
        );
    }

    /**
     * Normalize manifest to handle EBU OGraf variations
     */
    normalizeManifest(manifest) {
        const normalized = { ...manifest };
        
        // Ensure version is in the format we expect
        if (!normalized.version || normalized.version === "0") {
            normalized.version = "1.0.0";
        }
        
        // Ensure author has required structure
        if (typeof normalized.author === 'string') {
            normalized.author = { name: normalized.author, email: '' };
        } else if (normalized.author && !normalized.author.email) {
            normalized.author.email = '';
        } else if (!normalized.author) {
            normalized.author = { name: 'Unknown', email: '' };
        }
        
        // Preserve custom actions and vendor properties
        // These are valid in OGraf but optional in our editor
        
        return normalized;
    }

    /**
     * Generate a basic web component from manifest
     */
    generateBasicComponent(manifest) {
        // Validate the id before splicing it into generated code / a tag name.
        // A malicious id (e.g. with quotes or markup) could otherwise break out
        // of the string context; fall back to a safe default if it is invalid.
        const safeId = /^[a-z0-9-_]+$/.test(manifest.id || '') ? manifest.id : 'ograf-template';
        const className = this.toCamelCase(safeId) + 'Graphic';

        // Emit the name as a safe JS string literal, not spliced as code.
        const nameLiteral = JSON.stringify(manifest.name || 'OGraf Template');

        return `
class ${className} extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.data = {};
        this.isVisible = false;
        this.templateName = ${nameLiteral};
    }

    // Escape untrusted runtime data before it enters shadow DOM innerHTML.
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

    connectedCallback() {
        this.render();
    }

    async load() {
        this.isVisible = false;
        this.render();
        return Promise.resolve();
    }

    async dispose() {
        this.isVisible = false;
        this.shadowRoot.innerHTML = '';
        return Promise.resolve();
    }

    async playAction() {
        this.isVisible = true;
        this.render();
        return Promise.resolve();
    }

    async stopAction() {
        this.isVisible = false;
        this.render();
        return Promise.resolve();
    }

    async updateAction(data) {
        this.data = { ...this.data, ...data };
        this.render();
        return Promise.resolve();
    }

    async customAction(action, data) {
        return Promise.resolve();
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
                    opacity: \${this.isVisible ? '1' : '0'};
                    transition: opacity 0.3s ease;
                }
                .container {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background-color: rgba(0, 120, 204, 0.9);
                }
                .content {
                    color: white;
                    font-size: 48px;
                    text-align: center;
                }
            </style>
        \`;

        this.shadowRoot.innerHTML = \`
            \${style}
            <div class="container">
                <div class="content">
                    \${this.escapeHtml(this.templateName)}
                    \${this.renderData()}
                </div>
            </div>
        \`;
    }

    renderData() {
        return Object.entries(this.data).map(([key, value]) =>
            \`<div>\${this.escapeHtml(key)}: \${this.escapeHtml(value)}</div>\`
        ).join('');
    }
}

customElements.define('${safeId}-graphic', ${className});
        `.trim();
    }

    /**
     * Read file content
     */
    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                resolve(e.target.result);
            };
            
            reader.onerror = (e) => {
                reject(new Error('Failed to read file'));
            };
            
            reader.readAsText(file);
        });
    }

    /**
     * Export multiple templates as bundle
     */
    async exportTemplateBundle(templateIds, bundleName = 'ograf-templates') {
        const bundle = {
            format: 'ograf-editor-bundle',
            version: '1.0.0',
            exportDate: new Date().toISOString(),
            bundleName: bundleName,
            templates: {}
        };

        for (const templateId of templateIds) {
            const template = this.templateManager.getTemplate(templateId);
            if (template) {
                bundle.templates[templateId] = template.toJSON();
            }
        }

        const blob = new Blob([JSON.stringify(bundle, null, 2)], {
            type: 'application/json'
        });
        
        saveAs(blob, `${bundleName}-bundle.json`);
        return blob;
    }

    /**
     * Import template bundle
     */
    async importTemplateBundle(file) {
        try {
            const content = await this.readFile(file);
            const bundle = JSON.parse(content);
            
            if (bundle.format !== 'ograf-editor-bundle') {
                throw new Error('Invalid bundle format');
            }

            const importedTemplates = [];
            
            for (const [templateId, templateData] of Object.entries(bundle.templates)) {
                try {
                    // Check if template already exists
                    if (this.templateManager.getTemplate(templateId)) {
                        const shouldReplace = confirm(
                            `Template "${templateId}" already exists. Do you want to replace it?`
                        );
                        if (!shouldReplace) continue;
                        
                        // Delete existing template
                        this.templateManager.deleteTemplate(templateId);
                    }
                    
                    const template = this.importEditorTemplate(templateData);
                    importedTemplates.push(template);
                } catch (error) {
                }
            }

            return {
                success: true,
                importedCount: importedTemplates.length,
                templates: importedTemplates
            };
        } catch (error) {
            throw new Error(`Bundle import failed: ${error.message}`);
        }
    }

    /**
     * Validate OGraf template
     */
    validateOGrafTemplate(manifest, component) {
        const errors = [];
        
        // Validate manifest - be more permissive to handle EBU examples
        if (!manifest.$schema) {
            // Warning but not error - some examples might not have this
        }
        
        if (!manifest.id) {
            errors.push('Missing id property');
        } else if (!/^[a-z0-9-_]+$/.test(manifest.id)) {
            errors.push('Invalid id format. Use lowercase letters, numbers, hyphens, and underscores only.');
        }
        
        if (!manifest.name) {
            errors.push('Missing name property');
        }
        
        if (!manifest.main) {
            errors.push('Missing main property');
        }
        
        // Be more flexible with boolean checks
        if (manifest.supportsRealTime !== undefined && typeof manifest.supportsRealTime !== 'boolean') {
            errors.push('supportsRealTime must be a boolean');
        }
        
        if (manifest.supportsNonRealTime !== undefined && typeof manifest.supportsNonRealTime !== 'boolean') {
            errors.push('supportsNonRealTime must be a boolean');
        }
        
        // Validate schema - allow missing schema for simple imports
        if (manifest.schema && manifest.schema.properties) {
            // Schema exists and has properties - validate structure
            if (typeof manifest.schema.properties !== 'object') {
                errors.push('Schema properties must be an object');
            }
        } else if (manifest.schema) {
            // Schema exists but no properties
        }
        
        // Validate component (basic check) - only if component is provided
        if (component) {
            if (!component.includes('HTMLElement')) {
                errors.push('Component must extend HTMLElement');
            }
            
            const requiredMethods = ['load', 'dispose', 'playAction', 'stopAction', 'updateAction'];
            const missingMethods = requiredMethods.filter(method => !component.includes(method));
            if (missingMethods.length > 0) {
                // Don't error on missing methods if we're generating the component
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Utility method to convert string to camelCase
     */
    toCamelCase(str) {
        return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase())
                 .replace(/^[a-z]/, (g) => g.toUpperCase());
    }

    /**
     * Get supported import formats
     */
    getSupportedFormats() {
        return [
            {
                extension: '.json',
                description: 'OGraf Template JSON',
                mimeType: 'application/json'
            }
        ];
    }

    /**
     * Get supported export formats
     */
    getSupportedExportFormats() {
        return [
            {
                id: 'json',
                name: 'JSON Export',
                description: 'Export as OGraf Editor JSON format'
            },
            {
                id: 'zip',
                name: 'OGraf Bundle',
                description: 'Export as OGraf-compatible bundle'
            },
            {
                id: 'folder',
                name: 'Individual Files',
                description: 'Download manifest and component files separately'
            }
        ];
    }
}