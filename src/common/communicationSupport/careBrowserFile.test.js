import { chooseCareBrowserFile } from './careBrowserFile';

test('native picker retains an attached input until selection and releases it afterward', async () => {
  const click = jest
    .spyOn(HTMLInputElement.prototype, 'click')
    .mockImplementation(function() {
      expect(document.body.contains(this)).toBe(true);
    });
  const pending = chooseCareBrowserFile('image/png');
  const input = document.querySelector('input[type=file]');
  const file = new File(['synthetic'], 'trial.png', { type: 'image/png' });
  Object.defineProperty(input, 'files', { value: [file] });
  input.onchange();
  await expect(pending).resolves.toBe(file);
  expect(document.body.contains(input)).toBe(false);
  click.mockRestore();
});

test('cancel releases the picker and settles the operation', async () => {
  const click = jest
    .spyOn(HTMLInputElement.prototype, 'click')
    .mockImplementation(() => {});
  const pending = chooseCareBrowserFile('.zip');
  const input = document.querySelector('input[type=file]');
  input.oncancel();
  await expect(pending).resolves.toBeNull();
  expect(document.body.contains(input)).toBe(false);
  click.mockRestore();
});
