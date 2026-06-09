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
    static get MANIFEST_ALLOWED_KEYS() {
        return [
            // Required.
            '$schema', 'id', 'name', 'main', 'supportsRealTime', 'supportsNonRealTime',
            // Optional.
            'version', 'description', 'author', 'schema', 'customActions',
            'actionDurations', 'stepCount', 'renderRequirements', 'thumbnails'
        ];
    }

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

    // Rename a schema property key while preserving the key order.
    // A naive delete + re-add would move the key to the end, which would
    // reorder the operator's data-input list on every rename. We rebuild the
    // properties object, swapping the single key in place. No-op if oldKey is
    // missing or newKey already exists (and differs from oldKey).
    renameProperty(oldKey, newKey) {
        const properties = this.manifest.schema.properties;
        if (!(oldKey in properties)) return false;
        if (oldKey === newKey) return false;
        if (newKey in properties) return false;

        const rebuilt = {};
        for (const key of Object.keys(properties)) {
            if (key === oldKey) {
                rebuilt[newKey] = properties[oldKey];
            } else {
                rebuilt[key] = properties[key];
            }
        }
        this.manifest.schema.properties = rebuilt;
        return true;
    }

    // Find elements whose content references {{key}}. The token form must match
    // the interpolation regex (\{\{(\w+)\}\}) used by the generated component,
    // so we match the exact {{key}} substring. Used for "not used" cues and
    // rename/remove reference warnings.
    findElementsReferencingProperty(key) {
        const token = `{{${key}}}`;
        return this.elements.filter(
            el => typeof el.content === 'string' && el.content.includes(token)
        );
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

    // Reject CSS style values that could break out of a `key: value;` declaration
    // inside the generated `<style>` block. A crafted value containing { } < > or
    // a double quote could otherwise close the rule or the <style> element and
    // inject markup. Legitimate values (colors, px, rgba(), Arial, sans-serif)
    // contain none of these, so they pass through untouched.
    static sanitizeCssValue(value) {
        const str = String(value);
        return /[{}<>"]/.test(str) ? '' : str;
    }

    generateElementStyles() {
        // Generate CSS styles for all elements. element.id is already slugified on
        // import, and each value is checked so it cannot escape the declaration or
        // the surrounding <style> element.
        return this.elements.map(element => {
            const styles = Object.entries(element.style || {})
                .map(([key, value]) => `${this.kebabCase(key)}: ${OGrafTemplate.sanitizeCssValue(value)};`)
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
// Escape data values before they are interpolated into shadow DOM innerHTML.
// The template author's static markup is trusted; runtime data (operator/feed
// input arriving via load()/updateAction()) is not, so it is escaped here.
// Self-contained: no imports, lives in this generated module.
function escapeHtml(value) {
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

// Only allow http(s) and data:image URLs for an image src; anything else
// (e.g. javascript:) becomes a blank src, which is safer than a hostile one.
function safeSrc(value) {
    const s = escapeHtml(value);
    if (/^https?:\\/\\//i.test(value) || /^data:image\\//i.test(value)) {
        return s;
    }
    return '';
}

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

    // Compute the transform that places the whole graphic just off the given
    // stage edge, derived from the stage size and the elements' bounding box.
    // This makes the graphic slide fully on/off screen as a unit, regardless of
    // element size or position. A self-relative percentage (translateX(100%))
    // only moved an element by its own width, so a small element parked on the
    // left appeared to start mid-stage instead of off the right edge.
    offStageTransform(direction) {
        const elements = this.shadowRoot.querySelectorAll('.element');
        const stageW = this.offsetWidth || 1920;
        const stageH = this.offsetHeight || 1080;
        let minLeft = Infinity, maxRight = -Infinity, minTop = Infinity, maxBottom = -Infinity;
        elements.forEach(el => {
            const left = el.offsetLeft;
            const top = el.offsetTop;
            minLeft = Math.min(minLeft, left);
            maxRight = Math.max(maxRight, left + el.offsetWidth);
            minTop = Math.min(minTop, top);
            maxBottom = Math.max(maxBottom, top + el.offsetHeight);
        });
        switch (direction) {
            case 'right': return \`translate(\${stageW - minLeft}px, 0px)\`;
            case 'top': return \`translate(0px, \${-maxBottom}px)\`;
            case 'bottom': return \`translate(0px, \${stageH - minTop}px)\`;
            case 'left':
            default: return \`translate(\${-maxRight}px, 0px)\`;
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
            // Coerce to a number: settings may arrive as strings (e.g. "1500"
            // from a number input), and Number.isFinite('1500') is false, so the
            // duration was silently falling back to 500 and edits had no effect.
            const slideInDurationNum = Number(settings.slideInDuration);
            const duration = Number.isFinite(slideInDurationNum) && slideInDurationNum >= 0 ? slideInDurationNum : 500;
            const timing = settings.slideInType || 'ease-out';
            const direction = settings.slideInDirection || 'left';

            // Start fully off the chosen stage edge, then slide to rest.
            const startTransform = this.offStageTransform(direction);

            elements.forEach(element => {
                element.style.transform = startTransform;
                element.style.transition = 'none';
            });

            // Force a reflow on the host so the initial transform is committed
            // before the transition is enabled (ShadowRoot has no offsetHeight).
            void this.offsetHeight;

            elements.forEach(element => {
                element.style.transition = \`transform \${duration}ms \${timing}\`;

                // Trigger animation to the resting position.
                requestAnimationFrame(() => {
                    element.style.transform = 'translate(0px, 0px)';
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

            const slideOutDurationNum = Number(settings.slideOutDuration);
            const duration = Number.isFinite(slideOutDurationNum) && slideOutDurationNum >= 0 ? slideOutDurationNum : 500;
            const timing = settings.slideOutType || 'ease-in';
            const direction = settings.slideOutDirection || settings.slideInDirection || 'left';

            // Slide the whole graphic off the chosen stage edge as a unit.
            const endTransform = this.offStageTransform(direction);

            elements.forEach(element => {
                element.style.transition = \`transform \${duration}ms \${timing}\`;
                element.style.transform = endTransform;
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
        const baseStyles = \`left: \${element.x}px; top: \${element.y}px; width: \${element.width}px; height: \${element.height}px;\`;
        
        // Convert element.style object to CSS string. Escape each value for the
        // double-quoted style="..." attribute context so an imported style value
        // cannot close the attribute and inject markup. element.x/y/width/height
        // are numbers set by the editor, so baseStyles needs no escaping.
        const additionalStyles = element.style ? Object.entries(element.style)
            .map(([key, value]) => \`\${this.kebabCase(key)}: \${escapeHtml(value)};\`)
            .join(' ') : '';
        
        const allStyles = baseStyles + ' ' + additionalStyles;
        
        switch (element.type) {
            case 'text': {
                // Text context: escape the resolved data value.
                const content = this.interpolateContent(element.content || '');
                return \`<div class="element element-\${element.id}" style="\${allStyles}">\${content}</div>\`;
            }
            case 'image': {
                // src context: only allow http(s)/data:image URLs, else blank src.
                const src = this.interpolateContent(element.content || '', 'src');
                return \`<img class="element element-\${element.id}" src="\${src}" style="\${allStyles}" />\`;
            }
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

    interpolateContent(content, context = 'text') {
        const result = content.replace(/\\{\\{(\\w+)\\}\\}/g, (match, key) => {
            // Keep the presence check so empty-string/0 still render, and an
            // unresolved placeholder is left untouched (then escaped).
            const value = key in this.data ? this.data[key] : match;
            return context === 'src' ? safeSrc(value) : escapeHtml(value);
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

    // Build a portable, spec-clean OGraf v1 manifest object: only the top-level
    // fields the schema allows (additionalProperties:false), plus any v_-prefixed
    // vendor extensions. The editor's internal fields (elements, webComponent) and
    // export-wrapper fields must never leak into the manifest written to disk.
    // Allowed keys verified 2026-06-09 against the OGraf v1 graphics JSON schema
    // (source: https://raw.githubusercontent.com/ebu/ograf/main/v1/specification/json-schemas/graphics/schema.json).
    buildManifest() {
        const clean = {};
        for (const key of OGrafTemplate.MANIFEST_ALLOWED_KEYS) {
            if (this.manifest[key] !== undefined) {
                clean[key] = this.manifest[key];
            }
        }
        // Pass through vendor extensions (patternProperties ^v_.*).
        for (const [key, value] of Object.entries(this.manifest)) {
            if (key.startsWith('v_') && value !== undefined) {
                clean[key] = value;
            }
        }
        return clean;
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
        // Sanitize each element id before assignment: it is interpolated into an
        // `element-<id>` class attribute and the generateElementStyles `<style>`
        // block, so a crafted id from an imported file (e.g. `" onmouseover=...`)
        // could otherwise break out of that context.
        template.elements = Array.isArray(json.elements)
            ? json.elements.map(element => ({
                ...element,
                id: OGrafTemplate.slugifyId(element.id)
            }))
            : json.elements;
        template.webComponent = json.webComponent;
        return template;
    }
}