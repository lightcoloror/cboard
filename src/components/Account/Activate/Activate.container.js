import React, { Fragment, useEffect, useState } from 'react';
import { Link, useParams, useHistory } from 'react-router-dom';
import { activate } from './Activate.actions';
import './Activate.css';

import { FormattedMessage } from 'react-intl';
import messages from './Activate.messages';

function ActivateContainer() {
  const [isActivating, setIsActivating] = useState(true);
  const [isErrorActivating, setIsErrorActivating] = useState(false);

  const { url } = useParams();
  const history = useHistory();

  useEffect(
    () => {
      let current = true;
      let redirectTimer;
      const activateAccount = async () => {
        setIsActivating(true);
        setIsErrorActivating(false);
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
            <FormattedMessage {...messages.error} />
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
