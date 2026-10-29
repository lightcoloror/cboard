import React from 'react';
import PropTypes from 'prop-types';
import { FormattedMessage } from 'react-intl';
import ReactMarkdown from 'react-markdown';
import { connect } from 'react-redux';
import Paper from '@material-ui/core/Paper';
import { CboardScanButton as Button } from '../../UI/CboardScan';

import FullScreenDialog from '../../UI/FullScreenDialog';
import { isCordova } from '../../../cordova-util';
import messages from '../Settings.messages';
import './Help.css';

const propTypes = {
  history: PropTypes.object.isRequired,
  language: PropTypes.shape({ lang: PropTypes.string.isRequired }).isRequired,
  onClose: PropTypes.func
};

export class Help extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      markdown: '',
      loading: true,
      failed: false
    };
    this.loadRun = 0;
    this.contentRef = React.createRef();
  }

  componentDidMount() {
    window.addEventListener('hashchange', this.handleHashChange);
    this.loadHelp();
  }

  componentWillUnmount() {
    this.loadRun += 1;
    window.removeEventListener('hashchange', this.handleHashChange);
    if (this.request) this.request.abort();
    if (this.abortController) this.abortController.abort();
  }

  loadHelp = () => {
    const run = ++this.loadRun;
    if (this.request) this.request.abort();
    if (this.abortController) this.abortController.abort();
    this.setState({ loading: true, failed: false });
    const receive = text => {
      if (run !== this.loadRun) return;
      if (!text || !text.trim()) return fail();
      this.setState({ markdown: text, loading: false, failed: false }, () => {
        this.focusHelpContent();
      });
    };
    const fail = () => {
      if (run === this.loadRun) this.setState({ loading: false, failed: true });
    };
    let markdownPath = '';
    try {
      markdownPath = require(`../../../translations/help/${
        this.props.language.lang
      }.md`);
    } catch (err) {
      markdownPath = require(`../../../translations/help/en-US.md`);
    } finally {
      if (isCordova()) {
        const req = new XMLHttpRequest();
        this.request = req;
        req.onload = () => {
          if (req.status && (req.status < 200 || req.status >= 300)) return fail();
          const text = req.responseText;
          const utext = this.formatTextForCordova(text);
          receive(utext);
        };
        req.onerror = fail;
        req.open('GET', markdownPath);
        req.send();
      } else {
        this.abortController = typeof AbortController === 'function' ? new AbortController() : null;
        fetch(markdownPath, this.abortController ? { signal: this.abortController.signal } : undefined)
          .then(response => {
            if (!response.ok) throw new Error('help unavailable');
            return response.text();
          })
          .then(receive)
          .catch(fail);
      }
    }
  };

  formatTextForCordova(text) {
    //remove table of content
    const searchTerm = '##';
    const indexOfFirst = text.indexOf(searchTerm);
    const tableOfContents = text.substring(
      indexOfFirst,
      text.indexOf(searchTerm, indexOfFirst + 1)
    );
    const textNoTableOfContents = text.replace(tableOfContents, '');
    //update path for images
    const searchRegExp = /\/images/gi;
    const replaceWith = './images';
    return textNoTableOfContents.replace(searchRegExp, replaceWith);
  }

  getHelpAnchor(hash = window.location.hash.replace('#', '')) {
    // Cordova's #/settings/help is a route, not a Markdown reading anchor.
    if (!hash || hash.startsWith('/') || hash.startsWith('!')) return null;
    return Array.from(window.document.getElementsByName(hash)).find(node =>
      this.contentRef.current && this.contentRef.current.contains(node)
    );
  }

  focusHelpContent = requestedAnchor => {
    const anchor = requestedAnchor || this.getHelpAnchor();
    const target = anchor || this.contentRef.current;
    if (!target) return;
    if (anchor) target.setAttribute('tabindex', '-1');
    target.focus();
    if (anchor && anchor.scrollIntoView) anchor.scrollIntoView();
  };

  handleHashChange = () => {
    if (this.getHelpAnchor()) this.focusHelpContent();
  };

  handleContentClick = event => {
    if (event.defaultPrevented || event.button > 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const link = event.target.closest && event.target.closest('a');
    if (!link || !this.contentRef.current.contains(link)) return;
    const href = link.getAttribute('href');
    if (!href || !href.startsWith('#')) return;
    let fragment;
    try { fragment = decodeURIComponent(href.slice(1)); } catch (_) { return; }
    const anchor = this.getHelpAnchor(fragment);
    if (!anchor) return;
    // Reading the local table of contents must not insert an extra browser
    // history entry before the existing "return to previous task" action.
    event.preventDefault();
    this.focusHelpContent(anchor);
  };

  componentDidUpdate(previousProps) {
    if (previousProps.language.lang !== this.props.language.lang) {
      this.loadHelp();
      return;
    }
    const node = this.getHelpAnchor();
    if (node && node.scrollIntoView) node.scrollIntoView();
  }

  render() {
    const chinese = this.props.language.lang.startsWith('zh');
    return (
      <FullScreenDialog
        open
        title={<FormattedMessage {...messages.userHelp} />}
        onClose={this.props.history.goBack}
      >
        <Paper aria-label={chinese ? '图语家使用帮助' : 'User help'} className="Help">
          <div role={this.state.failed ? 'alert' : 'status'} aria-live="polite" aria-atomic="true">
            {this.state.loading && (chinese ? '正在读取帮助…' : 'Loading help…')}
            {this.state.failed && (chinese
              ? '帮助暂时无法读取。离线时需先缓存本版本帮助；可以重试或返回，当前沟通内容不会被更改。'
              : 'Help is unavailable. Offline use requires this version to be cached. Retry or return; your communication content is unchanged.')}
          </div>
          {this.state.failed && <Button onClick={this.loadHelp} color="primary">{chinese ? '重新读取帮助' : 'Retry help'}</Button>}
          <div ref={this.contentRef} tabIndex={-1} aria-label={chinese ? '帮助正文' : 'Help content'} onClick={this.handleContentClick}>
            <ReactMarkdown source={this.state.markdown} escapeHtml={false} />
          </div>
        </Paper>
      </FullScreenDialog>
    );
  }
}

const mapStateToProps = state => ({
  language: state.language
});

const mapDispatchToProps = {};

Help.propTypes = propTypes;

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(Help);
