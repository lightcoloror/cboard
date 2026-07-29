import React, { useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { FormattedMessage, injectIntl } from 'react-intl';
import { Formik } from 'formik';
import classNames from 'classnames';
import Typography from '@material-ui/core/Typography';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import DialogActions from '@material-ui/core/DialogActions';
import { TextField } from '../../UI/FormItems';
import LoadingIcon from '../../UI/LoadingIcon';
import validationSchema from './validationSchema';
import { login, loginWithPhone } from './Login.actions';
import {
  confirmPhoneVerification,
  getPhoneVerificationConfiguration,
  requestPhoneVerification
} from '../PhoneVerification/PhoneVerification.actions';
import {
  isValidMainlandChinaPhone,
  normalizeMainlandChinaPhone
} from '../../../common/communicationSupport/accountPhone';
import messages from './Login.messages';
import './Login.css';
import PasswordTextField from '../../UI/FormItems/PasswordTextField';

const initialValues = {
  email: '',
  password: ''
};

export function Login({
  intl,
  isDialogOpen,
  onClose,
  onResetPasswordClick,
  dialogWithKeyboardStyle = {},
  login,
  loginWithPhone
}) {
  const [isLogging, setIsLogging] = useState(false);
  const [loginStatus, setLoginStatus] = useState({});
  const [loginMode, setLoginMode] = useState('password');
  const [phone, setPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneChallenge, setPhoneChallenge] = useState(null);
  const [
    phoneVerificationConfiguration,
    setPhoneVerificationConfiguration
  ] = useState(null);
  const [phoneVerificationLoading, setPhoneVerificationLoading] = useState(
    false
  );
  const [phoneVerificationBusy, setPhoneVerificationBusy] = useState(false);

  useEffect(
    () => {
      if (!isDialogOpen) return undefined;

      let active = true;
      setLoginStatus({});
      setIsLogging(false);
      setLoginMode('password');
      setPhone('');
      setPhoneCode('');
      setPhoneChallenge(null);
      setPhoneVerificationBusy(false);
      setPhoneVerificationConfiguration(null);
      setPhoneVerificationLoading(true);
      getPhoneVerificationConfiguration()
        .then(configuration => {
          if (active) setPhoneVerificationConfiguration(configuration);
        })
        .catch(() => {
          if (active) {
            setPhoneVerificationConfiguration({
              available: false,
              phoneLoginAvailable: false
            });
          }
        })
        .finally(() => {
          if (active) setPhoneVerificationLoading(false);
        });

      return () => {
        active = false;
      };
    },
    [isDialogOpen]
  );

  const handleSubmit = async values => {
    setIsLogging(true);
    setLoginStatus({});
    try {
      await login(values);
    } catch (loginStatus) {
      setLoginStatus(loginStatus);
      setIsLogging(false);
    }
  };

  const getPhoneErrorMessage = error =>
    error?.response?.data?.message ||
    error?.message ||
    intl.formatMessage(messages.phoneLoginFailed);

  const changeLoginMode = mode => {
    setLoginMode(mode);
    setLoginStatus({});
    setIsLogging(false);
    setPhoneCode('');
    setPhoneChallenge(null);
  };

  const handlePhoneChange = event => {
    const nextPhone = normalizeMainlandChinaPhone(event.target.value).slice(
      0,
      11
    );
    if (nextPhone !== phoneChallenge?.phone) {
      setPhoneCode('');
      setPhoneChallenge(null);
    }
    setPhone(nextPhone);
    setLoginStatus({});
  };

  const sendPhoneCode = async () => {
    const normalizedPhone = normalizeMainlandChinaPhone(phone);
    if (!isValidMainlandChinaPhone(normalizedPhone)) {
      setLoginStatus({
        success: false,
        message: intl.formatMessage(messages.phoneVerificationInvalid)
      });
      return;
    }
    if (!phoneVerificationConfiguration?.phoneLoginAvailable) {
      setLoginStatus({
        success: false,
        message: intl.formatMessage(messages.phoneVerificationUnavailable)
      });
      return;
    }

    setPhoneVerificationBusy(true);
    setLoginStatus({});
    try {
      const challenge = await requestPhoneVerification(
        normalizedPhone,
        'login'
      );
      setPhoneChallenge({ ...challenge, phone: normalizedPhone });
      setPhoneCode('');
      setLoginStatus({
        success: true,
        message: intl.formatMessage(messages.phoneCodeSent, {
          phone: challenge.phoneMasked || normalizedPhone
        })
      });
    } catch (error) {
      setPhoneChallenge(null);
      setLoginStatus({
        success: false,
        message: getPhoneErrorMessage(error)
      });
    } finally {
      setPhoneVerificationBusy(false);
    }
  };

  const handlePhoneSubmit = async event => {
    event.preventDefault();
    const normalizedPhone = normalizeMainlandChinaPhone(phone);
    if (
      !phoneChallenge ||
      phoneChallenge.phone !== normalizedPhone ||
      phoneCode.length !== 6
    ) {
      setLoginStatus({
        success: false,
        message: intl.formatMessage(messages.confirmPhoneCode)
      });
      return;
    }

    setPhoneVerificationBusy(true);
    setIsLogging(true);
    setLoginStatus({});
    try {
      const result = await confirmPhoneVerification({
        challengeId: phoneChallenge.challengeId,
        phone: normalizedPhone,
        code: phoneCode,
        purpose: 'login'
      });
      await loginWithPhone({
        phone: normalizedPhone,
        phoneVerificationToken: result.verificationToken
      });
    } catch (error) {
      setLoginStatus({
        success: false,
        message: getPhoneErrorMessage(error)
      });
      setIsLogging(false);
    } finally {
      setPhoneVerificationBusy(false);
    }
  };

  const isButtonDisabled = isLogging || !!loginStatus.success;
  const phoneLoginAvailable = Boolean(
    phoneVerificationConfiguration?.phoneLoginAvailable
  );

  const { dialogStyle, dialogContentStyle } = dialogWithKeyboardStyle ?? {};

  return (
    <Dialog
      open={isDialogOpen}
      onClose={onClose}
      aria-labelledby="login"
      style={dialogStyle}
    >
      <DialogTitle id="login">
        <FormattedMessage {...messages.login} />
      </DialogTitle>
      <DialogContent style={dialogContentStyle}>
        <div
          className={classNames('Login__status', {
            'Login__status--error': !loginStatus.success,
            'Login__status--success': loginStatus.success
          })}
        >
          <Typography color="inherit">{loginStatus.message}</Typography>
        </div>
        <Button
          data-testid={
            loginMode === 'password'
              ? 'phone-login-mode'
              : 'password-login-mode'
          }
          size="small"
          color="primary"
          disabled={isLogging || phoneVerificationBusy}
          onClick={() =>
            changeLoginMode(loginMode === 'password' ? 'phone' : 'password')
          }
        >
          <FormattedMessage
            {...(loginMode === 'password'
              ? messages.phoneLogin
              : messages.passwordLogin)}
          />
        </Button>
        {loginMode === 'password' ? (
          <Formik
            initialValues={initialValues}
            onSubmit={handleSubmit}
            validationSchema={validationSchema}
          >
            {({ errors, handleChange, handleSubmit }) => (
              <form className="Login__form" onSubmit={handleSubmit}>
                <TextField
                  error={errors.email}
                  label={intl.formatMessage(messages.email)}
                  name="email"
                  onChange={handleChange}
                />
                <PasswordTextField
                  error={errors.password}
                  label={intl.formatMessage(messages.password)}
                  name="password"
                  onChange={handleChange}
                />
                <DialogActions>
                  <Button
                    color="primary"
                    disabled={isButtonDisabled}
                    onClick={onClose}
                  >
                    <FormattedMessage {...messages.cancel} />
                  </Button>
                  <Button
                    type="submit"
                    disabled={isButtonDisabled}
                    variant="contained"
                    color="primary"
                  >
                    {isLogging && <LoadingIcon />}
                    <FormattedMessage {...messages.login} />
                  </Button>
                </DialogActions>
              </form>
            )}
          </Formik>
        ) : (
          <form className="Login__form" onSubmit={handlePhoneSubmit}>
            <TextField
              name="phone"
              type="tel"
              inputProps={{ inputMode: 'numeric', maxLength: 11 }}
              label={intl.formatMessage(messages.phone)}
              value={phone}
              onChange={handlePhoneChange}
            />
            {phoneVerificationLoading ? (
              <Typography color="textSecondary">
                <FormattedMessage {...messages.checkingPhoneLogin} />
              </Typography>
            ) : !phoneLoginAvailable ? (
              <Typography color="error">
                <FormattedMessage {...messages.phoneVerificationUnavailable} />
              </Typography>
            ) : (
              <Button
                type="button"
                data-testid="send-phone-login-code"
                disabled={phoneVerificationBusy || isLogging}
                onClick={sendPhoneCode}
              >
                <FormattedMessage {...messages.sendPhoneCode} />
              </Button>
            )}
            {phoneChallenge?.phone === phone && (
              <TextField
                name="phoneVerificationCode"
                type="tel"
                inputProps={{ inputMode: 'numeric', maxLength: 6 }}
                label={intl.formatMessage(messages.phoneVerificationCode)}
                value={phoneCode}
                onChange={event =>
                  setPhoneCode(
                    String(event.target.value || '')
                      .replace(/\D/g, '')
                      .slice(0, 6)
                  )
                }
              />
            )}
            <DialogActions>
              <Button
                color="primary"
                disabled={isLogging || phoneVerificationBusy}
                onClick={onClose}
              >
                <FormattedMessage {...messages.cancel} />
              </Button>
              <Button
                type="submit"
                disabled={
                  isLogging ||
                  phoneVerificationBusy ||
                  !phoneChallenge ||
                  phoneCode.length !== 6
                }
                variant="contained"
                color="primary"
              >
                {isLogging && <LoadingIcon />}
                <FormattedMessage {...messages.login} />
              </Button>
            </DialogActions>
          </form>
        )}
        {loginMode === 'password' && (
          <Button
            size="small"
            color="primary"
            disabled={isButtonDisabled}
            onClick={onResetPasswordClick}
          >
            <FormattedMessage {...messages.forgotPassword} />
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

const mapDispatchToProps = {
  login,
  loginWithPhone
};

export default connect(
  null,
  mapDispatchToProps
)(injectIntl(Login));
