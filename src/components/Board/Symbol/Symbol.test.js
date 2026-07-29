import React from 'react';
import { shallow, mount } from 'enzyme';
import Symbol from './Symbol';

it('renders without crashing', () => {
  shallow(<Symbol label="dummy label" labelpos="Below" />);
});

it('renders with image', () => {
  const img = 'path/to/img.svg';
  const wrapper = mount(<Symbol label="dummy label" image={img} />);
  expect(wrapper.find('.Symbol__image')).toHaveLength(1);
});

it('renders with correct image source path', () => {
  const img = 'path/to/img.svg';
  const wrapper = mount(<Symbol label="dummy label" image={img} />);
  const symbolImage = wrapper.find('.Symbol__image');
  expect(symbolImage.prop('src')).toEqual(img);
});

it('renders with label', () => {
  const wrapper = shallow(
    <Symbol label="dummy label" type="p" labelpos="Below" />
  );
  expect(wrapper.find('.Symbol__label')).toHaveLength(1);
});

it('renders a video only when playback is requested', () => {
  const poster = 'path/to/poster.png';
  const video = 'path/to/action.mp4';
  const wrapper = shallow(
    <Symbol
      label="dummy label"
      image={poster}
      mediaType="video"
      video={video}
      videoAutoPlay
    />
  );

  expect(wrapper.find('video.Symbol__video')).toHaveLength(1);
  expect(wrapper.find('video.Symbol__video').prop('src')).toBe(video);
  expect(wrapper.find('video.Symbol__video').prop('poster')).toBe(poster);
  expect(wrapper.find('img.Symbol__image')).toHaveLength(0);
});

it('uses the poster in lightweight video lists', () => {
  const wrapper = shallow(
    <Symbol
      label="dummy label"
      image="path/to/poster.png"
      mediaType="video"
      video="path/to/action.mp4"
    />
  );

  expect(wrapper.find('video.Symbol__video')).toHaveLength(0);
  expect(wrapper.find('img.Symbol__image')).toHaveLength(1);
});
