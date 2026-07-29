import React, { Component } from 'react';
import PropTypes from 'prop-types';
import Helmet from 'react-helmet';
import { Route, Switch, Redirect } from 'react-router-dom';
import classNames from 'classnames';

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
import WelcomeScreen from '../WelcomeScreen';
import Analytics from '../Analytics';
import './App.css';
import LoginRequiredModal from '../LoggedInFeature/LoginRequiredModal';

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
    demoMode: PropTypes.bool
  };

  render() {
    const {
      lang,
      dir,
      isFirstVisit,
      isLogged,
      dark,
      isDownloadingLang,
      demoMode
    } = this.props;

    return (
      <div
        className={classNames('App', {
          'is-dark': dark,
          'is-demo': demoMode
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
        <Switch>
          <RedirectIfLogged
            component={AuthScreen}
            isLogged={isLogged}
            path="/login-signup"
            to="/"
          />
          <Route path="/settings" component={Settings} />
          <Route path="/analytics" component={Analytics} />
          <Route path="/activate/:url" component={Activate} />
          <Route path="/reset/:userid/:url" component={ChangePassword} />
          <Route path="/login/:type/callback" component={OAuthLogin} />
          <Route
            exact
            path="/demo"
            render={routeProps => <BoardContainer {...routeProps} demoMode />}
          />
          <Route path="/board/:id" component={BoardContainer} />
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
              const RootComponent =
                isFirstVisit && !isLogged ? WelcomeScreen : BoardContainer;
              return <RootComponent {...routeProps} />;
            }}
          />
          <Route component={NotFound} />
        </Switch>
        {!demoMode && <PremiumRequiredModal />}
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
