import {
  buildExpressionSharePayload,
  buildReceiverShareDocument,
  buildReceiverShareLayout,
  renderReceiverShareLayout
} from './communicationShare';

function isShareCancellation(error) {
  const name = String(error && error.name);
  const message = String(error && error.message).toLocaleLowerCase();
  return name === 'AbortError' || message.includes('cancel');
}

function loadBrowserImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https?:\/\//i.test(source)) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

function browserCanvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    if (!canvas || typeof canvas.toBlob !== 'function') {
      reject(new TypeError('Canvas PNG export is unavailable'));
      return;
    }
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new TypeError('Canvas PNG export failed'));
    }, 'image/png');
  });
}

function downloadBrowserBlob(blob, fileName, documentRef, urlRef) {
  const href = urlRef.createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = href;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  documentRef.body.appendChild(anchor);
  anchor.click();
  documentRef.body.removeChild(anchor);
  urlRef.revokeObjectURL(href);
}

function createBrowserFile(blob, fileName) {
  return typeof File === 'function'
    ? new File([blob], fileName, { type: 'image/png' })
    : null;
}

export function createBrowserCommunicationSharePort(dependencies = {}) {
  const navigatorRef =
    dependencies.navigatorRef ||
    (typeof navigator === 'undefined' ? null : navigator);
  const documentRef =
    dependencies.documentRef ||
    (typeof document === 'undefined' ? null : document);
  const urlRef =
    dependencies.urlRef || (typeof URL === 'undefined' ? null : URL);
  const createCanvas =
    dependencies.createCanvas ||
    (() => documentRef && documentRef.createElement('canvas'));
  const loadImage = dependencies.loadImage || loadBrowserImage;
  const canvasToBlob = dependencies.canvasToBlob || browserCanvasToBlob;
  const createFile = dependencies.createFile || createBrowserFile;
  const downloadBlob =
    dependencies.downloadBlob ||
    ((blob, fileName) =>
      downloadBrowserBlob(blob, fileName, documentRef, urlRef));

  return {
    async shareExpressionText(sentence) {
      const payload = buildExpressionSharePayload(sentence);
      if (!payload) {
        return { ok: false, message: '请先选择一句话再分享。' };
      }

      if (navigatorRef && typeof navigatorRef.share === 'function') {
        try {
          await navigatorRef.share({
            title: payload.title,
            text: payload.text
          });
          return { ok: true, mode: 'shared', message: '分享面板已打开。' };
        } catch (error) {
          if (isShareCancellation(error)) {
            return { ok: false, cancelled: true, message: '已取消分享。' };
          }
        }
      }

      try {
        downloadBlob(
          new Blob([payload.text], { type: 'text/plain;charset=utf-8' }),
          '图语家表达.txt'
        );
        return {
          ok: true,
          mode: 'downloaded',
          message: '当前浏览器不支持文字分享，已下载文本文件。'
        };
      } catch (error) {
        return {
          ok: false,
          message: '当前浏览器无法分享或下载这句话。'
        };
      }
    },

    async shareReceiverImage(items, options = {}) {
      try {
        const shareDocument = buildReceiverShareDocument(items, options);
        const layout = buildReceiverShareLayout(shareDocument);
        if (!layout) {
          return { ok: false, message: '请先生成图片序列再分享。' };
        }

        const canvas = createCanvas();
        if (!canvas) throw new TypeError('Canvas is unavailable');
        canvas.width = layout.width;
        canvas.height = layout.height;
        const context = canvas.getContext('2d');
        const renderResult = await renderReceiverShareLayout(
          context,
          layout,
          loadImage
        );
        const blob = await canvasToBlob(canvas);
        const fileName = '图语家接收图片.png';
        const file = createFile(blob, fileName);
        const canShareFile = Boolean(
          file &&
            navigatorRef &&
            typeof navigatorRef.share === 'function' &&
            typeof navigatorRef.canShare === 'function' &&
            navigatorRef.canShare({ files: [file] })
        );

        if (canShareFile) {
          try {
            await navigatorRef.share({
              title: '图语家接收图片',
              files: [file]
            });
            return {
              ok: true,
              mode: 'shared',
              message: renderResult.failedImageCount
                ? `分享面板已打开；${
                    renderResult.failedImageCount
                  } 张图片加载失败，已用问号标记。`
                : '图片分享面板已打开。'
            };
          } catch (error) {
            if (isShareCancellation(error)) {
              return { ok: false, cancelled: true, message: '已取消分享。' };
            }
          }
        }

        downloadBlob(blob, fileName);
        return {
          ok: true,
          mode: 'downloaded',
          message: renderResult.failedImageCount
            ? `已下载图片；${
                renderResult.failedImageCount
              } 张图片加载失败，已用问号标记。`
            : '当前浏览器不支持图片分享，已下载图片。'
        };
      } catch (error) {
        const tooManyItems = error instanceof RangeError;
        return {
          ok: false,
          message: tooManyItems
            ? '图片数量过多，请缩短本次内容后再分享。'
            : '图片序列生成失败，当前沟通内容仍会保留。'
        };
      }
    }
  };
}

export const browserCommunicationSharePort = createBrowserCommunicationSharePort();
