import React, { Component } from 'react';
import { legacyServicesEnabled } from '../../legacyServices';
import PropTypes from 'prop-types';
import Helmet from 'react-helmet';
import { Route, Switch, Redirect } from 'react-router-dom';
import classNames from 'classnames';
import { FormattedMessage } from 'react-intl';
import messages from './App.messages';

import Activate from '../Account/Activate';
import ChangePassword from '../Account/ChangePassword';
import OAuthLogin from '../Account/OAuthLogin';
import AuthScreen, { RedirectIfLogged } from '../AuthScreen';
import BoardContainer from '../Board';
import PremiumRequiredModal from '../PremiumFeature/PremiumRequiredModal';
import OfflineNotificationModal from '../OfflineNotification';
import Notifications from '../Notifications';
import NotFound from '../NotFound';
import Settings from '../Settings';
import Care from '../Care/Care';
import CareHome from '../Care/CareHome';
import WelcomeScreen from '../WelcomeScreen';
import Analytics from '../Analytics';
import './App.css';
import LoginRequiredModal from '../LoggedInFeature/LoginRequiredModal';
import { getCommunicationRepositoryReadError } from '../../common/communicationSupport/localData';

export function CommunicationDataGate({ children }) {
  const [, retry] = React.useReducer(value => value + 1, 0);
  const error = getCommunicationRepositoryReadError();
  if (error) return <main role="alert"><p>{error}</p><button type="button" onClick={retry}>重试读取资料</button></main>;
  return children;
}
const SafeBoard = props => <CommunicationDataGate><BoardContainer {...props} /></CommunicationDataGate>;
const SafeCareHome = props => <CommunicationDataGate><CareHome {...props} /></CommunicationDataGate>;

export class App extends Component {
  static propTypes = {
    /**
     * App language direction
     */
    dir: PropTypes.string.isRequired,
    /**
     * If 'true', user first visit
     */
    isFirstVisit: PropTypes.bool,
    /**
     * If 'true', user is logged in
     */
    isLogged: PropTypes.bool,
    /**
     * If 'true', user is downloading a new lang
     */
    isDownloadingLang: PropTypes.bool,
    /**
     * App language
     */
    lang: PropTypes.string.isRequired,
    /**
     * If 'true', dark mode is enabled
     */
    dark: PropTypes.bool,
    /**
     * If 'true', run the isolated no-login product demo
     */
    demoMode: PropTypes.bool,
    offlineReadiness: PropTypes.shape({
      status: PropTypes.oneOf(['preparing', 'ready', 'error', 'unavailable'])
    })
  };

  render() {
    const {
      lang,
      dir,
      isFirstVisit,
      isLogged,
      dark,
      isDownloadingLang,
      demoMode,
      offlineReadiness
    } = this.props;
    const offlineStatus =
      (offlineReadiness && offlineReadiness.status) || 'preparing';
    const offlineMessage = {
      preparing: messages.offlinePreparing,
      ready: messages.offlineReady,
      error: messages.offlineError,
      unavailable: messages.offlineUnavailable
    }[offlineStatus];

    return (
      <div
        className={classNames('App', {
          'is-dark': dark,
          'is-demo': demoMode,
          'has-filing': process.env.REACT_APP_CARE_COLLABORATION === 'true'
        })}
      >
        <Helmet>
          <html lang={lang} dir={dir} />
        </Helmet>

        <Notifications />
        {demoMode && (
          <div className="App__demoBanner" role="status">
            <strong>演示模式</strong>
            <span>数据只保留在当前页面，刷新后会清空</span>
            <a href="/">了解完整版</a>
          </div>
        )}
        <div className="App__content">
          <Switch>
            <RedirectIfLogged
              component={AuthScreen}
              isLogged={isLogged}
              path="/login-signup"
              to="/"
            />
            <Route path="/settings" component={Settings} />
            <Route path="/care" component={Care} />
            <Route path="/analytics" component={Analytics} />
            <Route path="/activate/:url" component={Activate} />
            <Route path="/reset/:userid/:url" component={ChangePassword} />
            <Route path="/login/:type/callback" component={OAuthLogin} />
            <Route
              exact
              path="/demo"
              render={routeProps => <BoardContainer {...routeProps} demoMode />}
            />
            <Route
              path="/board/:id"
              render={props =>
                isLogged &&
                process.env.REACT_APP_CARE_COLLABORATION === 'true' ? (
                  <SafeCareHome {...props} />
                ) : (
                  <SafeBoard {...props} />
                )
              }
            />
            {isDownloadingLang && (
              <Route exact path={'/'}>
                <Redirect to={'/settings/language'} />
              </Route>
            )}
            <Route
              exact
              path="/"
              render={routeProps => {
                if (demoMode) {
                  return <BoardContainer {...routeProps} demoMode />;
                }
                if (
                  (isLogged ||
                    localStorage.getItem('care-offline-selection-v1')) &&
                  process.env.REACT_APP_CARE_COLLABORATION === 'true'
                )
                  return <SafeCareHome {...routeProps} />;
                const RootComponent =
                  isFirstVisit && !isLogged ? WelcomeScreen : SafeBoard;
                return <RootComponent {...routeProps} />;
              }}
            />
            <Route component={NotFound} />
          </Switch>
        </div>
        {process.env.REACT_APP_CARE_COLLABORATION === 'true' && !demoMode && (
          <div
            className="App__offlineStatus"
            role="status"
            aria-live="polite"
            data-offline-status={offlineStatus}
          >
            <FormattedMessage {...offlineMessage} />
          </div>
        )}
        {process.env.REACT_APP_CARE_COLLABORATION === 'true' && (
          <footer className="App__filing" aria-label="网站备案信息">
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
            >
              粤ICP备2026141465号-1
            </a>
            <a
              href="https://beian.mps.gov.cn/#/query/webSearch?code=44060602003657"
              target="_blank"
              rel="noopener noreferrer"
              className="App__policeFiling"
            >
              <img
                src="/police-filing.png"
                width="20"
                height="22"
                alt="公安备案图标"
              />
              <span>粤公网安备44060602003657号</span>
            </a>
          </footer>
        )}
        {!demoMode && legacyServicesEnabled && <PremiumRequiredModal />}
        {!demoMode && <LoginRequiredModal />}
        <OfflineNotificationModal />
      </div>
    );
  }
}

App.defaultProps = {
  demoMode: false
};

export default App;
