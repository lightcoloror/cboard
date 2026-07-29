import {
  createBrowserVoiceRecordingSession,
  createCordovaRecordingTarget,
  createCordovaVoiceRecordingSession,
  getCordovaVoiceRecorderPlugin
} from './voiceRecordingAdapter';

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

describe('voice recording adapter', () => {
  test('selects the Cordova Media plugin only on supported mobile platforms', () => {
    const Media = jest.fn();
    const baseScope = {
      Media,
      cordova: {
        file: { cacheDirectory: 'file:///cache/' }
      },
      resolveLocalFileSystemURL: jest.fn()
    };

    expect(
      getCordovaVoiceRecorderPlugin({
        ...baseScope,
        cordova: { ...baseScope.cordova, platformId: 'android' }
      })
    ).toBe(Media);
    expect(
      getCordovaVoiceRecorderPlugin({
        ...baseScope,
        cordova: { ...baseScope.cordova, platformId: 'electron' }
      })
    ).toBeNull();
  });

  test('uses platform-compatible Cordova recording formats and paths', () => {
    const android = createCordovaRecordingTarget(
      {
        cordova: {
          platformId: 'android',
          file: { cacheDirectory: 'file:///data/user/0/cboard/cache/' }
        }
      },
      42
    );
    const ios = createCordovaRecordingTarget(
      {
        cordova: {
          platformId: 'ios',
          file: { cacheDirectory: 'file:///ios/cache/' }
        }
      },
      42
    );

    expect(android).toEqual({
      fileName: 'cboard-voice-42.aac',
      fileUrl: 'file:///data/user/0/cboard/cache/cboard-voice-42.aac',
      mediaPath: '/data/user/0/cboard/cache/cboard-voice-42.aac',
      mimeType: 'audio/aac'
    });
    expect(ios).toEqual({
      fileName: 'cboard-voice-42.m4a',
      fileUrl: 'file:///ios/cache/cboard-voice-42.m4a',
      mediaPath: 'file:///ios/cache/cboard-voice-42.m4a',
      mimeType: 'audio/mp4'
    });
  });

  test('records with browser MediaRecorder and releases the microphone', async () => {
    const stopTrack = jest.fn();
    const onRecorded = jest.fn();
    const blob = new Blob(['voice'], { type: 'audio/webm' });
    let recorder;

    class MediaRecorderMock {
      constructor() {
        this.state = 'inactive';
        this.mimeType = 'audio/webm';
        recorder = this;
      }

      start() {
        this.state = 'recording';
      }

      stop() {
        this.state = 'inactive';
        this.ondataavailable({ data: blob });
        this.onstop();
      }
    }

    class FileReaderMock {
      readAsDataURL() {
        this.result = 'data:audio/webm;base64,dm9pY2U=';
        this.onloadend();
      }
    }

    const scope = {
      Blob,
      FileReader: FileReaderMock,
      MediaRecorder: MediaRecorderMock,
      navigator: {
        mediaDevices: {
          getUserMedia: jest.fn().mockResolvedValue({
            getTracks: () => [{ stop: stopTrack }]
          })
        }
      }
    };
    const session = createBrowserVoiceRecordingSession({
      scope,
      onRecorded,
      onError: jest.fn()
    });

    await session.start();
    expect(recorder.state).toBe('recording');
    session.stop();
    await flushPromises();

    expect(onRecorded).toHaveBeenCalledWith('data:audio/webm;base64,dm9pY2U=');
    expect(stopTrack).toHaveBeenCalled();
  });

  test('records through Cordova Media, reads the file, and removes it', async () => {
    const onRecorded = jest.fn();
    const remove = jest.fn(success => success());
    const release = jest.fn();
    let successCallback;

    function MediaMock(path, success) {
      successCallback = success;
      this.path = path;
      this.startRecord = jest.fn();
      this.stopRecord = jest.fn(() => successCallback());
      this.release = release;
    }

    class FileReaderMock {
      readAsDataURL() {
        this.result = 'data:;base64,YWFj';
        this.onloadend();
      }
    }

    const scope = {
      FileReader: FileReaderMock,
      Media: MediaMock,
      cordova: {
        platformId: 'android',
        file: { cacheDirectory: 'file:///cache/' }
      },
      resolveLocalFileSystemURL: jest.fn((url, success) =>
        success({
          file: callback => callback({ type: '' }),
          remove
        })
      )
    };
    const session = createCordovaVoiceRecordingSession({
      scope,
      onRecorded,
      onError: jest.fn()
    });

    session.start();
    session.stop();
    await flushPromises();

    expect(onRecorded).toHaveBeenCalledWith('data:audio/aac;base64,YWFj');
    expect(release).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
  });
});
