import React, { Component, Fragment } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import shortid from 'shortid';
import { resize } from 'mathjs';
import { isEqual } from 'lodash';
import { injectIntl, intlShape } from 'react-intl';
import isMobile from 'ismobilejs';
import domtoimage from 'dom-to-image';
import CircularProgress from '@material-ui/core/CircularProgress';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import Slide from '@material-ui/core/Slide';
import {
  showNotification,
  hideNotification
} from '../Notifications/Notifications.actions';
import { deactivateScanner } from '../../providers/ScannerProvider/ScannerProvider.actions';
import {
  speak,
  cancelSpeech
} from '../../providers/SpeechProvider/SpeechProvider.actions';
import { getTilesListForNewOrder, moveOrderItem } from '../FixedGrid/utils';
import {
  addBoards,
  changeBoard,
  replaceBoard,
  previousBoard,
  toRootBoard,
  createBoard,
  updateBoard,
  switchBoard,
  createTile,
  deleteTiles,
  editTiles,
  focusTile,
  clickSymbol,
  changeOutput,
  historyRemoveBoard,
  updateApiObjects,
  updateApiObjectsNoChild,
  downloadImages,
  createApiBoard,
  upsertApiBoard,
  changeDefaultBoard,
  setIsSaving
} from './Board.actions';
import {
  verifyAndAddBoardCommunicator,
  verifyAndUpsertCommunicator
} from '../Communicator/Communicator.actions';
import { disableTour, setUnauthEditModalDismissed } from '../App/App.actions';
import { isLogged, isUnauthEditModalDismissed } from '../App/App.selectors';
import { showPremiumRequired } from '../../providers/SubscriptionProvider/SubscriptionProvider.actions';
import { isSubscriptionRequired } from '../../providers/SubscriptionProvider/SubscriptionProvider.selectors';
import UnauthenticatedEditModal from '../LoggedInFeature/UnauthenticatedEditModal';
import TileEditor from './TileEditor';
import messages from './Board.messages';
import Board from './Board.component';
import API from '../../api';
import {
  SCANNING_METHOD_AUTOMATIC,
  SCANNING_METHOD_MANUAL
} from '../Settings/Scanning/Scanning.constants';
import { NOTIFICATION_DELAY } from '../Notifications/Notifications.constants';
import { EMPTY_VOICES } from '../../providers/SpeechProvider/SpeechProvider.constants';
import { DEFAULT_ROWS_NUMBER, DEFAULT_COLUMNS_NUMBER } from './Board.constants';
import { getVisibleBoards } from './Board.selectors';
import PremiumFeature from '../PremiumFeature';
import {
  IS_BROWSING_FROM_APPLE_TOUCH,
  IS_BROWSING_FROM_SAFARI
} from '../../constants';
import LoadingIcon from '../UI/LoadingIcon';
import PinDialog from '../UI/PinDialog';
import { resolveTileLabel } from '../../helpers';
import {
  getCommunicationStorageScopeKey,
  loadPersonalImageRuntime
} from '../../common/communicationSupport/localData';
import { createBrowserExpressionAudio } from '../../common/communicationSupport/browserExpressionAudio';
import { subscribeSpeechInterruption } from '../../providers/SpeechProvider/speechInterruption';
import { saveVerifiedBoards } from '../../common/communicationSupport/verifiedBoardPersistence';
import { getGalleryTileUndo } from '../../common/communicationSupport/webGalleryTileUndo';
import GalleryTileUndoControl from './CommunicationSupport/GalleryTileUndoControl.component';
import { currentImageOperationEpoch } from '../../common/communicationSupport/imageOperationEpoch';
//import { isAndroid } from '../../cordova-util';

const ogv = require('ogv');
ogv.OGVLoader.base = process.env.PUBLIC_URL + '/ogv';

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export class BoardContainer extends Component {
  static propTypes = {
    /**
     * @ignore
     */
    intl: intlShape.isRequired,
    /**
     * Board history navigation stack
     */
    navHistory: PropTypes.arrayOf(PropTypes.string),
    /**
     * Board to display
     */
    board: PropTypes.shape({
      id: PropTypes.string,
      name: PropTypes.string,
      tiles: PropTypes.arrayOf(PropTypes.object)
    }),
    /**
     * Board output
     */
    output: PropTypes.arrayOf(
      PropTypes.shape({
        label: PropTypes.string,
        image: PropTypes.string,
        vocalization: PropTypes.string
      })
    ),
    /**
     * Add boards from API
     */
    addBoards: PropTypes.func,
    /**
     * Load board
     */
    changeBoard: PropTypes.func,
    /**
     * Load previous board
     */
    previousBoard: PropTypes.func,
    /**
     * Load root board
     */
    toRootBoard: PropTypes.func,
    historyRemoveBoard: PropTypes.func,
    /**
     * Create board
     */
    createBoard: PropTypes.func,
    updateBoard: PropTypes.func,
    saveVerifiedBoards: PropTypes.func,
    /**
     * Create tile
     */
    createTile: PropTypes.func,
    /**
     * Edit tiles
     */
    editTiles: PropTypes.func,
    /**
     * Delete tiles
     */
    deleteTiles: PropTypes.func,
    /**
     * Focuses a board tile
     */
    focusTile: PropTypes.func,
    /**
     * Change output
     */
    changeOutput: PropTypes.func,
    /**
     * Show notification
     */
    showNotification: PropTypes.func,
    /**
     * Deactivate Scanner
     */
    deactivateScanner: PropTypes.func,
    /**
     * Show display Settings
     */
    displaySettings: PropTypes.object,
    /**
     * Show navigationSettings
     */
    navigationSettings: PropTypes.object,
    /**
     * Show userData
     */
    userData: PropTypes.object,
    /**
     * Scanner Settings
     */
    scannerSettings: PropTypes.object,
    /**
     * Ensures ownership and adds a Board to the Active Communicator
     */
    verifyAndAddBoardCommunicator: PropTypes.func.isRequired,
    downloadImages: PropTypes.func,
    lang: PropTypes.string,
    isRootBoardTourEnabled: PropTypes.bool,
    isSymbolSearchTourEnabled: PropTypes.bool,
    disableTour: PropTypes.func,
    isLiveMode: PropTypes.bool,
    changeDefaultBoard: PropTypes.func,
    /**
     * Whether the unauthenticated edit modal has already been dismissed
     * for the current logged-out session
     */
    unauthEditModalDismissed: PropTypes.bool,
    /**
     * Persist that the unauthenticated edit modal was dismissed
     */
    setUnauthEditModalDismissed: PropTypes.func,
    demoMode: PropTypes.bool
  };

  state = {
    selectedTileIds: [],
    isSaving: false,
    isSelectAll: false,
    isSelecting: false,
    isLocked: true,
    tileEditorOpen: false,
    copyPublicBoard: false,
    blockedPrivateBoard: false,
    isFixedBoard: false,
    copiedTiles: [],
    isScroll: false,
    totalRows: null,
    isCbuilderBoard: false,
    pinDialogOpen: false,
    pinAttempt: '',
    pinError: false,
    showUnauthEditModal: false
  };

  pushBoardLocation = (path, state) => {
    if (!this.props.demoMode) {
      if (state === undefined) {
        this.props.history.push(path);
      } else {
        this.props.history.push(path, state);
      }
    }
  };

  replaceBoardLocation = (path, state) => {
    if (!this.props.demoMode) {
      if (state === undefined) {
        this.props.history.replace(path);
      } else {
        this.props.history.replace(path, state);
      }
    }
  };
  constructor(props) {
    super(props);
    this.boardRef = React.createRef();
  }

  async componentDidMount() {
    this.unsubscribeTileSpeech = subscribeSpeechInterruption(() => {
      // Another speech owner/cancel action already controls TTS. Release only
      // this recording so cleanup cannot cancel the newly requested speech.
      if (this.tilePlaybackActive) this.stopTileAudio();
    });
    const {
      match: {
        params: { id }
      }
    } = this.props;

    const {
      board,
      boards,
      communicator,
      changeBoard
      //downloadImages
    } = this.props;

    let boardExists = null;

    if (id && board && id === board.id) {
      //active board = requested board, use that board
      boardExists = boards.find(b => b.id === board.id);
    } else if (id && board && id !== board.id) {
      //active board != requested board, use requested if exist otherwise use active
      boardExists = boards.find(b => b.id === id);
      if (!boardExists) {
        try {
          const remoteBoard = await this.tryRemoteBoard(id);
          if (remoteBoard) {
            boardExists = remoteBoard;
          } else {
            boardExists = boards.find(b => b.id === board.id);
          }
        } catch (err) {
          boardExists = boards.find(b => b.id === board.id);
        }
      }
    } else if (id && !board) {
      //no active board but requested board, use requested
      boardExists = boards.find(b => b.id === id);
      if (!boardExists) {
        try {
          boardExists = await this.tryRemoteBoard(id);
        } catch (err) {
          boardExists = null;
        }
      }
    } else if (!id && !!board) {
      //no requested board, use active board
      boardExists = boards.find(b => b.id === board.id);
    } else {
      //neither requested nor active board, use communicator root board
      boardExists = boards.find(b => b.id === communicator.rootBoard);
    }

    if (!boardExists) {
      // try the root board
      boardExists = boards.find(b => b.id === communicator.rootBoard);
      if (!boardExists) {
        boardExists = boards.find(b => b.id !== '');
      }
    }
    const boardId = boardExists.id;
    changeBoard(boardId);
    const goTo = id ? boardId : `board/${boardId}`;
    this.replaceBoardLocation(goTo);

    //set board type
    this.setState({ isFixedBoard: !!boardExists.isFixed });

    // if (isAndroid()) downloadImages();
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (this.props.match.params.id !== nextProps.match.params.id) {
      const {
        navHistory,
        boards,
        changeBoard,
        previousBoard,
        historyRemoveBoard
      } = this.props;

      const boardExists = boards.find(b => b.id === nextProps.match.params.id);
      if (boardExists) {
        // Was a browser back action?
        if (
          navHistory.length >= 2 &&
          nextProps.match.params.id === navHistory[navHistory.length - 2]
        ) {
          changeBoard(nextProps.match.params.id);
          previousBoard();
          this.scrollToTop();
        }
      } else {
        // Was a browser back action?
        if (
          navHistory.length >= 2 &&
          nextProps.match.params.id === navHistory[navHistory.length - 2]
        ) {
          //board is invalid so we remove from navigation history
          historyRemoveBoard(nextProps.match.params.id);
        }
      }
    }
  }

  componentDidUpdate(prevProps) {
    const { board } = this.props;
    if (this.nativeSaveContextKey(prevProps) !== this.nativeSaveContextKey()) {
      this.nativeSelectionRevision += 1;
      if (this.state.tileEditorOpen) this.nativeEditorRevision += 1;
      this.nativeEditorBaseline = null;
      this.nativeEditorSavedRevision = null;
      this.nativePendingOperation = null;
      this.setState({ selectedTileIds: [], isSelectAll: false, isSelecting: false, tileEditorOpen: false });
    }
    if (
      this.tilePlaybackActive &&
      (this.tilePlaybackScope !== this.props.playbackScope ||
        this.tilePlaybackBoardId !== board?.id ||
        prevProps.isLiveMode !== this.props.isLiveMode)
    ) {
      this.stopTileAudio();
    }
    if (board && prevProps.board && board.isFixed !== prevProps.board.isFixed) {
      this.setState({ isFixedBoard: board.isFixed });
    }
  }

  componentWillUnmount() {
    if (this.nativeCloudRequestId && this.state.isSaving && this.props.setIsSaving) this.props.setIsSaving(false);
    this.nativeSaveDisposed = true;
    if (this.unsubscribeTileSpeech) this.unsubscribeTileSpeech();
    this.stopTileAudio();
  }

  toggleSelectMode() {
    this.nativeSelectionRevision += 1;
    this.setState(prevState => ({
      isSelecting: !prevState.isSelecting,
      isSelectAll: false,
      selectedTileIds: []
    }));
  }

  selectAllTiles() {
    this.nativeSelectionRevision += 1;
    const { board } = this.props;
    const allTileIds = board.tiles.map(tile => tile.id);

    this.setState({
      selectedTileIds: allTileIds
    });
  }

  selectTile(tileId) {
    this.nativeSelectionRevision += 1;
    this.setState({
      selectedTileIds: [...this.state.selectedTileIds, tileId]
    });
  }

  deselectTile(tileId) {
    this.nativeSelectionRevision += 1;
    const [...selectedTileIds] = this.state.selectedTileIds;
    const tileIndex = selectedTileIds.indexOf(tileId);
    selectedTileIds.splice(tileIndex, 1);
    this.setState({ selectedTileIds });
  }

  toggleTileSelect(tileId) {
    if (this.state.selectedTileIds.includes(tileId)) {
      this.deselectTile(tileId);
    } else {
      this.selectTile(tileId);
    }
  }

  async tryRemoteBoard(boardId) {
    const { userData, location } = this.props;

    const queryParams = new URLSearchParams(location.search);
    const isCbuilderBoard = queryParams.get('cbuilder');
    this.setState({ isCbuilderBoard });

    try {
      const remoteBoard = isCbuilderBoard
        ? await API.getCbuilderBoard(boardId)
        : await API.getBoard(boardId);

      //if requested board is from the user just add it
      if (
        'name' in userData &&
        'email' in userData &&
        remoteBoard.email === userData.email &&
        remoteBoard.author === userData.name
      ) {
        if (isCbuilderBoard) {
          this.setState({ copyPublicBoard: remoteBoard });
          return null;
        }
        return remoteBoard;
      } else {
        //if requested board is public, ask about copy it
        if (remoteBoard.isPublic) {
          this.setState({ copyPublicBoard: remoteBoard });
        } else {
          this.setState({ blockedPrivateBoard: true });
        }
        return null;
      }
    } catch (err) {
      if (
        isCbuilderBoard &&
        (err?.response?.status === 401 || err?.cause === 401)
      )
        this.setState({ blockedPrivateBoard: true });
      throw new Error('Cannot get the remote board');
    }
  }

  async captureBoardScreenshot() {
    const node = document.getElementById('BoardTilesContainer').firstChild;
    let dataURL = null;
    try {
      dataURL = await domtoimage.toPng(node);
    } catch (e) {}

    return dataURL;
  }

  tilePlaybackGeneration = 0;
  tilePlaybackActive = false;
  tileAudio = createBrowserExpressionAudio(source => {
    const safariNeedHelp =
      (IS_BROWSING_FROM_SAFARI || IS_BROWSING_FROM_APPLE_TOUCH) &&
      /\.ogg(?:[?#]|$)/i.test(source);
    return safariNeedHelp ? new ogv.OGVPlayer() : new Audio();
  });

  stopTileAudio = () => {
    this.tilePlaybackGeneration += 1;
    this.tilePlaybackActive = false;
    this.tileAudio.stop();
  };

  async playAudio(src, fallbackText = '', boardId = this.props.board?.id) {
    this.stopTileAudio();
    this.props.cancelSpeech();
    const generation = this.tilePlaybackGeneration;
    this.tilePlaybackScope = this.props.playbackScope;
    this.tilePlaybackBoardId = boardId;
    this.tilePlaybackActive = true;
    try {
      const result = await this.tileAudio.play(src);
      if (
        generation === this.tilePlaybackGeneration &&
        !result.ok && result.reason !== 'stopped' && fallbackText
      ) {
        // Reuse CBoard's selected vocalization; never infer another sentence.
        // A late failed recording must not speak after a newer selection/stop.
        this.tilePlaybackActive = false;
        try {
          const speaking = this.props.speak(fallbackText);
          if (speaking?.catch) await speaking.catch(() => {});
        } catch (_) {
          // The existing voice UI handles device availability. Keep selection.
        }
      }
      return result;
    } finally {
      if (generation === this.tilePlaybackGeneration) this.tilePlaybackActive = false;
    }
  }

  handleEditBoardTitle = name => {
    const { board, updateBoard } = this.props;
    const titledBoard = {
      ...board,
      name: name
    };
    const processedBoard = this.updateIfFeaturedBoard(titledBoard);
    updateBoard(processedBoard);
    this.saveApiBoardOperation(processedBoard);
  };

  saveApiBoardOperation = async board => {
    const {
      userData,
      communicator,
      replaceBoard,
      updateApiObjectsNoChild,
      lang,
      verifyAndUpsertCommunicator
    } = this.props;

    var createBoard = false;
    // Loggedin user?
    if ('name' in userData && 'email' in userData) {
      this.setState({ isSaving: true });
      this.props.setIsSaving(true);
      try {
        //prepare board
        let boardData = {
          ...board,
          author: userData.name,
          email: userData.email,
          hidden: false,
          locale: lang
        };
        //check if user has an own communicator
        if (communicator.email !== userData.email) {
          const communicatorData = {
            ...communicator,
            boards: boardData.id === 'root' ? ['root'] : ['root', boardData.id],
            rootBoard: 'root'
          };
          verifyAndUpsertCommunicator(communicatorData);
        }
        //check if we have to create a copy of the board
        if (boardData.id.length < 14) {
          createBoard = true;
          boardData = {
            ...boardData,
            isPublic: false
          };
        } else {
          //update the board
          updateBoard(boardData);
        }
        //api updates
        const boardId = await updateApiObjectsNoChild(
          boardData,

          createBoard
        );
        if (createBoard) {
          replaceBoard({ ...boardData }, { ...boardData, id: boardId });
        }
        this.historyReplaceBoardId(boardId);
      } catch (err) {
        console.log(err.message);
      } finally {
        this.setState({ isSaving: false });
        this.props.setIsSaving(false);
      }
    }
  };

  handleEditClick = () => {
    this.captureNativeEditor();
    this.setState({ tileEditorOpen: true });
  };

  handleBoardTypeChange = async () => {
    const { board, updateBoard } = this.props;

    this.setState({ isFixedBoard: !this.state.isFixedBoard });
    const newBoard = {
      ...board,
      isFixed: !this.state.isFixedBoard
    };
    if (!board.grid) {
      const defaultGrid = {
        rows: DEFAULT_ROWS_NUMBER,
        columns: DEFAULT_COLUMNS_NUMBER,
        order: this.getDefaultOrdering(board.tiles)
      };
      newBoard.grid = defaultGrid;
    }
    const processedBoard = this.updateIfFeaturedBoard(newBoard);
    await updateBoard(processedBoard);
    this.saveApiBoardOperation(processedBoard);
  };

  getDefaultOrdering = tiles => {
    let order = [];
    let tilesIndex = 0;
    for (var i = 0; i < DEFAULT_ROWS_NUMBER; i++) {
      order[i] = [];
      for (var j = 0; j < DEFAULT_COLUMNS_NUMBER; j++) {
        if (tilesIndex < tiles.length && tiles[tilesIndex]) {
          order[i][j] = tiles[tilesIndex].id;
        } else {
          order[i][j] = null;
        }
        tilesIndex++;
      }
    }
    return order;
  };

  handleTileEditorCancel = () => {
    if (this.nativeEditorSavedRevision === this.nativeEditorRevision) this.toggleSelectMode();
    this.nativeEditorSavedRevision = null;
    this.nativeEditorRevision += 1;
    this.nativeEditorBaseline = null;
    this.nativePendingOperation = null;
    this.setState({ tileEditorOpen: false });
  };

  nativeEditorRevision = 0;
  nativeEditorSavedRevision = null;
  nativeSelectionRevision = 0;
  nativeSaveDisposed = false;
  nativePendingOperation = null;
  nativeSavePromise = null;

  nativeSaveContextKey = (props = this.props) => JSON.stringify([
    getCommunicationStorageScopeKey(), currentImageOperationEpoch(),
    props.playbackScope, props.board?.id, props.communicator?.id,
    props.userData?.id || props.userData?._id || props.userData?.email
  ]);

  captureNativeEditor = () => {
    this.nativeEditorRevision += 1;
    this.nativeEditorSavedRevision = null;
    this.nativeEditorBaseline = this.props.board && JSON.parse(JSON.stringify(this.props.board));
    this.nativeEditorContext = this.nativeSaveContextKey();
    this.nativePendingOperation = null;
  };

  nativeSaveError = (message, code = 'BOARD_PERSISTENCE_FAILED') =>
    Object.assign(new Error(message), { code });

  nativeCloudScopeKey = () => JSON.stringify([
    getCommunicationStorageScopeKey(), currentImageOperationEpoch(),
    this.props.userData?.id || this.props.userData?._id || this.props.userData?.email,
    this.props.userData?.authToken
  ]);

  scheduleNativeCloudSync = operation => {
    // Finish the local receipt first. The legacy cloud flow can itself switch
    // the active communicator and must not turn that receipt into a failure.
    // Closing the editor is expected; changing scope or board contents is not.
    const withoutTimestamp = board => {
      const value = { ...board };
      delete value.lastEdited;
      return value;
    };
    const current = () => !this.nativeSaveDisposed &&
      this.nativeSaveContextKey() === operation.context &&
      operation.changes.every(({ board }) => {
        const stored = (this.props.boards || []).find(item => item.id === board.id);
        return stored && isEqual(withoutTimestamp(stored), withoutTimestamp(board));
      });
    const cloudScope = this.nativeCloudScopeKey();
    const editorRevision = this.nativeEditorRevision;
    const scopeGuard = () => !this.nativeSaveDisposed && this.nativeCloudScopeKey() === cloudScope &&
      this.nativeEditorRevision <= editorRevision + (operation.kind === 'delete' ? 0 : 1);
    setTimeout(() => {
      if (!current() || !scopeGuard()) return;
      const { kind, payload, desired } = operation;
      this.handleApiUpdates(
        kind === 'add' ? JSON.parse(JSON.stringify(payload)) : null,
        kind === 'delete' ? payload : null,
        kind === 'edit' ? JSON.parse(JSON.stringify(payload)) : null,
        desired && JSON.parse(JSON.stringify(desired)),
        { guard: current, scopeGuard, localCommitted: true,
          galleryUndoOperationId: operation.changes[0]?.galleryUndoOperationId }
      ).catch(() => {
        // This rejection concerns the existing cloud attempt only. The local
        // receipt was already confirmed and must not prompt a duplicate retry.
        // handleApiUpdates owns its request's saving indicator and cleanup.
      });
    }, 0);
  };

  // Keep the original native board and exact requested DTOs across an
  // unconfirmed write. Rebuilding from already-mutated Redux state would append
  // a duplicate card or silently accept a later edit as our own retry.
  saveNativeChange = (kind, value, { guard = () => true } = {}) => {
    let payload;
    try { payload = JSON.parse(JSON.stringify(value)); }
    catch (_) { return Promise.reject(this.nativeSaveError('图卡内容不能保存，请保留输入。')); }
    const context = this.nativeSaveContextKey();
    const revision = kind === 'delete' ? this.nativeSelectionRevision : this.nativeEditorRevision;
    const current = () => !this.nativeSaveDisposed && guard() &&
      this.nativeSaveContextKey() === context &&
      (kind === 'delete' ? this.nativeSelectionRevision : this.nativeEditorRevision) === revision;
    const assertCurrent = () => {
      if (!current()) throw this.nativeSaveError('当前操作已过期，未覆盖当前内容。', 'BOARD_SAVE_CANCELLED');
    };
    let operation = this.nativePendingOperation;
    const sameAttempt = operation && operation.kind === kind && operation.context === context &&
      operation.revision === revision && isEqual(operation.payload, payload);
    if (this.nativeSavePromise) {
      return sameAttempt ? this.nativeSavePromise : Promise.reject(this.nativeSaveError('正在确认保存，请稍后重试。'));
    }
    try {
      assertCurrent();
      if (kind !== 'delete' && this.nativeEditorBaseline && this.nativeEditorContext !== context)
        throw this.nativeSaveError('编辑范围已变化，请保留输入后重新打开图卡。', 'BOARD_SAVE_CANCELLED');
      if (!sameAttempt) {
        const board = JSON.parse(JSON.stringify(kind !== 'delete' && this.nativeEditorBaseline || this.props.board));
        if (!board || !Array.isArray(board.tiles)) throw this.nativeSaveError('当前图板不可用。');
        const userData = this.props.userData || {};
        const logged = 'name' in userData && 'email' in userData;
        const changes = [];
        let desired = null;
        if (kind === 'add') {
          if (!payload.id || board.tiles.some(tile => tile.id === payload.id))
            throw this.nativeSaveError('图卡身份已存在，请重新查看当前图板。', 'BOARD_SAVE_CONFLICT');
          if (payload.loadBoard && !payload.linkedBoard) {
            const child = {
              id: payload.loadBoard, name: payload.label, nameKey: payload.labelKey,
              hidden: false, tiles: [], isPublic: false,
              email: userData.email || board.email, author: userData.name || board.author,
              ...(logged ? { locale: this.props.lang, caption: payload.image } : {})
            };
            changes.push({ board: child, expectedBoard: null, create: true });
          }
          if (payload.type !== 'board') desired = { ...board, tiles: [...board.tiles, payload] };
        } else {
          const ids = kind === 'delete' ? payload : payload.map(tile => tile.id);
          if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !board.tiles.some(tile => tile.id === id)))
            throw this.nativeSaveError('所选图卡已变化，请重新查看当前图板。', 'BOARD_SAVE_CONFLICT');
          desired = { ...board, tiles: kind === 'delete'
            ? board.tiles.filter(tile => !ids.includes(tile.id))
            : board.tiles.map(tile => payload.find(edited => edited.id === tile.id) || tile) };
        }
        if (desired) {
          desired = this.updateIfFeaturedBoard(desired, false);
          changes.push({ board: desired, expectedBoard: board });
        }
        if (!changes.length) throw this.nativeSaveError('没有可保存的图板。');
        operation = { kind, context, revision, payload, changes, desired, logged };
        this.nativePendingOperation = operation;
      }
      if (!this.props.saveVerifiedBoards) throw this.nativeSaveError('本机保存服务未就绪，请保留输入。');
    } catch (error) { return Promise.reject(error); }

    let saving;
    const removedTile = kind === 'delete' && payload.length === 1 && operation.changes.length === 1
      && operation.changes[0].expectedBoard.tiles.find(tile => tile.id === payload[0]);
    const galleryDeleteTileId = removedTile && !removedTile.loadBoard && !removedTile.loadBoardId && removedTile.type !== 'board'
      ? removedTile.id : undefined;
    try { saving = this.props.saveVerifiedBoards(operation.changes, { guard: current, galleryDeleteTileId }); }
    catch (error) { return Promise.reject(error); }
    const pending = Promise.resolve(saving).then(result => {
      assertCurrent();
      if (result !== true) throw this.nativeSaveError('本机保存未确认，请保留输入后重试。');
      if (operation.logged) {
        if (operation.desired) operation.desired = operation.changes.find(change => change.board.id === operation.desired.id)?.board || operation.desired;
        this.scheduleNativeCloudSync(operation);
      }
      if (kind === 'delete') this.toggleSelectMode();
      if (kind === 'edit') this.nativeEditorSavedRevision = revision;
      if (kind === 'delete') this.props.showNotification(this.props.intl.formatMessage(messages.tilesDeleted));
      if (kind === 'add' && payload.type === 'board' && !operation.logged) {
        // Let the editor consume success before navigation changes its scope.
        setTimeout(() => {
          if (this.nativeSaveDisposed || this.nativeSaveContextKey() !== context ||
              this.nativeEditorRevision > revision + 1) return;
          this.props.switchBoard(payload.loadBoard);
          this.replaceBoardLocation(`/board/${payload.loadBoard}`, []);
        }, 0);
      }
      this.nativePendingOperation = null;
      // The editor closes after consuming this receipt. Preserve its source
      // props until then so our own success cannot invalidate its submit guard.
      if (kind === 'delete') this.nativeEditorBaseline = null;
      return true;
    });
    this.nativeSavePromise = pending;
    const clearPending = () => { if (this.nativeSavePromise === pending) this.nativeSavePromise = null; };
    pending.then(clearPending, clearPending);
    return pending;
  };

  handleEditTileEditorSubmit = (tiles, options) => this.saveNativeChange('edit', tiles, options);

  handleAddTileEditorSubmit = (tile, options) => this.saveNativeChange('add', tile, options);

  updateIfFeaturedBoard = (board, persist = true) => {
    const { userData, updateBoard, intl, lang } = this.props;
    let boardData = {
      ...board
    };
    if (
      'name' in userData &&
      'email' in userData &&
      board.email !== userData.email
    ) {
      boardData = {
        ...boardData,
        name:
          board.name ||
          this.nameFromKey(board) ||
          intl.formatMessage(messages.myBoardTitle),
        author: userData.name,
        email: userData.email,
        hidden: false,
        isPublic: false,
        locale: lang
      };
      if (persist) updateBoard(boardData);
    }
    return boardData;
  };

  nameFromKey = board => {
    let nameFromKey = undefined;
    if (board.nameKey) {
      const nameKeyArray = board.nameKey.split('.');
      nameFromKey = nameKeyArray[nameKeyArray.length - 1];
    }
    return nameFromKey;
  };

  handleAddClick = () => {
    this.captureNativeEditor();
    this.setState({
      tileEditorOpen: true,
      selectedTileIds: [],
      isSelecting: false
    });
  };

  handleAddRemoveRow = async (isAdd, isLeftOrTop) => {
    const { board, updateBoard } = this.props;
    if ((!isAdd && board.grid.rows > 1) || (isAdd && board.grid.rows < 12)) {
      let newOrder = [];
      const newRows = isAdd ? board.grid.rows + 1 : board.grid.rows - 1;
      if (Array.isArray(board.grid.order) && board.grid.order.length) {
        newOrder = resize(
          board.grid.order,
          [newRows, board.grid.columns],
          null
        );
      } else {
        newOrder = this.getDefaultOrdering(board.tiles);
      }
      const tilesForNewOrder = getTilesListForNewOrder({
        tileItems: board.tiles,
        order: newOrder
      });

      const newBoard = {
        ...board,
        tiles: tilesForNewOrder,
        grid: {
          ...board.grid,
          rows: newRows,
          order: newOrder
        }
      };
      const processedBoard = this.updateIfFeaturedBoard(newBoard);
      updateBoard(processedBoard);
      this.saveApiBoardOperation(processedBoard);
    }
  };

  handleAddRemoveColumn = async (isAdd, isLeftOrTop) => {
    const { board, updateBoard } = this.props;
    if (
      (!isAdd && board.grid.columns > 1) ||
      (isAdd && board.grid.columns < 12)
    ) {
      let newOrder = [];
      const newColumns = isAdd
        ? board.grid.columns + 1
        : board.grid.columns - 1;
      if (Array.isArray(board.grid.order) && board.grid.order.length) {
        newOrder = resize(
          board.grid.order,
          [board.grid.rows, newColumns],
          null
        );
      } else {
        newOrder = this.getDefaultOrdering(board.tiles);
      }
      const tilesForNewOrder = getTilesListForNewOrder({
        tileItems: board.tiles,
        order: newOrder
      });
      const newBoard = {
        ...board,
        tiles: tilesForNewOrder,
        grid: {
          ...board.grid,
          columns: newColumns,
          order: newOrder
        }
      };
      const processedBoard = this.updateIfFeaturedBoard(newBoard);
      updateBoard(processedBoard);
      this.saveApiBoardOperation(processedBoard);
    }
  };

  handleLayoutChange = (currentLayout, layouts) => {
    const { updateBoard, replaceBoard, board, navigationSettings } = this.props;
    currentLayout.sort((a, b) => {
      if (a.y === b.y) {
        return a.x - b.x;
      } else if (a.y > b.y) {
        return 1;
      }
      return -1;
    });

    const tilesIds = currentLayout.map(gridTile => gridTile.i);
    const tiles = tilesIds.map(t => {
      return board.tiles.find(tile => {
        if (!tile) {
          return false;
        }
        return tile.id === t || Number(tile.id) === Number(t);
      });
    });

    if (navigationSettings.bigScrollButtonsActive) {
      const cols =
        currentLayout.reduce(function(valorAnterior, item) {
          if (item.x > valorAnterior) return item.x;
          return valorAnterior;
        }, 0) + 1;
      const rows = 3;
      const isScroll = currentLayout.length / cols > rows ? true : false;
      const totalRows = Math.ceil(currentLayout.length / cols);
      this.setIsScroll(isScroll, totalRows);
    }

    const newBoard = { ...board, tiles };
    replaceBoard(board, newBoard);
    if (!isEqual(board.tiles, tiles)) {
      const processedBoard = this.updateIfFeaturedBoard(newBoard);
      updateBoard(processedBoard);
      this.saveApiBoardOperation(processedBoard);
    }
  };

  setIsScroll = (bool, totalRows = 0) => {
    this.setState({ isScroll: bool, totalRows: totalRows });
  };

  handleTileDrop = async (tile, position) => {
    const { board, updateBoard } = this.props;
    const newOrder = moveOrderItem(tile.id, position, board.grid.order);

    const newBoard = {
      ...board,
      grid: {
        ...board.grid,
        order: newOrder
      }
    };
    const processedBoard = this.updateIfFeaturedBoard(newBoard);
    updateBoard(processedBoard);
    this.saveApiBoardOperation(processedBoard);
  };

  handleLockClick = () => {
    const {
      showPremiumRequired,
      isSubscriptionRequired,
      setIsSaving
    } = this.props;
    const { pinLockEnabled, pinCode } = this.props.navigationSettings || {};

    const hasValidPinCode =
      typeof pinCode === 'string' && /^\d{4}$/.test(pinCode);

    if (pinLockEnabled && this.state.isLocked) {
      if (!this.state.pinDialogOpen) {
        this.setState({
          pinDialogOpen: true,
          pinAttempt: '',
          pinError: !hasValidPinCode
        });
      }
      return;
    }

    if (
      this.state.isLocked &&
      !this.props.isLogged &&
      !this.props.unauthEditModalDismissed
    ) {
      this.setState({ showUnauthEditModal: true });
      return;
    }

    this.setState(
      prevState => ({
        isLocked: !prevState.isLocked,
        isSaving: false,
        isSelecting: false,
        selectedTileIds: []
      }),
      () => {
        setIsSaving(false);
        if (!this.state.isLocked && isSubscriptionRequired) {
          showPremiumRequired({ showTryPeriodFinishedMessages: true });
        }
      }
    );
  };

  handleSelectClick = () => {
    this.toggleSelectMode();
  };

  handleSelectAllToggle = () => {
    this.nativeSelectionRevision += 1;
    if (this.state.isSelectAll) {
      this.setState({ selectedTileIds: [] });
    } else {
      this.selectAllTiles();
    }

    this.setState(prevState => ({
      isSelectAll: !prevState.isSelectAll
    }));
  };

  handleTileClick = clickedTile => {
    this.stopTileAudio();
    const tile = {
      ...clickedTile,
      label: resolveTileLabel(clickedTile, this.props.intl)
    };
    if (this.state.isSelecting) {
      this.toggleTileSelect(tile.id);
      return;
    }

    const {
      changeBoard,
      changeOutput,
      clickSymbol,
      speak,
      intl,
      boards,
      showNotification,
      navigationSettings,
      isLiveMode
    } = this.props;
    const hasAction = tile.action && tile.action.startsWith('+');

    const say = (boardId = this.props.board?.id) => {
      const toSpeak = !hasAction ? tile.vocalization || tile.label : null;
      if (tile.sound) {
        this.playAudio(tile.sound, toSpeak, boardId);
      } else {
        if (toSpeak) {
          speak(toSpeak);
        }
      }
    };

    if (tile.loadBoard) {
      const nextBoard =
        boards.find(b => b.id === tile.loadBoard) ||
        // If the board id is invalid, try falling back to a board
        // with the right name.
        boards.find(b => b.name === tile.label);
      if (nextBoard) {
        changeBoard(nextBoard.id);
        this.pushBoardLocation(nextBoard.id);
        if (navigationSettings.vocalizeFolders) {
          say(nextBoard.id);
        }
      } else {
        showNotification(intl.formatMessage(messages.boardMissed));
      }
    } else {
      clickSymbol(tile.label);
      if (!navigationSettings.quietBuilderMode) {
        say();
      }
      if (isLiveMode) {
        const liveTile = {
          backgroundColor: 'rgb(255, 241, 118)',
          id: shortid.generate(),
          image: '',
          label: '',
          labelKey: '',
          type: 'live'
        };
        changeOutput([...this.props.output, tile, liveTile]);
      } else {
        changeOutput([...this.props.output, tile]);
      }
    }
  };

  handleAddTile = (tile, boardId) => {
    const { intl, createTile, showNotification } = this.props;
    createTile(tile, boardId);
    showNotification(intl.formatMessage(messages.tilesCreated));
  };

  handleDeleteClick = (options) => this.saveNativeChange('delete', this.state.selectedTileIds, options);

  handleLockNotify = countdown => {
    const { intl, showNotification, hideNotification } = this.props;
    const { quickUnlockActive, pinLockEnabled, pinCode } =
      this.props.navigationSettings || {};

    if (quickUnlockActive) {
      hideNotification();
      this.handleLockClick();
      return;
    }

    if (pinLockEnabled && pinCode && pinCode.length === 4) {
      if (!this.state.pinDialogOpen) {
        hideNotification();
        this.setState({
          pinDialogOpen: true,
          pinAttempt: '',
          pinError: false
        });
      }
      return;
    }

    if (countdown > 3) {
      return;
    }

    if (!countdown) {
      hideNotification();
      return;
    }

    const clicksToUnlock = `${countdown} ${intl.formatMessage(
      messages.clicksToUnlock
    )}`;

    hideNotification();
    // HACK: refactor Notification container
    setTimeout(() => {
      showNotification(clicksToUnlock);
    });
  };

  handlePinDialogClose = () => {
    this.setState({
      pinDialogOpen: false,
      pinAttempt: '',
      pinError: false
    });
  };

  handlePinChange = value => {
    this.setState({
      pinAttempt: value,
      pinError: false
    });
  };

  handlePinSubmit = () => {
    const { showPremiumRequired, isSubscriptionRequired } = this.props;
    const { pinCode } = this.props.navigationSettings || {};
    if (this.state.pinAttempt === pinCode) {
      this.setState(
        {
          pinDialogOpen: false,
          pinAttempt: '',
          pinError: false,
          isLocked: false,
          isSaving: false,
          isSelecting: false,
          selectedTileIds: []
        },
        () => {
          if (isSubscriptionRequired) {
            showPremiumRequired({ showTryPeriodFinishedMessages: true });
          }
        }
      );
    } else {
      this.setState({
        pinError: true,
        pinAttempt: ''
      });
    }
  };

  handleScannerStrategyNotification = () => {
    const {
      scannerSettings: { strategy },
      showNotification,
      intl
    } = this.props;
    const messagesKeyMap = {
      [SCANNING_METHOD_MANUAL]: messages.scannerManualStrategy,
      [SCANNING_METHOD_AUTOMATIC]: messages.scannerAutomaticStrategy
    };
    showNotification(intl.formatMessage(messagesKeyMap[strategy]));

    if (!isMobile.any) {
      setTimeout(() => {
        showNotification(intl.formatMessage(messages.scannerHowToDeactivate));
      }, NOTIFICATION_DELAY);
    }
  };

  async uploadTileSound(tile) {
    if (tile && tile.sound && tile.sound.startsWith('data')) {
      const { userData } = this.props;
      try {
        var blob = new Blob([this.convertDataURIToBinary(tile.sound)], {
          type: 'audio/mp3; codecs=opus'
        });
        const audioUrl = await API.uploadFile(blob, userData.email + '.mp3');
        tile.sound = audioUrl;
      } catch (err) {
        console.log(err.message);
      }
    }
    return tile;
  }

  convertDataURIToBinary(dataURI) {
    var BASE64_MARKER = ';base64,';
    var base64Index = dataURI.indexOf(BASE64_MARKER) + BASE64_MARKER.length;
    var base64 = dataURI.substring(base64Index);
    var raw = window.atob(base64);
    var rawLength = raw.length;
    var array = new Uint8Array(new ArrayBuffer(rawLength));

    for (let i = 0; i < rawLength; i++) {
      array[i] = raw.charCodeAt(i);
    }
    return array;
  }

  handleApiUpdates = async (
    tile = null,
    deletedTilesiIds = null,
    editedTiles = null,
    processedBoard = null,
    nativeSave = null
  ) => {
    const {
      userData,
      communicator,
      board,
      intl,
      verifyAndAddBoardCommunicator,
      verifyAndUpsertCommunicator,
      updateApiObjectsNoChild,
      updateApiObjects,
      replaceBoard,
      updateBoard,
      switchBoard,
      lang
    } = this.props;
    const requestId = this.nativeCloudRequestId = (this.nativeCloudRequestId || 0) + 1;
    const scopeGuard = nativeSave && (nativeSave.scopeGuard || nativeSave.guard);
    const requestGuard = () => !this.nativeSaveDisposed && this.nativeCloudRequestId === requestId && scopeGuard();
    const finishSaving = () => {
      // Releasing this request's indicator is valid even when its scope expired.
      // The request token prevents an old completion from clearing a newer one.
      if (nativeSave && (this.nativeSaveDisposed || this.nativeCloudRequestId !== requestId)) return;
      this.setState({ isSaving: false });
      this.props.setIsSaving(false);
    };
    const canApplyCloudResult = () => !nativeSave ||
      (requestGuard() && (!nativeSave.currentAfterApi || nativeSave.currentAfterApi()));
    const cloudOptions = nativeSave ? {
      guard: requestGuard,
      galleryUndoOperationId: nativeSave.galleryUndoOperationId,
      ...(nativeSave.galleryUndoOperationId && communicator.email !== userData.email
        ? { ownedCommunicator: communicator } : {}),
      onGuard: current => { nativeSave.currentAfterApi = current; }
    } : undefined;
    const assertNativePending = () => {
      if (nativeSave && (!requestGuard() || !nativeSave.guard())) {
        finishSaving();
        throw this.nativeSaveError('当前操作已过期，云端同步未继续。', 'BOARD_SAVE_CANCELLED');
      }
    };
    // Loggedin user?
    if ('name' in userData && 'email' in userData) {
      assertNativePending();
      this.setState({
        isSaving: true
      });
      this.props.setIsSaving(true);

      if (tile && tile.sound && tile.sound.startsWith('data')) {
        tile = await this.uploadTileSound(tile);
      }
      if (editedTiles) {
        let _editedTiles = [];
        for (let _tile of editedTiles) {
          assertNativePending();
          _editedTiles.push(await this.uploadTileSound(_tile));
        }
        editedTiles = _editedTiles;
      }

      // A native local save can wait on sound uploads before the existing API
      // path starts. Do not reapply its captured board after the editor/scope
      // has been invalidated during that wait.
      assertNativePending();

      var createParentBoard = false;
      var createChildBoard = false;
      var childBoardData = null;

      let uTiles = [];
      if (deletedTilesiIds) {
        uTiles = board.tiles.filter(
          cTile => !deletedTilesiIds.includes(cTile.id)
        );
      }
      if (editedTiles) {
        uTiles = board.tiles.map(
          cTile => editedTiles.find(s => s.id === cTile.id) || cTile
        );
      }
      if (tile && tile.type !== 'board') {
        uTiles = board.tiles.find(t => t.id === tile.id)
          ? [...board.tiles]
          : [...board.tiles, tile];
      }
      if (tile && tile.type === 'board') {
        uTiles = [...board.tiles];
      }

      let parentBoardData = processedBoard
        ? processedBoard
        : {
            ...board,
            name:
              board.name ||
              this.nameFromKey(board) ||
              intl.formatMessage(messages.myBoardTitle),
            tiles: uTiles,
            author: userData.name,
            email: userData.email,
            hidden: false,
            locale: lang
          };
      //check if user has an own communicator
      const createsLinkedBoard = tile && tile.loadBoard && !tile.linkedBoard;
      if (createsLinkedBoard) {
        verifyAndAddBoardCommunicator(communicator, tile.loadBoard);
      } else if (communicator.email !== userData.email && !nativeSave?.galleryUndoOperationId) {
        verifyAndUpsertCommunicator(communicator);
      }
      //check for a new  own board
      if (tile && tile.loadBoard && !tile.linkedBoard) {
        const boardData = {
          id: tile.loadBoard,
          name: tile.label,
          nameKey: tile.labelKey,
          hidden: false,
          tiles: [],
          isPublic: false,
          author: userData.name,
          email: userData.email,
          locale: lang,
          caption: tile.image
        };
        childBoardData = { ...boardData };
        createChildBoard = true;
        if (!nativeSave?.localCommitted) updateBoard(childBoardData);
      }
      //check if we have to create a copy of the parent
      if (parentBoardData.id.length < 14) {
        createParentBoard = true;
        parentBoardData = {
          ...parentBoardData,
          isPublic: false
        };
      } else {
        //update the parent
        if (!nativeSave?.localCommitted) updateBoard(parentBoardData);
      }
      // Untill here all is with shorts ids
      //api updates
      if (tile && tile.type === 'board') {
        //child becomes parent
        updateApiObjectsNoChild(childBoardData, true, ...(cloudOptions ? [cloudOptions] : []))
          .then(parentBoardId => {
            if (!canApplyCloudResult()) { finishSaving(); return; }
            switchBoard(parentBoardId);
            this.replaceBoardLocation(`/board/${parentBoardId}`, []);
            finishSaving();
          })
          .catch(e => {
            finishSaving();
          });
      } else {
        if (!createChildBoard) {
          updateApiObjectsNoChild(parentBoardData, createParentBoard, ...(cloudOptions ? [cloudOptions] : []))
            .then(parentBoardId => {
              if (!canApplyCloudResult()) { finishSaving(); return; }
              if (createParentBoard && !nativeSave?.localCommitted) {
                replaceBoard(
                  { ...parentBoardData },
                  { ...parentBoardData, id: parentBoardId }
                );
              }
              this.historyReplaceBoardId(parentBoardId);
              finishSaving();
            })
            .catch(e => {
              finishSaving();
            });
        } else {
          updateApiObjects(childBoardData, parentBoardData, createParentBoard, ...(cloudOptions ? [cloudOptions] : []))
            .then(parentBoardId => {
              if (!canApplyCloudResult()) { finishSaving(); return; }
              if (createParentBoard && !nativeSave?.localCommitted) {
                /* Here the parentBoardData is not updated with the values
                that updatedApiObjects store on the API. Inside the boards are already updated
                an the value is not replaced because the oldboard Id was replaced on the updateApiObjects inside createApiBoardSuccess */
                replaceBoard(
                  { ...parentBoardData },
                  { ...parentBoardData, id: parentBoardId }
                );
              }
              this.historyReplaceBoardId(parentBoardId);
              finishSaving();
            })
            .catch(e => {
              finishSaving();
            });
        }
      }
    }
  };

  historyReplaceBoardId(boardId) {
    this.replaceBoardLocation(`/board/${boardId}`);
  }

  onRequestPreviousBoard = () => {
    this.props.previousBoard();
    this.scrollToTop();
  };

  onRequestToRootBoard = () => {
    this.props.toRootBoard();
    this.scrollToTop();
  };

  scrollToTop = () => {
    if (this.boardRef && !this.state.isSelecting) {
      const boardComponentRef = this.props.board.isFixed
        ? 'fixedBoardContainerRef'
        : 'boardContainerRef';
      this.boardRef.current[boardComponentRef].current.scrollTop = 0;
    }
  };

  handleCopyRemoteBoard = async () => {
    const { intl, showNotification, switchBoard, setIsSaving } = this.props;
    try {
      this.setState({
        isSaving: true
      });
      setIsSaving(true);
      const copiedBoard = await this.createBoardsRecursively(
        this.state.copyPublicBoard
      );
      if (!copiedBoard?.id) {
        throw new Error('Board not copied correctly');
      }
      switchBoard(copiedBoard.id);
      this.replaceBoardLocation(`/board/${copiedBoard.id}`, []);
      this.setState({
        copyPublicBoard: false,
        blockedPrivateBoard: false
      });
      showNotification(intl.formatMessage(messages.boardCopiedSuccessfully));
    } catch (err) {
      console.log(err.message);
      showNotification(intl.formatMessage(messages.boardCopyError));
      this.handleCloseDialog();
    }
    this.setState({
      isSaving: false
    });
    setIsSaving(false);
  };

  async createBoardsRecursively(board, records) {
    const {
      createBoard,
      communicator,
      userData,
      updateApiObjectsNoChild,
      boards,
      intl,
      verifyAndAddBoardCommunicator
    } = this.props;

    //prevent shit
    if (!board) {
      return null;
    }
    if (records) {
      //get the list of next boards in records
      let nextBoardsRecords = records.map(entry => entry.next);
      if (nextBoardsRecords.includes(board.id)) {
        return null;
      }
    }

    let newBoard = {
      ...board,
      isPublic: false,
      id: shortid.generate(),
      hidden: false,
      author: '',
      email: ''
    };
    if (!newBoard.name) {
      newBoard.name = newBoard.nameKey
        ? intl.formatMessage({ id: newBoard.nameKey })
        : intl.formatMessage(messages.noTitle);
    }
    if ('name' in userData && 'email' in userData) {
      newBoard = {
        ...newBoard,
        author: userData.name,
        email: userData.email
      };
    }
    createBoard(newBoard);
    if (!records) {
      verifyAndAddBoardCommunicator(communicator, newBoard.id);
    }

    if (!records) {
      records = [{ prev: board.id, next: newBoard.id }];
    } else {
      records.push({ prev: board.id, next: newBoard.id });
    }
    this.updateBoardReferences(board, newBoard, records);

    // Loggedin user?
    if ('name' in userData && 'email' in userData) {
      try {
        const boardId = await updateApiObjectsNoChild(newBoard, true);
        newBoard = {
          ...newBoard,
          id: boardId
        };
      } catch (err) {
        console.log(err.message);
      }
    }

    if (board.tiles.length < 1) {
      return newBoard;
    }

    //return condition
    for (const tile of board.tiles) {
      if (tile.loadBoard && !tile.linkedBoard) {
        try {
          const nextBoard = await API.getBoard(tile.loadBoard);
          await this.createBoardsRecursively(nextBoard, records);
        } catch (err) {
          if (!err.respose || err.response?.status === 404) {
            //look for this board in available boards
            const localBoard = boards.find(b => b.id === tile.loadBoard);
            if (localBoard) {
              await this.createBoardsRecursively(localBoard, records);
            }
          }
        }
      }
    }
    return newBoard;
  }

  updateBoardReferences(board, newBoard, records) {
    const { boards, updateBoard } = this.props;
    //get the list of prev boards in records, but remove the current board
    let prevBoardsRecords = records.map(entry => entry.prev);
    prevBoardsRecords = prevBoardsRecords.filter(id => id !== newBoard.id);
    //look for reference to the original board id
    boards.forEach(b => {
      b.tiles.forEach((tile, index) => {
        if (
          //general case: tile can contains reference to the board
          tile &&
          tile.loadBoard &&
          tile.loadBoard === board.id
        ) {
          b.tiles.splice(index, 1, {
            ...tile,
            loadBoard: newBoard.id
          });
          try {
            updateBoard(b);
          } catch (err) {
            console.log(err.message);
          }
        }
        if (
          //special case: tile can contains reference to a prev board in records!
          tile &&
          tile.loadBoard &&
          prevBoardsRecords.includes(tile.loadBoard)
        ) {
          const el = records.find(e => e.prev === tile.loadBoard);
          b.tiles.splice(index, 1, {
            ...tile,
            loadBoard: el.next
          });
          try {
            updateBoard(b);
          } catch (err) {
            console.log(err.message);
          }
        }
      });
    });
  }

  handleCloseDialog = (event, reason) => {
    const { isSaving } = this.state;
    if (isSaving) return;
    this.setState({
      copyPublicBoard: false,
      blockedPrivateBoard: false,
      isCbuilderBoard: false
    });
  };

  publishBoard = () => {
    const { board, updateBoard } = this.props;
    const newBoard = {
      ...board,
      isPublic: !board.isPublic
    };
    const processedBoard = this.updateIfFeaturedBoard(newBoard);
    updateBoard(processedBoard);
    this.saveApiBoardOperation(processedBoard);
  };

  handleCopyTiles = () => {
    const { intl, showNotification } = this.props;
    const copiedTiles = this.selectedTiles();
    this.setState({
      copiedTiles: copiedTiles
    });
    showNotification(intl.formatMessage(messages.tilesCopiedSuccessfully));
  };

  handlePasteTiles = async () => {
    const {
      board,
      intl,
      createTile,
      showNotification,
      setIsSaving
    } = this.props;
    try {
      this.setState({ isSaving: true });
      setIsSaving(true);
      for await (const tile of this.state.copiedTiles) {
        const newTile = {
          ...tile,
          id: shortid.generate()
        };
        if (tile.loadBoard) {
          createTile(newTile, board.id);
          await this.pasteBoardsRecursively(newTile, board.id, tile.loadBoard);
        } else {
          await this.handleAddTileEditorSubmit(newTile);
        }
      }
      showNotification(intl.formatMessage(messages.tilesPastedSuccessfully));
    } catch (err) {
      showNotification(intl.formatMessage(messages.tilesPastedError));
      console.error(err.message);
    } finally {
      this.setState({ isSaving: false });
      setIsSaving(false);
    }
  };

  async pasteBoardsRecursively(folderTile, parentBoardId, firstPastedFolderId) {
    const {
      createBoard,
      userData,
      updateBoard,
      createApiBoard,
      boards,
      intl
    } = this.props;

    //prevent shit
    if (!folderTile || !folderTile.loadBoard) {
      return;
    }

    let newBoard = {
      ...boards.find(b => b.id === folderTile.loadBoard),
      isPublic: false,
      id: shortid.generate(),
      hidden: false,
      author: '',
      email: ''
    };

    const tilesWithFatherRemoved = newBoard.tiles?.reduce((newTiles, tile) => {
      if (firstPastedFolderId !== tile.loadBoard) newTiles.push(tile);
      return newTiles;
    }, []);

    newBoard.tiles = tilesWithFatherRemoved;

    if (!newBoard.name) {
      newBoard.name = newBoard.nameKey
        ? intl.formatMessage({ id: newBoard.nameKey })
        : intl.formatMessage(messages.noTitle);
    }
    if ('name' in userData && 'email' in userData) {
      newBoard = {
        ...newBoard,
        author: userData.name,
        email: userData.email
      };
    }
    // Prevent creating a board without the tiles property
    if (newBoard.tiles) createBoard(newBoard);
    // Loggedin user?
    if ('name' in userData && 'email' in userData) {
      try {
        newBoard = await createApiBoard(newBoard, newBoard.id);
      } catch (err) {
        console.error(err.message);
      }
    }
    const parentBoard = boards.find(b => b.id === parentBoardId);
    const newTiles = parentBoard.tiles.map(tile =>
      tile && tile.id === folderTile.id
        ? { ...tile, loadBoard: newBoard.id }
        : tile
    );
    const boardData = { ...parentBoard, tiles: newTiles };
    updateBoard(boardData);
    // Loggedin user?
    if ('name' in userData && 'email' in userData) {
      try {
        let newParentBoard = {
          ...boardData,
          hidden: false,
          author: userData.name,
          email: userData.email
        };
        if (!newParentBoard.name) {
          newParentBoard.name = newParentBoard.nameKey
            ? intl.formatMessage({ id: newParentBoard.nameKey })
            : intl.formatMessage(messages.noTitle);
        }
        await this.handleApiUpdates('', '', '', newParentBoard);
      } catch (err) {
        console.error(err.message);
      }
    }

    //return condition
    for await (const tile of newBoard.tiles) {
      if (tile && tile.loadBoard && !tile.linkedBoard) {
        //look for this board in available boards
        const newBoardToCopy = boards.find(b => b.id === tile.loadBoard);
        if (newBoardToCopy) {
          await this.pasteBoardsRecursively(
            tile,
            newBoard.id,
            firstPastedFolderId
          );
        }
      }
    }
    return;
  }

  selectedTiles = (board = this.props.board) => (this.state.selectedTileIds || [])
    .map(id => board?.tiles?.find(tile => tile.id === id))
    .filter(Boolean);

  handleAddApiBoard = async boardId => {
    if (!this.props.boards.find(board => board.id === boardId)) {
      try {
        const board = await API.getBoard(boardId);
        this.props.addBoards([board]);
      } catch (err) {
        console.log(err.message);
      }
    }
  };

  render() {
    const {
      navHistory,
      board,
      focusTile,
      isPremiumRequiredModalOpen,
      improvedPhrase,
      speak
    } = this.props;
    const { isCbuilderBoard } = this.state;

    if (!this.props.board) {
      return (
        <div className="Board__loading">
          <CircularProgress size={60} thickness={5} color="inherit" />
        </div>
      );
    }

    const disableBackButton = navHistory.length === 1;
    const editorBoard = this.nativeEditorBaseline && this.nativeEditorContext !== this.nativeSaveContextKey()
      ? null : this.nativeEditorBaseline?.id === board.id ? this.nativeEditorBaseline : board;
    const editingTiles = this.state.tileEditorOpen
      ? this.selectedTiles(editorBoard)
      : [];

    return (
      <Fragment>
        <Board
          board={board}
          intl={this.props.intl}
          scannerSettings={this.props.scannerSettings}
          deactivateScanner={this.props.deactivateScanner}
          disableBackButton={disableBackButton}
          userData={this.props.userData}
          isLocked={this.state.isLocked}
          isSaving={this.state.isSaving}
          isSelecting={this.state.isSelecting}
          isSelectAll={this.state.isSelectAll}
          isFixedBoard={this.state.isFixedBoard}
          isRootBoardTourEnabled={this.props.isRootBoardTourEnabled}
          isSymbolSearchTourEnabled={this.props.isSymbolSearchTourEnabled}
          isUnlockedTourEnabled={this.props.isUnlockedTourEnabled}
          //updateBoard={this.handleUpdateBoard}
          onAddClick={this.handleAddClick}
          onDeleteClick={this.handleDeleteClick}
          deleteContextKey={this.nativeSaveContextKey()}
          galleryUndoControl={<GalleryTileUndoControl service={this.props.getGalleryTileUndo && this.props.getGalleryTileUndo()} />}
          onEditClick={this.handleEditClick}
          onSelectAllToggle={this.handleSelectAllToggle}
          onFocusTile={focusTile}
          onLockClick={this.handleLockClick}
          onLockNotify={this.handleLockNotify}
          onScannerActive={this.handleScannerStrategyNotification}
          onRequestPreviousBoard={this.onRequestPreviousBoard}
          onRequestToRootBoard={this.onRequestToRootBoard}
          onSelectClick={this.handleSelectClick}
          onTileClick={this.handleTileClick}
          onBoardTypeChange={this.handleBoardTypeChange}
          editBoardTitle={this.handleEditBoardTitle}
          selectedTileIds={this.state.selectedTileIds}
          displaySettings={this.props.displaySettings}
          navigationSettings={this.props.navigationSettings}
          navHistory={this.props.navHistory}
          publishBoard={this.publishBoard}
          showNotification={this.props.showNotification}
          emptyVoiceAlert={this.props.emptyVoiceAlert}
          offlineVoiceAlert={this.props.offlineVoiceAlert}
          onAddRemoveColumn={this.handleAddRemoveColumn}
          onAddRemoveRow={this.handleAddRemoveRow}
          onTileDrop={this.handleTileDrop}
          onLayoutChange={this.handleLayoutChange}
          disableTour={this.props.disableTour}
          onCopyTiles={this.handleCopyTiles}
          onPasteTiles={this.handlePasteTiles}
          copiedTiles={this.state.copiedTiles}
          setIsScroll={this.setIsScroll}
          isScroll={this.state.isScroll}
          totalRows={this.state.totalRows}
          ref={this.boardRef}
          changeDefaultBoard={this.props.changeDefaultBoard}
          improvedPhrase={improvedPhrase}
          speak={speak}
          personalImagePreferences={this.props.personalImagePreferences}
          personalImageIdentity={this.props.personalImageIdentity}
          demoMode={this.props.demoMode}
        />
        <Dialog
          open={!!this.state.copyPublicBoard && !isPremiumRequiredModalOpen}
          TransitionComponent={Transition}
          keepMounted
          onClose={this.handleCloseDialog}
          aria-labelledby="dialog-copy-title"
          aria-describedby="dialog-copy-desc"
        >
          <DialogTitle id="dialog-copy-board-title">
            {this.props.intl.formatMessage(
              isCbuilderBoard
                ? messages.importCbuilderBoardTitle
                : messages.copyPublicBoardTitle
            )}
          </DialogTitle>
          <DialogContent>
            <DialogContentText id="dialog-copy-board-desc">
              {this.props.intl.formatMessage(
                isCbuilderBoard
                  ? messages.importCbuilderBoardDesc
                  : messages.copyPublicBoardDesc
              )}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={this.handleCloseDialog}
              color="primary"
              disabled={this.state.isSaving}
            >
              {this.props.intl.formatMessage(messages.boardCopyCancel)}
            </Button>
            {isCbuilderBoard ? (
              <Button
                onClick={this.handleCopyRemoteBoard}
                color="primary"
                variant="contained"
                disabled={this.state.isSaving}
              >
                {this.state.isSaving ? (
                  <LoadingIcon />
                ) : (
                  this.props.intl.formatMessage(messages.boardCopyAccept)
                )}
              </Button>
            ) : (
              <PremiumFeature>
                <Button
                  onClick={this.handleCopyRemoteBoard}
                  color="primary"
                  variant="contained"
                  disabled={this.state.isSaving}
                >
                  {this.state.isSaving ? (
                    <LoadingIcon />
                  ) : (
                    this.props.intl.formatMessage(messages.boardCopyAccept)
                  )}
                </Button>
              </PremiumFeature>
            )}
          </DialogActions>
        </Dialog>
        <Dialog
          open={this.state.blockedPrivateBoard}
          TransitionComponent={Transition}
          keepMounted
          onClose={this.handleCloseDialog}
          aria-labelledby="dialog-blocked-title"
          aria-describedby="dialog-blocked-desc"
        >
          <DialogTitle id="dialog-blocked-board-title">
            {this.props.intl.formatMessage(
              isCbuilderBoard
                ? messages.importCbuilderBoardTitle
                : messages.blockedPrivateBoardTitle
            )}
          </DialogTitle>
          <DialogContent>
            <DialogContentText id="dialog-blocked-board-desc">
              {this.props.intl.formatMessage(
                isCbuilderBoard
                  ? messages.loginToImport
                  : messages.blockedPrivateBoardDesc
              )}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={this.handleCloseDialog}
              color="primary"
              variant="contained"
            >
              {this.props.intl.formatMessage(messages.boardCopyAccept)}
            </Button>
          </DialogActions>
        </Dialog>
        <TileEditor
          saveContextKey={this.nativeSaveContextKey()}
          editingTiles={editingTiles}
          open={this.state.tileEditorOpen}
          onClose={this.handleTileEditorCancel}
          onEditSubmit={this.handleEditTileEditorSubmit}
          onAddSubmit={this.handleAddTileEditorSubmit}
          boards={this.props.boards.filter(
            board =>
              board !== null &&
              board.id !== null &&
              this.props.communicator.boards.includes(board.id)
          )}
          userData={this.props.userData}
          folders={this.props.boards}
          onAddApiBoard={this.handleAddApiBoard}
          isSymbolSearchTourEnabled={this.props.isSymbolSearchTourEnabled}
          disableTour={this.props.disableTour}
        />
        <UnauthenticatedEditModal
          open={this.state.showUnauthEditModal}
          onClose={() => this.setState({ showUnauthEditModal: false })}
          onContinue={() => {
            const {
              showPremiumRequired,
              isSubscriptionRequired,
              setIsSaving,
              setUnauthEditModalDismissed
            } = this.props;
            setUnauthEditModalDismissed(true);
            this.setState(
              {
                showUnauthEditModal: false,
                isLocked: false,
                isSaving: false,
                isSelecting: false,
                selectedTileIds: []
              },
              () => {
                setIsSaving(false);
                if (isSubscriptionRequired) {
                  showPremiumRequired({ showTryPeriodFinishedMessages: true });
                }
              }
            );
          }}
        />
        <PinDialog
          open={this.state.pinDialogOpen}
          onClose={this.handlePinDialogClose}
          onSubmit={this.handlePinSubmit}
          error={this.state.pinError}
          value={this.state.pinAttempt}
          onChange={this.handlePinChange}
        />
      </Fragment>
    );
  }
}

export const mapStateToProps = state => {
  const {
    board,
    communicator,
    speech,
    scanner,
    app: {
      displaySettings,
      navigationSettings,
      userData,
      isConnected,
      liveHelp
    },
    language: { lang },
    subscription: { premiumRequiredModalState }
  } = state;
  const activeCommunicatorId = communicator.activeCommunicatorId;
  const currentCommunicator = communicator.communicators.find(
    communicator => communicator.id === activeCommunicatorId
  );
  const activeBoardId = board.activeBoardId;
  const emptyVoiceAlert =
    speech.voices.length > 0 && speech.options.voiceURI !== EMPTY_VOICES
      ? false
      : true;
  const offlineVoiceAlert = !isConnected && speech.options.isCloud;
  const personalImageRuntime = loadPersonalImageRuntime();
  return {
    communicator: currentCommunicator,
    board: getVisibleBoards(state).find(board => board.id === activeBoardId),
    boards: getVisibleBoards(state),
    output: board.output,
    playbackScope: JSON.stringify([
      getCommunicationStorageScopeKey(),
      userData && (userData.id || userData._id || userData.email),
      activeCommunicatorId
    ]),
    personalImagePreferences: personalImageRuntime.preferences,
    personalImageIdentity: personalImageRuntime.identity,
    isLiveMode: board.isLiveMode,
    scannerSettings: scanner,
    navHistory: board.navHistory,
    displaySettings,
    navigationSettings,
    userData,
    emptyVoiceAlert,
    lang,
    offlineVoiceAlert,
    isRootBoardTourEnabled: liveHelp.isRootBoardTourEnabled,
    isSymbolSearchTourEnabled: liveHelp.isSymbolSearchTourEnabled,
    isUnlockedTourEnabled: liveHelp.isUnlockedTourEnabled,
    isPremiumRequiredModalOpen: premiumRequiredModalState?.open,
    improvedPhrase: board.improvedPhrase,
    isSubscriptionRequired: isSubscriptionRequired(state),
    isLogged: isLogged(state),
    unauthEditModalDismissed: isUnauthEditModalDismissed(state)
  };
};

const mapDispatchToProps = {
  addBoards,
  changeBoard,
  replaceBoard,
  previousBoard,
  toRootBoard,
  historyRemoveBoard,
  createBoard,
  updateBoard,
  saveVerifiedBoards,
  getGalleryTileUndo,
  switchBoard,
  createTile,
  deleteTiles,
  editTiles,
  focusTile,
  clickSymbol,
  changeOutput,
  speak,
  cancelSpeech,
  showNotification,
  hideNotification,
  deactivateScanner,
  verifyAndAddBoardCommunicator,
  updateApiObjects,
  updateApiObjectsNoChild,
  downloadImages,
  disableTour,
  createApiBoard,
  upsertApiBoard,
  changeDefaultBoard,
  verifyAndUpsertCommunicator,
  showPremiumRequired,
  setIsSaving,
  setUnauthEditModalDismissed
};

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(injectIntl(BoardContainer));
