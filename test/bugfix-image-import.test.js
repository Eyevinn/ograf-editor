import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PropertyPanel } from '../src/components/PropertyPanel.js';

/**
 * GAP-E: image file import. A designer can put a local image into an image
 * element by picking (or dropping) a file. The file is read as a data: URI and
 * committed through the same content path the URL field uses, so the exported
 * template is self-contained (external URLs may not resolve in a renderer).
 *
 * handleImageFile is the core of the feature: it validates the type, enforces
 * the size guardrail (warn-but-embed over the limit, reject non-images), and
 * commits the data URI via visualEditor.updateSelectedElement. It is exercised
 * here on the prototype with a minimal fake `this`, mirroring the colorToHex
 * test, so we do not need to stand up the whole DOM panel.
 *
 * jsdom provides FileReader / File; readAsDataURL is async, so the assertions
 * wait on the updateSelectedElement spy.
 */
function makePanel() {
  const updateSelectedElement = vi.fn();
  const setImageFileNote = vi.fn();
  const notifyError = vi.fn();
  const render = vi.fn();
  const self = {
    currentElement: 'logo',
    visualEditor: { updateSelectedElement },
    handleImageFile: PropertyPanel.prototype.handleImageFile,
    setImageFileNote,
    notifyError,
    render,
    escapeHtml: PropertyPanel.prototype.escapeHtml
  };
  return { self, updateSelectedElement, setImageFileNote, notifyError, render };
}

// Resolve once the spy has been called (or time out). FileReader fires its
// onload on a microtask/macrotask boundary in jsdom.
function waitFor(spy, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (spy.mock.calls.length > 0) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('timeout waiting for spy'));
      setTimeout(tick, 5);
    };
    tick();
  });
}

describe('PropertyPanel.handleImageFile (GAP-E image import)', () => {
  beforeEach(() => {
    // The toast channel is optional; ensure it is absent so notifyError is a
    // no-op path unless the panel stubs it.
    delete globalThis.ografEditor;
    if (typeof window !== 'undefined') delete window.ografEditor;
  });

  it('reads a small PNG file and commits its content as a data:image URI', async () => {
    const { self, updateSelectedElement, setImageFileNote } = makePanel();
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'logo.png', { type: 'image/png' });

    self.handleImageFile(file);
    await waitFor(updateSelectedElement);

    expect(updateSelectedElement).toHaveBeenCalledTimes(1);
    const arg = updateSelectedElement.mock.calls[0][0];
    expect(arg.content.startsWith('data:image/png')).toBe(true);
    // Small file -> success note, not a warning.
    expect(setImageFileNote.mock.calls[0][1]).toBe('ok');
  });

  it('rejects a non-image file with a clear message and never commits', async () => {
    const { self, updateSelectedElement, setImageFileNote, notifyError } = makePanel();
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });

    self.handleImageFile(file);
    // Synchronous rejection (no FileReader), so a tick is enough.
    await new Promise((r) => setTimeout(r, 0));

    expect(updateSelectedElement).not.toHaveBeenCalled();
    expect(setImageFileNote.mock.calls[0][1]).toBe('error');
    expect(notifyError).toHaveBeenCalledTimes(1);
  });

  it('warns but still embeds when the file exceeds the size limit', async () => {
    const { self, updateSelectedElement, setImageFileNote } = makePanel();
    // Just over the 2 MB warn threshold.
    const bytes = new Uint8Array(PropertyPanel.IMAGE_SIZE_WARN_BYTES + 1);
    const file = new File([bytes], 'big.jpg', { type: 'image/jpeg' });

    self.handleImageFile(file);
    await waitFor(updateSelectedElement);

    // Still embedded.
    expect(updateSelectedElement).toHaveBeenCalledTimes(1);
    expect(updateSelectedElement.mock.calls[0][0].content.startsWith('data:image/jpeg')).toBe(true);
    // But flagged as a warning.
    expect(setImageFileNote.mock.calls[0][1]).toBe('warn');
  });

  it('does nothing when no element is selected', () => {
    const { self, updateSelectedElement } = makePanel();
    self.currentElement = null;
    const file = new File([new Uint8Array([1])], 'logo.png', { type: 'image/png' });

    self.handleImageFile(file);
    expect(updateSelectedElement).not.toHaveBeenCalled();
  });
});
