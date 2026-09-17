import axios from 'axios';

import { API_URL } from '../../../constants';

export function activate(url) {
  return axios
    .post(`${API_URL}user/activate/${url}`)
    .then(response => {
      const data = response.data || {};
      return { ...data, success: data.success === 1 || data.success === true };
    })
    .catch(error => ({ ...error?.response?.data, success: false }));
}
