import { escapeHtml } from '../utils/escapeHtml.js';

export class PropertyPanel {
    constructor(containerElement, visualEditor, templateManager) {
        this.container = containerElement;
        this.visualEditor = visualEditor;
        this.templateManager = templateManager;
        this.previewEngine = null;
        this.currentElement = null;
        
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
            <div class="property-section">
                <h4>Template Properties</h4>
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

            <div class="property-section">
                <h4>Animation Settings</h4>
                <p class="section-description">Configure how graphics animate when playing and stopping.</p>
                
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
        `;

        this.setupAnimationEventListeners();
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

    renderContentProperties(element) {
        if (element.type === 'text' || element.type === 'image') {
            const label = element.type === 'text' ? 'Text Content' : 'Image URL';
            const inputType = element.type === 'text' ? 'textarea' : 'input';
            const safeContent = escapeHtml(element.content || '');
            const inputElement = element.type === 'text' ?
                `<textarea class="property-input" data-property="content" rows="3">${safeContent}</textarea>` :
                `<input type="url" class="property-input" data-property="content" value="${safeContent}" placeholder="Enter image URL">`;

            return `
                <div class="property-group">
                    <label>${label}</label>
                    ${inputElement}
                </div>
            `;
        }
        return '';
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

        // Update the specific animation property
        template.animationSettings[property] = value;
        
        // Save changes
        this.templateManager.saveToStorage();
        
        // Regenerate web component with new animation settings
        template.generateWebComponent();
        
        // Reload the preview component to use new animation settings
        if (this.previewEngine) {
            this.previewEngine.reloadComponent();
        }
    }

    updateTemplateProperty(property, value) {
        const template = this.templateManager.getCurrentTemplate();
        if (!template) return;

        // Update template manifest property
        template.manifest[property] = value;
        
        // Save changes
        this.templateManager.saveToStorage();
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

    addCustomProperty() {
        const template = this.templateManager.getCurrentTemplate();
        if (!template) return;

        const propertyName = prompt('Enter property name:');
        if (!propertyName) return;

        const propertyType = prompt('Enter property type (string, number, boolean):') || 'string';
        const defaultValue = prompt('Enter default value:') || '';

        template.addProperty(propertyName, propertyType, propertyName, defaultValue);
        this.templateManager.saveToStorage();
        
        // Refresh template properties panel
        this.renderTemplateProperties(this.container);
    }
}