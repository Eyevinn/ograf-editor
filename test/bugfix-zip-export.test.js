import { describe, it, expect } from 'vitest';
import { createZip, crc32, readZip } from '../src/utils/zip.js';

describe('zip export util', () => {
  it('crc32 matches the known checksum for "hello"', () => {
    const bytes = new TextEncoder().encode('hello');
    expect(crc32(bytes)).toBe(0x3610a686);
  });

  it('createZip produces a valid stored zip containing both OGraf files', async () => {
    const blob = createZip({
      'demo.ograf.json': '{"id":"demo"}',
      'template.mjs': 'export default class {}'
    });
    expect(blob.type).toBe('application/zip');

    const buf = new Uint8Array(await blob.arrayBuffer());

    // Local file header signature: PK\x03\x04
    expect([buf[0], buf[1], buf[2], buf[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);

    // End-of-central-directory record (22 bytes, no comment): PK\x05\x06
    const eocd = buf.length - 22;
    expect([buf[eocd], buf[eocd + 1], buf[eocd + 2], buf[eocd + 3]]).toEqual([0x50, 0x4b, 0x05, 0x06]);

    // Total entries (little-endian u16 at EOCD offset 10) is 2.
    const totalEntries = buf[eocd + 10] | (buf[eocd + 11] << 8);
    expect(totalEntries).toBe(2);

    // Both file names are present in the archive bytes.
    const text = new TextDecoder().decode(buf);
    expect(text).toContain('demo.ograf.json');
    expect(text).toContain('template.mjs');
  });

  it('round-trips: createZip then readZip returns the same files (export/import symmetry)', async () => {
    const files = {
      'demo.ograf.json': '{"id":"demo","name":"Demo","main":"template.mjs"}',
      'template.mjs': 'export default class Demo extends HTMLElement {}'
    };
    const blob = createZip(files);
    const entries = await readZip(await blob.arrayBuffer());
    expect(entries['demo.ograf.json']).toBe(files['demo.ograf.json']);
    expect(entries['template.mjs']).toBe(files['template.mjs']);
  });
});
