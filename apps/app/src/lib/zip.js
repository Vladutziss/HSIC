// A minimal ZIP writer: text files stored without compression (method 0), UTF-8 names. Enough to hand over a folder
// of Markdown notes in one download, without a dependency. Tested in tests/mdExport.test.mjs (and read back with unzip).

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** files: [{ name, text }]. `at`: the time stamped on every file. Returns the archive as a Uint8Array. */
export function zipFiles(files, at = new Date()) {
  const enc = new TextEncoder();
  const time = (at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1);
  const date = ((Math.max(1980, at.getFullYear()) - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate();
  const parts = [];
  const central = [];
  let offset = 0;
  const header = (size, fill) => {
    const b = new Uint8Array(size);
    fill(new DataView(b.buffer));
    return b;
  };
  for (const f of files) {
    const name = enc.encode(String(f.name).replace(/^\/+/, ""));
    const data = enc.encode(f.text ?? "");
    const crc = crc32(data);
    const common = (v, at0) => {
      v.setUint16(at0, 20, true); // version needed
      v.setUint16(at0 + 2, 0x0800, true); // names are UTF-8
      v.setUint16(at0 + 4, 0, true); // stored
      v.setUint16(at0 + 6, time, true);
      v.setUint16(at0 + 8, date, true);
      v.setUint32(at0 + 10, crc, true);
      v.setUint32(at0 + 14, data.length, true);
      v.setUint32(at0 + 18, data.length, true);
      v.setUint16(at0 + 22, name.length, true);
    };
    const local = header(30, (v) => {
      v.setUint32(0, 0x04034b50, true);
      common(v, 4);
    });
    parts.push(local, name, data);
    const start = offset;
    central.push(
      header(46, (v) => {
        v.setUint32(0, 0x02014b50, true);
        v.setUint16(4, 20, true); // made by
        common(v, 6);
        v.setUint32(42, start, true);
      }),
      name
    );
    offset += local.length + name.length + data.length;
  }
  const centralSize = central.reduce((a, b) => a + b.length, 0);
  const end = header(22, (v) => {
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, files.length, true);
    v.setUint16(10, files.length, true);
    v.setUint32(12, centralSize, true);
    v.setUint32(16, offset, true);
  });
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0;
  for (const b of all) {
    out.set(b, p);
    p += b.length;
  }
  return out;
}
