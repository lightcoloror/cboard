import React from 'react';
import PropTypes from 'prop-types';
import CommunicationSupportPanel from '../CommunicationSupport/CommunicationSupportPanel.component';

const TUYUJIA_COPY = {
  title: '图语家双向沟通',
  subtitle:
    '患者端支持候选句播报与收藏，照护者端支持语音输入、编辑换图和全屏展示。',
  expressSectionTitle: '患者端候选句',
  receiveSectionTitle: '照护者输入转图片'
};

export default function TuyujiaPanel(props) {
  return <CommunicationSupportPanel {...props} copyOverrides={TUYUJIA_COPY} />;
}

TuyujiaPanel.propTypes = {
  boards: PropTypes.arrayOf(PropTypes.object).isRequired,
  output: PropTypes.arrayOf(PropTypes.object).isRequired,
  activeBoardId: PropTypes.string,
  intl: PropTypes.object,
  isLogged: PropTypes.bool,
  onApplyOutput: PropTypes.func.isRequired,
  onJumpBoard: PropTypes.func.isRequired,
  onSpeak: PropTypes.func.isRequired,
  onCancelSpeech: PropTypes.func.isRequired
};

TuyujiaPanel.defaultProps = {
  activeBoardId: null,
  intl: null,
  isLogged: false
};
