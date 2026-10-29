import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Scanner, Scannable } from 'react-scannable';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import { findDOMNode } from 'react-dom';
import './CboardScan.css';

const ScanContext = createContext(null);

// Registration, modal ownership and visibility glue around CBoard's scanner.
// Strategy, traversal, selection keys and exit behavior remain react-scannable's.
export function CboardScannerRoot({ active = false, iterationInterval = 2000, strategy = 'automatic', onDeactivation = () => {}, children, className, classNameActive, showStopAction = false }) {
  const [pauses, setPauses] = useState(0);
  const [editing, setEditing] = useState(false);
  const [hidden, setHidden] = useState(false);
  const scannerRef = useRef(null);
  const owners = useRef(new Set());
  const pause = useCallback(token => {
    owners.current.add(token); setPauses(owners.current.size);
    return () => { owners.current.delete(token); setPauses(owners.current.size); };
  }, []);
  useLayoutEffect(() => {
    const node = findDOMNode(scannerRef.current);
    if (!node) return undefined;
    const changed = () => setHidden(document.hidden || isHidden(node));
    changed();
    const observer = new MutationObserver(changed);
    for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) observer.observe(ancestor, { attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'inert', 'class', 'style'] });
    document.addEventListener('visibilitychange', changed);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', changed); };
  }, []);
  useLayoutEffect(() => {
    const changed = () => {
      const node = document.activeElement;
      setEditing(Boolean(node && node.matches('input:not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"]')));
    };
    changed(); document.addEventListener('focusin', changed); document.addEventListener('focusout', changed);
    return () => { document.removeEventListener('focusin', changed); document.removeEventListener('focusout', changed); };
  }, []);
  const context = useMemo(() => ({ active, iterationInterval, strategy, onDeactivation, pause }), [active, iterationInterval, strategy, onDeactivation, pause]);
  const scanning = active && !pauses && !editing && !hidden;
  return <ScanContext.Provider value={context}>
    <Scanner ref={scannerRef} active={scanning} autoDeactivateCount={scanning ? 4 : 0} iterationInterval={iterationInterval} strategy={strategy} onDeactivation={onDeactivation}
      {...(className ? { className, classNameActive: classNameActive || className + ' Scanner__Container--active' } : {})}>
      {showStopAction && active && <CboardScanButton onClick={onDeactivation}>停止扫描</CboardScanButton>}
      {children}
    </Scanner>
  </ScanContext.Provider>;
}

function isHidden(node) {
  for (let current = node; current && current.nodeType === 1; current = current.parentElement) {
    if (current.hidden || current.inert || current.getAttribute('aria-hidden') === 'true') return true;
    const style = window.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
  }
  return false;
}

export function CboardScanItem({ children, disabled = false }) {
  const context = useContext(ScanContext);
  const childRef = useRef(null);
  const [hidden, setHidden] = useState(false);
  useLayoutEffect(() => {
    if (!context || !childRef.current) return undefined;
    const node = childRef.current;
    const update = () => setHidden(isHidden(node));
    update();
    const observer = new MutationObserver(update);
    for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
      observer.observe(ancestor, { attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'inert', 'style', 'class'] });
    }
    return () => observer.disconnect();
  }, [Boolean(context)]);
  if (!context) return children;
  const child = React.cloneElement(children, { ref: node => {
    childRef.current = node;
    const ref = children.ref;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  } });
  return <Scannable disabled={disabled || hidden}>{child}</Scannable>;
}

export const CboardScanButton = React.forwardRef(function CboardScanButton(props, ref) {
  return <CboardScanItem disabled={Boolean(props.disabled)}><Button {...props} ref={ref} /></CboardScanItem>;
});

export function CboardScanDialog({ children, ...props }) {
  const outer = useContext(ScanContext);
  const token = useRef({});
  useLayoutEffect(() => props.open && outer ? outer.pause(token.current) : undefined, [props.open, outer?.pause]);
  return <Dialog {...props}>{outer && props.open
    ? <CboardScannerRoot active={outer.active} iterationInterval={outer.iterationInterval} strategy={outer.strategy} onDeactivation={outer.onDeactivation} className="Scanner__Container CommunicationScanDialog">{children}</CboardScannerRoot>
    : children}</Dialog>;
}
