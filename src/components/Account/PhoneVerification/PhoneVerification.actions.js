import axios from 'axios';
import get from 'lodash/fp/get';

import { API_URL } from '../../../constants';

const buildPurposePayload = (payload, purpose) =>
  purpose && purpose !== 'registration' ? { ...payload, purpose } : payload;

export function getPhoneVerificationConfiguration() {
  return axios.get(`${API_URL}user/phone-verification`).then(get('data'));
}

export function requestPhoneVerification(phone, purpose = 'registration') {
  return axios
    .post(
      `${API_URL}user/phone-verification`,
      buildPurposePayload({ phone }, purpose)
    )
    .then(get('data'));
}

export function confirmPhoneVerification({
  challengeId,
  phone,
  code,
  purpose = 'registration'
}) {
  return axios
    .post(
      `${API_URL}user/phone-verification/confirm`,
      buildPurposePayload({ challengeId, phone, code }, purpose)
    )
    .then(get('data'));
}
