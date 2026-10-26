import React from 'react';
import { shallowMatchSnapshot } from '../../../common/test_utils';
import { mount, shallow } from 'enzyme';
import InputImage, {
  InputImage as InputImageComponent
} from './InputImage.component';
import { readAndCompressImage } from 'browser-image-resizer';

jest.mock('browser-image-resizer', () => ({
  readAndCompressImage: jest.fn(file => Promise.resolve(file))
}));

jest.mock('../../../api/api');

jest.mock('./InputImage.messages', () => {
  return {
    uploadImage: {
      id: 'cboard.components.InputImage.uploadImage',
      defaultMessage: 'Upload image'
    }
  };
});

describe('InputImage tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('default render ', () => {
    const onChange = jest.fn();
    const setIsLoadingImage = jest.fn();
    const wrapper = mount(
      <InputImage
        disabled={false}
        onChange={onChange}
        setIsLoadingImage={setIsLoadingImage}
      />
    );
    expect(wrapper).toMatchSnapshot();
  });
  test('on buttton click', () => {
    const onChange = jest.fn();
    const setIsLoadingImage = jest.fn();
    const event = {
      target: {
        files: [new File(['foo'], 'foo.txt')]
      }
    };
    const wrapper = mount(
      <InputImage
        user={{ email: 'test' }}
        disabled={false}
        onChange={onChange}
        setIsLoadingImage={setIsLoadingImage}
      />
    );
    wrapper.find('input').prop('onChange')(event);
  });

  test('preserves an animated GIF instead of flattening it through canvas', async () => {
    const onChange = jest.fn();
    const gif = new File(['GIF89a'], 'drink.gif', { type: 'image/gif' });
    const input = new InputImageComponent({
      intl: { formatMessage: jest.fn() },
      onChange,
      setIsLoadingImage: jest.fn()
    });

    await input.resizeImage(gif);

    expect(readAndCompressImage).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(gif, 'drink.gif', gif);
  });

  test.each(['scope','unmount','newer'])('ignores delayed compressed image and loading result after %s', async mode => {
    let finish;
    readAndCompressImage.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    let current=true;
    const onChange=jest.fn(),setIsLoadingImage=jest.fn();
    const input=new InputImageComponent({onChange,setIsLoadingImage,createChangeGuard:()=>()=>current});
    const file=new File(['geometry'],'synthetic.png',{type:'image/png'});
    const pending=input.handleChange({target:{files:[file]}});
    if(mode==='scope') current=false;
    if(mode==='unmount') input.componentWillUnmount();
    if(mode==='newer') input.beginChange();
    finish(file); await pending;
    expect(onChange).not.toHaveBeenCalled();
    expect(setIsLoadingImage.mock.calls).toEqual([[true]]);
  });
});
