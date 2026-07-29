import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import MissingTokenQueue from './MissingTokenQueue.component';

jest.mock('../Symbol', () => {
  return function MockSymbol(props) {
    return <div className="MockSymbol">{props.label}</div>;
  };
});

jest.mock('../../UI/InputImage', () => {
  return function MockInputImage(props) {
    return (
      <button
        className="MockInputImage"
        onClick={() => props.onChange({ type: 'image/png' })}
      >
        选择测试图片
      </button>
    );
  };
});

const record = {
  id: 'missing-1',
  normalizedToken: '头晕',
  status: 'new',
  occurrenceCount: 3,
  rawTextSamples: ['我还是头晕'],
  updatedAt: 30
};

const candidate = {
  id: 'home:dizzy',
  boardName: '身体',
  displayLabel: '头晕图卡',
  labels: ['眩晕'],
  synonyms: [],
  tile: {
    id: 'dizzy',
    label: '头晕图卡',
    image: '/dizzy.png'
  }
};

describe('MissingTokenQueue', () => {
  test('automatically resolves a unique local exact match without caregiver attribution', () => {
    const onReview = jest.fn(() => ({ ...record, status: 'resolved' }));

    mount(
      <MissingTokenQueue
        records={[record]}
        catalog={[{ ...candidate, labels: ['头晕'] }]}
        onReview={onReview}
      />
    );

    expect(onReview).toHaveBeenCalledWith('missing-1', {
      status: 'resolved',
      resolvedPictogramId: 'dizzy',
      source: 'catalog-auto',
      reviewedByCaregiver: false
    });
  });

  test('shows the full pending count and retained automatic-resolution evidence', () => {
    const pendingRecords = Array.from({ length: 25 }, (_, index) => ({
      ...record,
      id: `pending-${index}`,
      normalizedToken: `缺词-${index}`,
      updatedAt: 100 - index
    }));
    const wrapper = mount(
      <MissingTokenQueue
        records={[
          ...pendingRecords,
          {
            ...record,
            id: 'catalog-resolved',
            normalizedToken: '叉子',
            status: 'resolved',
            source: 'catalog-auto'
          }
        ]}
        catalog={[]}
        onReview={jest.fn()}
      />
    );

    expect(wrapper.text()).toContain('待处理 25');
    expect(wrapper.text()).toContain('本机 CBoard 已自动解决 1 个过期缺图词。');
  });

  test('shows caregiver evidence and resolves a token to an existing tile', () => {
    const onReview = jest.fn(() => ({ ...record, status: 'resolved' }));
    const wrapper = mount(
      <MissingTokenQueue
        records={[record]}
        catalog={[candidate]}
        onReview={onReview}
      />
    );

    expect(wrapper.text()).toContain('头晕');
    expect(wrapper.text()).toContain('出现次数：3');
    expect(wrapper.text()).toContain('最近原句：我还是头晕');

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '关联图卡')
      .first()
      .simulate('click');
    wrapper.update();
    wrapper
      .find('button.CommunicationSupportPanel__swapOption')
      .first()
      .simulate('click');

    expect(onReview).toHaveBeenCalledWith('missing-1', {
      status: 'resolved',
      resolvedPictogramId: 'dizzy',
      source: 'caregiver'
    });
  });

  test('supports ignore and restore without exposing storage errors', () => {
    const onReview = jest
      .fn()
      .mockReturnValueOnce({ ...record, status: 'ignored' })
      .mockImplementationOnce(() => {
        throw new Error('storage unavailable');
      });
    const wrapper = mount(
      <MissingTokenQueue records={[record]} catalog={[]} onReview={onReview} />
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '忽略')
      .first()
      .simulate('click');
    expect(onReview).toHaveBeenCalledWith('missing-1', { status: 'ignored' });

    wrapper.setProps({ records: [{ ...record, status: 'ignored' }] });
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '恢复待处理')
      .first()
      .simulate('click');
    wrapper.update();

    expect(wrapper.text()).toContain('维护结果保存失败，请稍后重试。');
  });

  test('resolves a missing token with a device-private compressed image', async () => {
    const onReview = jest.fn(() => ({ ...record, status: 'resolved' }));
    const wrapper = mount(
      <MissingTokenQueue
        records={[record]}
        catalog={[]}
        onReview={onReview}
        readPrivateImage={() =>
          Promise.resolve('data:image/png;base64,private')
        }
      />
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '选择本机图片')
      .first()
      .simulate('click');
    wrapper.update();

    await act(async () => {
      await wrapper.find('button.MockInputImage').prop('onClick')();
    });
    wrapper.update();

    expect(onReview).toHaveBeenCalledWith(
      'missing-1',
      expect.objectContaining({
        status: 'resolved',
        resolvedPictogramId: 'device_private_missing_missing-1',
        source: 'device-private',
        reviewedByCaregiver: true,
        resolvedPictogram: expect.objectContaining({
          label: '头晕',
          image: 'data:image/png;base64,private',
          source: expect.objectContaining({
            provider: 'device-private',
            license: '用户提供，仅限本机使用'
          })
        })
      })
    );
    expect(wrapper.text()).toContain(
      '已为“头晕”保存本机私有图片，下次生成会直接使用。'
    );
  });

  test('previews an AI pictogram before caregiver confirmation', async () => {
    const onReview = jest.fn(() => ({ ...record, status: 'resolved' }));
    const onGeneratePictogram = jest.fn().mockResolvedValue({
      blob: new Blob(['generated'], { type: 'image/png' }),
      provider: 'openai-compatible',
      model: 'gpt-image-1',
      generationId: 'generation-1',
      useScope: 'device-private'
    });
    const readPrivateImage = jest
      .fn()
      .mockResolvedValue('data:image/png;base64,aW1hZ2U=');
    const wrapper = mount(
      <MissingTokenQueue
        records={[record]}
        catalog={[]}
        onReview={onReview}
        aiImageGenerationAvailable
        onGeneratePictogram={onGeneratePictogram}
        readPrivateImage={readPrivateImage}
      />
    );

    const generateButton = wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === 'AI 生成图符')
      .first();
    await act(async () => {
      await generateButton.prop('onClick')();
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    wrapper.update();

    expect(onGeneratePictogram).toHaveBeenCalledWith({ label: '头晕' });
    expect(readPrivateImage).toHaveBeenCalledWith(expect.any(Blob));
    expect(onReview).not.toHaveBeenCalled();
    expect(
      wrapper
        .find('ForwardRef(Dialog)')
        .last()
        .prop('open')
    ).toBe(true);
    expect(document.body.textContent).toContain('确认 AI 生成图符');
    expect(document.body.textContent).toContain('生成服务：openai-compatible');
    expect(document.body.textContent).toContain('模型：gpt-image-1');
    expect(document.body.textContent).toContain('不能作为公开许可素材');

    const confirmButton = Array.from(document.querySelectorAll('button')).find(
      button => button.textContent === '确认并保存'
    );
    expect(confirmButton).toBeTruthy();
    act(() => {
      confirmButton.click();
    });
    wrapper.update();

    expect(onReview).toHaveBeenCalledWith(
      'missing-1',
      expect.objectContaining({
        status: 'resolved',
        resolvedPictogramId: 'device_private_ai_missing-1_generation-1',
        source: 'device-private',
        reviewedByCaregiver: true,
        resolvedPictogram: expect.objectContaining({
          label: '头晕',
          image: 'data:image/png;base64,aW1hZ2U=',
          source: expect.objectContaining({
            provider: 'device-private',
            author: '模型：gpt-image-1'
          })
        })
      })
    );
    wrapper.unmount();
  });

  test('searches only pending records and requires caregiver confirmation', async () => {
    const suggestedPictogram = {
      id: 'runtime-dizzy',
      label: '头晕',
      image: 'https://api.example.test/pictograms/arasaac/123/image',
      source: {
        provider: 'arasaac',
        originalId: '123',
        name: 'ARASAAC',
        license: 'CC BY-NC-SA 4.0',
        sourceUrl: 'https://arasaac.org/pictograms/123'
      }
    };
    const alternativePictogram = {
      ...suggestedPictogram,
      id: 'runtime-dizzy-alternative',
      image: 'https://api.example.test/pictograms/arasaac/456/image',
      source: {
        ...suggestedPictogram.source,
        originalId: '456'
      }
    };
    const onSearchOnline = jest.fn().mockResolvedValue({ foundCount: 1 });
    const onReview = jest.fn(() => ({
      ...record,
      status: 'resolved'
    }));
    const wrapper = mount(
      <MissingTokenQueue
        records={[record]}
        catalog={[]}
        onReview={onReview}
        onlineSearchAvailable
        onSearchOnline={onSearchOnline}
      />
    );

    await act(async () => {
      wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text() === '在线搜索缺图')
        .first()
        .simulate('click');
      await Promise.resolve();
    });
    wrapper.update();
    expect(onSearchOnline).toHaveBeenCalledWith(['missing-1']);

    wrapper.setProps({
      records: [
        {
          ...record,
          status: 'suggested',
          suggestedPictogram,
          suggestedPictograms: [suggestedPictogram, alternativePictogram]
        }
      ]
    });
    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '确认使用')
      .at(1)
      .simulate('click');

    expect(onReview).toHaveBeenCalledWith('missing-1', {
      status: 'resolved',
      resolvedPictogramId: 'runtime-dizzy-alternative',
      source: 'online'
    });
  });
});
