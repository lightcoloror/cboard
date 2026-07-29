/* global globalThis */
let cachedFs = null;
let cachedPath = null;
let cachedOs = null;
let cachedRequire = undefined;
export function getNodeRequire() {
  if (cachedRequire === undefined) {
    if (typeof require === 'function') {
      cachedRequire = require;
    } else if (typeof globalThis !== 'undefined') {
      const maybeRequire = globalThis.require;
      cachedRequire = typeof maybeRequire === 'function' ? maybeRequire : null;
    } else {
      cachedRequire = null;
    }
  }
  if (!cachedRequire) {
    throw new Error('File system access is not available in this environment.');
  }
  return cachedRequire;
}
function getFs() {
  if (!cachedFs) {
    try {
      const nodeRequire = getNodeRequire();
      const fsModule = 'node:fs';
      cachedFs = nodeRequire(fsModule);
    } catch {
      throw new Error(
        'File system access is not available in this environment.'
      );
    }
  }
  if (!cachedFs) {
    throw new Error('File system access is not available in this environment.');
  }
  return cachedFs;
}
function getPath() {
  if (!cachedPath) {
    try {
      const nodeRequire = getNodeRequire();
      const pathModule = 'path';
      cachedPath = nodeRequire(pathModule);
    } catch {
      throw new Error('Path utilities are not available in this environment.');
    }
  }
  if (!cachedPath) {
    throw new Error('Path utilities are not available in this environment.');
  }
  return cachedPath;
}
export function getOs() {
  if (!cachedOs) {
    try {
      const nodeRequire = getNodeRequire();
      const osModule = 'os';
      cachedOs = nodeRequire(osModule);
    } catch {
      throw new Error('OS utilities are not available in this environment.');
    }
  }
  if (!cachedOs) {
    throw new Error('OS utilities are not available in this environment.');
  }
  return cachedOs;
}
export function isNodeRuntime() {
  var _process$versions;
  return (
    typeof process !== 'undefined' &&
    !!(
      (_process$versions = process.versions) !== null &&
      _process$versions !== void 0 &&
      _process$versions.node
    )
  );
}
export function getBasename(filePath) {
  const trimmed = filePath.replace(/[/\\]+$/, '') || filePath;
  const parts = trimmed.split(/[/\\]/);
  return parts[parts.length - 1] || trimmed;
}
export function toUint8Array(input) {
  if (input instanceof Uint8Array) {
    return input;
  }
  return new Uint8Array(input);
}
export function toArrayBuffer(input) {
  if (input instanceof ArrayBuffer) {
    return input;
  }
  const view = input instanceof Uint8Array ? input : new Uint8Array(input);
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
}
export function decodeText(input) {
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) {
    return input.toString('utf8');
  }
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(input);
}
export function encodeBase64(input) {
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) {
    return input.toString('base64');
  }
  // Browser fallback using btoa
  let binary = '';
  const len = input.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(input[i]);
  }
  return btoa(binary);
}
export function encodeText(text) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(text, 'utf8');
  }
  return new TextEncoder().encode(text);
}
// extname algorithm from node:path
const splitDeviceRe = /^([a-zA-Z]:|[\\\/]{2}[^\\\/]+[\\\/]+[^\\\/]+)?([\\\/])?([\s\S]*?)$/; //eslint-disable-line
const splitTailRe = /^([\s\S]*?)((?:\.{1,2}|[^\\\/]+?|)(\.[^.\/\\]*|))(?:[\\\/]*)$/; //eslint-disable-line
export function extname(path) {
  var _splitDeviceRe$exec$a,
    _splitDeviceRe$exec,
    _splitTailRe$exec$at,
    _splitTailRe$exec;
  const tail =
    (_splitDeviceRe$exec$a =
      (_splitDeviceRe$exec = splitDeviceRe.exec(path)) === null ||
      _splitDeviceRe$exec === void 0
        ? void 0
        : _splitDeviceRe$exec.at(3)) !== null &&
    _splitDeviceRe$exec$a !== void 0
      ? _splitDeviceRe$exec$a
      : '';
  return (_splitTailRe$exec$at =
    (_splitTailRe$exec = splitTailRe.exec(tail)) === null ||
    _splitTailRe$exec === void 0
      ? void 0
      : _splitTailRe$exec.at(3)) !== null && _splitTailRe$exec$at !== void 0
    ? _splitTailRe$exec$at
    : '';
}
async function readBinaryFromInput(input) {
  if (typeof input === 'string') {
    return Promise.resolve(getFs().readFileSync(input));
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) {
    return Promise.resolve(input);
  }
  if (input instanceof ArrayBuffer) {
    return Promise.resolve(new Uint8Array(input));
  }
  return Promise.resolve(input);
}
async function readTextFromInput(input, encoding = 'utf8') {
  if (typeof input === 'string') {
    return Promise.resolve(getFs().readFileSync(input, encoding));
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) {
    return Promise.resolve(input.toString(encoding));
  }
  if (input instanceof ArrayBuffer) {
    return Promise.resolve(decodeText(new Uint8Array(input)));
  }
  return Promise.resolve(decodeText(input));
}
async function writeBinaryToPath(outputPath, data) {
  getFs().writeFileSync(outputPath, data);
  await Promise.resolve();
}
async function writeTextToPath(outputPath, text) {
  getFs().writeFileSync(outputPath, text, 'utf8');
  await Promise.resolve();
}
async function pathExists(path) {
  return Promise.resolve(getFs().existsSync(path));
}
async function isDirectory(path) {
  return Promise.resolve(
    getFs()
      .statSync(path)
      .isDirectory()
  );
}
async function getFileSize(path) {
  return Promise.resolve(getFs().statSync(path).size);
}
async function mkDir(path, options) {
  getFs().mkdirSync(path, options);
  await Promise.resolve();
}
async function listDir(path) {
  return Promise.resolve(getFs().readdirSync(path));
}
async function removePath(path, options) {
  getFs().rmSync(path, options);
  await Promise.resolve();
}
async function mkTempDir(prefix) {
  const path = join(getOs().tmpdir(), prefix);
  return Promise.resolve(getFs().mkdtempSync(path));
}
function join(...pathParts) {
  return getPath().join(...pathParts);
}
export function joinWin32(...pathParts) {
  return getPath().win32.join(...pathParts);
}
function dirname(path) {
  return getPath().dirname(path);
}
function basename(path, suffix) {
  return getPath().basename(path, suffix);
}
export const defaultFileAdapter = {
  readBinaryFromInput,
  readTextFromInput,
  writeBinaryToPath,
  writeTextToPath,
  pathExists,
  isDirectory,
  getFileSize,
  mkDir,
  listDir,
  removePath,
  mkTempDir,
  join,
  dirname,
  basename
};
