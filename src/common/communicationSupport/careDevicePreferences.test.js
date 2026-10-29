import { createCareDevicePreferencesStore, CARE_DEVICE_OVERRIDES_KEY } from './careDevicePreferences';

test('device overrides win after reopen and never create a shared pending operation', () => {
  const values = new Map(), storage = { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v) };
  const defaults = { speechRate: 0.7, fontSize: 'large', cardDensity: 3 };
  const open = () => createCareDevicePreferencesStore({ storage, defaults: () => defaults });
  expect(open().load().speechRate).toBe(0.7);
  open().update({ speechRate: 1.3, gridColumns: 2 });
  defaults.speechRate = 1;
  expect(open().load()).toMatchObject({ speechRate: 1.3, gridColumns: 2, fontSize: 'large' });
  expect([...values.keys()].some(k => k.includes('pending'))).toBe(false);
});
test.each(['false','silent','readback'])('override marker %s failure is not success and can be retried', mode => {
  const values = new Map(); let failing = true;
  const store = createCareDevicePreferencesStore({ storage: {
    getItem: k => { if(failing && mode==='readback' && k===CARE_DEVICE_OVERRIDES_KEY && values.has(k)) throw Error('synthetic read');return values.get(k); },
    setItem: (k,v) => { if(failing && k===CARE_DEVICE_OVERRIDES_KEY){if(mode==='false')return false;if(mode==='silent')return;}values.set(k,v); }
  }, defaults: () => ({speechRate:0.7}) });
  expect(() => store.update({speechRate:1.3})).toThrow();
  failing=false;expect(store.update({speechRate:1.3}).speechRate).toBe(1.3);expect(store.load().speechRate).toBe(1.3);
});
test('older explicit pending and display values are read without mutation', () => {
  const values=new Map([['cboard_communication_preferences',JSON.stringify({speechRate:1.3})]]);
  const set=jest.fn(); const store=createCareDevicePreferencesStore({storage:{getItem:k=>values.get(k),setItem:set},defaults:()=>({speechRate:0.7}),legacy:()=>({fontSize:'large'}),legacySpeechPending:()=>true});
  expect(store.load()).toMatchObject({speechRate:1.3,fontSize:'large'});expect(set).not.toHaveBeenCalled();
});
