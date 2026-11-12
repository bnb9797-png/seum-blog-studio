"use strict";

async function createCardNewsZip(files) {
  const encode = new TextEncoder();
  const checksumTable = Uint32Array.from({ length: 256 }, (_, value) => {
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    }
    return value;
  });
  const fileParts = [];
  const directory = [];
  let offset = 0;
  let directorySize = 0;

  for (const file of files) {
    const name = encode.encode(file.name);
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    let checksum = 0xffffffff;
    for (const byte of bytes) checksum = (checksum >>> 8) ^ checksumTable[(checksum ^ byte) & 0xff];
    checksum = (checksum ^ 0xffffffff) >>> 0;

    // ZIP stores PNGs as-is because the image bytes are already compressed.
    const entry = new DataView(new ArrayBuffer(30));
    entry.setUint32(0, 0x04034b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 0x0800, true);
    entry.setUint16(12, 33, true);
    entry.setUint32(14, checksum, true);
    entry.setUint32(18, bytes.length, true);
    entry.setUint32(22, bytes.length, true);
    entry.setUint16(26, name.length, true);
    fileParts.push(entry.buffer, name, bytes);

    const record = new DataView(new ArrayBuffer(46));
    record.setUint32(0, 0x02014b50, true);
    record.setUint16(4, 20, true);
    record.setUint16(6, 20, true);
    record.setUint16(8, 0x0800, true);
    record.setUint16(14, 33, true);
    record.setUint32(16, checksum, true);
    record.setUint32(20, bytes.length, true);
    record.setUint32(24, bytes.length, true);
    record.setUint16(28, name.length, true);
    record.setUint32(42, offset, true);
    directory.push(record.buffer, name);
    offset += entry.byteLength + name.length + bytes.length;
    directorySize += record.byteLength + name.length;
  }

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  return new Blob([...fileParts, ...directory, end.buffer], { type: "application/zip" });
}
