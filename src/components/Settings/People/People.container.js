import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

import { logout } from '../../Account/Login/Login.actions';
import { updateUserData } from '../../App/App.actions';
import People from './People.component';
import { getUser, isLogged } from '../../App/App.selectors';
import API from '../../../api';

import { isAndroid } from '../../../cordova-util';

export class PeopleContainer extends PureComponent {
  static propTypes = {
    history: PropTypes.object.isRequired
  };

  state = {
    accountId: this.props.user.id,
    name: this.props.user.name,
    email: this.props.user.email,
    birthdate: this.props.user.birthdate,
    updateError: false
  };

  componentDidUpdate(previous) {
    if (previous.user.id !== this.props.user.id) {
      this.setState({
        accountId: this.props.user.id,
        name: this.props.user.name,
        email: this.props.user.email,
        birthdate: this.props.user.birthdate,
        updateError: false
      });
    }
  }

  handleChange = name => event => {
    this.setState({
      ...this.state,
      [name]: event.target.value
    });
  };

  handleSubmit = async () => {
    try {
      this.setState({ updateError: false });
      await API.updateUser({
        id: this.props.user.id,
        name: this.state.name,
        birthdate: this.state.birthdate
      });
      this.props.updateUserData({
        ...this.props.user,
        name: this.state.name,
        email: this.state.email,
        birthdate: this.state.birthdate
      });
    } catch (e) {
      console.error('Unable to update user profile.');
      this.setState({ updateError: true });
    } finally {
    }
  };

  handleLogout = () => {
    if (isAndroid()) {
      window.FirebasePlugin?.unregister?.();
      window.facebookConnectPlugin.logout(
        function(msg) {
          console.log('disconnect facebook msg' + msg);
        },
        function(msg) {
          console.log('error facebook disconnect msg' + msg);
        }
      );
    }
    return this.props.logout();
  };

  handleDeleteAccount = async closeFamilyIds => {
    try {
      const data = await API.deleteAccount(closeFamilyIds);
      this.handleLogout();
      this.props.history.push('/login-signup/');
      return data;
    } catch (error) {
      const response = error && error.response;
      const payload = response && response.data;
      const nested = payload && payload.error;
      const code = (nested && nested.code) || (payload && payload.code) || '';
      const familyIds =
        response &&
        response.status === 409 &&
        code === 'FAMILY_CLOSE_CONFIRMATION_REQUIRED' &&
        nested &&
        Array.isArray(nested.familyIds)
          ? nested.familyIds.every(
              familyId =>
                typeof familyId === 'string' && familyId.trim().length > 0
            )
            ? nested.familyIds
            : []
          : [];
      const normalized = new Error(
        (payload && payload.message) || 'Unable to delete the cloud account.'
      );
      normalized.code = code;
      normalized.familyIds = familyIds;
      throw normalized;
    }
  };

  render() {
    const { history, location } = this.props;
    const editable =
      this.state.accountId === this.props.user.id
        ? this.state
        : this.props.user;

    return (
      <People
        onClose={history.goBack}
        isLogged={this.props.isLogged}
        accountId={this.props.isLogged ? this.props.user.id : null}
        logout={this.handleLogout}
        name={editable.name || ''}
        email={editable.email || ''}
        birthdate={editable.birthdate || ''}
        updateError={this.state.updateError}
        location={location}
        onChangePeople={this.handleChange}
        onSubmitPeople={this.handleSubmit}
        onDeleteAccount={this.handleDeleteAccount}
      />
    );
  }
}

const mapStateToProps = state => {
  const userIsLogged = isLogged(state);
  const user = getUser(state);
  const location = userIsLogged
    ? {
        country: user?.location?.country,
        countryCode: user?.location?.countryCode
      }
    : {
        country: state.app.unloggedUserLocation?.country,
        countryCode: state.app.unloggedUserLocation?.countryCode
      };
  return {
    isLogged: userIsLogged,
    user: user,
    location: location
  };
};

const mapDispatchToProps = {
  logout: logout,
  updateUserData: updateUserData
};

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(PeopleContainer);
