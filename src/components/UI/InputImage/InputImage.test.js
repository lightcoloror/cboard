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
});
