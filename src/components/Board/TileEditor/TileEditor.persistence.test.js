import React from 'react';
import { shallow } from 'enzyme';
import { TileEditor } from './TileEditor.component';
import FullScreenDialog from '../../UI/FullScreenDialog';
import InputImage from '../../UI/InputImage';

jest.mock('../../../api', () => ({ __esModule: true, default: { uploadFile: jest.fn() } }));
jest.mock('./TileEditor.messages', () => ({ __esModule: true, default: new Proxy({}, {
  get: (_, name) => ({ id: String(name), defaultMessage: String(name) })
}) }));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; };
function setup(extra={}) {
  const props={open:true,saveContextKey:'synthetic-scope-a',editingTiles:[],boards:[],folders:[],
    intl:{formatMessage:m=>m.defaultMessage||m.id,locale:'zh-CN'},userData:{},
    onClose:jest.fn(),onAddSubmit:jest.fn().mockResolvedValue(true),onEditSubmit:jest.fn().mockResolvedValue(true),...extra};
  const wrapper=shallow(<TileEditor {...props}/>);
  const instance=wrapper.instance();
  if (!props.editingTiles.length) {
    instance.updateTileProperty('label','合成林安');
    instance.updateTileProperty('image','data:image/png;base64,c3ludGhldGlj');
  }
  return {props,wrapper,instance};
}
beforeEach(()=>{ URL.revokeObjectURL=jest.fn(); });

test('waits for true local receipt and never closes through the shared dialog eagerly',async()=>{
  const gate=deferred(); const {props,wrapper,instance}=setup({onAddSubmit:jest.fn(()=>gate.promise)});
  const id=wrapper.state('tile').id;
  const saved=instance.handleSubmit();
  expect(wrapper.find(FullScreenDialog).prop('closeOnSubmit')).toBe(false);
  expect(wrapper.find(FullScreenDialog).prop('disableSubmit')).toBe(true);
  expect(props.onClose).not.toHaveBeenCalled();
  await instance.handleSubmit(); expect(props.onAddSubmit).toHaveBeenCalledTimes(1);
  gate.resolve(true); expect(await saved).toBe(true);
  expect(props.onClose).toHaveBeenCalledWith({saved:true});
  expect(wrapper.state('tile').label).toBe('');
  expect(wrapper.state('tile').id).not.toBe(id);
});

test.each(['reject','false','undefined'])('keeps input, image, identity after %s and retries once',async mode=>{
  const callback=jest.fn().mockImplementationOnce(()=>mode==='reject'?Promise.reject(new Error('quota')):Promise.resolve(mode==='false'?false:undefined)).mockResolvedValue(true);
  const {props,wrapper,instance}=setup({onAddSubmit:callback});
  const before={...wrapper.state('tile')};
  const scrollIntoView=jest.fn(); instance.saveStatusNode={scrollIntoView};
  expect(await instance.handleSubmit()).toBe(false);
  expect(scrollIntoView).toHaveBeenCalledWith({block:'center',behavior:'auto'});
  expect(wrapper.state('tile')).toEqual(before);
  expect(wrapper.state('saveStatus')).toContain('保存未确认');
  expect(wrapper.state('isSavingTile')).toBe(false);
  expect(props.onClose).not.toHaveBeenCalled();
  wrapper.setProps({boards:[{id:'refresh',tiles:[]}],userData:{}});
  expect(wrapper.state('tile')).toEqual(before);
  await instance.handleSubmit();
  expect(callback.mock.calls.map(args=>args[0].id)).toEqual([before.id,before.id]);
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

test('retains same-label distinct identities and ordered snapshots through failure, refresh and retry',async()=>{
  const tiles=[{id:'person-a',label:'合成甲',image:'one',personId:'a'},
    {id:'person-b',label:'合成甲',image:'two',personId:'b'}];
  const {props,wrapper,instance}=setup({editingTiles:tiles,onEditSubmit:jest.fn().mockRejectedValueOnce(new Error('readback')).mockResolvedValue(true)});
  const before=JSON.parse(JSON.stringify(wrapper.state('editingTiles')));
  await instance.handleSubmit();
  wrapper.setProps({editingTiles:tiles.map(tile=>({...tile}))});
  expect(wrapper.state('editingTiles')).toEqual(before);
  expect(props.onClose).not.toHaveBeenCalled();
  expect(props.onEditSubmit.mock.calls[0][0]).toEqual(tiles);
  await instance.handleSubmit();
  expect(props.onEditSubmit.mock.calls[1][0]).toEqual(tiles);
});

test.each(['cancel','scope','unmount','edit'])('ignores late result after %s',async mode=>{
  const gate=deferred(); const {props,wrapper,instance}=setup({onAddSubmit:jest.fn(()=>gate.promise)});
  const saved=instance.handleSubmit();
  const guard=props.onAddSubmit.mock.calls[0][1].guard;
  if(mode==='cancel') instance.handleCancel();
  if(mode==='scope') wrapper.setProps({saveContextKey:'synthetic-scope-b'});
  if(mode==='unmount') wrapper.unmount();
  if(mode==='edit') instance.updateTileProperty('label','新输入');
  expect(guard()).toBe(false);
  gate.resolve(true); expect(await saved).toBe(false);
  expect(props.onClose).toHaveBeenCalledTimes(mode==='cancel'?1:0);
  if(mode==='edit') expect(wrapper.state('tile').label).toBe('新输入');
});

test('prepares media once across failed record save and catches media preparation failure',async()=>{
  const {props,wrapper,instance}=setup({onAddSubmit:jest.fn().mockRejectedValueOnce(new Error('write')).mockResolvedValue(true)});
  const blob=new Blob(['geometry']);
  wrapper.setState({imageUploadedData:[{isUploaded:true,blob,fileName:'synthetic.png'}]});
  instance.updateTileImgURL=jest.fn().mockResolvedValue('data:image/png;base64,c3ludGhldGlj');
  await instance.handleSubmit(); await instance.handleSubmit();
  expect(instance.updateTileImgURL).toHaveBeenCalledTimes(1);
  expect(props.onAddSubmit).toHaveBeenCalledTimes(2);
  const second=setup(); second.wrapper.setState({imageUploadedData:[{isUploaded:true,blob,fileName:'synthetic.png'}]});
  second.instance.updateTileImgURL=jest.fn().mockRejectedValue(new Error('read'));
  expect(await second.instance.handleSubmit()).toBe(false);
  expect(second.props.onAddSubmit).not.toHaveBeenCalled();
  expect(second.wrapper.state('imageUploadedData')[0].blob).toBe(blob);
});

test('cancel during media preparation never dispatches a save into the next editor',async()=>{
  const gate=deferred();const {props,wrapper,instance}=setup();
  wrapper.setState({imageUploadedData:[{isUploaded:true,blob:new Blob(['shape']),fileName:'geometry.png'}]});
  instance.updateTileImgURL=jest.fn(()=>gate.promise);
  const saved=instance.handleSubmit();instance.handleCancel();
  gate.resolve('data:image/png;base64,c3ludGhldGlj');await saved;
  expect(props.onAddSubmit).not.toHaveBeenCalled();
});

test.each(['onerror','onabort'])('real FileReader %s releases save and retains retry input',async kind=>{
  const Original=global.FileReader;
  const {props,wrapper,instance}=setup();
  const before={...wrapper.state('tile')};
  wrapper.setState({imageUploadedData:[{isUploaded:true,blob:new Blob(['shape']),fileName:'geometry.png'}]});
  global.FileReader=class { readAsDataURL(){this[kind]();} };
  try {
    expect(await instance.handleSubmit()).toBe(false);
    expect(props.onAddSubmit).not.toHaveBeenCalled();
    expect(wrapper.state('isSavingTile')).toBe(false);
    expect(wrapper.state('saveStatus')).toContain('保存未确认');
    expect(wrapper.state('tile')).toEqual(before);
  } finally { global.FileReader=Original; }
});

test.each(['scope','close','unmount'])('invalidates pending media on %s without rendering stale image editor',mode=>{
  const {wrapper,instance}=setup();
  URL.createObjectURL=jest.fn(()=>'blob:synthetic');
  wrapper.setState({isEditImageBtnActive:true,openImageEditor:true,
    imageUploadedData:[{isUploaded:true,blob:new Blob(['shape']),blobHQ:new Blob(['shape'])}]});
  const guard=wrapper.find(InputImage).prop('createChangeGuard')();
  const metadata=instance.metadataSuggestionRequestId;
  instance.pendingMetadataSuggestionBlob=new Blob(['private-geometry']);
  if(mode==='scope') wrapper.setProps({saveContextKey:'other'});
  if(mode==='close') wrapper.setProps({open:false});
  if(mode==='unmount') wrapper.unmount();
  expect(guard()).toBe(false);
  expect(instance.metadataSuggestionRequestId).toBeGreaterThan(metadata);
  expect(instance.pendingMetadataSuggestionBlob).toBe(null);
  if(mode!=='unmount') {
    expect(wrapper.state('openImageEditor')).toBe(false);
    expect(wrapper.state('isEditImageBtnActive')).toBe(false);
  }
});

test('video metadata cannot enter a new scope after delayed read',async()=>{
  const {props,wrapper,instance}=setup({userData:{email:'synthetic@example.test'}});
  const create=document.createElement.bind(document); let video;
  const spy=jest.spyOn(document,'createElement').mockImplementation(tag=>{
    if(tag==='video'){video={duration:2};return video;}return create(tag);
  });
  URL.createObjectURL=jest.fn(()=>'blob:synthetic-video');
  try {
    const job=instance.handleInputVideoChange({target:{files:[new File(['shape'],'shape.mp4',{type:'video/mp4'})],value:'old'}});
    wrapper.setProps({saveContextKey:'other'});
    const fresh={...wrapper.state('tile')};video.onloadedmetadata();await job;
    expect(wrapper.state('tile')).toEqual(fresh);
    expect(wrapper.state('videoUploadedData')).toEqual([]);
    expect(props.onAddSubmit).not.toHaveBeenCalled();
  } finally {spy.mockRestore();}
});
