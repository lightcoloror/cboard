import React from 'react';
import { shallow } from 'enzyme';
import { SignUp } from './SignUp.component';
import { signUp } from './SignUp.actions';

jest.mock('./SignUp.actions', () => ({ signUp: jest.fn() }));
jest.mock('./SignUp.messages', () => ({
  signUp: { id: 'signup', defaultMessage: 'Sign up' }
}));

test('missing care policies block even direct form submission', async () => {
  const previous = process.env.REACT_APP_CARE_COLLABORATION;
  process.env.REACT_APP_CARE_COLLABORATION = 'true';
  try {
    const wrapper = shallow(
      <SignUp
        intl={{ formatMessage: message => message.defaultMessage }}
        isDialogOpen={false}
        onClose={() => {}}
      />
    );
    await wrapper.find('Formik').prop('onSubmit')({});
    expect(signUp).not.toHaveBeenCalled();
  } finally {
    if (previous === undefined) delete process.env.REACT_APP_CARE_COLLABORATION;
    else process.env.REACT_APP_CARE_COLLABORATION = previous;
  }
});
