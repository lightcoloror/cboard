import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createCareSync } from './careSync';
import { createBoardDTO, getBoardDTOTilesInDisplayOrder } from './dto';
import { previewCareArchive } from './careArchiveImport';

// UI primitives and device APIs are supplied by each client. No patient content
// is copied into the old global CBoard settings or guest library.
export default function CarePanel({ runtime, ui }) {
  const { Box, Text, Button, Input, Image } = ui;
  const [identity, setIdentity] = useState(runtime.identity());
  const [profiles, setProfiles] = useState([]);
  const [families, setFamilies] = useState([]);
  const [active, setActive] = useState(null);
  const [data, setData] = useState(null);
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [invitation, setInvitation] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [members, setMembers] = useState({});
  const [audit, setAudit] = useState([]);
  const [boardId, setBoardId] = useState('default');
  const [boardName, setBoardName] = useState('');
  const [migration, setMigration] = useState(null);
  const engine = useRef(null);
  const mounted = useRef(true);
  const account = useRef(identity && identity.id);
  const enabled = runtime.enabled !== false;
  const request = runtime.request;
  async function run(fn) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (mounted.current) setMessage('已保存；本地待同步修改会保留。');
    } catch (e) {
      if (mounted.current)
        setMessage(
          e.status === 401
            ? '登录已失效，请返回账号页面重新登录。'
            : e.status === 403
            ? '访问已撤销或未获授权。'
            : e.message || '暂时无法连接，修改保留在本机。'
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const reload = useCallback(
    async () => {
      const who = runtime.identity();
      if (!who || !who.id) return;
      const cacheKey = `care-list-v1:${who.id}`;
      const cached = await runtime.storage.get(cacheKey);
      if (cached && mounted.current && account.current === who.id) {
        const v = JSON.parse(cached);
        setProfiles(v.profiles);
        setFamilies(v.families);
      }
      const [p, f] = await Promise.all([
        request('/care/profiles', 'GET'),
        request('/care/families', 'GET')
      ]);
      if (!mounted.current || runtime.identity()?.id !== who.id) return;
      await runtime.storage.set(
        cacheKey,
        JSON.stringify({ profiles: p, families: f })
      );
      setProfiles(p);
      setFamilies(f);
    },
    [runtime, request]
  );
  useEffect(
    () => {
      mounted.current = true;
      const tick = () => {
        const who = runtime.identity();
        if (who?.id !== account.current) {
          account.current = who?.id;
          engine.current = null;
          setData(null);
          setActive(null);
          setProfiles([]);
          setFamilies([]);
          setMembers({});
          setAudit([]);
          setSessions([]);
          setIdentity(who);
        }
        if (!enabled || !who?.id) return;
        if (engine.current)
          engine.current
            .sync()
            .catch(
              e =>
                mounted.current &&
                setMessage(
                  e.status === 401 || e.status === 403
                    ? '登录失效或权限已撤销，请重新登录并检查授权。'
                    : '离线或同步暂停；本地修改已保留。'
                )
            );
        else
          reload().catch(
            () =>
              mounted.current &&
              setMessage('暂时无法联网；可打开已缓存的档案。')
          );
      };
      const stop = runtime.watch(tick);
      tick();
      return () => {
        mounted.current = false;
        stop();
        engine.current = null;
      };
    },
    [runtime, enabled, reload]
  );
  async function open(profile) {
    setData(null);
    setActive(profile);
    setMembers({});
    setAudit([]);
    setBoardId('default');
    const who = runtime.identity();
    if (!who) throw new Error('请先登录');
    let instance;
    instance = createCareSync({
      accountId: who.id,
      familyId: profile.familyId,
      profileId: profile.id,
      storage: runtime.storage,
      request,
      newId: runtime.newId,
      currentAccount: () => runtime.identity()?.id,
      changed: () => {
        if (mounted.current && engine.current === instance)
          setData(instance.view());
      }
    });
    engine.current = instance;
    await instance.init();
    await instance.sync();
  }
  async function saveTile(tile) {
    const tileId = tile ? tile.id : await runtime.newId();
    const value = { ...(tile ? tile.value : {}), label: label.trim() };
    if (!value.label) throw new Error('请输入图卡文字');
    await engine.current.edit('tile', tileId, value);
    if (!tile) await appendToBoard(tileId);
    setLabel('');
    await engine.current.sync();
  }
  async function photo() {
    if (!label.trim()) throw new Error('先输入图片对应的表达文字');
    const asset = await runtime.chooseImage();
    if (!asset) return;
    const mediaId = await runtime.newId();
    await engine.current.addMedia({ ...asset, mediaId });
    const tileId = await runtime.newId();
    await engine.current.edit('tile', tileId, { label: label.trim(), mediaId });
    await appendToBoard(tileId);
    setLabel('');
    await engine.current.sync();
  }
  async function appendToBoard(tileId) {
    const board = engine.current.view().resources[`board:${boardId}`];
    const value = board?.value || { name: '常用图板', tileIds: [] };
    await engine.current.edit('board', boardId, {
      ...value,
      tileIds: [...new Set([...value.tileIds, tileId])]
    });
  }
  const permissions = data?.permissions || [];
  const canEdit = permissions.includes('library.edit') && !data?.locked;
  const resources = Object.values(data?.resources || {}).filter(
    r => !r.deleted
  );
  const boards = resources.filter(r => r.kind === 'board');
  const order = boards.find(r => r.id === boardId)?.value?.tileIds || [];
  const selectedTiles = resources
    .filter(
      r => r.kind === 'tile' && (boardId === 'default' || order.includes(r.id))
    )
    .sort((a, b) => {
      const ai = order.indexOf(a.id),
        bi = order.indexOf(b.id);
      return (
        (ai < 0 ? 100000 : ai) - (bi < 0 ? 100000 : bi) ||
        a.id.localeCompare(b.id)
      );
    });
  // Keep the existing CBoard DTO and ordering contract at the rendering boundary.
  const dto = createBoardDTO({
    id: boardId,
    name: '患者图板',
    tiles: selectedTiles.map(t => ({
      id: t.id,
      label: t.value.label,
      vocalization: t.value.label
    })),
    orderedTileIds: selectedTiles.map(t => t.id)
  });
  const tiles = getBoardDTOTilesInDisplayOrder(dto).map(t =>
    selectedTiles.find(r => r.id === t.id)
  );
  if (!enabled)
    return (
      <Box>
        <Text>患者协作尚未启用。</Text>
      </Box>
    );
  if (!identity?.id)
    return (
      <Box>
        <Text>请先在现有账号页面登录，再进入患者协作。</Text>
      </Box>
    );
  return (
    <Box>
      <Text>患者协作 · 图语家</Text>
      <Text>
        只与获授权成员共享。离线修改会在联网后同步；离线设备不能即时获知撤权。
      </Text>
      <Text>{message}</Text>
      <Button disabled={busy} onClick={() => run(reload)}>
        刷新家庭与档案
      </Button>
      <Button
        disabled={busy}
        onClick={() =>
          run(async () =>
            setMigration(await request('/care/migration-preview', 'GET'))
          )
        }
      >
        查看旧资料归属预览
      </Button>
      {migration && (
        <Box>
          <Text>
            旧图板 {migration.boardIds.length} 个，旧沟通者档案{' '}
            {migration.communicators.length} 个。
          </Text>
          <Text>
            {migration.ambiguous
              ? '归属不明确，需要逐项选择患者。'
              : '已发现单个旧档案，仍需明确选择目标患者。'}
            本次预览不会迁移或删除旧资料。
          </Text>
          {migration.communicators.map(c => (
            <Text key={c.sourceId}>
              来源档案 {c.sourceId}：{c.boardIds.length} 个图板；目标尚未选择。
            </Text>
          ))}
        </Box>
      )}
      <Input value={name} onValue={setName} placeholder="家庭或患者档案名称" />
      <Button
        disabled={busy}
        onClick={() =>
          run(async () => {
            await request('/care/families', 'POST', { name });
            setName('');
            await reload();
          })
        }
      >
        新建家庭
      </Button>
      {families.map(f => (
        <Box key={f.id}>
          <Text>{f.name}</Text>
          <Button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await request('/care/profiles', 'POST', {
                  familyId: f.id,
                  name
                });
                setName('');
                await reload();
              })
            }
          >
            在此家庭新建患者档案
          </Button>
        </Box>
      ))}
      <Input
        value={invitation}
        onValue={setInvitation}
        placeholder="粘贴邀请凭据"
      />
      <Button
        disabled={busy}
        onClick={() =>
          run(async () => {
            await request('/care/invitations/accept', 'POST', {
              token: invitation.trim()
            });
            setInvitation('');
            await reload();
          })
        }
      >
        接受邀请
      </Button>
      {profiles.map(p => (
        <Button key={p.id} disabled={busy} onClick={() => run(() => open(p))}>
          {p.name}
        </Button>
      ))}
      {active && data && (
        <Box>
          <Text>
            {active.name} · 待同步 {data.queue.length} · 冲突{' '}
            {data.conflicts.length}
          </Text>
          {data.locked ? (
            <Text>此档案已锁定。联网核验权限后才能继续使用。</Text>
          ) : (
            <Box>
              <Button
                disabled={busy}
                onClick={() => run(() => engine.current.sync())}
              >
                立即同步
              </Button>
              <Button onClick={() => setBoardId('default')}>
                全部／常用图卡
              </Button>
              {boards
                .filter(b => b.id !== 'default')
                .map(b => (
                  <Button key={b.id} onClick={() => setBoardId(b.id)}>
                    {b.value.name || '图板'}
                  </Button>
                ))}
              {canEdit && (
                <Box>
                  <Input
                    value={label}
                    onValue={setLabel}
                    placeholder="图卡文字；点击图卡的“修改文字”应用"
                  />
                  <Input
                    value={boardName}
                    onValue={setBoardName}
                    placeholder="新图板名称"
                  />
                  <Button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        if (!boardName.trim())
                          throw new Error('请输入图板名称');
                        const id = await runtime.newId();
                        await engine.current.edit('board', id, {
                          name: boardName.trim(),
                          tileIds: []
                        });
                        setBoardId(id);
                        setBoardName('');
                        await engine.current.sync();
                      })
                    }
                  >
                    新建图板
                  </Button>
                  <Button disabled={busy} onClick={() => run(() => saveTile())}>
                    添加文字图卡
                  </Button>
                  <Button disabled={busy} onClick={() => run(photo)}>
                    选择个人图片并添加图卡
                  </Button>
                </Box>
              )}
              {canEdit && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const bytes = await runtime.chooseArchive();
                      if (!bytes) return;
                      const preview = await previewCareArchive(bytes, {
                        profileId: active.id,
                        familyId: active.familyId
                      });
                      if (
                        !(await runtime.confirm(
                          `把备份中的${preview.boardCount}个图板、${
                            preview.tileCount
                          }张图卡复制到「${
                            active.name
                          }」？请确认这些资料都属于此患者。原资料保留，不覆盖已有图卡。`
                        ))
                      )
                        return;
                      await engine.current.importPreview(preview);
                      await engine.current.sync();
                    })
                  }
                >
                  从旧图库备份预览并复制到此患者
                </Button>
              )}
              {tiles.map((tile, index) => (
                <Box key={tile.id}>
                  {data.media[tile.value.mediaId] && (
                    <Image
                      src={`data:${
                        data.media[tile.value.mediaId].type
                      };base64,${data.media[tile.value.mediaId].data}`}
                    />
                  )}
                  <Button
                    onClick={() =>
                      run(() =>
                        runtime.speak(
                          tile.value.label,
                          resources.find(
                            r =>
                              r.kind === 'preference' && r.id === 'speechRate'
                          )?.value?.value || 1
                        )
                      )
                    }
                  >
                    {tile.value.label}
                  </Button>
                  {tile.pending && <Text>待同步</Text>}
                  {canEdit && (
                    <Box>
                      <Button
                        disabled={busy}
                        onClick={() => run(() => saveTile(tile))}
                      >
                        修改文字
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            if (
                              !(await runtime.confirm(
                                '删除这张图卡？联网后将同步到其他设备。'
                              ))
                            )
                              return;
                            await engine.current.edit(
                              'tile',
                              tile.id,
                              null,
                              'delete'
                            );
                            await engine.current.sync();
                          })
                        }
                      >
                        删除图卡
                      </Button>
                      <Button
                        disabled={busy || index === 0}
                        onClick={() =>
                          run(async () => {
                            const ids = tiles.map(t => t.id);
                            [ids[index - 1], ids[index]] = [
                              ids[index],
                              ids[index - 1]
                            ];
                            await engine.current.edit('board', boardId, {
                              ...(boards.find(b => b.id === boardId)?.value ||
                                {}),
                              tileIds: ids
                            });
                            await engine.current.sync();
                          })
                        }
                      >
                        向前移动
                      </Button>
                    </Box>
                  )}
                </Box>
              ))}
              {permissions.includes('preferences.edit') && (
                <Box>
                  <Text>患者语速（设备具体语音保留本机设置）</Text>
                  {[0.7, 1, 1.3].map(rate => (
                    <Button
                      key={rate}
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await engine.current.edit(
                            'preference',
                            'speechRate',
                            { value: rate }
                          );
                          await engine.current.sync();
                        })
                      }
                    >
                      {rate} 倍
                    </Button>
                  ))}
                </Box>
              )}
              {data.conflicts.map(c => (
                <Box key={c.operation.operationId}>
                  <Text>
                    同步冲突：
                    {c.operation.value?.label || c.operation.resourceId}
                  </Text>
                  {c.reason && (
                    <Text>
                      此项被服务端拒绝：{c.reason}，不会自动反复提交。
                    </Text>
                  )}
                  <Text>
                    本机：{JSON.stringify(c.operation.value)}；云端：
                    {c.current?.deleted
                      ? '已删除'
                      : JSON.stringify(c.current?.value)}
                  </Text>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        engine.current.resolve(
                          c.operation.operationId,
                          'server'
                        )
                      )
                    }
                  >
                    采用云端，放弃此项本机修改
                  </Button>
                  {!c.current?.deleted && (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await engine.current.resolve(
                            c.operation.operationId,
                            'local'
                          );
                          await engine.current.sync();
                        })
                      }
                    >
                      采用本机并重新提交
                    </Button>
                  )}
                </Box>
              ))}
              {permissions.includes('members.manage') && (
                <Box>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const v = await request(
                          `/care/profiles/${active.id}`,
                          'GET'
                        );
                        setMembers(v.members || {});
                      })
                    }
                  >
                    查看成员
                  </Button>
                  {['read', 'edit'].map(mode => (
                    <Button
                      key={mode}
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const v = await request(
                            `/care/profiles/${active.id}/commands`,
                            'POST',
                            {
                              action: 'invite',
                              operationId: await runtime.newId(),
                              permissions:
                                mode === 'read'
                                  ? ['read']
                                  : ['read', 'library.edit', 'preferences.edit']
                            }
                          );
                          setInvitation(v.token);
                          await runtime.copy(v.token);
                        })
                      }
                    >
                      生成{mode === 'read' ? '只读' : '编辑'}邀请（72小时）
                    </Button>
                  ))}
                  {Object.entries(members).map(([member, grant]) => (
                    <Box key={member}>
                      <Text>
                        {member}：{grant.join('、')}
                      </Text>
                      {member !== identity.id && (
                        <Button
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              if (
                                !(await runtime.confirm(
                                  '撤销该成员对此患者档案的访问？'
                                ))
                              )
                                return;
                              await request(
                                `/care/profiles/${active.id}/commands`,
                                'POST',
                                {
                                  action: 'grant',
                                  member,
                                  permissions: [],
                                  operationId: await runtime.newId()
                                }
                              );
                              setMembers({});
                            })
                          }
                        >
                          撤销访问
                        </Button>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
              <Button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    setAudit(
                      (await request(
                        `/care/profiles/${active.id}/audit`,
                        'GET'
                      )).items
                    );
                  })
                }
              >
                查看修改记录
              </Button>
              {audit
                .slice(-30)
                .reverse()
                .map((a, i) => (
                  <Text key={i}>
                    {a.actor} · {a.action} · {new Date(a.at).toLocaleString()}
                  </Text>
                ))}
            </Box>
          )}
        </Box>
      )}
      <Button
        disabled={busy}
        onClick={() =>
          run(async () =>
            setSessions((await request('/user/sessions', 'GET')).items)
          )
        }
      >
        管理登录设备
      </Button>
      {sessions.map(s => (
        <Box key={s.id}>
          <Text>
            {s.current ? '当前设备 · ' : ''}
            {s.label}
          </Text>
          <Button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await request('/user/sessions', 'POST', { id: s.id });
                if (s.current) {
                  runtime.logout();
                  setIdentity(null);
                  setData(null);
                  engine.current = null;
                }
                setSessions([]);
              })
            }
          >
            退出此设备
          </Button>
        </Box>
      ))}
      <Button
        disabled={busy}
        onClick={() =>
          run(async () => {
            if (
              !(await runtime.confirm(
                '退出全部设备？患者的其他设备也需要重新登录。'
              ))
            )
              return;
            await request('/user/sessions', 'POST', { all: true });
            runtime.logout();
            setIdentity(null);
            setData(null);
            engine.current = null;
            setSessions([]);
          })
        }
      >
        退出全部设备
      </Button>
    </Box>
  );
}
