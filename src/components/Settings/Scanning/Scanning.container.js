import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { injectIntl, intlShape } from 'react-intl';
import Scanning from './Scanning.component';
import { saveVerifiedScannerSettings } from '../../../providers/ScannerProvider/ScannerProvider.persistence';
import { getCommunicationStorageScopeKey } from '../../../common/communicationSupport/localData';
import { getStore } from '../../../store';
import API from '../../../api';

const saveScope = () => {
  const user = getStore()?.getState()?.app?.userData || {};
  return JSON.stringify([getCommunicationStorageScopeKey(), user.id || user._id || '', user.authToken || null]);
};

export class ScanningContainer extends PureComponent {
  static propTypes = {
    intl: intlShape.isRequired
  };

  constructor(props) {
    super(props);
    this.saveScope = saveScope();
    this.expectedSettings = { ...props.scanningSettings };
    this.current = true;
    this.pending = null;
  }

  componentWillUnmount() {
    this.current = false;
  }

  updateScannerSettings = (scanningSettings, { guard = () => true } = {}) => {
    if (this.pending) return this.pending;
    const current = () => this.current && guard() && this.saveScope === saveScope();
    const save = async () => {
      if (!current()) throw new Error('账号或档案已切换，请重新打开扫描设置。');
      const saved = await this.props.updateScannerSettings(scanningSettings, {
        expectedSettings: this.expectedSettings, guard: current
      });
      if (!current()) throw new Error('账号或档案已切换，旧扫描设置未确认保存。');
      if (saved !== true) throw new Error('本机保存未核验，当前编辑仍保留，请重试。');
      // Account synchronization is best effort and cannot delay or undo a
      // verified local save. No response callback writes into the active store.
      try { Promise.resolve(API.updateSettings({ scanning: scanningSettings })).catch(() => {}); }
      catch (_) { /* Local acceptance is independent from remote availability. */ }
      return true;
    };
    const pending = save();
    this.pending = pending;
    pending.then(() => { if (this.pending === pending) this.pending = null; },
      () => { if (this.pending === pending) this.pending = null; });
    return pending;
  };

  render() {
    const { history, scanningSettings } = this.props;

    return (
      <Scanning
        onClose={history.goBack}
        updateScannerSettings={this.updateScannerSettings}
        scanningSettings={scanningSettings}
      />
    );
  }
}

ScanningContainer.props = {
  history: PropTypes.object,
  updateScannerSettings: PropTypes.func.isRequired,
  scanningSettings: PropTypes.object.isRequired
};

const mapStateToProps = ({ scanner: scanningSettings }) => ({
  scanningSettings
});

const mapDispatchToProps = {
  updateScannerSettings: saveVerifiedScannerSettings
};

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(injectIntl(ScanningContainer));
