import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { FormattedMessage, injectIntl, intlShape } from 'react-intl';
import { Formik, ErrorMessage } from 'formik';
import classNames from 'classnames';
import Button from '@material-ui/core/Button';
import Typography from '@material-ui/core/Typography';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import DialogActions from '@material-ui/core/DialogActions';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Checkbox from '@material-ui/core/Checkbox';
import { TextField } from '../../UI/FormItems';
import LoadingIcon from '../../UI/LoadingIcon';
import validationSchema from './validationSchema';
import {
  confirmPhoneVerification,
  getPhoneVerificationConfiguration,
  requestPhoneVerification,
  signUp
} from './SignUp.actions';
import messages from './SignUp.messages';
import './SignUp.css';
import PasswordTextField from '../../UI/FormItems/PasswordTextField';
import {
  isValidMainlandChinaPhone,
  normalizeMainlandChinaPhone
} from '../../../common/communicationSupport/accountPhone';
import {
  blocksPhoneRegistration,
  buildRegistrationPayload,
  hasMatchingPhoneVerification
} from './phoneVerification';

function SignUp(props) {
  const { intl, isDialogOpen, onClose, dialogWithKeyboardStyle = {} } = props;

  const [isSigningUp, setIsSigningUp] = useState(false);
  const [signUpStatus, setSignUpStatus] = useState({});
  const [
    phoneVerificationConfiguration,
    setPhoneVerificationConfiguration
  ] = useState(null);
  const [phoneVerificationLoading, setPhoneVerificationLoading] = useState(
    false
  );
  const [phoneVerificationBusy, setPhoneVerificationBusy] = useState(false);
  const [phoneChallenge, setPhoneChallenge] = useState(null);
  const [phoneCode, setPhoneCode] = useState('');
  const [verifiedPhone, setVerifiedPhone] = useState('');
  const [phoneVerificationToken, setPhoneVerificationToken] = useState('');
  const [phoneVerificationStatus, setPhoneVerificationStatus] = useState({});

  const isButtonDisabled = isSigningUp || !!signUpStatus.success;

  useEffect(
    () => {
      if (isDialogOpen) {
        setSignUpStatus({});
        setPhoneChallenge(null);
        setPhoneCode('');
        setVerifiedPhone('');
        setPhoneVerificationToken('');
        setPhoneVerificationStatus({});
        setPhoneVerificationConfiguration(null);
        setPhoneVerificationLoading(true);
        let active = true;
        getPhoneVerificationConfiguration()
          .then(configuration => {
            if (active) setPhoneVerificationConfiguration(configuration);
          })
          .catch(() => {
            if (active) {
              setPhoneVerificationConfiguration({
                available: false,
                requiredForPhoneRegistration: false
              });
            }
          })
          .finally(() => {
            if (active) setPhoneVerificationLoading(false);
          });
        return () => {
          active = false;
        };
      }
      setPhoneVerificationLoading(false);
      return undefined;
    },
    [isDialogOpen]
  );

  function resetPhoneVerification() {
    setPhoneChallenge(null);
    setPhoneCode('');
    setVerifiedPhone('');
    setPhoneVerificationToken('');
    setPhoneVerificationStatus({});
  }

  async function sendPhoneCode(phoneValue) {
    const phone = normalizeMainlandChinaPhone(phoneValue);
    if (!isValidMainlandChinaPhone(phone)) {
      setPhoneVerificationStatus({
        success: false,
        message: intl.formatMessage(messages.phoneVerificationInvalid)
      });
      return;
    }
    setPhoneVerificationBusy(true);
    setPhoneVerificationStatus({});
    try {
      const challenge = await requestPhoneVerification(phone);
      setPhoneChallenge({ ...challenge, phone });
      setPhoneCode('');
      setVerifiedPhone('');
      setPhoneVerificationToken('');
      setPhoneVerificationStatus({
        success: true,
        message: intl.formatMessage(messages.phoneCodeSent, {
          phone: challenge.phoneMasked || phone
        })
      });
    } catch (error) {
      setPhoneVerificationStatus({
        success: false,
        message:
          error?.response?.data?.message ||
          intl.formatMessage(messages.noConnection)
      });
    } finally {
      setPhoneVerificationBusy(false);
    }
  }

  async function verifyPhoneCode(phoneValue) {
    const phone = normalizeMainlandChinaPhone(phoneValue);
    if (!phoneChallenge || phoneChallenge.phone !== phone) {
      resetPhoneVerification();
      return;
    }
    setPhoneVerificationBusy(true);
    setPhoneVerificationStatus({});
    try {
      const result = await confirmPhoneVerification({
        challengeId: phoneChallenge.challengeId,
        phone,
        code: phoneCode
      });
      setVerifiedPhone(phone);
      setPhoneVerificationToken(result.verificationToken || '');
      setPhoneVerificationStatus({
        success: true,
        message: intl.formatMessage(messages.phoneVerified)
      });
    } catch (error) {
      setVerifiedPhone('');
      setPhoneVerificationToken('');
      setPhoneVerificationStatus({
        success: false,
        message:
          error?.response?.data?.message ||
          intl.formatMessage(messages.noConnection)
      });
    } finally {
      setPhoneVerificationBusy(false);
    }
  }

  async function handleSubmit(values) {
    const normalizedPhone = normalizeMainlandChinaPhone(values.phone);
    const formValues = buildRegistrationPayload(values, {
      verifiedPhone,
      verificationToken: phoneVerificationToken
    });

    if (
      normalizedPhone &&
      phoneVerificationConfiguration?.requiredForPhoneRegistration &&
      !hasMatchingPhoneVerification({
        phone: normalizedPhone,
        verifiedPhone,
        verificationToken: phoneVerificationToken
      })
    ) {
      setPhoneVerificationStatus({
        success: false,
        message: intl.formatMessage(messages.confirmPhoneCode)
      });
      return;
    }

    setIsSigningUp(true);
    setSignUpStatus({});

    try {
      const res = await signUp(formValues);
      setSignUpStatus(res);
    } catch (err) {
      const responseMessage = err?.response?.data?.message;
      const message = responseMessage
        ? responseMessage
        : intl.formatMessage(messages.noConnection);
      setSignUpStatus({ success: false, message });
    } finally {
      setIsSigningUp(false);
    }
  }

  const { dialogStyle, dialogContentStyle } = dialogWithKeyboardStyle ?? {};
  const values = {
    name: '',
    email: '',
    phone: '',
    password: '',
    passwordConfirm: '',
    isTermsAccepted: false
  };

  return (
    <Dialog
      open={isDialogOpen}
      onClose={onClose}
      aria-labelledby="sign-up"
      style={dialogStyle}
    >
      <DialogTitle id="sign-up">
        <FormattedMessage {...messages.signUp} />
      </DialogTitle>
      <DialogContent style={dialogContentStyle}>
        <div
          className={classNames('SignUp__status', {
            'SignUp__status--error': !signUpStatus.success,
            'SignUp__status--success': signUpStatus.success
          })}
        >
          <Typography color="inherit">{signUpStatus.message}</Typography>
        </div>
        {signUpStatus && !signUpStatus.success && (
          <Formik
            onSubmit={handleSubmit}
            validationSchema={validationSchema}
            initialValues={values}
          >
            {({ errors, handleChange, handleSubmit, values: formValues }) => {
              const normalizedPhone = normalizeMainlandChinaPhone(
                formValues.phone
              );
              const phoneVerificationRequired = Boolean(
                normalizedPhone &&
                  phoneVerificationConfiguration?.requiredForPhoneRegistration
              );
              const phoneIsVerified = Boolean(
                hasMatchingPhoneVerification({
                  phone: normalizedPhone,
                  verifiedPhone,
                  verificationToken: phoneVerificationToken
                })
              );
              const phoneVerificationBlocksSubmit = blocksPhoneRegistration({
                phone: normalizedPhone,
                configuration: phoneVerificationConfiguration,
                loading: phoneVerificationLoading,
                verifiedPhone,
                verificationToken: phoneVerificationToken
              });
              const showPhoneVerification = Boolean(
                normalizedPhone &&
                  (phoneVerificationConfiguration?.available ||
                    phoneVerificationRequired)
              );

              return (
                <form className="SignUp__form" onSubmit={handleSubmit}>
                  <TextField
                    name="name"
                    label={intl.formatMessage(messages.name)}
                    error={errors.name}
                    onChange={handleChange}
                  />
                  <TextField
                    name="email"
                    label={intl.formatMessage(messages.email)}
                    error={errors.email}
                    onChange={handleChange}
                  />
                  <TextField
                    name="phone"
                    type="tel"
                    inputProps={{ inputMode: 'numeric', maxLength: 20 }}
                    label={intl.formatMessage(messages.phoneOptional)}
                    error={errors.phone}
                    onChange={event => {
                      const nextPhone = normalizeMainlandChinaPhone(
                        event.target.value
                      );
                      if (
                        nextPhone !== verifiedPhone &&
                        nextPhone !== phoneChallenge?.phone
                      ) {
                        resetPhoneVerification();
                      }
                      handleChange(event);
                    }}
                  />
                  {showPhoneVerification && (
                    <div className="SignUp__phoneVerification">
                      {!phoneVerificationConfiguration?.available ? (
                        <Typography color="error">
                          {intl.formatMessage(
                            messages.phoneVerificationUnavailable
                          )}
                        </Typography>
                      ) : (
                        <>
                          <Button
                            type="button"
                            disabled={phoneVerificationBusy || phoneIsVerified}
                            onClick={() => sendPhoneCode(formValues.phone)}
                          >
                            {intl.formatMessage(messages.sendPhoneCode)}
                          </Button>
                          {phoneChallenge?.phone === normalizedPhone &&
                            !phoneIsVerified && (
                              <>
                                <TextField
                                  name="phoneVerificationCode"
                                  type="tel"
                                  inputProps={{
                                    inputMode: 'numeric',
                                    maxLength: 6
                                  }}
                                  label={intl.formatMessage(
                                    messages.phoneVerificationCode
                                  )}
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
                                  disabled={
                                    phoneVerificationBusy ||
                                    phoneCode.length !== 6
                                  }
                                  onClick={() =>
                                    verifyPhoneCode(formValues.phone)
                                  }
                                >
                                  {intl.formatMessage(
                                    messages.confirmPhoneCode
                                  )}
                                </Button>
                              </>
                            )}
                        </>
                      )}
                      {phoneVerificationStatus.message && (
                        <Typography
                          color={
                            phoneVerificationStatus.success
                              ? 'primary'
                              : 'error'
                          }
                        >
                          {phoneVerificationStatus.message}
                        </Typography>
                      )}
                    </div>
                  )}
                  <PasswordTextField
                    error={errors.password}
                    label={intl.formatMessage(messages.createYourPassword)}
                    name="password"
                    onChange={handleChange}
                  />
                  <PasswordTextField
                    error={errors.passwordConfirm}
                    label={intl.formatMessage(messages.confirmYourPassword)}
                    name="passwordConfirm"
                    onChange={handleChange}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        type="checkbox"
                        name="isTermsAccepted"
                        onChange={handleChange}
                        color="primary"
                      />
                    }
                    label={
                      <FormattedMessage
                        {...messages.agreement}
                        values={{
                          terms: (
                            <a
                              href="https://www.cboard.io/terms-of-use/"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {intl.formatMessage(messages.termsAndConditions)}
                            </a>
                          ),
                          privacy: (
                            <a
                              href="https://www.cboard.io/privacy/"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {intl.formatMessage(messages.privacy)}
                            </a>
                          )
                        }}
                      />
                    }
                  />
                  <ErrorMessage
                    name="isTermsAccepted"
                    component="p"
                    className="SignUp__status--error SignUp__termsError"
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
                      disabled={
                        isButtonDisabled || phoneVerificationBlocksSubmit
                      }
                      variant="contained"
                      color="primary"
                    >
                      {isSigningUp && <LoadingIcon />}
                      <FormattedMessage {...messages.signMeUp} />
                    </Button>
                  </DialogActions>
                </form>
              );
            }}
          </Formik>
        )}
      </DialogContent>
    </Dialog>
  );
}

SignUp.propTypes = {
  intl: intlShape.isRequired,
  isDialogOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  dialogWithKeyboardStyle: PropTypes.object
};

export default injectIntl(SignUp);
