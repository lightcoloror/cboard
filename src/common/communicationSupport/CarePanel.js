import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createCareSync } from './careSync';
import { createBoardDTO, getBoardDTOTilesInDisplayOrder } from './dto';
import { previewCareArchive } from './careArchiveImport';
import { exportCareDeviceArchive } from './careDeviceArchive';
import { careErrorMessage } from './careErrors';
import { encryptPrivateArchive } from './privateArchiveEncryption';
import CareOfflineImport from './CareOfflineImport';

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
  const [funding, setFunding] = useState([]);
  const [chosenFunding, setChosenFunding] = useState(null);
  const [rights, setRights] = useState(null);
  const [favoriteText, setFavoriteText] = useState('');
  const [includeOriginal, setIncludeOriginal] = useState(false);
  const [delegationLimit, setDelegationLimit] = useState('');
  const [archivePassword, setArchivePassword] = useState('');
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
      if (mounted.current) setMessage(careErrorMessage(e));
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
            .catch(e => mounted.current && setMessage(careErrorMessage(e)));
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
    setFunding([]);
    setRights(null);
    setIncludeOriginal(false);
    setFavoriteText('');
    setChosenFunding(runtime.funding ? runtime.funding(profile.id) : null);
    setBoardId('default');
    const who = runtime.identity();
    if (!who) throw new Error('请先登录');
    if (runtime.selectProfile) await runtime.selectProfile(profile);
    let instance;
    instance = createCareSync({
      accountId: who.id,
      familyId: profile.familyId,
      profileId: profile.id,
      storage: runtime.storage,
      request,
      newId: runtime.newId,
      personalFavorites: Boolean(runtime.funding),
      currentAccount: () => runtime.identity()?.id,
      changed: () => {
        if (mounted.current && engine.current === instance)
          setData(instance.view());
      }
    });
    engine.current = instance;
    await instance.init();
    await instance.sync();
    if (runtime.funding) {
      const [available, entitlement] = await Promise.all([
        request(
          `/care/funding?profileId=${encodeURIComponent(profile.id)}`,
          'GET'
        ),
        request(`/care/profiles/${profile.id}/entitlements`, 'GET')
      ]);
      if (engine.current === instance) {
        setFunding(available.items || []);
        setRights(entitlement);
      }
    }
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
  async function updateFavorite(item, action) {
    const value = {
      ...item.value,
      sentence: favoriteText.trim() || item.value?.sentence
    };
    await engine.current.edit(item.kind, item.id, value, action, {
      updateOriginal: includeOriginal && Boolean(item.source)
    });
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
        {runtime.restoreOffline && (
          <CareOfflineImport runtime={runtime} ui={ui} />
        )}
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
              ? '归属不明确，需要核对原患者来源。'
              : '已发现单个旧档案，仍需核对同一患者的来源。'}
            本次预览不会迁移或删除旧资料。
          </Text>
          {migration.communicators.map(c => (
            <Text key={c.sourceId}>
              来源档案 {c.sourceId}：{c.boardIds.length} 个图板；来源待核对。
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
          {rights && (
            <Text>
              云服务：
              {rights.state === 'active'
                ? '有效'
                : rights.state === 'download_grace'
                ? '到期后只读下载期'
                : '已到期'}
              {rights.downloadUntil
                ? `；下载期限 ${new Date(
                    rights.downloadUntil
                  ).toLocaleString()}`
                : ''}
              。本地沟通与导出继续可用。
            </Text>
          )}
          {funding.length > 0 && (
            <Box>
              <Text>
                选择此档案使用的 AI 额度来源；额度不足不会自动换来源。
              </Text>
              {funding.map(item => (
                <Box key={item.id}>
                  <Text>
                    {item.kind === 'institution' ? '机构额度' : '家庭额度'} ·
                    本周 {item.weeklyUsed}/{item.weeklyLimit} · 重置{' '}
                    {new Date(item.resetAt).toLocaleString()}
                  </Text>
                  {item.delegatedLimit !== null && (
                    <Text>
                      本人每周授权限额 {item.delegatedUsed}/
                      {item.delegatedLimit}
                    </Text>
                  )}
                  {item.packs.map(pack => (
                    <Text key={pack.id}>
                      {pack.type}：剩余 {Math.max(0, pack.amount - pack.used)}
                      ，有效至 {new Date(pack.expiresAt).toLocaleString()}
                    </Text>
                  ))}
                  {(item.pendingRequests || []).map(pending => (
                    <Text key={`${pending.actor}:${pending.requestId}`}>
                      请求 {pending.requestId}：预留 {pending.reserved}
                      ，执行结果待对账，暂不重复调用。
                    </Text>
                  ))}
                  <Button
                    disabled={chosenFunding === item.id}
                    onClick={() => {
                      runtime.setFunding(active.id, item.id);
                      setChosenFunding(item.id);
                    }}
                  >
                    {chosenFunding === item.id
                      ? '当前额度来源'
                      : '使用此额度来源'}
                  </Button>
                </Box>
              ))}
            </Box>
          )}
          {data.locked ? (
            <Text>此档案已锁定。联网核验权限后才能继续使用。</Text>
          ) : (
            <Box>
              {permissions.includes('preferences.edit') && (
                <Box>
                  <Text>患者默认字号（设备可单独调整）</Text>
                  {['normal', 'large', 'extra-large'].map((value, i) => (
                    <Button
                      key={value}
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await engine.current.edit('preference', 'fontSize', {
                            value
                          });
                          await engine.current.sync();
                        })
                      }
                    >
                      {['标准', '大号', '特大'][i]}
                    </Button>
                  ))}
                  <Text>患者默认每行图卡数</Text>
                  {[2, 3, 4].map(value => (
                    <Button
                      key={value}
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await engine.current.edit(
                            'preference',
                            'cardDensity',
                            { value }
                          );
                          await engine.current.sync();
                        })
                      }
                    >
                      {value} 张
                    </Button>
                  ))}
                </Box>
              )}
              <Box>
                <Text>收藏与家庭共享</Text>
                <Input
                  value={favoriteText}
                  placeholder="收藏内容或修改后的文字"
                  onValue={setFavoriteText}
                />
                {data.owner && (
                  <Button onClick={() => setIncludeOriginal(!includeOriginal)}>
                    {includeOriginal
                      ? '修改范围：共享内容及对应成员原收藏'
                      : '修改范围：仅家庭共享内容'}
                  </Button>
                )}
                {resources
                  .filter(r =>
                    ['favorite', 'personalFavorite'].includes(r.kind)
                  )
                  .map(item => (
                    <Box key={`${item.kind}:${item.id}`}>
                      <Text>
                        {item.kind === 'personalFavorite'
                          ? '我的收藏'
                          : '家庭收藏'}
                        ：{item.value.sentence}
                      </Text>
                      <Button
                        onClick={() => setFavoriteText(item.value.sentence)}
                      >
                        编辑此内容
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() => run(() => updateFavorite(item, 'put'))}
                      >
                        保存修改
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            if (await runtime.confirm('删除此收藏？'))
                              await updateFavorite(item, 'delete');
                          })
                        }
                      >
                        删除
                      </Button>
                      {item.kind === 'personalFavorite' && (
                        <Button
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await request(
                                `/care/profiles/${active.id}/commands`,
                                'POST',
                                {
                                  action: 'shareFavorite',
                                  operationId: await runtime.newId(),
                                  sourceId: item.id,
                                  sourceVersion: item.version,
                                  resourceId: await runtime.newId()
                                }
                              );
                              await engine.current.sync();
                            })
                          }
                        >
                          共享给当前家庭
                        </Button>
                      )}
                    </Box>
                  ))}
              </Box>
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
              {runtime.saveArchive && !data?.locked && (
                <Box>
                  <Text>
                    换设备备份密码（至少12个字符，仅用于本次加密或解密）
                  </Text>
                  <Input
                    type="password"
                    value={archivePassword}
                    onValue={setArchivePassword}
                  />
                  <Button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const bytes = await exportCareDeviceArchive(
                          { profileId: active.id, familyId: active.familyId },
                          engine.current.archive()
                        );
                        const encrypted = await encryptPrivateArchive({
                          data: bytes,
                          passphrase: archivePassword,
                          randomBytes: runtime.randomBytes
                        });
                        await runtime.saveArchive(encrypted);
                        setArchivePassword('');
                      })
                    }
                  >
                    加密导出到另一设备
                  </Button>
                </Box>
              )}
              {!data?.locked && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const bytes = await runtime.chooseArchive();
                      if (!bytes) return;
                      const preview = await previewCareArchive(
                        bytes,
                        {
                          profileId: active.id,
                          familyId: active.familyId
                        },
                        archivePassword
                      );
                      setArchivePassword('');
                      if (
                        !(await runtime.confirm(
                          `恢复「${active.name}」的换设备备份：${
                            preview.boardCount
                          }个图板、${preview.tileCount}张图卡。${
                            preview.restore
                              ? '保留资源标识与待同步修改。'
                              : '这是旧格式，请确认来源确实为同一患者；不创建新的账号或授权。'
                          }原资料保留。`
                        ))
                      )
                        return;
                      await engine.current.importPreview(preview);
                      await engine.current.sync();
                    })
                  }
                >
                  从同一患者的备份恢复
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
              {(data.originalUpdates || []).map(job => (
                <Box key={job.operationId}>
                  <Text>
                    {job.sharedVersion
                      ? '共享内容已保存；成员原收藏'
                      : '共享内容和原收藏'}
                    {job.error ? '更新未完成，需要处理' : '等待同步'}
                  </Text>
                  {job.error && (
                    <>
                      <Text>
                        原收藏当前内容：
                        {job.current?.value?.sentence || '不可读取或已删除'}
                      </Text>
                      {job.current && !job.current.deleted && (
                        <Button
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await engine.current.resolveOriginal(
                                job.operationId,
                                'local'
                              );
                              await engine.current.sync();
                            })
                          }
                        >
                          确认用本次修改更新原收藏
                        </Button>
                      )}
                      <Button
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            engine.current.resolveOriginal(
                              job.operationId,
                              'server'
                            )
                          )
                        }
                      >
                        保留原收藏当前版本
                      </Button>
                    </>
                  )}
                </Box>
              ))}
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
                      {data.owner && member !== identity.id && (
                        <Button
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              if (
                                !(await runtime.confirm(
                                  '将整个家庭的管理员权限交给此成员？付款账号不会因此改变。'
                                ))
                              )
                                return;
                              await request(
                                `/care/profiles/${active.id}/administrator`,
                                'POST',
                                { member, operationId: await runtime.newId() }
                              );
                              await engine.current.sync();
                              setMembers({});
                            })
                          }
                        >
                          交接家庭管理员
                        </Button>
                      )}
                      {member !== identity.id &&
                        funding.some(
                          f => f.id === chosenFunding && f.canManage
                        ) && (
                          <Box>
                            <Input
                              value={delegationLimit}
                              onValue={setDelegationLimit}
                              placeholder="授权给此成员的每周 AI 限额"
                            />
                            <Button
                              disabled={busy}
                              onClick={() =>
                                run(async () => {
                                  const limit = Number(delegationLimit);
                                  if (!Number.isSafeInteger(limit) || limit < 1)
                                    throw new Error('请输入正整数限额');
                                  await request(
                                    `/care/funding/${chosenFunding}/delegation`,
                                    'POST',
                                    { member, limit, profileIds: [active.id] }
                                  );
                                })
                              }
                            >
                              授权此档案的 AI 用量
                            </Button>
                            <Button
                              disabled={busy}
                              onClick={() =>
                                run(async () => {
                                  await request(
                                    `/care/funding/${chosenFunding}/delegation`,
                                    'POST',
                                    {
                                      member,
                                      limit: 1,
                                      profileIds: [active.id],
                                      revoked: true
                                    }
                                  );
                                })
                              }
                            >
                              撤销此额度授权
                            </Button>
                          </Box>
                        )}
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
