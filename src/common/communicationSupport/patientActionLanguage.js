export const PATIENT_ACTION_IDS = Object.freeze({
  express: 'express',
  receive: 'receive',
  emergency: 'emergency',
  play: 'play',
  playAll: 'play-all',
  stop: 'stop',
  confirm: 'confirm',
  clear: 'clear',
  undo: 'undo',
  moveLeft: 'move-left',
  moveRight: 'move-right',
  remove: 'remove',
  replay: 'replay',
  save: 'save',
  share: 'share',
  back: 'back',
  understood: 'understood',
  notUnderstood: 'not-understood',
  repeat: 'repeat',
  fullscreen: 'fullscreen',
  improve: 'improve'
});

const definitions = [
  ['express', 'message', '…', '表达', '打开患者表达'],
  ['receive', 'receive', '?', '理解', '打开接收理解'],
  ['emergency', 'warning', '!', '求助', '打开紧急求助'],
  ['play', 'play', '▶', '朗读', '朗读当前句子'],
  ['play-all', 'play-all', '▶▶', '全播', '依次朗读全部候选句'],
  ['stop', 'stop', '■', '停止', '停止当前朗读'],
  ['confirm', 'confirm', '✓', '确认', '确认并保存当前表达'],
  ['clear', 'clear', '×', '清空', '清空当前图片序列'],
  ['undo', 'undo', '↶', '撤回', '撤回最后一张图片'],
  ['move-left', 'left', '←', '左移', '向左移动这张图片'],
  ['move-right', 'right', '→', '右移', '向右移动这张图片'],
  ['remove', 'remove', '×', '删除', '从表达中删除这张图片'],
  ['replay', 'replay', '↻', '重播', '重新朗读当前内容'],
  ['save', 'save', '☆', '收藏', '收藏当前句子为常用语'],
  ['share', 'share', '↗', '分享', '分享当前沟通内容'],
  ['back', 'back', '←', '返回', '返回上一沟通页面'],
  ['understood', 'understood', '✓', '明白', '我明白了'],
  ['not-understood', 'not-understood', '?', '不懂', '我没有明白'],
  ['repeat', 'repeat', '↻', '再说', '请再说一次'],
  ['fullscreen', 'fullscreen', '□', '全屏', '全屏展示已确认图片'],
  ['improve', 'improve', '+', '优化', '生成更自然的候选句']
];

const PATIENT_ACTION_DEFINITIONS = Object.freeze(
  Object.fromEntries(
    definitions.map(([id, icon, glyph, label, ariaLabel]) => [
      id,
      Object.freeze({ id, icon, glyph, label, ariaLabel })
    ])
  )
);

export function getPatientActionDefinition(id, overrides = {}) {
  const definition = PATIENT_ACTION_DEFINITIONS[String(id || '')];
  if (!definition) return null;

  const label = String(overrides.label || definition.label).trim();
  const ariaLabel = String(overrides.ariaLabel || definition.ariaLabel).trim();

  return {
    ...definition,
    label: label || definition.label,
    ariaLabel: ariaLabel || definition.ariaLabel
  };
}

export function getPatientActionDefinitions() {
  return Object.values(PATIENT_ACTION_DEFINITIONS);
}
