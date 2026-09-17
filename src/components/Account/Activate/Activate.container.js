import React, { Fragment, useEffect, useState } from 'react';
import { Link, useParams, useHistory } from 'react-router-dom';
import { activate } from './Activate.actions';
import './Activate.css';

import { FormattedMessage } from 'react-intl';
import messages from './Activate.messages';
import TextField from '@material-ui/core/TextField';
import ResendVerification from '../SignUp/ResendVerification';

function ActivateContainer() {
  const [isActivating, setIsActivating] = useState(true);
  const [isErrorActivating, setIsErrorActivating] = useState(false);
  const [email, setEmail] = useState('');

  const { url } = useParams();
  const history = useHistory();

  useEffect(
    () => {
      let current = true;
      let redirectTimer;
      const activateAccount = async () => {
        setIsActivating(true);
        setIsErrorActivating(false);
        setEmail('');
        try {
          const status = await activate(url);
          if (!current) return;
          if (!status?.success) {
            throw new Error('Activation failed');
          }
          redirectTimer = setTimeout(() => {
            if (current) history.replace('/login-signup');
          }, 2000);
        } catch (error) {
          if (!current) return;
          setIsErrorActivating(true);
        }
        if (current) setIsActivating(false);
      };
      activateAccount();
      return () => {
        current = false;
        clearTimeout(redirectTimer);
      };
    },
    [url, history]
  );

  return (
    <div className="Activate">
      {isActivating ? (
        <FormattedMessage {...messages.activating} />
      ) : (
        <Fragment>
          {isErrorActivating ? (
            <Fragment>
              <FormattedMessage {...messages.error} />
              <p>
                如果已经验证过，请直接登录。若链接失效或未完成验证，可以重新申请验证邮件。
              </p>
              <TextField
                label="注册邮箱"
                type="email"
                autoComplete="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
              />
              <ResendVerification email={email} />
            </Fragment>
          ) : (
            <FormattedMessage {...messages.success} />
          )}
          <br />
          <Link to="/login-signup" className="Activate_home">
            <FormattedMessage {...messages.loginSignUpPage} />
          </Link>
        </Fragment>
      )}
    </div>
  );
}

export default ActivateContainer;
