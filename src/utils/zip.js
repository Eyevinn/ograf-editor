// Minimal, dependency-free ZIP writer (stored / no compression). Enough to
// bundle an OGraf Graphic's small text files (the <id>.ograf.json manifest and
// its .mjs component) into a single .zip. No compression keeps it tiny and
// correct; the files are small text so size is not a concern.

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c >>> 0;
    }
    return table;
})();

export function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
        crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function concat(arrays) {
    let len = 0;
    for (const a of arrays) len += a.length;
    const out = new Uint8Array(len);
    let pos = 0;
    for (const a of arrays) { out.set(a, pos); pos += a.length; }
    return out;
}

const u16 = (v) => new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF]);
const u32 = (v) => new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]);

// files: { filename: string | Uint8Array }. Returns a Blob (application/zip).
export function createZip(files) {
    const encoder = new TextEncoder();
    const entries = Object.entries(files).map(([name, content]) => {
        const nameBytes = encoder.encode(name);
        const data = typeof content === 'string' ? encoder.encode(content) : content;
        return { nameBytes, data, crc: crc32(data) };
    });

    const chunks = [];
    const central = [];
    let offset = 0;

    for (const e of entries) {
        const localHeader = concat([
            u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
            u32(e.crc), u32(e.data.length), u32(e.data.length),
            u16(e.nameBytes.length), u16(0),
            e.nameBytes
        ]);
        chunks.push(localHeader, e.data);

        central.push(concat([
            u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
            u32(e.crc), u32(e.data.length), u32(e.data.length),
            u16(e.nameBytes.length), u16(0), u16(0), u16(0), u16(0),
            u32(0), u32(offset),
            e.nameBytes
        ]));

        offset += localHeader.length + e.data.length;
    }

    const centralStart = offset;
    let centralSize = 0;
    for (const c of central) { chunks.push(c); centralSize += c.length; }

    chunks.push(concat([
        u32(0x06054b50), u16(0), u16(0),
        u16(entries.length), u16(entries.length),
        u32(centralSize), u32(centralStart), u16(0)
    ]));

    return new Blob(chunks, { type: 'application/zip' });
}

async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') {
        throw new Error('This browser cannot read compressed zip entries.');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Read a zip (stored or deflate) into { filename: textContent }. Decodes entries
// as UTF-8 (OGraf files are text). Reads our own stored zips and standard
// deflate zips produced by other tools.
export async function readZip(arrayBuffer) {
    const buf = new Uint8Array(arrayBuffer);
    const dv = new DataView(arrayBuffer);
    const decoder = new TextDecoder();

    // Find the End Of Central Directory record (scan back over any comment).
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65536); i--) {
        if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Not a valid zip file');

    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true); // central directory offset
    const out = {};

    for (let n = 0; n < count; n++) {
        if (dv.getUint32(p, true) !== 0x02014b50) break;
        const method = dv.getUint16(p + 10, true);
        const compSize = dv.getUint32(p + 20, true);
        const nameLen = dv.getUint16(p + 28, true);
        const extraLen = dv.getUint16(p + 30, true);
        const commentLen = dv.getUint16(p + 32, true);
        const localOffset = dv.getUint32(p + 42, true);
        const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));

        const lhNameLen = dv.getUint16(localOffset + 26, true);
        const lhExtraLen = dv.getUint16(localOffset + 28, true);
        const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
        const raw = buf.subarray(dataStart, dataStart + compSize);

        let data;
        if (method === 0) data = raw;
        else if (method === 8) data = await inflateRaw(raw);
        else throw new Error('Unsupported zip compression method ' + method);

        out[name] = decoder.decode(data);
        p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
}
