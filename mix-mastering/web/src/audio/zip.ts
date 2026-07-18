// Minimal store-only (uncompressed) ZIP writer, used to export a mastered
// album as one download. WAV data doesn't compress meaningfully, so STORE
// keeps this dependency-free without a size penalty.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export function createZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    // Local file header
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);      // version needed
    local.setUint16(6, 0x0800, true);  // flags: UTF-8 names
    local.setUint16(8, 0, true);       // method: store
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);   // compressed size
    local.setUint32(22, size, true);   // uncompressed size
    local.setUint16(26, nameBytes.length, true);

    // Central directory record
    const cdr = new DataView(new ArrayBuffer(46));
    cdr.setUint32(0, 0x02014b50, true);
    cdr.setUint16(4, 20, true);        // version made by
    cdr.setUint16(6, 20, true);        // version needed
    cdr.setUint16(8, 0x0800, true);    // flags: UTF-8 names
    cdr.setUint16(10, 0, true);        // method: store
    cdr.setUint32(16, crc, true);
    cdr.setUint32(20, size, true);
    cdr.setUint32(24, size, true);
    cdr.setUint16(28, nameBytes.length, true);
    cdr.setUint32(42, offset, true);   // local header offset

    parts.push(new Uint8Array(local.buffer), nameBytes, entry.data);
    central.push(new Uint8Array(cdr.buffer), nameBytes);
    offset += 30 + nameBytes.length + size;
  }

  const centralSize = central.reduce((n, p) => n + p.length, 0);

  // End of central directory
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, offset, true);

  return new Blob(
    [...parts, ...central, new Uint8Array(eocd.buffer)] as BlobPart[],
    { type: 'application/zip' },
  );
}
