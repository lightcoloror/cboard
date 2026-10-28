import React, { useState } from 'react';
import Button from '@material-ui/core/Button';
import { sortPictogramsForDisplay } from '../../common/communicationSupport/pictogramOrdering';
import { getBoardDTOGridSlots } from '../../common/communicationSupport/dto';

export default function CareExpressionBoard({
  boards,
  activeBoardId,
  output,
  onApplyOutput,
  onJumpBoard,
  preferences = {},
  pictogramOrdering = {},
  onPictogramUsed = () => {}
}) {
  const [notice, setNotice] = useState('');
  const board = boards.find(item => item.id === activeBoardId) || boards[0];
  const fixed = Array.isArray(board?.layout?.cells);
  const columns = fixed ? board.layout.columns : [2, 3, 4].includes(preferences.gridColumns)
    ? preferences.gridColumns
    : 3;
  const fontSize =
    { normal: 18, large: 24, 'extra-large': 32 }[preferences.fontSize] || 18;
  const order =
    board?.layout?.tileIds || board?.tiles.map(tile => tile.id) || [];
  const manualTiles = order
    .map(id => board.tiles.find(tile => tile.id === id))
    .filter(Boolean);
  const tiles = fixed ? getBoardDTOGridSlots(board) : sortPictogramsForDisplay(
    manualTiles,
    preferences.pictogramSortMode,
    {
      ...pictogramOrdering,
      manualOrderByBoard: {
        ...pictogramOrdering.manualOrderByBoard,
        [board?.id]: order
      }
    },
    board?.id
  );
  const select = tile => {
    const target = tile.loadBoardId || tile.loadBoard;
    if (target) {
      const next =
        boards.find(item => item.id === target) ||
        boards.find(item => item.name === tile.label);
      if (next) {
        setNotice('');
        onJumpBoard(next.id);
      } else setNotice('目标图板已不存在，请从上方选择其他图板。');
      return;
    }
    setNotice('');
    onPictogramUsed(board.id, tile.id);
    onApplyOutput([...output, tile]);
  };
  return (
    <section aria-label="患者选图表达">
      <nav aria-label="选择沟通图板">
        {boards.map(item => (
          <Button
            key={item.id}
            aria-pressed={item.id === board?.id}
            onClick={() => onJumpBoard(item.id)}
          >
            {item.name}
          </Button>
        ))}
      </nav>
      <div
        role="group"
        aria-label="可选择的图卡"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: 12
        }}
      >
        {tiles.map((tile, index) => tile ? (
          <Button
            key={tile.id}
            variant="outlined"
            aria-label={`选择图卡：${tile.label}`}
            onClick={() => select(tile)}
            style={{
              minHeight: 120,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              fontSize,
              overflowWrap: 'anywhere'
            }}
          >
            {tile.image && (
              <img
                src={tile.image}
                alt=""
                style={{
                  width: 80,
                  maxWidth: '100%',
                  height: 80,
                  objectFit: 'contain'
                }}
              />
            )}
            <span>{tile.label}</span>
          </Button>
        ) : <span key={`empty-${index}`} aria-hidden="true" data-fixed-grid-empty={index} />)}
      </div>
      {!tiles.length && (
        <p>此图板还没有图卡，请由有编辑权限的成员从设置添加。</p>
      )}
      {notice && <p role="status">{notice}</p>}
      <p aria-live="polite">
        已选：
        {output.map(tile => tile.label || tile.vocalization).join(' · ') ||
          '尚未选图'}
      </p>
      <Button
        disabled={!output.length}
        onClick={() => onApplyOutput(output.slice(0, -1))}
      >
        撤回最后一张
      </Button>
      <Button disabled={!output.length} onClick={() => onApplyOutput([])}>
        清空已选图卡
      </Button>
    </section>
  );
}
