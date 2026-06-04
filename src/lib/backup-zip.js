import { deflateRawSync, inflateRawSync } from "zlib";

const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

export function backupJsonPayload(data, extra = {}) {
  return JSON.stringify({ exportedAt: new Date().toISOString(), ...extra, data }, null, 2);
}

export function backupZipFileName(date = new Date()) {
  const stamp = toDate(date).toISOString().replace(/[:.]/g, "-");
  return `repairnote-backup-${stamp}.zip`;
}

export function backupJsonFileName(date = new Date()) {
  const stamp = toDate(date).toISOString().replace(/[:.]/g, "-");
  return `repairnote-backup-${stamp}.json`;
}

export function zipResponse({ json, zipName, jsonName }) {
  return new Response(createZipBuffer(jsonName, json), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`
    }
  });
}

export function createZipBuffer(fileName, text) {
  const name = Buffer.from(fileName, "utf8");
  const source = Buffer.from(text, "utf8");
  const compressed = deflateRawSync(source);
  const crc = crc32(source);
  const now = new Date();
  const local = Buffer.alloc(30);
  local.writeUInt32LE(ZIP_LOCAL_SIGNATURE, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(dosTime(now), 10);
  local.writeUInt16LE(dosDate(now), 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(source.length, 22);
  local.writeUInt16LE(name.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(ZIP_CENTRAL_SIGNATURE, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(dosTime(now), 12);
  central.writeUInt16LE(dosDate(now), 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(source.length, 24);
  central.writeUInt16LE(name.length, 28);

  const centralOffset = local.length + name.length + compressed.length;
  central.writeUInt32LE(0, 42);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(ZIP_EOCD_SIGNATURE, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(centralOffset, 16);

  return Buffer.concat([local, name, compressed, central, name, end]);
}

export function readBackupTextFromZip(buffer) {
  const source = Buffer.from(buffer);
  const eocdOffset = findEndOfCentralDirectory(source);
  const entryCount = source.readUInt16LE(eocdOffset + 10);
  if (entryCount > 20) throwBadZip();
  let offset = source.readUInt32LE(eocdOffset + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (source.readUInt32LE(offset) !== ZIP_CENTRAL_SIGNATURE) throwBadZip();
    const method = source.readUInt16LE(offset + 10);
    const compressedSize = source.readUInt32LE(offset + 20);
    const uncompressedSize = source.readUInt32LE(offset + 24);
    const nameLength = source.readUInt16LE(offset + 28);
    const extraLength = source.readUInt16LE(offset + 30);
    const commentLength = source.readUInt16LE(offset + 32);
    const localOffset = source.readUInt32LE(offset + 42);
    const fileName = source.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (uncompressedSize > 200 * 1024 * 1024) {
      const error = new Error("压缩包里的备份文件太大，最多 200MB");
      error.status = 400;
      throw error;
    }
    if (fileName.toLowerCase().endsWith(".json")) {
      return readZipEntry(source, localOffset, method, compressedSize, uncompressedSize).toString("utf8");
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }

  const error = new Error("压缩包里没有找到 JSON 备份文件");
  error.status = 400;
  throw error;
}

function readZipEntry(source, offset, method, compressedSize, uncompressedSize) {
  if (source.readUInt32LE(offset) !== ZIP_LOCAL_SIGNATURE) throwBadZip();
  const nameLength = source.readUInt16LE(offset + 26);
  const extraLength = source.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + nameLength + extraLength;
  const compressed = source.subarray(dataStart, dataStart + compressedSize);
  if (method === 0) return compressed;
  if (method === 8) {
    const inflated = inflateRawSync(compressed);
    if (inflated.length !== uncompressedSize) throwBadZip();
    return inflated;
  }
  const error = new Error("压缩包格式不支持，请上传系统导出的 ZIP 备份");
  error.status = 400;
  throw error;
}

function findEndOfCentralDirectory(source) {
  for (let offset = source.length - 22; offset >= 0; offset -= 1) {
    if (source.readUInt32LE(offset) === ZIP_EOCD_SIGNATURE) return offset;
  }
  throwBadZip();
}

function crc32(source) {
  let crc = 0xffffffff;
  for (const byte of source) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTime(date) {
  return (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
}

function dosDate(date) {
  return ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function throwBadZip() {
  const error = new Error("压缩包格式不正确");
  error.status = 400;
  throw error;
}
