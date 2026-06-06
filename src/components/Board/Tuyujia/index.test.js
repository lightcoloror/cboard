import TuyujiaPanel from './index';
import TuyujiaPanelContainer from './TuyujiaPanel.container';

describe('Tuyujia board entrypoint', () => {
  test('re-exports the compatibility container', () => {
    expect(TuyujiaPanel).toBe(TuyujiaPanelContainer);
  });
});
