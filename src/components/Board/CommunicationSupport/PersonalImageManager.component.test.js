import React from 'react';
import { act } from 'react-dom/test-utils';
import { mount } from 'enzyme';
import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import PersonalImageManager from './PersonalImageManager.component';

jest.mock('../../UI/InputImage', () => () => null);

const board = {
  id: 'home',
  name: 'Home',
  layout: { columns: 1, rows: 1, tileIds: ['water'] },
  tiles: [
    {
      id: 'water',
      boardId: 'home',
      label: 'Water',
      image: 'default://water'
    }
  ]
};

const publicBoard = {
  id: 'public-food',
  name: '公共食物',
  layout: { columns: 1, rows: 1, tileIds: ['apple'] },
  tiles: [
    {
      id: 'apple',
      boardId: 'public-food',
      label: '苹果',
      image: 'https://static.example.org/apple.png',
      pictogramAttribution: {
        provider: 'arasaac',
        originalId: '123',
        name: '苹果',
        license: 'CC BY-NC-SA 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
        author: 'ARASAAC',
        authorUrl: 'https://arasaac.org/',
        sourceUrl: 'https://arasaac.org/pictograms/123'
      }
    }
  ]
};

const personalBoard = {
  id: 'device_private_board_favorites',
  name: '我的常用',
  communicationCategory: 'device-private',
  isFixed: true,
  grid: { rows: 1, columns: 2, order: [[null, null]] },
  tiles: []
};

describe('PersonalImageManager', () => {
  test('finds a cross-board tile by its Chinese synonym for caregiver maintenance', () => {
    const spoonBoard = {
      id: 'food',
      name: '餐具',
      layout: { columns: 1, rows: 1, tileIds: ['spoon'] },
      tiles: [
        {
          id: 'spoon',
          boardId: 'food',
          label: '勺子',
          image: 'default://spoon',
          communication: {
            synonyms: ['汤匙']
          }
        }
      ]
    };
    const wrapper = mount(
      <PersonalImageManager
        boards={[board, spoonBoard]}
        preferences={[]}
        onSave={jest.fn()}
        onRemove={jest.fn()}
      />
    );

    act(() => {
      wrapper
        .find(TextField)
        .filterWhere(
          node =>
            node.prop('label') === '输入标签、同义词或板块，例如：汤匙、厕所'
        )
        .first()
        .prop('onChange')({ target: { value: '汤匙' } });
    });
    wrapper.update();

    expect(wrapper.text()).toContain('跨分类找图');
    expect(
      wrapper
        .find(Button)
        .filterWhere(node => node.text().includes('勺子'))
        .first()
        .text()
    ).toContain('餐具');
  });

  test('restores a configured tile to its CBoard default image', () => {
    const onRemove = jest.fn(() => true);
    const wrapper = mount(
      <PersonalImageManager
        boards={[board]}
        preferences={[
          {
            tileId: 'water',
            boardId: 'home',
            labelSnapshot: 'Water',
            image: 'data:image/png;base64,private'
          }
        ]}
        onSave={jest.fn()}
        onRemove={onRemove}
      />
    );

    wrapper
      .find('ForwardRef(Button)')
      .filterWhere(node => node.text() === '恢复默认')
      .first()
      .simulate('click');

    expect(onRemove).toHaveBeenCalledWith('water', 'home');
    expect(wrapper.text()).toContain('已恢复 CBoard 默认图片');
  });

  test('edits local attribution without replacing the familiar image', () => {
    const onSave = jest.fn(() => true);
    const wrapper = mount(
      <PersonalImageManager
        boards={[board]}
        preferences={[
          {
            tileId: 'water',
            boardId: 'home',
            labelSnapshot: 'Water',
            image: 'data:image/png;base64,private',
            pictogramAttribution: {
              provider: 'device-private',
              originalId: 'home:water',
              name: 'Water',
              license: '设备私有图片（未声明公开许可）',
              author: null,
              sourceUrl: 'device-private://personal-image/home/water'
            }
          }
        ]}
        onSave={onSave}
        onRemove={jest.fn()}
      />
    );

    wrapper
      .find(Button)
      .filterWhere(node => node.text() === '更换照片')
      .first()
      .simulate('click');
    const authorField = wrapper
      .find(TextField)
      .filterWhere(node => node.prop('label') === '拍摄者或图片提供者（可选）')
      .first();
    const licenseField = wrapper
      .find(TextField)
      .filterWhere(node => node.prop('label') === '使用说明')
      .first();
    act(() => {
      authorField.prop('onChange')({ target: { value: '家属' } });
      licenseField.prop('onChange')({
        target: { value: '家属提供，仅用于当前设备沟通' }
      });
    });
    wrapper.update();
    wrapper
      .find(Button)
      .filterWhere(node => node.text() === '保存图片说明')
      .first()
      .simulate('click');

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        tileId: 'water',
        boardId: 'home',
        image: 'data:image/png;base64,private',
        pictogramAttribution: expect.objectContaining({
          provider: 'device-private',
          author: '家属',
          license: '家属提供，仅用于当前设备沟通'
        })
      })
    );
    expect(wrapper.text()).toContain('已保存“Water”的本机图片说明');
  });

  test('curates a licensed public pictogram into the selected personal board', () => {
    const onBoardSave = jest.fn(() => true);
    const wrapper = mount(
      <PersonalImageManager
        boards={[publicBoard, personalBoard]}
        editableBoards={[publicBoard, personalBoard]}
        preferences={[]}
        onSave={jest.fn()}
        onRemove={jest.fn()}
        onBoardSave={onBoardSave}
        onCreatePersonalBoard={jest.fn()}
        createCuratedId={() => 'curated_public_apple'}
      />
    );

    wrapper
      .find(Button)
      .filterWhere(node => node.text() === '加入“我的常用”')
      .first()
      .simulate('click');

    expect(onBoardSave).toHaveBeenCalledTimes(1);
    expect(onBoardSave.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        id: 'device_private_board_favorites',
        tiles: [
          expect.objectContaining({
            id: 'curated_public_apple',
            label: '苹果',
            image: 'https://static.example.org/apple.png',
            sound: '',
            pictogramAttribution: expect.objectContaining({
              provider: 'arasaac',
              originalId: '123'
            })
          })
        ]
      })
    );
    expect(wrapper.text()).toContain('已把“苹果”的公开原图加入个人板');
  });

  test('offers personal board creation before public curation', () => {
    const onCreatePersonalBoard = jest.fn(() => 'device_private_board_new');
    const wrapper = mount(
      <PersonalImageManager
        boards={[publicBoard]}
        editableBoards={[publicBoard]}
        preferences={[]}
        onSave={jest.fn()}
        onRemove={jest.fn()}
        onBoardSave={jest.fn()}
        onCreatePersonalBoard={onCreatePersonalBoard}
      />
    );

    wrapper
      .find(Button)
      .filterWhere(node => node.text() === '创建个人板')
      .first()
      .simulate('click');

    expect(onCreatePersonalBoard).toHaveBeenCalledWith('我的常用图卡');
    expect(wrapper.text()).toContain('已创建个人板“我的常用图卡”');
  });

  test('removes only a curated public pictogram from its personal board', () => {
    const curatedBoard = {
      ...personalBoard,
      grid: {
        rows: 1,
        columns: 2,
        order: [['curated_public_apple', null]]
      },
      tiles: [
        {
          ...publicBoard.tiles[0],
          id: 'curated_public_apple',
          boardId: personalBoard.id,
          sound: ''
        }
      ]
    };
    const onBoardSave = jest.fn(() => true);
    const wrapper = mount(
      <PersonalImageManager
        boards={[publicBoard, curatedBoard]}
        editableBoards={[publicBoard, curatedBoard]}
        preferences={[]}
        onSave={jest.fn()}
        onRemove={jest.fn()}
        onBoardSave={onBoardSave}
      />
    );

    wrapper
      .find(Button)
      .filterWhere(node => node.text() === '从个人板移除')
      .first()
      .simulate('click');

    expect(onBoardSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: personalBoard.id,
        tiles: []
      })
    );
    expect(wrapper.text()).toContain('已从个人板移除“苹果”');
  });
});
