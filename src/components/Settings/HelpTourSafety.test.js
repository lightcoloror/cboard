import React from 'react';
import { IntlProvider } from 'react-intl';
import { mount, shallow } from 'enzyme';
import { act } from 'react-dom/test-utils';
import SettingsTour from './SettingsTour.component';
import BoardTour from '../Board/BoardTour/BoardTour';
import ResetToursItem from '../UI/ResetToursItem/ResetToursItem.component';

jest.unmock('react-intl');
jest.mock('react-joyride', () => ({
  __esModule: true,
  STATUS: { FINISHED: 'finished', SKIPPED: 'skipped' },
  default: function JoyrideStub() { return null; }
}));
jest.mock('swiper/react', () => ({
  Swiper: function SwiperStub(props) { return <div>{props.children}</div>; },
  SwiperSlide: function SwiperSlideStub(props) { return <div>{props.children}</div>; }
}));
jest.mock('swiper/core', () => ({
  __esModule: true, default: { use: jest.fn() }, Navigation: {}, Pagination: {}
}));
jest.mock('../../cordova-util', () => ({ isCordova: () => false }));
jest.mock('../Communicator/CommunicatorToolbar/DefaultBoardSelector/DefaultBoardsGallery', () => () => null);

const intl = {
  ...new IntlProvider({ locale: 'en-US', defaultLocale: 'en-US', messages: {} }, {}).getChildContext().intl,
  locale: 'zh-CN'
};
let entry;
beforeEach(() => {
  entry = document.createElement('button');
  entry.textContent = '重新查看引导';
  document.body.appendChild(entry);
  entry.focus();
});
afterEach(() => { entry.remove(); });

test('settings instructions stay paused until explicit slide navigation, including after reopen', () => {
  const disableTour = jest.fn();
  const wrapper = mount(<SettingsTour intl={intl} disableTour={disableTour} isSettingsTourEnabled />);
  const check = () => {
    const steps = wrapper.find('JoyrideStub').prop('steps');
    [5, 7].forEach(index => {
      const content = shallow(steps[index].content);
      expect(content.find('SwiperStub').prop('autoplay')).toBe(false);
      expect(content.find('SwiperStub').prop('navigation')).toBe(true);
      expect(content.text()).toContain('说明图片不会自动翻页');
    });
  };
  check();
  act(() => { wrapper.setProps({ isSettingsTourEnabled: false }); });
  act(() => { wrapper.setProps({ isSettingsTourEnabled: true }); });
  check();
  expect(disableTour).not.toHaveBeenCalled();
  wrapper.unmount();
});

test.each(['skipped', 'finished'])('settings %s only closes the existing tour and returns to its entry', async status => {
  const disableTour = jest.fn();
  const wrapper = mount(<SettingsTour intl={intl} disableTour={disableTour} isSettingsTourEnabled />);
  const temporaryFocus = document.createElement('button');
  document.body.appendChild(temporaryFocus);
  temporaryFocus.focus();
  await act(async () => { wrapper.find('JoyrideStub').prop('callback')({ status }); await Promise.resolve(); });
  expect(disableTour).toHaveBeenCalledWith({ isSettingsTourEnabled: false });
  expect(document.activeElement).toBe(entry);
  temporaryFocus.remove();
  wrapper.unmount();
});

test.each([true, false])('board tour skip and reopen preserve the locked=%s branch and keyboard return', async isLocked => {
  const disableTour = jest.fn();
  const props = { isLocked, isRootBoardTourEnabled: true, isUnlockedTourEnabled: true, disableTour, intl };
  const wrapper = mount(<BoardTour {...props} />);
  const callback = wrapper.find('JoyrideStub').prop('callback');
  act(() => { callback({ status: 'running' }); });
  expect(disableTour).not.toHaveBeenCalled();
  await act(async () => { callback({ status: 'skipped' }); await Promise.resolve(); });
  expect(disableTour).toHaveBeenCalledWith(isLocked
    ? { isRootBoardTourEnabled: false } : { isUnlockedTourEnabled: false });
  expect(document.activeElement).toBe(entry);
  const enabledKey = isLocked ? 'isRootBoardTourEnabled' : 'isUnlockedTourEnabled';
  act(() => { wrapper.setProps({ [enabledKey]: false }); });
  expect(wrapper.find('JoyrideStub').exists()).toBe(false);
  act(() => { wrapper.setProps({ [enabledKey]: true }); });
  expect(wrapper.find('JoyrideStub').prop('showSkipButton')).toBe(true);
  wrapper.unmount();
});

test('settings replay returns focus to the recreated real entry after the tour unmounts', async () => {
  function Launcher() {
    const [active, setActive] = React.useState(false);
    return <div>{!active && <div className="Settings_EnableTour_Button"><button onClick={() => setActive(true)}>重看</button></div>}
      {active && <SettingsTour intl={intl} disableTour={() => setActive(false)} isSettingsTourEnabled />}</div>;
  }
  const host = document.createElement('div');
  document.body.appendChild(host);
  const wrapper = mount(<Launcher />, { attachTo: host });
  const oldEntry = wrapper.find('button').getDOMNode();
  oldEntry.focus();
  act(() => { wrapper.find('button').simulate('click'); });
  wrapper.update();
  expect(document.documentElement.contains(oldEntry)).toBe(false);
  await act(async () => {
    wrapper.find('JoyrideStub').prop('callback')({ status: 'skipped' });
    await Promise.resolve();
  });
  wrapper.update();
  const newEntry = wrapper.find('button').getDOMNode();
  expect(newEntry).not.toBe(oldEntry);
  expect(document.activeElement).toBe(newEntry);
  wrapper.unmount();
  host.remove();
});

test('resetting tours requires explicit confirmation; cancel does not enable tours', () => {
  const enableAllTours = jest.fn();
  const wrapper = mount(<IntlProvider locale="en-US" defaultLocale="en-US"><ResetToursItem enableAllTours={enableAllTours} /></IntlProvider>);
  wrapper.find('div[role="button"]').first().simulate('click');
  expect(enableAllTours).not.toHaveBeenCalled();
  wrapper.find('button').filterWhere(button => button.text() === 'Cancel').simulate('click');
  expect(enableAllTours).not.toHaveBeenCalled();
  wrapper.find('div[role="button"]').first().simulate('click');
  wrapper.find('button').filterWhere(button => button.text() === 'OK').simulate('click');
  expect(enableAllTours).toHaveBeenCalledTimes(1);
  wrapper.unmount();
});
