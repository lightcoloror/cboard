import React from 'react';
import { Router } from 'react-router-dom';
import history from './history';

// API session failures and mounted routes must use the same history instance.
export default function PlatformRouter({ children }) {
  return <Router history={history}>{children}</Router>;
}
