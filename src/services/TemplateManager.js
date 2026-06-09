import { OGrafTemplate } from '../models/OGrafTemplate.js';

export class TemplateManager {
    constructor() {
        this.templates = new Map();
        this.currentTemplate = null;
        this.loadFromStorage();
    }

    createTemplate(type, id, name, description) {
        // Slugify up front so the Map key matches the template's safe manifest id.
        const safeId = OGrafTemplate.slugifyId(id);
        if (this.templates.has(safeId)) {
            throw new Error(`Template with id "${safeId}" already exists`);
        }

        const template = OGrafTemplate.createFromType(type, safeId, name, description);
        this.templates.set(template.manifest.id, template);
        this.currentTemplate = template;
        this.saveToStorage();
        
        return template;
    }

    getTemplate(id) {
        return this.templates.get(id);
    }

    getCurrentTemplate() {
        return this.currentTemplate;
    }

    setCurrentTemplate(id) {
        const template = this.templates.get(id);
        if (template) {
            this.currentTemplate = template;
            return true;
        }
        return false;
    }

    getAllTemplates() {
        return Array.from(this.templates.values());
    }

    updateTemplate(id, updates) {
        const template = this.templates.get(id);
        if (template) {
            Object.assign(template, updates);
            this.saveToStorage();
            return true;
        }
        return false;
    }

    deleteTemplate(id) {
        const deleted = this.templates.delete(id);
        if (deleted) {
            if (this.currentTemplate && this.currentTemplate.manifest.id === id) {
                this.currentTemplate = null;
            }
            this.saveToStorage();
        }
        return deleted;
    }

    exportTemplate(id) {
        const template = this.templates.get(id);
        if (!template) {
            throw new Error(`Template with id "${id}" not found`);
        }

        // Generate the web component if not already generated
        if (!template.webComponent) {
            template.generateWebComponent();
        }

        const files = {
            [`${id}.ograf.json`]: JSON.stringify(template.manifest, null, 2),
            [`${template.manifest.main}`]: template.webComponent
        };

        return files;
    }

    importTemplate(manifestJson, componentCode) {
        try {
            const manifest = JSON.parse(manifestJson);
            
            // Validate required fields
            if (!manifest.id || !manifest.name) {
                throw new Error('Invalid manifest: missing required fields (id, name)');
            }

            // Check for existing template and offer to replace
            if (this.templates.has(manifest.id)) {
                const shouldReplace = confirm(`Template "${manifest.id}" already exists. Replace it?`);
                if (!shouldReplace) {
                    throw new Error(`Template with id "${manifest.id}" already exists`);
                }
                this.deleteTemplate(manifest.id);
            }

            const template = new OGrafTemplate();
            
            // First set up the manifest and elements
            template.manifest = manifest;
            template.elements = this.createElementsFromSchema(manifest);
            
            // Then handle the component code
            if (componentCode && this.isValidComponentCode(componentCode)) {
                template.webComponent = this.cleanComponentCode(componentCode);
            } else {
                // Generate new component code if import code is invalid or missing
                template.webComponent = null; // Clear any invalid code
            }
            
            // Don't call generateWebComponent here - let the preview engine do it when needed

            this.templates.set(manifest.id, template);
            this.currentTemplate = template;
            this.saveToStorage();

            return template;
        } catch (error) {
            throw new Error(`Failed to import template: ${error.message}`);
        }
    }

    createElementsFromSchema(manifest) {
        const elements = [];
        
        if (!manifest.schema || !manifest.schema.properties) {
            // No schema properties, create a basic template based on name
            if (manifest.name.toLowerCase().includes('lower') || manifest.name.toLowerCase().includes('third')) {
                // Lower third template
                elements.push({
                    id: 'background',
                    type: 'rect',
                    x: 50,
                    y: 450,
                    width: 400,
                    height: 80,
                    style: { backgroundColor: 'rgba(0, 120, 204, 0.9)', borderRadius: '4px' }
                });
            }
            return elements;
        }

        // Create elements based on schema properties
        let yPosition = 100;
        Object.entries(manifest.schema.properties).forEach(([key, prop], index) => {
            if (prop.type === 'string') {
                elements.push({
                    id: key,
                    type: 'text',
                    x: 100,
                    y: yPosition + (index * 60),
                    width: 300,
                    height: 50,
                    content: `{{${key}}}`,
                    style: {
                        fontSize: key.toLowerCase().includes('title') ? '24px' : '20px',
                        fontFamily: 'Arial, sans-serif',
                        color: '#ffffff',
                        fontWeight: key.toLowerCase().includes('name') || key.toLowerCase().includes('title') ? 'bold' : 'normal'
                    }
                });
            }
        });

        // Add background if multiple text elements
        if (elements.length > 0) {
            const maxWidth = Math.max(...elements.map(el => el.x + el.width)) + 50;
            const maxHeight = Math.max(...elements.map(el => el.y + el.height)) + 20;
            const minX = Math.min(...elements.map(el => el.x)) - 20;
            const minY = Math.min(...elements.map(el => el.y)) - 10;

            elements.unshift({
                id: 'background',
                type: 'rect',
                x: minX,
                y: minY,
                width: maxWidth - minX,
                height: maxHeight - minY,
                style: { 
                    backgroundColor: 'rgba(0, 120, 204, 0.9)', 
                    borderRadius: '4px',
                    zIndex: -1
                }
            });
        }

        return elements;
    }

    isValidComponentCode(componentCode) {
        if (!componentCode || typeof componentCode !== 'string') {
            return false;
        }
        
        // Check if it contains basic component structure
        return componentCode.includes('HTMLElement') && 
               componentCode.includes('class') &&
               (componentCode.includes('playAction') || componentCode.includes('load'));
    }

    cleanComponentCode(componentCode) {
        let cleaned = componentCode;
        
        // Remove export statements
        cleaned = cleaned.replace(/^export\s+default\s+/m, '');
        cleaned = cleaned.replace(/^export\s+/m, '');
        
        // Ensure proper formatting
        cleaned = cleaned.trim();
        
        return cleaned;
    }

    extractElementsFromComponent(componentCode) {
        // This is a simplified extraction - in a real implementation,
        // you might use an AST parser or more sophisticated parsing
        const elements = [];
        
        // Try to find element definitions in the code
        // This is a basic pattern matching approach
        const elementPattern = /\.element-(\w+)\s*\{[^}]*\}/g;
        let match;
        
        while ((match = elementPattern.exec(componentCode)) !== null) {
            const elementId = match[1];
            elements.push({
                id: elementId,
                type: 'text', // Default type
                x: 0,
                y: 0,
                width: 100,
                height: 30,
                content: '',
                style: {}
            });
        }

        return elements;
    }

    saveToStorage() {
        try {
            const templatesData = {};
            for (const [id, template] of this.templates) {
                templatesData[id] = template.toJSON();
            }
            
            localStorage.setItem('ograf-templates', JSON.stringify(templatesData));
            localStorage.setItem('ograf-current-template', 
                this.currentTemplate ? this.currentTemplate.manifest.id : null);
        } catch (error) {
        }
    }

    loadFromStorage() {
        try {
            const templatesData = localStorage.getItem('ograf-templates');
            const currentTemplateId = localStorage.getItem('ograf-current-template');
            
            if (templatesData) {
                const parsed = JSON.parse(templatesData);
                for (const [id, templateData] of Object.entries(parsed)) {
                    try {
                        const template = OGrafTemplate.fromJSON(templateData);
                        // Ensure the template has all required methods
                        if (typeof template.generateWebComponent !== 'function') {
                            const newTemplate = new OGrafTemplate();
                            newTemplate.manifest = templateData.manifest;
                            newTemplate.elements = templateData.elements || [];
                            newTemplate.webComponent = null; // Will regenerate when needed
                            this.templates.set(id, newTemplate);
                        } else {
                            this.templates.set(id, template);
                        }
                    } catch (templateError) {
                    }
                }
            }

            if (currentTemplateId && this.templates.has(currentTemplateId)) {
                this.currentTemplate = this.templates.get(currentTemplateId);
            }
        } catch (error) {
        }
    }

    clearStorage() {
        localStorage.removeItem('ograf-templates');
        localStorage.removeItem('ograf-current-template');
        this.templates.clear();
        this.currentTemplate = null;
    }

    validateTemplate(template) {
        const errors = [];

        // Check manifest
        if (!template.manifest.id) errors.push('Missing template ID');
        if (!template.manifest.name) errors.push('Missing template name');
        if (!template.manifest.main) errors.push('Missing main file reference');
        
        // Check schema
        if (!template.manifest.schema || !template.manifest.schema.properties) {
            errors.push('Missing schema properties');
        }

        // Check elements
        if (!Array.isArray(template.elements)) {
            errors.push('Elements must be an array');
        } else {
            template.elements.forEach((element, index) => {
                if (!element.id) errors.push(`Element ${index}: missing ID`);
                if (!element.type) errors.push(`Element ${index}: missing type`);
                if (typeof element.x !== 'number') errors.push(`Element ${index}: invalid x position`);
                if (typeof element.y !== 'number') errors.push(`Element ${index}: invalid y position`);
                if (typeof element.width !== 'number') errors.push(`Element ${index}: invalid width`);
                if (typeof element.height !== 'number') errors.push(`Element ${index}: invalid height`);
            });
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    duplicateTemplate(id, newId, newName) {
        const originalTemplate = this.templates.get(id);
        if (!originalTemplate) {
            throw new Error(`Template with id "${id}" not found`);
        }

        if (this.templates.has(newId)) {
            throw new Error(`Template with id "${newId}" already exists`);
        }

        const duplicatedTemplate = OGrafTemplate.fromJSON(originalTemplate.toJSON());
        duplicatedTemplate.manifest.id = newId;
        duplicatedTemplate.manifest.name = newName;
        duplicatedTemplate.webComponent = null; // Will be regenerated

        this.templates.set(newId, duplicatedTemplate);
        this.saveToStorage();

        return duplicatedTemplate;
    }
}