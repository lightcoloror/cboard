import * as yup from 'yup';
import { isValidMainlandChinaPhone } from '../../../common/communicationSupport/accountPhone';

const validationSchema = yup.object().shape({
  password: yup
    .string()
    .required('Required')
    .oneOf([yup.ref('passwordConfirm'), null], "Passwords don't match"),
  passwordConfirm: yup
    .string()
    .required('Required')
    .oneOf([yup.ref('password'), null], "Passwords don't match"),
  name: yup.string().required('Required'),
  email: yup
    .string()
    .email('Invalid email')
    .required('Required'),
  phone: yup
    .string()
    .test(
      'mainland-china-phone',
      'Use an 11-digit mainland China phone number',
      value => !String(value || '').trim() || isValidMainlandChinaPhone(value)
    ),
  isTermsAccepted: yup
    .bool()
    .oneOf([true], 'Accept Terms and Policy is required')
});

export default validationSchema;
