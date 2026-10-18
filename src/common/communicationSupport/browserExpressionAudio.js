// Browser adapter for the existing CBoard Output Audio/onended contract.
// The shared coordinator owns sequence order, fallback and cancellation policy.
export function createBrowserExpressionAudio(createAudio = () => new Audio()) {
  let finishActive = null;
  const stop = () => {
    if (finishActive)
      finishActive({ ok: false, reason: 'stopped', message: '朗读已停止。' });
  };
  return {
    stop,
    play(source, { rate = 1 } = {}) {
      stop();
      return new Promise(resolve => {
        let audio,
          timer,
          done = false;
        const finish = result => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (finishActive === finish) finishActive = null;
          if (audio) {
            audio.onended = null;
            audio.onerror = null;
            try {
              audio.pause();
            } catch (_) {
              /* A failed audio device must still settle playback. */
            }
          }
          resolve(result);
        };
        finishActive = finish;
        try {
          audio = createAudio();
          audio.onended = () => finish({ ok: true, message: '录音已播报。' });
          audio.onerror = () =>
            finish({
              ok: false,
              reason: 'playback',
              message: '录音无法播放。'
            });
          audio.src = source;
          audio.playbackRate = rate;
          timer = setTimeout(
            () =>
              finish({
                ok: false,
                reason: 'timeout',
                message: '录音播报超时。'
              }),
            60000
          );
          const playing = audio.play();
          if (playing?.catch)
            playing.catch(() =>
              finish({
                ok: false,
                reason: 'playback',
                message: '录音无法播放。'
              })
            );
        } catch (_) {
          finish({ ok: false, reason: 'playback', message: '录音无法播放。' });
        }
      });
    }
  };
}
