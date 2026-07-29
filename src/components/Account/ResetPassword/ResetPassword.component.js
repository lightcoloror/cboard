import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { FormattedMessage, injectIntl, intlShape } from 'react-intl';
import { Formik } from 'formik';
import classNames from 'classnames';
import Typography from '@material-ui/core/Typography';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogActions from '@material-ui/core/DialogActions';
import { TextField } from '../../UI/FormItems';
import PasswordTextField from '../../UI/FormItems/PasswordTextField';
import LoadingIcon from '../../UI/LoadingIcon';
import {
  isValidMainlandChinaPhone,
  normalizeMainlandChinaPhone
} from '../../../common/communicationSupport/accountPhone';
import {
  confirmPhoneVerification,
  getPhoneVerificationConfiguration,
  requestPhoneVerification
} from '../PhoneVerification/PhoneVerification.actions';
import validationSchema from './validationSchema';
import { forgot, resetPasswordWithPhone } from './ResetPassword.actions';
import messages from './ResetPassword.messages';
import './ResetPassword.css';

const initialValues = { email: '' };

export function ResetPassword({
  intl,
  isDialogOpen,
  onClose,
  forgot,
  resetPasswordWithPhone
}) {
  const [isSending, setIsSending] = useState(false);
  const [forgotState, setForgotState] = useState({});
  const [completed, setCompleted] = useState(false);
  const [resetMode, setResetMode] = useState('email');
  const [phone, setPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneChallenge, setPhoneChallenge] = useState(null);
  const [phoneVerificationToken, setPhoneVerificationToken] = useState('');
  const [
    phoneVerificationConfiguration,
    setPhoneVerificationConfiguration
  ] = useState(null);
  const [phoneVerificationLoading, setPhoneVerificationLoading] = useState(
    false
  );
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordRepeat, setNewPasswordRepeat] = useState('');

  useEffect(
    () => {
      if (!isDialogOpen) return undefined;

      let active = true;
      setIsSending(false);
      setForgotState({});
      setCompleted(false);
      setResetMode('email');
      setPhone('');
      setPhoneCode('');
      setPhoneChallenge(null);
      setPhoneVerificationToken('');
      setNewPassword('');
      setNewPasswordRepeat('');
      setPhoneVerificationConfiguration(null);
      setPhoneVerificationLoading(true);
      getPhoneVerificationConfiguration()
        .then(configuration => {
          if (active) setPhoneVerificationConfiguration(configuration);
        })
        .catch(() => {
          if (active) {
            setPhoneVerificationConfiguration({
              phonePasswordResetAvailable: false
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

  const getErrorMessage = error =>
    error?.response?.data?.message ||
    error?.message ||
    intl.formatMessage(messages.resetPasswordError);

  const handleSubmit = async values => {
    setIsSending(true);
    setForgotState({});
    try {
      const res = await forgot(values);
      setForgotState(res);
      setCompleted(true);
    } catch (err) {
      console.error('Error in ResetPassword:', err?.message);
      setForgotState({
        success: false,
        message: getErrorMessage(err)
      });
    } finally {
      setIsSending(false);
    }
  };

  const resetPhoneFlow = () => {
    setPhoneCode('');
    setPhoneChallenge(null);
    setPhoneVerificationToken('');
    setNewPassword('');
    setNewPasswordRepeat('');
  };

  const changeResetMode = mode => {
    setResetMode(mode);
    setForgotState({});
    setCompleted(false);
    resetPhoneFlow();
  };

  const handlePhoneChange = event => {
    const nextPhone = normalizeMainlandChinaPhone(event.target.value).slice(
      0,
      11
    );
    if (nextPhone !== phoneChallenge?.phone) resetPhoneFlow();
    setPhone(nextPhone);
    setForgotState({});
  };

  const sendPhoneCode = async () => {
    const normalizedPhone = normalizeMainlandChinaPhone(phone);
    if (!isValidMainlandChinaPhone(normalizedPhone)) {
      setForgotState({
        success: false,
        message: intl.formatMessage(messages.phoneVerificationInvalid)
      });
      return;
    }
    if (!phoneVerificationConfiguration?.phonePasswordResetAvailable) {
      setForgotState({
        success: false,
        message: intl.formatMessage(messages.phoneResetUnavailable)
      });
      return;
    }

    setIsSending(true);
    setForgotState({});
    try {
      const challenge = await requestPhoneVerification(
        normalizedPhone,
        'password-reset'
      );
      setPhoneChallenge({ ...challenge, phone: normalizedPhone });
      setPhoneVerificationToken('');
      setPhoneCode('');
      setForgotState({
        success: true,
        message: intl.formatMessage(messages.phoneCodeSent, {
          phone: challenge.phoneMasked || normalizedPhone
        })
      });
    } catch (error) {
      setPhoneChallenge(null);
      setForgotState({
        success: false,
        message: getErrorMessage(error)
      });
    } finally {
      setIsSending(false);
    }
  };

  const confirmPhoneCode = async () => {
    const normalizedPhone = normalizeMainlandChinaPhone(phone);
    if (
      !phoneChallenge ||
      phoneChallenge.phone !== normalizedPhone ||
      phoneCode.length !== 6
    ) {
      setForgotState({
        success: false,
        message: intl.formatMessage(messages.confirmPhoneCode)
      });
      return;
    }

    setIsSending(true);
    setForgotState({});
    try {
      const result = await confirmPhoneVerification({
        challengeId: phoneChallenge.challengeId,
        phone: normalizedPhone,
        code: phoneCode,
        purpose: 'password-reset'
      });
      setPhoneVerificationToken(result.verificationToken);
      setForgotState({
        success: true,
        message: intl.formatMessage(messages.phoneVerified)
      });
    } catch (error) {
      setForgotState({
        success: false,
        message: getErrorMessage(error)
      });
    } finally {
      setIsSending(false);
    }
  };

  const handlePhoneReset = async event => {
    event.preventDefault();
    if (
      newPassword.length < 6 ||
      newPassword.length > 128 ||
      newPassword !== newPasswordRepeat
    ) {
      setForgotState({
        success: false,
        message: intl.formatMessage(messages.passwordMismatch)
      });
      return;
    }
    if (!phoneVerificationToken) {
      setForgotState({
        success: false,
        message: intl.formatMessage(messages.confirmPhoneCode)
      });
      return;
    }

    setIsSending(true);
    setForgotState({});
    try {
      const res = await resetPasswordWithPhone({
        phone: normalizeMainlandChinaPhone(phone),
        phoneVerificationToken,
        password: newPassword
      });
      setForgotState(res);
      setCompleted(true);
      resetPhoneFlow();
    } catch (error) {
      setForgotState({
        success: false,
        message: getErrorMessage(error)
      });
    } finally {
      setIsSending(false);
    }
  };

  const isButtonDisabled = isSending || completed;
  const phoneResetAvailable = Boolean(
    phoneVerificationConfiguration?.phonePasswordResetAvailable
  );

  return (
    <Dialog open={isDialogOpen} onClose={onClose} aria-labelledby="forgot">
      <DialogTitle id="forgot">
        <FormattedMessage {...messages.resetPassword} />
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          <FormattedMessage
            {...(resetMode === 'email'
              ? messages.resetPasswordText
              : messages.phoneResetText)}
          />
        </DialogContentText>

        <div
          className={classNames('Forgot__status', {
            'Forgot__status--error': !forgotState.success,
            'Forgot__status--success': forgotState.success
          })}
        >
          <Typography color="inherit">
            {completed && resetMode === 'email'
              ? intl.formatMessage(messages.resetPasswordSuccess)
              : completed && resetMode === 'phone'
              ? intl.formatMessage(messages.phoneResetSuccess)
              : forgotState.message}
          </Typography>
        </div>

        {!completed && (
          <Button
            data-testid={
              resetMode === 'email' ? 'phone-reset-mode' : 'email-reset-mode'
            }
            size="small"
            color="primary"
            disabled={isSending}
            onClick={() =>
              changeResetMode(resetMode === 'email' ? 'phone' : 'email')
            }
          >
            <FormattedMessage
              {...(resetMode === 'email'
                ? messages.usePhoneReset
                : messages.useEmailReset)}
            />
          </Button>
        )}

        {!completed && resetMode === 'email' && (
          <Formik
            initialValues={initialValues}
            onSubmit={handleSubmit}
            validationSchema={validationSchema}
          >
            {({ errors, handleChange, handleSubmit }) => (
              <form className="Forgot__form" onSubmit={handleSubmit}>
                <TextField
                  error={errors.email}
                  label={intl.formatMessage(messages.email)}
                  name="email"
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
                    {isSending && <LoadingIcon />}
                    <FormattedMessage {...messages.send} />
                  </Button>
                </DialogActions>
              </form>
            )}
          </Formik>
        )}

        {!completed && resetMode === 'phone' && (
          <form className="Forgot__form" onSubmit={handlePhoneReset}>
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
                <FormattedMessage {...messages.checkingPhoneReset} />
              </Typography>
            ) : !phoneResetAvailable ? (
              <Typography color="error">
                <FormattedMessage {...messages.phoneResetUnavailable} />
              </Typography>
            ) : (
              <Button
                type="button"
                data-testid="send-phone-reset-code"
                disabled={isSending || Boolean(phoneVerificationToken)}
                onClick={sendPhoneCode}
              >
                <FormattedMessage {...messages.sendPhoneCode} />
              </Button>
            )}
            {phoneChallenge?.phone === phone && !phoneVerificationToken && (
              <>
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
                <Button
                  type="button"
                  data-testid="confirm-phone-reset-code"
                  disabled={isSending || phoneCode.length !== 6}
                  onClick={confirmPhoneCode}
                >
                  <FormattedMessage {...messages.verifyPhoneCode} />
                </Button>
              </>
            )}
            {phoneVerificationToken && (
              <>
                <PasswordTextField
                  label={intl.formatMessage(messages.newPassword)}
                  name="newPassword"
                  onChange={event => setNewPassword(event.target.value)}
                />
                <PasswordTextField
                  label={intl.formatMessage(messages.newPasswordRepeat)}
                  name="newPasswordRepeat"
                  onChange={event => setNewPasswordRepeat(event.target.value)}
                />
              </>
            )}
            <DialogActions>
              <Button color="primary" disabled={isSending} onClick={onClose}>
                <FormattedMessage {...messages.cancel} />
              </Button>
              <Button
                type="submit"
                disabled={isSending || !phoneVerificationToken}
                variant="contained"
                color="primary"
              >
                {isSending && <LoadingIcon />}
                <FormattedMessage {...messages.resetNow} />
              </Button>
            </DialogActions>
          </form>
        )}

        {completed && (
          <DialogActions>
            <Button color="primary" onClick={onClose}>
              <FormattedMessage {...messages.close} />
            </Button>
          </DialogActions>
        )}
      </DialogContent>
    </Dialog>
  );
}

ResetPassword.propTypes = {
  intl: intlShape.isRequired,
  forgot: PropTypes.func.isRequired,
  resetPasswordWithPhone: PropTypes.func.isRequired,
  isDialogOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired
};

const mapDispatchToProps = {
  forgot,
  resetPasswordWithPhone
};

export default connect(
  null,
  mapDispatchToProps
)(injectIntl(ResetPassword));
