import type { BoardDTO } from './dto';
export interface CareLocalMediaScope { accountId: string; familyId: string; profileId: string; }
export function preserveCareLocalTileMedia(cloudBoards: BoardDTO[], localBoards: BoardDTO[], localScope: CareLocalMediaScope, projectionScope: CareLocalMediaScope): BoardDTO[];
export function preserveCareLocalFavoriteMedia<T extends {id: string; output?: unknown[]}>(cloudItems: T[], localItems: T[], localScope: CareLocalMediaScope, projectionScope: CareLocalMediaScope): T[];
