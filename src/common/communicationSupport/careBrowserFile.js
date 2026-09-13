// Keep the picker attached until the native chooser has finished. Detached
// inputs cannot be addressed reliably by browser automation and some webviews.
export function chooseCareBrowserFile(accept) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.hidden = true;
    const finish = file => {
      input.remove();
      resolve(file);
    };
    input.onchange = () => finish(input.files[0] || null);
    input.oncancel = () => finish(null);
    document.body.appendChild(input);
    try {
      input.click();
    } catch (error) {
      input.remove();
      reject(error);
    }
  });
}
