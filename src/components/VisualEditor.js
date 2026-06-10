// Inline gray placeholder so a new image element has no external runtime
// dependency (via.placeholder.com is defunct). A 1x1 SVG scaled by the element.
const PLACEHOLDER_IMAGE = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
    '<rect width="100" height="100" fill="#808080"/>' +
    '<rect x="1" y="1" width="98" height="98" fill="none" stroke="#606060" stroke-width="2"/>' +
    '</svg>'
);

export class VisualEditor {
    constructor(containerElement, templateManager) {
        this.container = containerElement;
        this.templateManager = templateManager;
        this.canvas = null;
        this.selectedElement = null;
        this.dragState = null;
        this.resizeState = null;
        this.scale = 1;
        this.panOffset = { x: 0, y: 0 };

        // Bind handlers once so add/removeEventListener use the same refs and
        // destroy() actually detaches them (a fresh .bind() each call cannot be
        // removed, which would leak a torn-down editor's document keydown and
        // keep deleting elements).
        this._onMouseDown = this.handleMouseDown.bind(this);
        this._onClick = this.handleClick.bind(this);
        this._onContextMenu = (e) => e.preventDefault();
        this._onMouseMove = this.handleMouseMove.bind(this);
        this._onMouseUp = this.handleMouseUp.bind(this);
        this._onKeyDown = this.handleKeyDown.bind(this);
        this._onWheel = this.handleWheel.bind(this);

        this.init();
    }

    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.render();
    }

    setupCanvas() {
        this.canvas = this.container.querySelector('.graphics-canvas');
        if (!this.canvas) {
            this.canvas = document.createElement('div');
            this.canvas.className = 'graphics-canvas';
            this.container.appendChild(this.canvas);
        }

        // Set canvas size to standard broadcast resolution
        this.canvas.style.width = '1920px';
        this.canvas.style.height = '1080px';
        this.canvas.style.position = 'relative';
        this.canvas.style.transformOrigin = 'top left';
    }

    setupEventListeners() {
        // Canvas events
        this.canvas.addEventListener('mousedown', this._onMouseDown);
        this.canvas.addEventListener('click', this._onClick);

        // Document events for dragging (so it works when mouse leaves canvas)
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);

        // Keyboard events
        document.addEventListener('keydown', this._onKeyDown);

        // Prevent context menu on canvas
        this.canvas.addEventListener('contextmenu', this._onContextMenu);

        // Zoom and pan
        this.container.addEventListener('wheel', this._onWheel);
    }

    handleMouseDown(e) {
        // Convert client coordinates to canvas coordinates for mousedown on canvas
        const canvasRect = this.canvas.getBoundingClientRect();
        const canvasX = e.clientX - canvasRect.left;
        const canvasY = e.clientY - canvasRect.top;
        
        const elementData = this.getElementAtPosition(canvasX, canvasY);
        
        if (elementData) {
            this.selectElement(elementData.element.id);
            
            const handle = this.getResizeHandle(e.target);
            if (handle) {
                this.startResize(elementData.element, handle, e);
            } else {
                this.startDrag(elementData.element, e);
            }
        } else {
            this.deselectElement();
        }
    }

    handleMouseMove(e) {
        if (this.dragState) {
            this.updateDrag(e);
        } else if (this.resizeState) {
            this.updateResize(e);
        }
    }

    handleMouseUp(e) {
        if (this.dragState) {
            this.endDrag();
        } else if (this.resizeState) {
            this.endResize();
        }
    }

    handleClick(e) {
        // Handle element selection
        e.stopPropagation();
    }

    handleKeyDown(e) {
        // Do not treat keys as canvas shortcuts while the user types in a form
        // control (e.g. a Property Panel input) or contentEditable surface.
        const t = e.target;
        if (t && ((t.matches && t.matches('input, textarea, select')) || t.isContentEditable)) return;

        if (e.key === 'Delete' && this.selectedElement) {
            this.deleteSelectedElement();
        } else if (e.key === 'Escape') {
            this.deselectElement();
        }
    }

    handleWheel(e) {
        e.preventDefault();
        
        if (e.ctrlKey || e.metaKey) {
            // Zoom
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            this.scale *= delta;
            this.scale = Math.max(0.1, Math.min(5, this.scale));
            this.updateTransform();
        } else {
            // Pan
            this.panOffset.x -= e.deltaX;
            this.panOffset.y -= e.deltaY;
            this.updateTransform();
        }
    }

    updateTransform() {
        this.canvas.style.transform = 
            `scale(${this.scale}) translate(${this.panOffset.x}px, ${this.panOffset.y}px)`;
    }

    getElementAtPosition(x, y) {
        const template = this.templateManager.getCurrentTemplate();
        if (!template) return null;

        // Convert rect-relative coordinates to canvas-local coordinates. The
        // canvas transform is scale() then translate(panOffset) with
        // transform-origin top-left, so getBoundingClientRect() already
        // reflects the pan. Dividing by scale is the complete inverse; adding a
        // pan term here would subtract the pan a second time.
        const canvasX = x / this.scale;
        const canvasY = y / this.scale;

        // Check elements in reverse order (top to bottom)
        for (let i = template.elements.length - 1; i >= 0; i--) {
            const element = template.elements[i];
            if (canvasX >= element.x && canvasX <= element.x + element.width &&
                canvasY >= element.y && canvasY <= element.y + element.height) {
                return { element, index: i };
            }
        }
        return null;
    }

    getResizeHandle(target) {
        if (target.classList.contains('resize-handle')) {
            return Array.from(target.classList).find(cls => 
                ['nw', 'ne', 'sw', 'se'].includes(cls));
        }
        return null;
    }

    selectElement(elementId) {
        this.selectedElement = elementId;
        this.render();
        this.dispatchEvent('elementSelected', { elementId });
    }

    deselectElement() {
        this.selectedElement = null;
        this.render();
        this.dispatchEvent('elementDeselected');
    }

    startDrag(element, e) {
        // getBoundingClientRect already includes the pan; (client - rect)/scale
        // is the full screen->canvas-local inverse.
        const canvasRect = this.canvas.getBoundingClientRect();
        const canvasX = (e.clientX - canvasRect.left) / this.scale;
        const canvasY = (e.clientY - canvasRect.top) / this.scale;

        this.dragState = {
            element,
            startX: canvasX,
            startY: canvasY,
            elementStartX: element.x,
            elementStartY: element.y
        };
        
        this.canvas.style.cursor = 'grabbing';
    }

    updateDrag(e) {
        if (!this.dragState) return;

        // Get canvas bounds to calculate relative position (rect includes pan).
        const canvasRect = this.canvas.getBoundingClientRect();
        const canvasX = (e.clientX - canvasRect.left) / this.scale;
        const canvasY = (e.clientY - canvasRect.top) / this.scale;

        const deltaX = canvasX - this.dragState.startX;
        const deltaY = canvasY - this.dragState.startY;

        const newX = this.dragState.elementStartX + deltaX;
        const newY = this.dragState.elementStartY + deltaY;

        this.updateElementPosition(this.dragState.element.id, newX, newY);
    }

    endDrag() {
        this.dragState = null;
        this.canvas.style.cursor = '';
        this.templateManager.saveToStorage();
    }

    startResize(element, handle, e) {
        // rect includes pan; (client - rect)/scale is the full inverse.
        const canvasRect = this.canvas.getBoundingClientRect();
        const canvasX = (e.clientX - canvasRect.left) / this.scale;
        const canvasY = (e.clientY - canvasRect.top) / this.scale;

        this.resizeState = {
            element,
            handle,
            startX: canvasX,
            startY: canvasY,
            elementStartX: element.x,
            elementStartY: element.y,
            elementStartWidth: element.width,
            elementStartHeight: element.height
        };
    }

    updateResize(e) {
        if (!this.resizeState) return;

        // Get canvas bounds to calculate relative position (rect includes pan).
        const canvasRect = this.canvas.getBoundingClientRect();
        const currentX = (e.clientX - canvasRect.left) / this.scale;
        const currentY = (e.clientY - canvasRect.top) / this.scale;

        const deltaX = currentX - this.resizeState.startX;
        const deltaY = currentY - this.resizeState.startY;

        const { element, handle } = this.resizeState;
        let newX = element.x;
        let newY = element.y;
        let newWidth = element.width;
        let newHeight = element.height;

        switch (handle) {
            case 'nw':
                newX = this.resizeState.elementStartX + deltaX;
                newY = this.resizeState.elementStartY + deltaY;
                newWidth = this.resizeState.elementStartWidth - deltaX;
                newHeight = this.resizeState.elementStartHeight - deltaY;
                break;
            case 'ne':
                newY = this.resizeState.elementStartY + deltaY;
                newWidth = this.resizeState.elementStartWidth + deltaX;
                newHeight = this.resizeState.elementStartHeight - deltaY;
                break;
            case 'sw':
                newX = this.resizeState.elementStartX + deltaX;
                newWidth = this.resizeState.elementStartWidth - deltaX;
                newHeight = this.resizeState.elementStartHeight + deltaY;
                break;
            case 'se':
                newWidth = this.resizeState.elementStartWidth + deltaX;
                newHeight = this.resizeState.elementStartHeight + deltaY;
                break;
        }

        // Ensure minimum size.
        newWidth = Math.max(10, newWidth);
        newHeight = Math.max(10, newHeight);

        // Recompute the moving edge from the FIXED (anchored) edge after the
        // clamp. Otherwise newX/newY were derived from the unclamped delta, so
        // the anchored edge slides once the element hits its minimum size.
        const fixedRight = this.resizeState.elementStartX + this.resizeState.elementStartWidth;
        const fixedBottom = this.resizeState.elementStartY + this.resizeState.elementStartHeight;
        if (handle === 'nw' || handle === 'sw') {
            newX = fixedRight - newWidth; // right edge stays put
        }
        if (handle === 'nw' || handle === 'ne') {
            newY = fixedBottom - newHeight; // bottom edge stays put
        }

        this.updateElementBounds(element.id, newX, newY, newWidth, newHeight);
    }

    endResize() {
        this.resizeState = null;
        this.templateManager.saveToStorage();
    }

    updateElementPosition(elementId, x, y) {
        const template = this.templateManager.getCurrentTemplate();
        if (template) {
            template.updateElement(elementId, { x, y });
            this.render();
            this.dispatchEvent('elementUpdated', { elementId, x, y });
        }
    }

    updateElementBounds(elementId, x, y, width, height) {
        const template = this.templateManager.getCurrentTemplate();
        if (template) {
            template.updateElement(elementId, { x, y, width, height });
            this.render();
            this.dispatchEvent('elementUpdated', { elementId, x, y, width, height });
        }
    }

    deleteSelectedElement() {
        if (this.selectedElement) {
            const template = this.templateManager.getCurrentTemplate();
            if (template) {
                template.removeElement(this.selectedElement);
                this.selectedElement = null;
                this.render();
                this.templateManager.saveToStorage();
                this.dispatchEvent('elementDeleted');
            }
        }
    }

    addElement(type) {
        const template = this.templateManager.getCurrentTemplate();
        if (!template) return;

        const element = {
            type,
            x: 100,
            y: 100,
            width: type === 'text' ? 200 : 100,
            height: type === 'text' ? 50 : 100,
            content: this.getDefaultContent(type),
            style: this.getDefaultStyle(type)
        };

        template.addElement(element);
        this.render();
        this.templateManager.saveToStorage();
        
        // Select the newly added element
        const newElement = template.elements[template.elements.length - 1];
        this.selectElement(newElement.id);
        
        this.dispatchEvent('elementAdded', { element: newElement });
    }

    getDefaultContent(type) {
        switch (type) {
            case 'text':
                return 'New Text';
            case 'image':
                return PLACEHOLDER_IMAGE;
            default:
                return '';
        }
    }

    getDefaultStyle(type) {
        switch (type) {
            case 'text':
                return {
                    fontSize: '20px',
                    fontFamily: 'Arial, sans-serif',
                    color: '#ffffff',
                    textAlign: 'left',
                    backgroundColor: 'transparent'
                };
            case 'image':
                return {
                    objectFit: 'contain'
                };
            case 'rect':
                return {
                    backgroundColor: '#007acc',
                    borderRadius: '0px',
                    border: 'none'
                };
            case 'circle':
                return {
                    backgroundColor: '#007acc',
                    border: 'none'
                };
            default:
                return {};
        }
    }

    render() {
        const template = this.templateManager.getCurrentTemplate();
        if (!template) {
            this.renderEmptyState();
            return;
        }

        this.renderElements(template.elements);
    }

    renderEmptyState() {
        this.canvas.innerHTML = `
            <div class="canvas-placeholder">
                <p>Select a template or create a new one to start editing</p>
            </div>
        `;
    }

    renderElements(elements) {
        this.canvas.innerHTML = '';
        
        elements.forEach(element => {
            const elementDiv = this.createElement(element);
            this.canvas.appendChild(elementDiv);
        });
    }

    createElement(element) {
        const div = document.createElement('div');
        div.className = 'graphics-element';
        div.dataset.elementId = element.id;
        
        // Apply position and size
        div.style.left = element.x + 'px';
        div.style.top = element.y + 'px';
        div.style.width = element.width + 'px';
        div.style.height = element.height + 'px';

        // Apply element-specific styles
        if (element.style) {
            Object.assign(div.style, element.style);
        }

        // Create element content
        if (element.type === 'text') {
            div.textContent = element.content || 'Text';
            div.style.display = 'flex';
            div.style.alignItems = 'center';
        } else if (element.type === 'image') {
            const img = document.createElement('img');
            // Only load real http(s)/data:image URLs on the design canvas; an
            // unresolved {{token}} or a hostile scheme from an imported template
            // (e.g. data:text/html) falls back to the placeholder. This mirrors
            // the safeSrc guard the generated component applies at render time.
            const content = element.content || '';
            img.src = /^(https?:\/\/|data:image\/)/i.test(content) ? content : PLACEHOLDER_IMAGE;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = element.style?.objectFit || 'contain';
            div.appendChild(img);
        } else if (element.type === 'circle') {
            div.style.borderRadius = '50%';
        }

        // Add selection state
        if (element.id === this.selectedElement) {
            div.classList.add('selected');
            this.addResizeHandles(div);
        }

        return div;
    }

    addResizeHandles(element) {
        const handles = ['nw', 'ne', 'sw', 'se'];
        
        handles.forEach(handle => {
            const handleDiv = document.createElement('div');
            handleDiv.className = `resize-handle ${handle}`;
            element.appendChild(handleDiv);
        });
    }

    fitToView() {
        const containerRect = this.container.getBoundingClientRect();
        const canvasWidth = 1920;
        const canvasHeight = 1080;
        
        const scaleX = (containerRect.width - 40) / canvasWidth;
        const scaleY = (containerRect.height - 40) / canvasHeight;
        
        this.scale = Math.min(scaleX, scaleY, 1);
        this.panOffset = { x: 0, y: 0 };
        this.updateTransform();
    }

    resetView() {
        this.scale = 1;
        this.panOffset = { x: 0, y: 0 };
        this.updateTransform();
    }

    getSelectedElement() {
        const template = this.templateManager.getCurrentTemplate();
        if (template && this.selectedElement) {
            return template.getElementById(this.selectedElement);
        }
        return null;
    }

    updateSelectedElement(updates) {
        if (this.selectedElement) {
            const template = this.templateManager.getCurrentTemplate();
            if (template) {
                template.updateElement(this.selectedElement, updates);
                this.render();
                this.templateManager.saveToStorage();
            }
        }
    }

    dispatchEvent(eventName, detail = {}) {
        const event = new CustomEvent(eventName, { detail });
        this.container.dispatchEvent(event);
    }

    destroy() {
        // Clean up event listeners (same bound refs used to add them).
        this.canvas.removeEventListener('mousedown', this._onMouseDown);
        this.canvas.removeEventListener('click', this._onClick);
        this.canvas.removeEventListener('contextmenu', this._onContextMenu);
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mouseup', this._onMouseUp);
        document.removeEventListener('keydown', this._onKeyDown);
        this.container.removeEventListener('wheel', this._onWheel);
    }
}