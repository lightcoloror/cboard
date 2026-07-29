import React from 'react';
import PropTypes from 'prop-types';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import {
  COMMUNICATION_CANDIDATE_AUTOPLAY_DELAYS,
  toggleCommunicationBoardVisibility,
  updateCommunicationPreferences
} from '../../../common/communicationSupport/communicationPreferences';
import { resolveCommunicationBoardName } from '../../../common/communicationSupport/resolvers';

const FONT_OPTIONS = [
  { value: 'normal', label: '正常' },
  { value: 'large', label: '大' },
  { value: 'extra-large', label: '超大' }
];

const GRID_OPTIONS = [
  { value: 2, label: '大图' },
  { value: 3, label: '标准' },
  { value: 4, label: '紧凑' }
];

const SPEECH_RATE_OPTIONS = [
  { value: 0.7, label: '慢速' },
  { value: 1, label: '正常' },
  { value: 1.3, label: '快速' }
];

const CANDIDATE_AUTOPLAY_OPTIONS = COMMUNICATION_CANDIDATE_AUTOPLAY_DELAYS.map(
  value => ({
    value,
    label: value ? `${value} 秒` : '关闭'
  })
);

export default function CommunicationAccessibilityDialog({
  open,
  onClose,
  onReplayOnboarding,
  boards,
  intl,
  value,
  onChange
}) {
  const hiddenBoardIds = new Set(value.hiddenBoardIds || []);
  const visibleBoardCount = boards.filter(
    board => !hiddenBoardIds.has(board.id)
  ).length;

  function patch(changes) {
    onChange(updateCommunicationPreferences(value, changes));
  }

  return (
    <Dialog
      fullScreen
      open={open}
      onClose={onClose}
      aria-labelledby="communication-accessibility-dialog-title"
    >
      <DialogTitle id="communication-accessibility-dialog-title">
        显示与易用性
      </DialogTitle>
      <DialogContent className="CommunicationSupportPanel__accessibilityScreen">
        <section className="CommunicationSupportPanel__preferenceSection">
          <h4>视觉显示</h4>
          <p className="CommunicationSupportPanel__hint">
            字号和图卡大小会复用 CBoard 的全局显示设置。
          </p>
          <div className="CommunicationSupportPanel__preferenceRow">
            <strong>高对比度</strong>
            <Button
              color="primary"
              variant={value.highContrast ? 'contained' : 'outlined'}
              onClick={() => patch({ highContrast: !value.highContrast })}
            >
              {value.highContrast ? '已开启' : '未开启'}
            </Button>
          </div>
          <div className="CommunicationSupportPanel__preferenceGroup">
            <strong>字体大小</strong>
            <div className="CommunicationSupportPanel__preferenceOptions">
              {FONT_OPTIONS.map(option => (
                <Button
                  key={option.value}
                  color="primary"
                  variant={
                    value.fontSize === option.value ? 'contained' : 'outlined'
                  }
                  onClick={() => patch({ fontSize: option.value })}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="CommunicationSupportPanel__preferenceGroup">
            <strong>图卡大小</strong>
            <div className="CommunicationSupportPanel__preferenceOptions">
              {GRID_OPTIONS.map(option => (
                <Button
                  key={option.value}
                  color="primary"
                  variant={
                    value.gridColumns === option.value
                      ? 'contained'
                      : 'outlined'
                  }
                  onClick={() => patch({ gridColumns: option.value })}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="CommunicationSupportPanel__preferenceGroup">
            <strong>图卡顺序</strong>
            <p className="CommunicationSupportPanel__hint">
              固定顺序沿用 CBoard
              图板布局；解锁图板后可用原生编辑功能调整。常用优先只改变当前设备的显示顺序，不修改图板。
            </p>
            <div className="CommunicationSupportPanel__preferenceOptions">
              {[
                { value: 'manual', label: '固定顺序' },
                { value: 'popularity', label: '常用优先' }
              ].map(option => (
                <Button
                  key={option.value}
                  color="primary"
                  variant={
                    value.pictogramSortMode === option.value
                      ? 'contained'
                      : 'outlined'
                  }
                  onClick={() => patch({ pictogramSortMode: option.value })}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </section>

        <section className="CommunicationSupportPanel__preferenceSection">
          <h4>朗读</h4>
          <p className="CommunicationSupportPanel__hint">
            语速直接使用 CBoard 当前语音引擎。
          </p>
          <div className="CommunicationSupportPanel__preferenceOptions">
            {SPEECH_RATE_OPTIONS.map(option => (
              <Button
                key={option.value}
                color="primary"
                variant={
                  value.speechRate === option.value ? 'contained' : 'outlined'
                }
                onClick={() => patch({ speechRate: option.value })}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <div className="CommunicationSupportPanel__preferenceGroup">
            <strong>候选句自动播报</strong>
            <p className="CommunicationSupportPanel__hint">
              候选句出现后开始计时；患者触摸、滚动、单句朗读或停止都会取消。
            </p>
            <div className="CommunicationSupportPanel__preferenceOptions">
              {CANDIDATE_AUTOPLAY_OPTIONS.map(option => (
                <Button
                  key={option.value}
                  color="primary"
                  variant={
                    value.candidateAutoplayDelaySeconds === option.value
                      ? 'contained'
                      : 'outlined'
                  }
                  onClick={() =>
                    patch({
                      candidateAutoplayDelaySeconds: option.value
                    })
                  }
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </section>

        <section className="CommunicationSupportPanel__preferenceSection">
          <h4>接收匹配板块</h4>
          <p className="CommunicationSupportPanel__hint">
            隐藏只影响图语家双向沟通的文字匹配，不删除 CBoard 板块。
          </p>
          <div className="CommunicationSupportPanel__boardVisibilityList">
            {boards.map(board => {
              const hidden = hiddenBoardIds.has(board.id);
              const boardName =
                resolveCommunicationBoardName(board, intl) || board.id;
              return (
                <div
                  className="CommunicationSupportPanel__boardVisibilityRow"
                  key={board.id}
                >
                  <strong>{boardName}</strong>
                  <Button
                    color="primary"
                    size="small"
                    variant={hidden ? 'outlined' : 'contained'}
                    disabled={!hidden && visibleBoardCount <= 1}
                    onClick={() =>
                      onChange(
                        toggleCommunicationBoardVisibility(value, board.id)
                      )
                    }
                  >
                    {hidden ? '恢复' : '隐藏'}
                  </Button>
                </div>
              );
            })}
          </div>
        </section>

        <section className="CommunicationSupportPanel__preferenceSection">
          <h4>关于双向沟通</h4>
          <p className="CommunicationSupportPanel__hint">
            可随时重新查看患者表达、接收理解和离线优先的三步说明。
          </p>
          <Button
            color="primary"
            variant="outlined"
            onClick={onReplayOnboarding}
          >
            重新查看使用引导
          </Button>
        </section>
      </DialogContent>
      <DialogActions>
        <Button color="primary" variant="contained" onClick={onClose}>
          返回沟通
        </Button>
      </DialogActions>
    </Dialog>
  );
}

CommunicationAccessibilityDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  onReplayOnboarding: PropTypes.func,
  boards: PropTypes.arrayOf(PropTypes.object),
  intl: PropTypes.object,
  value: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired
};

CommunicationAccessibilityDialog.defaultProps = {
  open: false,
  onReplayOnboarding: () => {},
  boards: [],
  intl: null
};
