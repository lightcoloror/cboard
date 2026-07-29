import {
  formatPictogramAttribution,
  getPictogramAttribution
} from './pictogramAttribution';

export const COMMUNICATION_SHARE_CONTRACT_VERSION = 1;
export const RECEIVER_SHARE_CANVAS_WIDTH = 1080;
export const MAX_RECEIVER_SHARE_ITEMS = 40;

const CANVAS_PADDING = 64;
const CARD_GAP = 24;
const CARD_HEIGHT_SINGLE = 320;
const CARD_HEIGHT_DOUBLE = 280;

function normalizeText(value, maxLength) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function wrapCommunicationShareText(value, maxCharacters) {
  const text = normalizeText(value, 2000);
  const width = Math.max(1, Number(maxCharacters) || 1);
  const characters = Array.from(text);
  const lines = [];

  for (let index = 0; index < characters.length; index += width) {
    lines.push(characters.slice(index, index + width).join(''));
  }

  return lines;
}

export function buildExpressionSharePayload(sentence) {
  const text = normalizeText(sentence, 240);
  if (!text) return null;

  return {
    contractVersion: COMMUNICATION_SHARE_CONTRACT_VERSION,
    title: '图语家表达',
    text
  };
}

function normalizeReceiverShareItem(item, index) {
  if (!item || typeof item !== 'object') return null;
  const label = normalizeText(item.label, 48);
  const image = normalizeText(item.image, 2048);
  if (!label && !image) return null;
  const attribution = getPictogramAttribution(item);
  const attributionText = formatPictogramAttribution(attribution);

  return {
    id: normalizeText(item.id, 160) || `share-item-${index + 1}`,
    label: label || '未命名图片',
    image,
    attribution,
    attributionText
  };
}

export function buildReceiverShareDocument(
  items,
  { title = '图语家 · 接收理解', speechText = '' } = {}
) {
  const sourceItems = Array.isArray(items) ? items : [];
  if (sourceItems.length > MAX_RECEIVER_SHARE_ITEMS) {
    throw new RangeError(
      `Receiver share supports at most ${MAX_RECEIVER_SHARE_ITEMS} items`
    );
  }

  const normalizedItems = sourceItems
    .map(normalizeReceiverShareItem)
    .filter(Boolean);
  if (!normalizedItems.length) return null;

  const attributionLines = Array.from(
    new Set(normalizedItems.map(item => item.attributionText).filter(Boolean))
  );

  return {
    contractVersion: COMMUNICATION_SHARE_CONTRACT_VERSION,
    title: normalizeText(title, 80) || '图语家 · 接收理解',
    speechText: normalizeText(speechText, 240),
    items: normalizedItems,
    attributionLines
  };
}

function appendTextLines(
  textBlocks,
  lines,
  { x, y, lineHeight, font, color, maxWidth, align = 'left' }
) {
  lines.forEach((text, index) => {
    textBlocks.push({
      text,
      x,
      y: y + index * lineHeight,
      font,
      color,
      maxWidth,
      align
    });
  });
}

export function buildReceiverShareLayout(document) {
  if (!document || !Array.isArray(document.items) || !document.items.length) {
    return null;
  }

  const width = RECEIVER_SHARE_CANVAS_WIDTH;
  const columns = document.items.length > 4 ? 2 : 1;
  const cardHeight = columns === 1 ? CARD_HEIGHT_SINGLE : CARD_HEIGHT_DOUBLE;
  const cardWidth =
    (width - CANVAS_PADDING * 2 - CARD_GAP * (columns - 1)) / columns;
  const imageSize = columns === 1 ? 220 : 164;
  const textBlocks = [];
  const imageBlocks = [];
  const rectangles = [];
  let cursorY = CANVAS_PADDING;

  appendTextLines(textBlocks, wrapCommunicationShareText(document.title, 18), {
    x: CANVAS_PADDING,
    y: cursorY + 54,
    lineHeight: 64,
    font: '700 54px sans-serif',
    color: '#153f36',
    maxWidth: width - CANVAS_PADDING * 2
  });
  cursorY +=
    Math.max(1, wrapCommunicationShareText(document.title, 18).length) * 64 +
    20;

  if (document.speechText) {
    const speechLines = wrapCommunicationShareText(
      `照护者原文：${document.speechText}`,
      30
    );
    appendTextLines(textBlocks, speechLines, {
      x: CANVAS_PADDING,
      y: cursorY + 38,
      lineHeight: 46,
      font: '400 36px sans-serif',
      color: '#365b52',
      maxWidth: width - CANVAS_PADDING * 2
    });
    cursorY += speechLines.length * 46 + 24;
  }

  const cardsTop = cursorY;
  document.items.forEach((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = CANVAS_PADDING + column * (cardWidth + CARD_GAP);
    const y = cardsTop + row * (cardHeight + CARD_GAP);
    const imageX = x + 24;
    const imageY = y + (cardHeight - imageSize) / 2;
    const labelX = imageX + imageSize + 28;
    const labelWidth = cardWidth - imageSize - 80;
    const labelLines = wrapCommunicationShareText(
      item.label,
      columns === 1 ? 14 : 7
    );

    rectangles.push({
      x,
      y,
      width: cardWidth,
      height: cardHeight,
      fill: '#fffdf7',
      stroke: '#cbdad2',
      lineWidth: 3
    });
    imageBlocks.push({
      source: item.image,
      x: imageX,
      y: imageY,
      width: imageSize,
      height: imageSize,
      label: item.label
    });
    textBlocks.push({
      text: String(index + 1).padStart(2, '0'),
      x: labelX,
      y: y + 62,
      font: '700 34px sans-serif',
      color: '#a05b16',
      maxWidth: labelWidth,
      align: 'left'
    });
    appendTextLines(textBlocks, labelLines, {
      x: labelX,
      y: y + 126,
      lineHeight: 58,
      font: '700 48px sans-serif',
      color: '#102f29',
      maxWidth: labelWidth
    });
  });

  const rowCount = Math.ceil(document.items.length / columns);
  cursorY =
    cardsTop + rowCount * cardHeight + Math.max(0, rowCount - 1) * CARD_GAP;
  cursorY += 56;
  textBlocks.push({
    text: '图片来源与许可',
    x: CANVAS_PADDING,
    y: cursorY,
    font: '700 34px sans-serif',
    color: '#153f36',
    maxWidth: width - CANVAS_PADDING * 2,
    align: 'left'
  });
  cursorY += 52;

  const attributionLines = document.attributionLines.length
    ? document.attributionLines
    : ['未提供可验证的图片来源信息，请查看原应用记录。'];
  attributionLines.forEach(line => {
    const wrapped = wrapCommunicationShareText(line, 38);
    appendTextLines(textBlocks, wrapped, {
      x: CANVAS_PADDING,
      y: cursorY,
      lineHeight: 40,
      font: '400 30px sans-serif',
      color: '#526b64',
      maxWidth: width - CANVAS_PADDING * 2
    });
    cursorY += wrapped.length * 40 + 12;
  });

  cursorY += 30;
  textBlocks.push({
    text: '由图语家生成 · 图片顺序与确认时一致',
    x: width / 2,
    y: cursorY,
    font: '400 28px sans-serif',
    color: '#6f817c',
    maxWidth: width - CANVAS_PADDING * 2,
    align: 'center'
  });

  return {
    contractVersion: COMMUNICATION_SHARE_CONTRACT_VERSION,
    width,
    height: Math.ceil(cursorY + CANVAS_PADDING),
    background: '#f4f8f5',
    rectangles,
    imageBlocks,
    textBlocks
  };
}

function drawPlaceholder(context, block) {
  context.fillStyle = '#f3eee5';
  context.fillRect(block.x, block.y, block.width, block.height);
  context.fillStyle = '#9a3412';
  context.font = '700 96px sans-serif';
  context.textAlign = 'center';
  context.fillText(
    '?',
    block.x + block.width / 2,
    block.y + block.height / 2 + 34,
    block.width
  );
}

function getContainedImageRect(image, block) {
  const sourceWidth = Number(image && (image.naturalWidth || image.width));
  const sourceHeight = Number(image && (image.naturalHeight || image.height));
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
    return block;
  }

  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = block.width / block.height;
  if (sourceRatio > targetRatio) {
    const height = block.width / sourceRatio;
    return {
      x: block.x,
      y: block.y + (block.height - height) / 2,
      width: block.width,
      height
    };
  }

  const width = block.height * sourceRatio;
  return {
    x: block.x + (block.width - width) / 2,
    y: block.y,
    width,
    height: block.height
  };
}

export async function renderReceiverShareLayout(context, layout, loadImage) {
  if (!context || !layout || typeof loadImage !== 'function') {
    throw new TypeError(
      'A canvas context, layout and image loader are required'
    );
  }

  context.fillStyle = layout.background;
  context.fillRect(0, 0, layout.width, layout.height);

  layout.rectangles.forEach(rectangle => {
    context.fillStyle = rectangle.fill;
    context.fillRect(
      rectangle.x,
      rectangle.y,
      rectangle.width,
      rectangle.height
    );
    context.strokeStyle = rectangle.stroke;
    context.lineWidth = rectangle.lineWidth;
    context.strokeRect(
      rectangle.x,
      rectangle.y,
      rectangle.width,
      rectangle.height
    );
  });

  let loadedImageCount = 0;
  let failedImageCount = 0;
  for (const block of layout.imageBlocks) {
    if (!block.source) {
      failedImageCount += 1;
      drawPlaceholder(context, block);
      continue;
    }

    try {
      const image = await loadImage(block.source);
      const imageRect = getContainedImageRect(image, block);
      context.drawImage(
        image,
        imageRect.x,
        imageRect.y,
        imageRect.width,
        imageRect.height
      );
      loadedImageCount += 1;
    } catch (error) {
      failedImageCount += 1;
      drawPlaceholder(context, block);
    }
  }

  layout.textBlocks.forEach(block => {
    context.fillStyle = block.color;
    context.font = block.font;
    context.textAlign = block.align;
    context.fillText(block.text, block.x, block.y, block.maxWidth);
  });

  return { loadedImageCount, failedImageCount };
}
