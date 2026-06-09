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
        // The generated component also defaults per field defensively, so a
        // partial or empty object never produces invalid CSS.
        this.animationSettings = {
            slideInDuration: 500,
            slideInType: 'ease-out',
            slideInDirection: 'left',
            slideOutDuration: 500,
            slideOutType: 'ease-in',
            slideOutDirection: 'left'
        };
    }

    // Turn arbitrary user input into a safe OGraf id: lowercase, hyphen-separated,
    // only [a-z0-9-]. e.g. "My Lower Third" -> "my-lower-third".
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

    addElement(element) {
        this.elements.push({
            id: `element_${Date.now()}`,
            ...element
        });
    }

    removeElement(elementId) {
        this.elements = this.elements.filter(el => el.id !== elementId);
    }

    getElementById(elementId) {
        return this.elements.find(el => el.id === elementId);
    }

    updateElement(elementId, updates) {
        const element = this.getElementById(elementId);
        if (element) {
            Object.assign(element, updates);
        }
    }

    generateElementStyles() {
        // Generate CSS styles for all elements
        return this.elements.map(element => {
            const styles = Object.entries(element.style || {})
                .map(([key, value]) => `${this.kebabCase(key)}: ${value};`)
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

        // Serialize elements data and animation settings for the component
        const elementsData = JSON.stringify(this.elements);
        const animationSettingsData = JSON.stringify(this.animationSettings || {});

        const className = this.safeClassName();

        const componentCode = `
export default class ${className} extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.data = {};
        this.isVisible = false;
        this.currentStep = 0;
        this.elements = ${elementsData};
        this.animationSettings = ${animationSettingsData};
        this.elementStyles = \`${elementStyles}\`;
    }

    // OGraf lifecycle: load applies the initial data and renders the graphic.
    async load(params = {}) {
        const { data } = params;
        if (data) {
            this.data = { ...this.data, ...data };
        }
        this.isVisible = false;
        this.render();
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

        if (!skipAnimation) {
            // Wait for render to complete before starting animation
            await new Promise(resolve => requestAnimationFrame(resolve));
            await this.animateSlideIn();
        }

        return { statusCode: 200, currentStep: this.currentStep };
    }

    async stopAction(params = {}) {
        const { skipAnimation } = params;
        if (!skipAnimation) {
            // Trigger slide-out animation before hiding
            await this.animateSlideOut();
        }

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
        const { id } = params;
        switch (id) {
            case 'slideIn':
                await this.animateSlideIn();
                return { statusCode: 200 };
            case 'slideOut':
                await this.animateSlideOut();
                return { statusCode: 200 };
            default:
                return { statusCode: 200 };
        }
    }

    animateSlideIn() {
        return new Promise((resolve) => {
            const settings = this.animationSettings || {};

            const elements = this.shadowRoot.querySelectorAll('.element');
            if (elements.length === 0) {
                resolve();
                return;
            }

            // Default per field so an empty or partial settings object still
            // produces valid CSS (an empty object is truthy, so a single
            // object-level fallback would not catch it).
            const duration = Number.isFinite(settings.slideInDuration) ? settings.slideInDuration : 500;
            const timing = settings.slideInType || 'ease-out';
            const direction = settings.slideInDirection || 'left';

            let transform = '';
            switch (direction) {
                case 'left': transform = 'translateX(-100%)'; break;
                case 'right': transform = 'translateX(100%)'; break;
                case 'top': transform = 'translateY(-100%)'; break;
                case 'bottom': transform = 'translateY(100%)'; break;
                default: transform = 'translateX(-100%)';
            }
            
            elements.forEach(element => {
                // Set initial position before animation
                element.style.transform = transform;
                element.style.transition = 'none';
            });
            
            // Force a reflow on the host so the initial transform is committed
            // before the transition is enabled (ShadowRoot has no offsetHeight).
            void this.offsetHeight;
            
            elements.forEach(element => {
                element.style.transition = \`transform \${duration}ms \${timing}\`;
                
                // Trigger animation
                requestAnimationFrame(() => {
                    element.style.transform = 'translateX(0) translateY(0)';
                });
            });
            
            // Resolve after animation completes
            setTimeout(resolve, duration);
        });
    }
    
    animateSlideOut() {
        return new Promise((resolve) => {
            const settings = this.animationSettings || {};

            const elements = this.shadowRoot.querySelectorAll('.element');
            if (elements.length === 0) {
                resolve();
                return;
            }

            const duration = Number.isFinite(settings.slideOutDuration) ? settings.slideOutDuration : 500;
            const timing = settings.slideOutType || 'ease-in';
            const direction = settings.slideOutDirection || settings.slideInDirection || 'left';
            
            let transform = '';
            switch (direction) {
                case 'left': transform = 'translateX(-100%)'; break;
                case 'right': transform = 'translateX(100%)'; break;
                case 'top': transform = 'translateY(-100%)'; break;
                case 'bottom': transform = 'translateY(100%)'; break;
                default: transform = 'translateX(-100%)';
            }
            
            elements.forEach(element => {
                element.style.transition = \`transform \${duration}ms \${timing}\`;
                element.style.transform = transform;
            });
            
            // Resolve after animation completes
            setTimeout(resolve, duration);
        });
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
        const content = this.interpolateContent(element.content || '');
        const baseStyles = \`left: \${element.x}px; top: \${element.y}px; width: \${element.width}px; height: \${element.height}px;\`;
        
        // Convert element.style object to CSS string
        const additionalStyles = element.style ? Object.entries(element.style)
            .map(([key, value]) => \`\${this.kebabCase(key)}: \${value};\`)
            .join(' ') : '';
        
        const allStyles = baseStyles + ' ' + additionalStyles;
        
        switch (element.type) {
            case 'text':
                return \`<div class="element element-\${element.id}" style="\${allStyles}">\${content}</div>\`;
            case 'image':
                return \`<img class="element element-\${element.id}" src="\${content}" style="\${allStyles}" />\`;
            case 'rect':
            case 'rectangle':
                return \`<div class="element element-\${element.id}" style="\${allStyles}"></div>\`;
            case 'circle':
                const circleStyles = allStyles + ' border-radius: 50%;';
                return \`<div class="element element-\${element.id}" style="\${circleStyles}"></div>\`;
            default:
                return '';
        }
    }

    interpolateContent(content) {
        const result = content.replace(/\\{\\{(\\w+)\\}\\}/g, (match, key) => {
            const value = key in this.data ? this.data[key] : match;
            return value;
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

    toJSON() {
        return {
            manifest: this.manifest,
            elements: this.elements,
            webComponent: this.webComponent
        };
    }

    static fromJSON(json) {
        const template = new OGrafTemplate();
        template.manifest = json.manifest;
        template.elements = json.elements;
        template.webComponent = json.webComponent;
        return template;
    }
}