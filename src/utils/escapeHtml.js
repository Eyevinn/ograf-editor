/**
 * HTML-escape an untrusted value before it is interpolated into innerHTML.
 *
 * Use this anywhere the editor UI splices manifest or element data (which can
 * arrive from an imported .ograf / editor-template file) into an innerHTML
 * string. It covers both element-text and double-quoted attribute contexts.
 *
 * NOTE: the generated web component keeps its own inline escapeHtml so the
 * emitted module stays self-contained (no import). Do not import this into
 * generated component code.
 */
export function escapeHtml(value) {
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
