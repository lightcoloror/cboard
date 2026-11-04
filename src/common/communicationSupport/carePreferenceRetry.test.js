import { createCareSync } from './careSync';

function fixture() {
  const disk=new Map();let serial=0,ackFailure=false;
  const permissions=['read','preferences.edit','library.edit'];
  const storage={get:async key=>disk.get(key),set:async(key,value)=>{disk.set(key,value);if(ackFailure){ackFailure=false;throw Error('synthetic write receipt lost');}}};
  const open=()=>createCareSync({accountId:'synthetic-account',familyId:'synthetic-family',profileId:'synthetic-profile',storage,currentAccount:()=> 'synthetic-account',newId:async()=>`synthetic-operation-${++serial}`,request:async()=>({familyId:'synthetic-family',cursor:1,permissions,resources:[]})});
  return {open,permissions,loseReceipt:()=>{ackFailure=true;},ids:()=>serial};
}
test.each(['fontSize','cardDensity','speechRate'])('same pending %s retains one operation identity, including after a new engine reads storage',async field=>{
  const f=fixture(),a=f.open();await a.init();await a.sync();
  const value={value:field==='fontSize'?'large':field==='cardDensity'?4:1.3};
  await a.edit('preference',field,value);const original=a.view().queue[0];
  await a.edit('preference',field,{...value});
  const b=f.open();await b.init();await b.edit('preference',field,{...value});
  expect(b.view().queue).toEqual([original]);expect(f.ids()).toBe(1);
});
test('write completed but receipt failed is discovered by the existing serial read rather than duplicated',async()=>{
  const f=fixture(),engine=f.open();await engine.init();await engine.sync();f.loseReceipt();
  await expect(engine.edit('preference','speechRate',{value:1.3})).rejects.toThrow('receipt lost');
  await engine.edit('preference','speechRate',{value:1.3});
  expect(engine.view().queue).toHaveLength(1);expect(f.ids()).toBe(1);
});
test('an intervening different preference intention is not merged with an older matching value',async()=>{
  const f=fixture(),engine=f.open();await engine.init();await engine.sync();
  for(const value of [1.3,.7,1.3])await engine.edit('preference','speechRate',{value});
  expect(engine.view().queue.map(op=>op.value.value)).toEqual([1.3,.7,1.3]);expect(f.ids()).toBe(3);
});
test('deduplication cannot bypass a revoked preferences.edit grant',async()=>{
  const f=fixture(),engine=f.open();await engine.init();await engine.sync();await engine.edit('preference','speechRate',{value:1.3});
  f.permissions.splice(f.permissions.indexOf('preferences.edit'),1);
  await expect(engine.sync()).rejects.toThrow('编辑权限');
  await expect(engine.edit('preference','speechRate',{value:1.3})).rejects.toThrow('编辑权限');
  expect(engine.view().queue).toHaveLength(1);expect(f.ids()).toBe(1);
});
test('the change does not deduplicate other resource kinds or unknown preference fields',async()=>{
  const f=fixture(),engine=f.open();await engine.init();await engine.sync();
  for(let i=0;i<2;i++)await engine.edit('tile','synthetic-tile',{label:'合成图'});
  for(let i=0;i<2;i++)await engine.edit('preference','synthetic-other',{value:'unchanged'});
  expect(engine.view().queue).toHaveLength(4);expect(f.ids()).toBe(4);
});
