import React from 'react';
import { shallow } from 'enzyme';
import API from '../../../api';
import SymbolSearch, {
  SymbolSearch as SymbolSearchComponent
} from './SymbolSearch.component';

jest.mock('../../../api', () => ({
  __esModule: true,
  default: {
    globalsymbolsPictogramsSearch: jest.fn()
  }
}));

jest.mock('./SymbolSearch.messages', () => {
  return {
    searchSymbolLibrary: {
      id: 'cboard.components.SymbolSearch.searchSymbolLibrary',
      defaultMessage: 'Search symbol library'
    },
    uploadAnImage: {
      id: 'cboard.components.InputImage.uploadImage',
      defaultMessage: 'Upload an image'
    }
  };
});

jest.mock('../../../api/cboard-symbols', () => ({
  searchCboardSymbols: jest.fn(),
  mapArasaacToCboardSkinTone: jest.fn()
}));

jest.mock('../../../api/mulberry-symbols.json', () => ({
  __esModule: true,
  default: []
}));

describe('SymbolSearch tests', () => {
  const props = {
    intl: {
      formatMessage: jest.fn(),
      locale: 'en-US'
    },
    open: true,
    maxSuggestions: 7,
    onChange: jest.fn(),
    onClose: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('default renderer', () => {
    const wrapper = shallow(<SymbolSearch {...props} />);
    expect(wrapper).toMatchSnapshot();
  });

  test('passes Global Symbols attribution with the selected candidate', async () => {
    const attribution = {
      provider: 'globalsymbols',
      originalId: '314',
      name: 'Global Symbols / Mulberry Symbols',
      license: 'CC BY-SA 4.0',
      author: 'Paxtoncrafts Charitable Trust',
      sourceUrl: 'https://globalsymbols.com/uploads/apple.svg'
    };
    API.globalsymbolsPictogramsSearch.mockResolvedValue([
      {
        id: 42,
        text: 'apple',
        picto: {
          id: 314,
          image_url:
            'https://api.example.test/pictograms/globalsymbols/signed/image'
        },
        pictogramAttribution: attribution
      }
    ]);
    props.onChange.mockResolvedValue();
    const wrapper = shallow(<SymbolSearchComponent {...props} />);

    await wrapper.instance().fetchGlobalsymbolsSuggestions('apple');
    const suggestion = wrapper.state('suggestions')[0];
    await wrapper.instance().handleSuggestionSelected(null, { suggestion });

    expect(suggestion.pictogramAttribution).toEqual(attribution);
    expect(props.onChange).toHaveBeenCalledWith({
      image: 'https://api.example.test/pictograms/globalsymbols/signed/image',
      keyPath: undefined,
      label: 'apple',
      labelKey: undefined,
      pictogramAttribution: attribution
    });
    expect(props.onClose).toHaveBeenCalled();
  });

  test('shows attribution before selecting an external candidate', () => {
    const wrapper = shallow(<SymbolSearchComponent {...props} />);
    const renderedSuggestion = shallow(
      wrapper.instance().renderSuggestion(
        {
          translatedId: 'apple',
          src: 'https://api.example.test/pictograms/globalsymbols/image',
          pictogramAttribution: {
            provider: 'globalsymbols',
            originalId: '314',
            name: 'Global Symbols / Mulberry Symbols',
            license: 'CC BY-SA 4.0',
            author: 'Paxtoncrafts Charitable Trust',
            sourceUrl: 'https://globalsymbols.com/uploads/apple.svg'
          }
        },
        { query: 'apple', isHighlighted: false }
      )
    );

    expect(
      renderedSuggestion.hasClass('SymbolSearch__Suggestion--attributed')
    ).toBe(true);
    expect(renderedSuggestion.find('.SymbolSearch__Attribution').text()).toBe(
      'Global Symbols / Mulberry Symbols · ' +
        '作者：Paxtoncrafts Charitable Trust · CC BY-SA 4.0'
    );
  });

  test('does not reserve attribution space for bundled candidates', () => {
    const wrapper = shallow(<SymbolSearchComponent {...props} />);
    const renderedSuggestion = shallow(
      wrapper.instance().renderSuggestion(
        {
          translatedId: 'apple',
          src: '/symbols/mulberry/apple.svg'
        },
        { query: 'apple', isHighlighted: false }
      )
    );

    expect(
      renderedSuggestion.hasClass('SymbolSearch__Suggestion--attributed')
    ).toBe(false);
    expect(renderedSuggestion.find('.SymbolSearch__Attribution')).toHaveLength(
      0
    );
  });
});
