import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { Route, Switch } from 'react-router-dom';
import PlatformRouter from './PlatformRouter';
import history from './history';

it('shows login immediately when an external session failure redirects, even with an offline archive', () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  localStorage.setItem('care-offline-selection-v1', 'synthetic-offline');
  history.replace('/');
  try {
    act(() => {
      ReactDOM.render(
        <PlatformRouter>
          <Switch>
            <Route path="/login-signup" render={() => <p>登录表单</p>} />
            <Route exact path="/" render={() => <p>本机离线沟通</p>} />
          </Switch>
        </PlatformRouter>,
        host
      );
    });
    expect(host.textContent).toBe('本机离线沟通');
    act(() => history.push('/login-signup/'));
    expect(host.textContent).toBe('登录表单');
    expect(localStorage.getItem('care-offline-selection-v1')).toBe(
      'synthetic-offline'
    );
    act(() => history.push('/'));
    expect(host.textContent).toBe('本机离线沟通');
  } finally {
    act(() => {
      ReactDOM.unmountComponentAtNode(host);
    });
    host.remove();
    localStorage.removeItem('care-offline-selection-v1');
    history.replace('/');
  }
});
