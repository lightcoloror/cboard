import JSZip from 'jszip';

export async function createJsZipArchiveAdapter(input) {
  const zip = await JSZip.loadAsync(input);
  const fileNames = Object.entries(zip.files)
    .filter(([, entry]) => !entry.dir)
    .map(([name]) => name);

  return {
    listFiles: () => fileNames.slice(),
    readFile: async name => {
      const file = zip.file(name);
      if (!file) throw new TypeError(`ZIP entry not found: ${name}`);
      return file.async('uint8array');
    }
  };
}
