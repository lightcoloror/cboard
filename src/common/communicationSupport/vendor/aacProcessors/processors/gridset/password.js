function getExtension(source) {
  const index = source.lastIndexOf('.');
  if (index === -1) return '';
  return source.slice(index);
}
/**
 * Resolve the password to use for Grid3 archives.
 * Preference order:
 * 1. Explicit processor option
 * 2. GRIDSET_PASSWORD env var
 */
export function resolveGridsetPassword(options, source) {
  if (options?.gridsetPassword) return options.gridsetPassword;
  const envPassword =
    typeof process !== 'undefined' ? process.env?.GRIDSET_PASSWORD : undefined;
  if (envPassword) return envPassword;
  if (typeof source === 'string') {
    const ext = getExtension(source).toLowerCase();
    if (ext === '.gridsetx') return envPassword;
  }
  return undefined;
}
export function resolveGridsetPasswordFromEnv() {
  return typeof process !== 'undefined'
    ? process.env?.GRIDSET_PASSWORD
    : undefined;
}
export function getZipEntriesWithPassword(zip, password) {
  const entries = [];
  // Note: JSZip doesn't support zip-level password protection like AdmZip
  // Password protection for .gridsetx files is handled at the encrypted archive level
  // in crypto.ts before the zip is loaded
  if (password) {
    console.warn(
      'JSZip does not support zip-level password protection. For .gridsetx encrypted files, password is handled at the archive level.'
    );
  }
  zip.forEach((relativePath, file) => {
    entries.push({
      name: relativePath,
      entryName: relativePath,
      dir: file.dir || false,
      getData: async () => {
        // Use 'uint8array' which is supported everywhere
        return await file.async('uint8array');
      }
    });
  });
  return entries;
}
export function getZipEntriesFromAdapter(zip, password) {
  if (password) {
    console.warn(
      'Zip password support is handled at the archive level for .gridsetx files.'
    );
  }
  return zip.listFiles().map(entryName => ({
    name: entryName,
    entryName,
    dir: false,
    getData: () => zip.readFile(entryName)
  }));
}
