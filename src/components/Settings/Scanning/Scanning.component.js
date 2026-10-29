import React from 'react';
import PropTypes from 'prop-types';
import { FormattedMessage } from 'react-intl';
import Switch from '@material-ui/core/Switch';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';
import { CboardScanButton as Button } from '../../UI/CboardScan';
import Paper from '@material-ui/core/Paper';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ListItemSecondaryAction from '@material-ui/core/ListItemSecondaryAction';
import FullScreenDialog from '../../UI/FullScreenDialog';
import messages from './Scanning.messages';
import {
  SCANNING_METHOD_AUTOMATIC,
  SCANNING_METHOD_MANUAL
} from './Scanning.constants';

import './Scanning.css';

const propTypes = {
  /**
   * Callback fired when clicking the back button
   */
  onClose: PropTypes.func,
  updateScannerSettings: PropTypes.func
};

const SCANNER_MESSAGES_KEYMAP = {
  [SCANNING_METHOD_MANUAL]: messages.scannerManualStrategy,
  [SCANNING_METHOD_AUTOMATIC]: messages.scannerAutomaticStrategy
};

const DELAY_OPTIONS = [
  {
    value: 750,
    label: 0.75
  },
  {
    value: 1000,
    label: 1
  },
  {
    value: 2000,
    label: 2
  },
  {
    value: 3000,
    label: 3
  },
  {
    value: 5000,
    label: 5
  }
];

class Scanning extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      ...props.scanningSettings,
      saving: false,
      saveError: ''
    };
    this.current = true;
    this.saveGeneration = 0;
    this.pending = null;
  }

  componentWillUnmount() {
    this.current = false;
    this.saveGeneration += 1;
    window.removeEventListener('beforeunload', this.onBeforeUnload);
  }

  onBeforeUnload = event => {
    if (!this.pending) return undefined;
    const message = '本机保存尚未完成，离开可能无法保留当前设置。';
    event.preventDefault();
    event.returnValue = message;
    return message;
  };

  toggleScanner = () => {
    if (this.state.saving) return;
    this.setState({
      active: !this.state.active
    });
  };

  changeSelect = property => event => {
    if (this.state.saving) return;
    this.setState({
      [property]: event.target.value
    });
  };

  onSubmit = () => {
    if (!this.current) return Promise.resolve(false);
    if (this.pending) return this.pending;
    const generation = ++this.saveGeneration;
    const current = () => this.current && generation === this.saveGeneration;
    const settings = { active: this.state.active, delay: this.state.delay, strategy: this.state.strategy };
    this.setState({ saving: true, saveError: '' });
    const pending = Promise.resolve().then(() => this.props.updateScannerSettings(settings, { guard: current }))
      .then(saved => {
        if (!current()) return false;
        if (saved !== true) throw new Error('本机保存未核验，请重试。');
        this.setState({ saving: false });
        this.props.onClose();
        return true;
      }).catch(error => {
        if (current()) this.setState({ saving: false, saveError: error.message || '本机保存失败，请重试。' });
        return false;
      });
    this.pending = pending;
    window.addEventListener('beforeunload', this.onBeforeUnload);
    pending.then(() => {
      if (this.pending === pending) {
        this.pending = null;
        window.removeEventListener('beforeunload', this.onBeforeUnload);
      }
    });
    return pending;
  };

  onClose = () => {
    // A write that has already started cannot be cancelled by invalidating its
    // receipt. Keep the editor open until verification completes or fails.
    if (this.pending) return;
    this.saveGeneration += 1;
    this.pending = null;
    if (this.current) this.setState({ saving: false });
    this.props.onClose();
  };

  render() {
    return (
      <div className="Scanning">
        <FullScreenDialog
          open
          title={<FormattedMessage {...messages.scanning} />}
          onClose={this.onClose}
          onSubmit={this.onSubmit}
          closeOnSubmit={false}
          disableSubmit={this.state.saving}
        >
          <Paper>
            <p>保存后先核对本机设置；账号同步不会阻止本机保存。</p>
            <div className="Scanning__save-status">
              {this.state.saving ? <p role="status">正在核对本机保存，请稍候；完成前暂不能返回。</p> :
                this.state.saveError ? <div role="alert">
                  <p>{this.state.saveError} 当前编辑仍保留。</p>
                  <Button onClick={this.onSubmit} disabled={this.state.saving}>重试保存设置</Button>
                </div> : null}
            </div>
            <List>
              <ListItem>
                <ListItemText
                  className="Scanning__ListItemText"
                  primary={<FormattedMessage {...messages.enable} />}
                  secondary={<FormattedMessage {...messages.enableSecondary} />}
                />
                <ListItemSecondaryAction>
                  <Switch
                    disabled={this.state.saving}
                    checked={this.state.active}
                    onChange={this.toggleScanner}
                    value="active"
                    color="secondary"
                  />
                </ListItemSecondaryAction>
              </ListItem>
              <ListItem>
                <ListItemText
                  className="Scanning__ListItemText"
                  primary={<FormattedMessage {...messages.delay} />}
                  secondary={<FormattedMessage {...messages.delaySecondary} />}
                />
                <ListItemSecondaryAction>
                  <Select
                    disabled={this.state.saving}
                    value={this.state.delay}
                    onChange={this.changeSelect('delay')}
                    inputProps={{
                      name: 'delay',
                      id: 'scanning-delay'
                    }}
                  >
                    {DELAY_OPTIONS.map(({ value, label }, i) => (
                      <MenuItem key={i} value={value}>
                        <FormattedMessage
                          {...messages.seconds}
                          values={{ value: label }}
                        />
                      </MenuItem>
                    ))}
                  </Select>
                </ListItemSecondaryAction>
              </ListItem>
              <ListItem>
                <ListItemText
                  className="Scanning__ListItemText"
                  primary={<FormattedMessage {...messages.method} />}
                  secondary={<FormattedMessage {...messages.methodSecondary} />}
                />
                <ListItemSecondaryAction>
                  <Select
                    disabled={this.state.saving}
                    value={this.state.strategy}
                    onChange={this.changeSelect('strategy')}
                    inputProps={{
                      name: 'strategy',
                      id: 'scanning-strategy'
                    }}
                  >
                    <MenuItem value={SCANNING_METHOD_AUTOMATIC}>
                      <FormattedMessage {...messages.automatic} />
                    </MenuItem>
                    <MenuItem value={SCANNING_METHOD_MANUAL}>
                      <FormattedMessage {...messages.manual} />
                    </MenuItem>
                  </Select>
                </ListItemSecondaryAction>
              </ListItem>
            </List>
            <div className="Scanning__HelpText">
              <div>
                <FormattedMessage
                  {...SCANNER_MESSAGES_KEYMAP[this.state.strategy]}
                />
              </div>
              <div>
                <FormattedMessage {...messages.scannerHowToDeactivate} />
              </div>
            </div>
          </Paper>
        </FullScreenDialog>
      </div>
    );
  }
}

Scanning.propTypes = propTypes;

export default Scanning;
