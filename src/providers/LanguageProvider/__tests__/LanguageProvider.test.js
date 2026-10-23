import React from 'react';
import { shallow } from 'enzyme';
import { LanguageProvider } from '../LanguageProvider.container';
import { importTranslation } from '../../../i18n';
import { DEFAULT_LANG } from '../../../components/App/App.constants';
import { setLangs } from '../LanguageProvider.actions';
import languageProviderReducer from '../LanguageProvider.reducer';

jest.mock('../../../i18n', () => ({
  ...jest.requireActual('../../../i18n'),
  importTranslation: jest.fn()
}));

beforeEach(() => {
  importTranslation.mockReset().mockResolvedValue({});
});

it('renders without crashing', () => {
  const props = {
    lang: '',
    setLangs: () => {},
    changeLang: () => {}
  };
  shallow(
    <LanguageProvider {...props}>
      <div />
    </LanguageProvider>
  );
});

it('keeps a language array and preserves props when a translation fails', async () => {
  importTranslation.mockRejectedValue(new Error('Translation chunk unavailable'));
  const platformLangs = ['zh-CN'];
  const props = {
    lang: 'zh-CN',
    platformLangs,
    setLangs: jest.fn(),
    changeLang: jest.fn(),
    showNotification: jest.fn()
  };
  const wrapper = shallow(
    <LanguageProvider {...props}><div /></LanguageProvider>,
    { disableLifecycleMethods: true }
  );

  wrapper.instance().fetchMessages('zh-CN');
  await Promise.resolve();
  await Promise.resolve();

  expect(props.setLangs).toHaveBeenCalledWith(['zh-CN', DEFAULT_LANG]);
  expect(platformLangs).toEqual(['zh-CN']);
  const fallbackLangs = props.setLangs.mock.calls[0][0];
  expect(languageProviderReducer(undefined, setLangs(fallbackLangs)).langs)
    .toEqual([DEFAULT_LANG, 'zh-CN']);
  expect(props.changeLang).toHaveBeenCalledWith(DEFAULT_LANG);
  expect(props.showNotification).toHaveBeenCalled();
  wrapper.unmount();
});
