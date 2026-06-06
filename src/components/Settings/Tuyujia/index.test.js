import TuyujiaSettings from './index';
import TuyujiaContainer from './Tuyujia.container';

describe('Tuyujia settings entrypoint', () => {
  test('re-exports the compatibility container', () => {
    expect(TuyujiaSettings).toBe(TuyujiaContainer);
  });
});
