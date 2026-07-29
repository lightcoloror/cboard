import { defineMessages } from 'react-intl';

export default defineMessages({
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
  board: {
    id: 'cboard.components.Board.TileEditor.board',
    defaultMessage: 'Empty Board'
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
    defaultMessage:
      '开启后，所选图片会发送给已配置的视觉模型一次；原图不会由 CBoard API 保存。所有建议都可修改。'
  },
  metadataSuggestionLoading: {
    id: 'cboard.components.Board.TileEditor.metadataSuggestionLoading',
    defaultMessage: '正在生成可编辑建议…'
  },
  metadataSuggestionApplied: {
    id: 'cboard.components.Board.TileEditor.metadataSuggestionApplied',
    defaultMessage: '建议已填入空白字段，请检查并按需修改后再保存。'
  },
  metadataSuggestionUnavailable: {
    id: 'cboard.components.Board.TileEditor.metadataSuggestionUnavailable',
    defaultMessage: '自动建议暂时不可用，图片已保留，可继续手工填写。'
  },
  metadataSuggestionRateLimited: {
    id: 'cboard.components.Board.TileEditor.metadataSuggestionRateLimited',
    defaultMessage: '自动建议请求较多，请稍后重试；图片已保留，可继续手工填写。'
  },
  metadataSuggestionMonthlyQuota: {
    id: 'cboard.components.Board.TileEditor.metadataSuggestionMonthlyQuota',
    defaultMessage: '本月增强服务额度已用完；图片已保留，可继续手工填写。'
  },
  metadataSuggestionLoginRequired: {
    id: 'cboard.components.Board.TileEditor.metadataSuggestionLoginRequired',
    defaultMessage: '登录并配置视觉服务后可使用；当前仍可手工新增图卡。'
  },
  metadataSuggestionManual: {
    id: 'cboard.components.Board.TileEditor.metadataSuggestionManual',
    defaultMessage: '图片已保留；可手工填写，或明确允许单次上传后获取建议。'
  },
  animatedImagePreserved: {
    id: 'cboard.components.Board.TileEditor.animatedImagePreserved',
    defaultMessage:
      'GIF 动图已原样保留。为避免动画变成单帧，图片裁剪、自动建议和去背景不会用于这张图。'
  },
  chooseVideo: {
    id: 'cboard.components.Board.TileEditor.chooseVideo',
    defaultMessage: '选择 10 秒短视频'
  },
  videoHelp: {
    id: 'cboard.components.Board.TileEditor.videoHelp',
    defaultMessage:
      '支持 MP4/WebM，最长 10 秒、最大 8 MiB；当前图片会作为封面。'
  },
  videoLoginRequired: {
    id: 'cboard.components.Board.TileEditor.videoLoginRequired',
    defaultMessage: 'Web 端登录后才能持久化短视频，避免大文件损坏本地沟通板。'
  },
  videoFormatInvalid: {
    id: 'cboard.components.Board.TileEditor.videoFormatInvalid',
    defaultMessage: '仅支持 MP4 或 WebM 短视频。'
  },
  videoTooLarge: {
    id: 'cboard.components.Board.TileEditor.videoTooLarge',
    defaultMessage: '短视频超过 8 MiB，请压缩后重试。'
  },
  videoTooLong: {
    id: 'cboard.components.Board.TileEditor.videoTooLong',
    defaultMessage: '短视频超过 10 秒，请裁剪后重试。'
  },
  videoUnreadable: {
    id: 'cboard.components.Board.TileEditor.videoUnreadable',
    defaultMessage: '无法读取该短视频，请换一个文件重试。'
  },
  videoReady: {
    id: 'cboard.components.Board.TileEditor.videoReady',
    defaultMessage: '短视频已准备好，保存图卡时会上传。'
  },
  videoUploadFailed: {
    id: 'cboard.components.Board.TileEditor.videoUploadFailed',
    defaultMessage: '短视频上传失败，图卡尚未保存，请检查网络后重试。'
  },
  backgroundRemovalAction: {
    id: 'cboard.components.Board.TileEditor.backgroundRemovalAction',
    defaultMessage: '一键去除照片背景'
  },
  backgroundRemovalRestore: {
    id: 'cboard.components.Board.TileEditor.backgroundRemovalRestore',
    defaultMessage: '恢复原图'
  },
  backgroundRemovalConsent: {
    id: 'cboard.components.Board.TileEditor.backgroundRemovalConsent',
    defaultMessage:
      '所选照片将发送给已配置的背景移除服务一次。CBoard API 不保存原图，原图会继续保留在当前编辑器中供恢复；服务提供方仍受其自身条款约束。是否继续？'
  },
  backgroundRemovalPrivacy: {
    id: 'cboard.components.Board.TileEditor.backgroundRemovalPrivacy',
    defaultMessage:
      '结果只是可预览候选。请确认人物或物品没有被严重裁掉，再保存图卡。'
  },
  backgroundRemovalLoading: {
    id: 'cboard.components.Board.TileEditor.backgroundRemovalLoading',
    defaultMessage: '正在去除背景，原图仍保留…'
  },
  backgroundRemovalApplied: {
    id: 'cboard.components.Board.TileEditor.backgroundRemovalApplied',
    defaultMessage: '已切换为透明背景候选；请检查边缘，必要时恢复原图。'
  },
  backgroundRemovalRestored: {
    id: 'cboard.components.Board.TileEditor.backgroundRemovalRestored',
    defaultMessage: '已恢复原图。'
  },
  backgroundRemovalUnavailable: {
    id: 'cboard.components.Board.TileEditor.backgroundRemovalUnavailable',
    defaultMessage: '背景移除暂时不可用，原图和已填内容均未改变。'
  },
  backgroundRemovalRateLimited: {
    id: 'cboard.components.Board.TileEditor.backgroundRemovalRateLimited',
    defaultMessage: '背景移除请求较多，请稍后重试；原图和已填内容均未改变。'
  },
  backgroundRemovalMonthlyQuota: {
    id: 'cboard.components.Board.TileEditor.backgroundRemovalMonthlyQuota',
    defaultMessage: '本月增强服务额度已用完；原图和已填内容均未改变。'
  },
  backgroundRemovalLoginRequired: {
    id: 'cboard.components.Board.TileEditor.backgroundRemovalLoginRequired',
    defaultMessage: '登录并配置背景移除服务后可使用；当前仍可保存原图。'
  },
  loadFolderBoard: {
    id: 'cboard.components.Board.TileEditor.loadFolderBoard',
    defaultMessage: 'Link to an existing folder'
  },
  loadBoardAlertTitle: {
    id: 'cboard.components.Board.TileEditor.loadBoardAlertTitle',
    defaultMessage: "We can't find this folder"
  },
  loadBoardAlertDescription: {
    id: 'cboard.components.Board.TileEditor.loadBoardAlertDescription',
    defaultMessage:
      'Try to find it manualy on your remote folders by clicking on the search button.'
  },
  loadBoardAlertDescriptionLocalId: {
    id: 'cboard.components.Board.TileEditor.loadBoardAlertDescriptionLocalId',
    defaultMessage: `It looks like this folder is stored locally on the device where it was created. To use it, please connect that device to the internet and make a change to the folder. Alternatively, edit this tile to select a different folder.`
  },
  loadBoardAlertSearch: {
    id: 'cboard.components.Board.TileEditor.loadBoardAlertSearch',
    defaultMessage: 'Search folder'
  }
});
