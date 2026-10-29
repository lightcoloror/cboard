import React from 'react';
import PropTypes from 'prop-types';
import { CboardScanButton as Button } from '../../UI/CboardScan';
import { getSavedPhraseLifeContexts } from '../../../common/communicationSupport/savedPhraseManagement';

export default function LifeContextFilter({ items, value, onChange }) {
  const choices = [{ value: null, label: '全部' }, { value: '', label: '未分类' },
    ...getSavedPhraseLifeContexts(items).map(context => ({ value: context, label: context }))];
  return <div className="CommunicationSupportPanel__actions" role="group" aria-label="生活情境筛选">
    {choices.map(choice => <Button key={choice.value === null ? '__all' : `context:${choice.value}`}
      size="small" color="primary" variant={value === choice.value ? 'contained' : 'outlined'}
      aria-pressed={value === choice.value} onClick={() => onChange(choice.value)}>{choice.label}</Button>)}
  </div>;
}
LifeContextFilter.propTypes = { items: PropTypes.array.isRequired, value: PropTypes.string, onChange: PropTypes.func.isRequired };
