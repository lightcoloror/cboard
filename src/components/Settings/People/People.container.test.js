import API from '../../../api';
import { PeopleContainer } from './People.container';

jest.mock('../../../api', () => ({
  __esModule: true,
  default: { updateUser: jest.fn(), deleteAccount: jest.fn() }
}));
jest.mock('../../Account/Login/Login.actions', () => ({
  logout: jest.fn()
}));
jest.mock('../../App/App.actions', () => ({
  updateUserData: jest.fn()
}));
jest.mock('../../App/App.selectors', () => ({
  getUser: jest.fn(),
  isLogged: jest.fn()
}));
jest.mock('../../../cordova-util', () => ({
  isAndroid: jest.fn(() => false)
}));

describe('PeopleContainer profile updates', () => {
  const updateUserData = jest.fn();

  function createContainer() {
    const instance = new PeopleContainer({
      user: {
        id: 'user-1',
        name: 'Existing name',
        email: 'existing@example.test',
        birthdate: '2000-01-01'
      },
      updateUserData,
      isLogged: true,
      history: { goBack: jest.fn() }
    });
    instance.setState = patch => {
      instance.state = { ...instance.state, ...patch };
    };
    return instance;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('submits editable profile fields without the read-only email', async () => {
    API.updateUser.mockResolvedValue({});
    const instance = createContainer();
    instance.state.name = 'New name';
    instance.state.birthdate = '2001-02-03';

    await instance.handleSubmit();

    expect(API.updateUser).toHaveBeenCalledWith({
      id: 'user-1',
      name: 'New name',
      birthdate: '2001-02-03'
    });
    expect(updateUserData).toHaveBeenCalledTimes(1);
  });

  test('shows a stable update error and does not update local user data on failure', async () => {
    API.updateUser.mockRejectedValue(
      new Error('EMAIL_CHANGE_REQUIRES_VERIFICATION')
    );
    const instance = createContainer();

    await instance.handleSubmit();

    expect(updateUserData).not.toHaveBeenCalled();
    expect(instance.state.updateError).toBe(true);
  });

  test('preserves only a valid family-close contract for the confirmation UI', async () => {
    API.deleteAccount.mockRejectedValue({
      response: {
        status: 409,
        data: {
          message: 'Confirm closing the family first.',
          error: {
            code: 'FAMILY_CLOSE_CONFIRMATION_REQUIRED',
            familyIds: ['family-1', { id: 'unexpected' }]
          }
        }
      }
    });
    const instance = createContainer();

    await expect(instance.handleDeleteAccount()).rejects.toMatchObject({
      code: 'FAMILY_CLOSE_CONFIRMATION_REQUIRED',
      familyIds: []
    });
  });
});
