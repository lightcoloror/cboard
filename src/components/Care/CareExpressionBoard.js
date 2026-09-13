import React from 'react';
import Button from '@material-ui/core/Button';

export default function CareExpressionBoard({
  boards,
  activeBoardId,
  output,
  onApplyOutput,
  onJumpBoard,
  preferences = {}
}) {
  const columns = [2, 3, 4].includes(preferences.gridColumns)
    ? preferences.gridColumns
    : 3;
  const fontSize =
    { normal: 18, large: 24, 'extra-large': 32 }[preferences.fontSize] || 18;
  const board = boards.find(item => item.id === activeBoardId) || boards[0];
  const order =
    board?.layout?.tileIds || board?.tiles.map(tile => tile.id) || [];
  const tiles = order
    .map(id => board.tiles.find(tile => tile.id === id))
    .filter(Boolean);
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
        {tiles.map(tile => (
          <Button
            key={tile.id}
            variant="outlined"
            aria-label={`选择图卡：${tile.label}`}
            onClick={() => onApplyOutput([...output, tile])}
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
        ))}
      </div>
      {!tiles.length && (
        <p>此图板还没有图卡，请由有编辑权限的成员从设置添加。</p>
      )}
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
