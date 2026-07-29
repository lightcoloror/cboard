import * as actions from '../SpeechProvider.actions';
import * as types from '../SpeechProvider.constants';
import tts from '../tts';

import configureMockStore from 'redux-mock-store';
import thunk from 'redux-thunk';

jest.mock('../tts', () => ({
  __esModule: true,
  default: {
    cancel: jest.fn(),
    speak: jest.fn()
  }
}));

const middlewares = [thunk];
const mockStore = configureMockStore(middlewares);

let initialState;
initialState = {
  app: {
    userData: {
      authToken:
        'eyJhbGciOiJIUtI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFybCI6ImFueXRoaW5nQGNib2FyZC5pbyIsImlkIjoiNWJjZmE0ZWQ0OTRiMjAwMDBmOGFiOThiIiwiaXNzdWVyIjoiY2JvYXJkLmlvIiwiaWF0IjoxNTU5NzU1NTU3fQ.2ENI4GyaHwV1B-Pifi0ZUKqyGcjTSLDV0UoPKUY99bo',
      email: 'anything@cboard.io',
      id: '5bcfa4ed494b20000f8ab98b',
      lastlogin: '2018-10-23T22:47:09.367Z',
      locale: 'en-US',
      name: 'martin bedouret',
      provider: '',
      role: 'user'
    }
  },
  speech: {
    isSpeaking: false,
    langs: [
      'de-DE',
      'en-GB',
      'en-US',
      'es-ES',
      'es-US',
      'fr-FR',
      'hi-IN',
      'id-ID',
      'it-IT',
      'ja-JP',
      'ko-KR',
      'nl-NL',
      'pl-PL',
      'pt-BR',
      'ru-RU',
      'zh-CN',
      'zh-HK',
      'zh-TW'
    ],
    options: {
      lang: 'en-US',
      voiceURI: 'Microsoft David Desktop - English (United States)',
      pitch: 0.75,
      rate: 0.75,
      volume: 1
    },
    voices: []
  }
};
let voices = [
  { voiceURI: 'Google Deutsch', lang: 'de-DE', name: 'Google Deutsch' },
  { voiceURI: 'Google US English', lang: 'en-US', name: 'Google US English' },
  {
    voiceURI: 'Google UK English Female',
    lang: 'en-GB',
    name: 'Google UK English Female'
  },
  {
    voiceURI: 'Google UK English Male',
    lang: 'en-GB',
    name: 'Google UK English Male'
  },
  { voiceURI: 'Google español', lang: 'es-ES', name: 'Google español' }
];

describe('actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create an action to request voices', () => {
    const expectedAction = {
      type: types.REQUEST_VOICES
    };
    expect(actions.requestVoices()).toEqual(expectedAction);
  });

  it('should create an action to receive voices', () => {
    const voices = [{}, {}];
    const expectedAction = {
      type: types.RECEIVE_VOICES,
      voices
    };
    expect(actions.receiveVoices(voices)).toEqual(expectedAction);
  });

  it('should create an action to change voice', () => {
    const voiceURI = 'Shay Hebrew Voice';
    const lang = 'he';
    const store = mockStore(initialState);

    const expectedAction = {
      type: types.CHANGE_VOICE,
      voiceURI,
      lang,
      isCloud: false
    };

    store.dispatch(actions.changeVoice(voiceURI, lang));
    expect(store.getActions()).toEqual([expectedAction]);
  });

  it('should create an action to change pitch', () => {
    const pitch = 2;
    const expectedAction = {
      type: types.CHANGE_PITCH,
      pitch
    };
    expect(actions.changePitch(pitch)).toEqual(expectedAction);
  });

  it('should create an action to change rate', () => {
    const rate = 2;
    const expectedAction = {
      type: types.CHANGE_RATE,
      rate
    };
    expect(actions.changeRate(rate)).toEqual(expectedAction);
  });
  it('should create an action to cancelSpeech', () => {
    const dispatch = jest.fn();
    actions.cancelSpeech()(dispatch);
    expect(dispatch).toHaveBeenCalledWith({
      type: types.CANCEL_SPEECH,
      isSpeaking: false
    });
    expect(tts.cancel).toHaveBeenCalledTimes(1);
  });
  it('should create an action to speak ', () => {
    const store = mockStore(initialState);
    const onend = jest.fn();
    store.dispatch(actions.speak(' aaa ', onend));

    expect(store.getActions()).toEqual([
      {
        type: types.START_SPEECH,
        isSpeaking: true,
        text: 'aaa'
      }
    ]);
    expect(tts.speak).toHaveBeenCalledWith(
      ' aaa ',
      expect.objectContaining({
        ...initialState.speech.options,
        onend: expect.any(Function)
      }),
      expect.any(Function)
    );

    const speechOptions = tts.speak.mock.calls[0][1];
    speechOptions.onend();

    expect(onend).toHaveBeenCalledTimes(1);
    expect(store.getActions()).toContainEqual({
      type: types.END_SPEECH,
      isSpeaking: false
    });
  });
});
