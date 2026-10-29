import React, { useState } from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import { Scanner } from 'react-scannable';
import { CboardScannerRoot, CboardScanButton, CboardScanDialog } from './CboardScan';

const key = code => act(() => {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: code }));
  jest.advanceTimersByTime(450);
});
let host, wrapper, originalScroll;
beforeEach(() => {
  jest.useFakeTimers();Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  originalScroll=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=jest.fn();
  host=document.createElement('div');document.body.appendChild(host);
});
afterEach(() => { if(wrapper)wrapper.unmount();host.remove();wrapper=null;Element.prototype.scrollIntoView=originalScroll;jest.clearAllTimers();jest.useRealTimers(); });

test('actual CBoard scanner skips hidden/disabled buttons and selects via its existing keys', async () => {
  const picked=jest.fn();
  await act(async () => { wrapper=mount(<CboardScannerRoot active strategy="manual">
    <CboardScanButton onClick={()=>picked('first')}>第一项</CboardScanButton>
    <div hidden><CboardScanButton onClick={()=>picked('hidden')}>隐藏项</CboardScanButton></div>
    <CboardScanButton disabled onClick={()=>picked('disabled')}>禁用项</CboardScanButton>
    <CboardScanButton onClick={()=>picked('last')}>最后项</CboardScanButton>
  </CboardScannerRoot>, {attachTo:host}); });
  wrapper.update();
  key(32);wrapper.update();expect(host.querySelector('.scanner__focused').textContent).toContain('最后项');
  key(13);expect(picked).toHaveBeenCalledWith('last');expect(picked).toHaveBeenCalledTimes(1);
});

test('portal dialog owns scanning while background pauses; closing restores the existing root', async () => {
  const selected=jest.fn();
  function Fixture(){const[open,setOpen]=useState(false);return <CboardScannerRoot active strategy="manual">
    <CboardScanButton onClick={()=>setOpen(true)}>打开</CboardScanButton><CboardScanButton onClick={()=>selected('background')}>背景</CboardScanButton>
    <CboardScanDialog open={open} onClose={()=>setOpen(false)} aria-label="扫描弹窗">
      <CboardScanButton onClick={()=>selected('inside')}>弹窗操作</CboardScanButton><CboardScanButton onClick={()=>setOpen(false)}>返回</CboardScanButton>
    </CboardScanDialog></CboardScannerRoot>;}
  await act(async()=>{wrapper=mount(<Fixture/>,{attachTo:host});});
  key(13);wrapper.update();
  expect(wrapper.find(Scanner).map(s=>s.prop('active'))).toEqual([false,true]);
  key(13);expect(selected).toHaveBeenCalledWith('inside');expect(selected).not.toHaveBeenCalledWith('background');
  key(32);key(13);wrapper.update();
  expect(wrapper.find(Scanner).first().prop('active')).toBe(true);
});

test('editing an input leaves native text keys available; four Escape presses still stop scanning', async () => {
  const stopped=jest.fn();
  await act(async()=>{wrapper=mount(<CboardScannerRoot active strategy="manual" onDeactivation={stopped}>
    <input aria-label="原句"/><CboardScanButton>继续</CboardScanButton>
  </CboardScannerRoot>,{attachTo:host});});
  act(()=>host.querySelector('input').focus());wrapper.update();expect(wrapper.find(Scanner).prop('active')).toBe(false);
  act(()=>host.querySelector('button').focus());wrapper.update();expect(wrapper.find(Scanner).prop('active')).toBe(true);
  for(let i=0;i<4;i++)act(()=>document.body.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,keyCode:27})));
  expect(stopped).toHaveBeenCalledTimes(1);
});
