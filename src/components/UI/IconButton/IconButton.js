import React, { Fragment } from 'react';
import PropTypes from 'prop-types';
import Tooltip from '@material-ui/core/Tooltip';
import MUIIconButton from '@material-ui/core/IconButton';
import { CboardScanItem } from '../CboardScan';

const propTypes = {
  /**
   *
   */
  children: PropTypes.node.isRequired,
  /**
   *
   */
  component: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.object,
    PropTypes.string
  ]),
  /**
   *
   */
  disabled: PropTypes.bool,
  /**
   *
   */
  label: PropTypes.string.isRequired,
  /**
   *
   */
  onClick: PropTypes.func,
  /**
   *
   */
  to: PropTypes.string
};

function IconButton({ children, component, to, label, disabled, onClick, scan = false }) {
  const child = React.Children.only(children);

  const iconButtonProps = {
    component,
    disabled,
    onClick,
    to,
    'aria-label': label,
    color: 'inherit'
  };

  const disableIconButtondStyle = {
    color: 'rgba(255, 255, 255, 0.26)'
  };

  const button = <MUIIconButton {...iconButtonProps} {...(disabled ? { style: disableIconButtondStyle } : {})}>{child}</MUIIconButton>;
  const action = scan ? <CboardScanItem disabled={disabled}>{button}</CboardScanItem> : button;
  return <Fragment>{disabled ? action : <Tooltip placement="bottom" title={label}>{action}</Tooltip>}</Fragment>;
}

IconButton.propTypes = propTypes;

export default IconButton;
