import React from 'react';
import { shallow } from 'enzyme';
import { matchSnapshotWithIntlProvider } from '../../../common/test_utils';

import TileEditor, {
  MAX_TILE_VIDEO_SIZE_BYTES,
  TileEditor as TileEditorComponent,
  validateTileVideoFile
} from './TileEditor.component';

jest.mock('../../../api', () => ({
  __esModule: true,
  default: {
    uploadFile: jest.fn(),
    suggestCommunicationPictogramMetadata: jest.fn(),
    removeCommunicationImageBackground: jest.fn()
  }
}));

const API = require('../../../api').default;

jest.mock('./TileEditor.messages', () => {
  const mockedMessages = {
    createTile: {
      id: 'cboard.components.Board.TileEditor.createTile',
      defaultMessage: 'Create tile'
    },
    editTile: {
      id: 'cboard.components.Board.TileEditor.editTile',
      defaultMessage: 'Edit Tile'
    },
    label: {
      id: 'cboard.components.Board.TileEditor.label',
      defaultMessage: 'Label'
    },
    boardName: {
      id: 'cboard.components.Board.TileEditor.boardName',
      defaultMessage: 'Board Name'
    },
    vocalization: {
      id: 'cboard.components.Board.TileEditor.vocalization',
      defaultMessage: 'Vocalization'
    },
    matchingSynonyms: {
      id: 'cboard.components.Board.TileEditor.matchingSynonyms',
      defaultMessage: 'Matching synonyms'
    },
    relatedTerms: {
      id: 'cboard.components.Board.TileEditor.relatedTerms',
      defaultMessage: 'Related terms (not matched automatically)'
    },
    excludeTokens: {
      id: 'cboard.components.Board.TileEditor.excludeTokens',
      defaultMessage: 'Exclude tokens'
    },
    semanticCategory: {
      id: 'cboard.components.Board.TileEditor.semanticCategory',
      defaultMessage: 'Semantic category'
    },
    matchingSynonymsHelper: {
      id: 'cboard.components.Board.TileEditor.matchingSynonymsHelper',
      defaultMessage:
        'Comma-separated optional matching hints for the receiver workflow'
    },
    relatedTermsHelper: {
      id: 'cboard.components.Board.TileEditor.relatedTermsHelper',
      defaultMessage:
        'Comma-separated curation notes for related concepts; these terms never trigger an automatic match'
    },
    excludeTokensHelper: {
      id: 'cboard.components.Board.TileEditor.excludeTokensHelper',
      defaultMessage:
        'Optional tokens that should not resolve to this tile during matching'
    },
    semanticCategoryHelper: {
      id: 'cboard.components.Board.TileEditor.semanticCategoryHelper',
      defaultMessage:
        'Optional category override used to improve receiver-side matching'
    },
    voiceRecorder: {
      id: 'cboard.components.Board.TileEditor.voiceRecorder',
      defaultMessage: 'Voice Recorder'
    },
    button: {
      id: 'cboard.components.Board.TileEditor.button',
      defaultMessage: 'Button'
    },
    folder: {
      id: 'cboard.components.Board.TileEditor.folder',
      defaultMessage: 'Folder'
    },
    type: {
      id: 'cboard.components.Board.TileEditor.type',
      defaultMessage: 'Type'
    },
    back: {
      id: 'cboard.components.Board.TileEditor.back',
      defaultMessage: 'Back'
    },
    next: {
      id: 'cboard.components.Board.TileEditor.next',
      defaultMessage: 'Next'
    },
    symbolSearch: {
      id: 'cboard.components.Board.TileEditor.symbolSearch',
      defaultMessage: 'Symbol search'
    },
    existingBoards: {
      id: 'cboard.components.Board.TileEditor.existingBoards',
      defaultMessage: 'Link to an existing board'
    },
    none: {
      id: 'cboard.components.Board.TileEditor.none',
      defaultMessage: 'None'
    },
    symbols: {
      id: 'cboard.components.Board.TileEditor.symbols',
      defaultMessage: 'Symbols'
    },
    editImage: {
      id: 'cboard.components.Board.TileEditor.editImage',
      defaultMessage: 'Edit image'
    },
    metadataSuggestionConsent: {
      id: 'cboard.components.Board.TileEditor.metadataSuggestionConsent',
      defaultMessage: '允许单次上传并自动建议图卡文字'
    },
    metadataSuggestionPrivacy: {
      id: 'cboard.components.Board.TileEditor.metadataSuggestionPrivacy',
      defaultMessage: '图片只发送一次'
    },
    metadataSuggestionLoading: {
      id: 'cboard.components.Board.TileEditor.metadataSuggestionLoading',
      defaultMessage: '正在生成可编辑建议'
    },
    metadataSuggestionApplied: {
      id: 'cboard.components.Board.TileEditor.metadataSuggestionApplied',
      defaultMessage: '建议已填入'
    },
    metadataSuggestionUnavailable: {
      id: 'cboard.components.Board.TileEditor.metadataSuggestionUnavailable',
      defaultMessage: '自动建议暂时不可用'
    },
    metadataSuggestionRateLimited: {
      id: 'cboard.components.Board.TileEditor.metadataSuggestionRateLimited',
      defaultMessage: '自动建议请求较多'
    },
    metadataSuggestionMonthlyQuota: {
      id: 'cboard.components.Board.TileEditor.metadataSuggestionMonthlyQuota',
      defaultMessage: '本月额度已用完，图片已保留'
    },
    metadataSuggestionLoginRequired: {
      id: 'cboard.components.Board.TileEditor.metadataSuggestionLoginRequired',
      defaultMessage: '登录后可使用'
    },
    metadataSuggestionManual: {
      id: 'cboard.components.Board.TileEditor.metadataSuggestionManual',
      defaultMessage: '可手工填写'
    },
    animatedImagePreserved: {
      id: 'cboard.components.Board.TileEditor.animatedImagePreserved',
      defaultMessage: 'GIF 动图已原样保留'
    },
    chooseVideo: {
      id: 'chooseVideo',
      defaultMessage: '选择 10 秒短视频'
    },
    videoHelp: { id: 'videoHelp', defaultMessage: '短视频说明' },
    videoLoginRequired: {
      id: 'videoLoginRequired',
      defaultMessage: '请先登录'
    },
    videoFormatInvalid: {
      id: 'videoFormatInvalid',
      defaultMessage: '格式错误'
    },
    videoTooLarge: { id: 'videoTooLarge', defaultMessage: '文件过大' },
    videoTooLong: { id: 'videoTooLong', defaultMessage: '视频过长' },
    videoUnreadable: { id: 'videoUnreadable', defaultMessage: '无法读取' },
    videoReady: { id: 'videoReady', defaultMessage: '视频已准备' },
    videoUploadFailed: {
      id: 'videoUploadFailed',
      defaultMessage: '视频上传失败'
    },
    backgroundRemovalAction: {
      id: 'cboard.components.Board.TileEditor.backgroundRemovalAction',
      defaultMessage: '一键去背景'
    },
    backgroundRemovalRestore: {
      id: 'cboard.components.Board.TileEditor.backgroundRemovalRestore',
      defaultMessage: '恢复原图'
    },
    backgroundRemovalConsent: {
      id: 'cboard.components.Board.TileEditor.backgroundRemovalConsent',
      defaultMessage: '是否单次上传去背景？'
    },
    backgroundRemovalPrivacy: {
      id: 'cboard.components.Board.TileEditor.backgroundRemovalPrivacy',
      defaultMessage: '请检查人物和物品边缘'
    },
    backgroundRemovalLoading: {
      id: 'cboard.components.Board.TileEditor.backgroundRemovalLoading',
      defaultMessage: '正在去背景'
    },
    backgroundRemovalApplied: {
      id: 'cboard.components.Board.TileEditor.backgroundRemovalApplied',
      defaultMessage: '已应用透明背景'
    },
    backgroundRemovalRestored: {
      id: 'cboard.components.Board.TileEditor.backgroundRemovalRestored',
      defaultMessage: '已恢复原图'
    },
    backgroundRemovalUnavailable: {
      id: 'cboard.components.Board.TileEditor.backgroundRemovalUnavailable',
      defaultMessage: '去背景不可用'
    },
    backgroundRemovalRateLimited: {
      id: 'cboard.components.Board.TileEditor.backgroundRemovalRateLimited',
      defaultMessage: '去背景请求较多，原图未改变'
    },
    backgroundRemovalMonthlyQuota: {
      id: 'cboard.components.Board.TileEditor.backgroundRemovalMonthlyQuota',
      defaultMessage: '本月额度已用完，原图未改变'
    },
    backgroundRemovalLoginRequired: {
      id: 'cboard.components.Board.TileEditor.backgroundRemovalLoginRequired',
      defaultMessage: '登录后可去背景'
    },
    loadFolderBoard: {
      id: 'cboard.components.Board.TileEditor.loadFolderBoard',
      defaultMessage: 'Link to an existing folder'
    }
  };

  return {
    __esModule: true,
    default: mockedMessages,
    ...mockedMessages
  };
});
describe('TileEditor tests', () => {
  const props = {
    intl: {
      formatMessage: jest.fn(message => message?.defaultMessage || message?.id),
      locale: 'en-US'
    },
    open: true,
    onClose: jest.fn(),
    editingTiles: [],
    boards: [],
    folders: [],
    onEditSubmit: jest.fn(),
    onAddSubmit: jest.fn(),
    userData: { email: 'caregiver@example.com' }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    props.intl.formatMessage.mockImplementation(
      message => message?.defaultMessage || message?.id
    );
    URL.createObjectURL = jest.fn(() => 'blob:personal-photo');
    URL.revokeObjectURL = jest.fn();
    window.confirm = jest.fn(() => true);
  });

  test('default renderer', () => {
    matchSnapshotWithIntlProvider(<TileEditor {...props} />);
  });
  test('mount renderer', () => {
    const wrapper = shallow(<TileEditor {...props} />);
    expect(wrapper).toMatchSnapshot();
  });

  test('shows communication matching fields for button tiles', () => {
    const wrapper = shallow(<TileEditorComponent {...props} />);
    const synonymsField = wrapper.findWhere(
      node => node.prop('id') === 'communicationSynonyms'
    );
    const relatedTermsField = wrapper.findWhere(
      node => node.prop('id') === 'communicationRelatedTerms'
    );
    const excludeTokensField = wrapper.findWhere(
      node => node.prop('id') === 'communicationExcludeTokens'
    );
    const categoryField = wrapper.findWhere(
      node => node.prop('id') === 'communicationCategory'
    );

    expect(synonymsField.exists()).toBe(true);
    expect(relatedTermsField.exists()).toBe(true);
    expect(excludeTokensField.exists()).toBe(true);
    expect(categoryField.exists()).toBe(true);
    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cboard.components.Board.TileEditor.matchingSynonymsHelper'
      })
    );
    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cboard.components.Board.TileEditor.relatedTermsHelper'
      })
    );
    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cboard.components.Board.TileEditor.excludeTokensHelper'
      })
    );
    expect(props.intl.formatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cboard.components.Board.TileEditor.semanticCategoryHelper'
      })
    );
  });

  test('hides communication matching fields for board tiles', () => {
    const wrapper = shallow(
      <TileEditorComponent
        {...props}
        editingTiles={[
          {
            id: 'board-tile',
            type: 'board',
            label: 'Daily board',
            loadBoard: 'root'
          }
        ]}
      />
    );

    expect(wrapper.find('#communicationSynonyms').exists()).toBe(false);
    expect(wrapper.find('#communicationRelatedTerms').exists()).toBe(false);
    expect(wrapper.find('#communicationExcludeTokens').exists()).toBe(false);
    expect(wrapper.find('#communicationCategory').exists()).toBe(false);
  });

  test('fills only empty editable fields after explicit one-time consent', async () => {
    API.suggestCommunicationPictogramMetadata.mockResolvedValue({
      label: '苹果',
      synonyms: ['水果'],
      category: '饮食',
      provider: 'cboard-api-ai',
      sourceStored: false
    });
    const wrapper = shallow(<TileEditorComponent {...props} />);
    const instance = wrapper.instance();

    wrapper.setState({ metadataSuggestionConsent: true });
    await instance.handleInputImageChange(
      new Blob(['image'], { type: 'image/jpeg' }),
      'apple.jpg',
      new Blob(['image'], { type: 'image/jpeg' })
    );
    await Promise.resolve();
    await Promise.resolve();
    wrapper.update();

    expect(API.suggestCommunicationPictogramMetadata).toHaveBeenCalledTimes(1);
    expect(wrapper.state('tile')).toEqual(
      expect.objectContaining({
        label: '苹果',
        vocalization: '苹果',
        communicationSynonyms: '水果',
        communicationCategory: '饮食'
      })
    );
    expect(wrapper.state('metadataSuggestionStatus')).toBe('建议已填入');
  });

  test('keeps the upload local when one-time suggestion consent is off', async () => {
    const wrapper = shallow(<TileEditorComponent {...props} />);

    await wrapper
      .instance()
      .handleInputImageChange(
        new Blob(['image'], { type: 'image/png' }),
        'manual.png',
        new Blob(['image'], { type: 'image/png' })
      );

    expect(API.suggestCommunicationPictogramMetadata).not.toHaveBeenCalled();
    expect(wrapper.state('metadataSuggestionStatus')).toBe('可手工填写');
  });

  test('preserves animated GIFs and skips static-only enhancements', async () => {
    const gif = new Blob(['GIF89a'], { type: 'image/gif' });
    const wrapper = shallow(<TileEditorComponent {...props} />);
    const instance = wrapper.instance();
    wrapper.setState({ metadataSuggestionConsent: true });

    await instance.handleInputImageChange(gif, 'drink.gif', gif);
    await instance.handleBackgroundRemoval();

    expect(wrapper.state('imageUploadedData')[0]).toEqual(
      expect.objectContaining({
        fileName: 'drink.gif',
        blob: gif,
        blobHQ: gif
      })
    );
    expect(wrapper.state('isEditImageBtnActive')).toBe(false);
    expect(wrapper.state('metadataSuggestionStatus')).toBe(
      'GIF 动图已原样保留'
    );
    expect(API.suggestCommunicationPictogramMetadata).not.toHaveBeenCalled();
    expect(API.removeCommunicationImageBackground).not.toHaveBeenCalled();
  });

  test('uploads the original GIF when the caregiver saves the tile', async () => {
    const gif = new Blob(['GIF89a'], { type: 'image/gif' });
    API.uploadFile.mockResolvedValue('https://cdn.example.test/drink.gif');
    const wrapper = shallow(<TileEditorComponent {...props} />);
    const instance = wrapper.instance();

    await instance.handleInputImageChange(gif, 'drink.gif', gif);
    await instance.handleSubmit();

    expect(API.uploadFile).toHaveBeenCalledWith(gif, 'drink.gif');
    expect(props.onAddSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        image: 'https://cdn.example.test/drink.gif'
      })
    );
  });

  test('validates short video format, size and duration', () => {
    expect(
      validateTileVideoFile(
        { type: 'video/mp4', size: MAX_TILE_VIDEO_SIZE_BYTES },
        10
      )
    ).toBe('');
    expect(validateTileVideoFile({ type: 'video/avi', size: 1 }, 1)).toBe(
      'format'
    );
    expect(
      validateTileVideoFile(
        { type: 'video/mp4', size: MAX_TILE_VIDEO_SIZE_BYTES + 1 },
        1
      )
    ).toBe('size');
    expect(validateTileVideoFile({ type: 'video/mp4', size: 1 }, 10.01)).toBe(
      'duration'
    );
  });

  test('uploads a prepared short video instead of persisting a blob URL', async () => {
    const video = new Blob(['video'], { type: 'video/mp4' });
    API.uploadFile.mockResolvedValue('https://cdn.example.test/action.mp4');
    const wrapper = shallow(<TileEditorComponent {...props} />);
    wrapper.setState({
      tile: {
        ...wrapper.state('tile'),
        label: '喝水',
        mediaType: 'video',
        video: 'blob:personal-video'
      },
      videoUploadedData: [
        { isUploaded: true, fileName: 'action.mp4', blob: video }
      ]
    });

    await wrapper.instance().handleSubmit();

    expect(API.uploadFile).toHaveBeenCalledWith(video, 'action.mp4');
    expect(props.onAddSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaType: 'video',
        video: 'https://cdn.example.test/action.mp4'
      })
    );
  });

  test('keeps the upload editable when metadata suggestions reach the monthly quota', async () => {
    API.suggestCommunicationPictogramMetadata.mockRejectedValue({
      response: {
        status: 429,
        data: {
          error: { code: 'COMMUNICATION_MONTHLY_QUOTA_EXCEEDED' }
        }
      }
    });
    const wrapper = shallow(<TileEditorComponent {...props} />);
    wrapper.setState({ metadataSuggestionConsent: true });

    await wrapper
      .instance()
      .requestPictogramMetadataSuggestion(
        new Blob(['image'], { type: 'image/jpeg' })
      );

    expect(wrapper.state('metadataSuggestionStatus')).toBe(
      '本月额度已用完，图片已保留'
    );
    expect(wrapper.state('isMetadataSuggestionLoading')).toBe(false);
  });

  test('applies a reviewed transparent candidate and can restore the original upload', async () => {
    const original = new Blob(['original'], { type: 'image/jpeg' });
    const processed = new Blob(['processed'], { type: 'image/png' });
    API.removeCommunicationImageBackground.mockResolvedValue({
      blob: processed,
      fileName: 'pictogram-no-background.png',
      sourceStored: false,
      originalRetained: true
    });
    URL.createObjectURL.mockImplementation(blob =>
      blob === processed ? 'blob:processed' : 'blob:original'
    );
    const wrapper = shallow(<TileEditorComponent {...props} />);
    const instance = wrapper.instance();

    await instance.handleInputImageChange(original, 'cup.jpg', original);
    await instance.handleBackgroundRemoval();

    expect(window.confirm).toHaveBeenCalledWith('是否单次上传去背景？');
    expect(API.removeCommunicationImageBackground).toHaveBeenCalledWith(
      original
    );
    expect(wrapper.state('tile').image).toBe('blob:processed');
    expect(wrapper.state('imageUploadedData')[0].blob).toBe(processed);
    expect(wrapper.state('hasBackgroundRemovalOriginal')).toBe(true);
    expect(wrapper.state('backgroundRemovalStatus')).toBe('已应用透明背景');

    instance.handleRestoreOriginalBackground();

    expect(wrapper.state('tile').image).toBe('blob:original');
    expect(wrapper.state('imageUploadedData')[0].blob).toBe(original);
    expect(wrapper.state('hasBackgroundRemovalOriginal')).toBe(false);
    expect(wrapper.state('backgroundRemovalStatus')).toBe('已恢复原图');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:processed');
  });

  test('keeps the original upload when background removal fails', async () => {
    const original = new Blob(['original'], { type: 'image/jpeg' });
    API.removeCommunicationImageBackground.mockRejectedValue(
      new Error('provider unavailable')
    );
    URL.createObjectURL.mockImplementation(() => 'blob:original');
    const wrapper = shallow(<TileEditorComponent {...props} />);

    await wrapper
      .instance()
      .handleInputImageChange(original, 'cup.jpg', original);
    await wrapper.instance().handleBackgroundRemoval();

    expect(wrapper.state('tile').image).toBe('blob:original');
    expect(wrapper.state('imageUploadedData')[0].blob).toBe(original);
    expect(wrapper.state('hasBackgroundRemovalOriginal')).toBe(false);
    expect(wrapper.state('backgroundRemovalStatus')).toBe('去背景不可用');
  });

  test('keeps the original upload and explains transient background limits', async () => {
    const original = new Blob(['original'], { type: 'image/jpeg' });
    API.removeCommunicationImageBackground.mockRejectedValue({
      response: { status: 429, data: {} }
    });
    URL.createObjectURL.mockImplementation(() => 'blob:original');
    const wrapper = shallow(<TileEditorComponent {...props} />);

    await wrapper
      .instance()
      .handleInputImageChange(original, 'cup.jpg', original);
    await wrapper.instance().handleBackgroundRemoval();

    expect(wrapper.state('tile').image).toBe('blob:original');
    expect(wrapper.state('imageUploadedData')[0].blob).toBe(original);
    expect(wrapper.state('backgroundRemovalStatus')).toBe(
      '去背景请求较多，原图未改变'
    );
  });

  test('does not upload the photo when the caregiver cancels consent', async () => {
    const original = new Blob(['original'], { type: 'image/jpeg' });
    window.confirm.mockReturnValue(false);
    const wrapper = shallow(<TileEditorComponent {...props} />);

    await wrapper
      .instance()
      .handleInputImageChange(original, 'cup.jpg', original);
    await wrapper.instance().handleBackgroundRemoval();

    expect(API.removeCommunicationImageBackground).not.toHaveBeenCalled();
    expect(wrapper.state('imageUploadedData')[0].blob).toBe(original);
  });

  test('stores reviewed public attribution with a symbol-search selection', async () => {
    const attribution = {
      provider: 'globalsymbols',
      originalId: '314',
      name: 'Global Symbols / Mulberry Symbols',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://globalsymbols.com/uploads/apple.svg'
    };
    const wrapper = shallow(<TileEditorComponent {...props} />);

    await wrapper.instance().handleSymbolSearchChange({
      image: 'https://api.example.test/pictograms/globalsymbols/signed/image',
      label: '苹果',
      labelKey: undefined,
      pictogramAttribution: attribution
    });

    expect(wrapper.state('tile')).toEqual(
      expect.objectContaining({
        image: 'https://api.example.test/pictograms/globalsymbols/signed/image',
        label: '苹果',
        pictogramAttribution: attribution
      })
    );
  });
});
