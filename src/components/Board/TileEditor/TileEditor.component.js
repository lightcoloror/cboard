import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { FormattedMessage, injectIntl, intlShape } from 'react-intl';
import shortid from 'shortid';
import FormControl from '@material-ui/core/FormControl';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Checkbox from '@material-ui/core/Checkbox';
import FormLabel from '@material-ui/core/FormLabel';
import Radio from '@material-ui/core/Radio';
import RadioGroup from '@material-ui/core/RadioGroup';
import Paper from '@material-ui/core/Paper';
import TextField from '@material-ui/core/TextField';
import MobileStepper from '@material-ui/core/MobileStepper';
import Button from '@material-ui/core/Button';
import SearchIcon from '@material-ui/icons/Search';
import KeyboardArrowRightIcon from '@material-ui/icons/KeyboardArrowRight';
import KeyboardArrowLeftIcon from '@material-ui/icons/KeyboardArrowLeft';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';
import InputLabel from '@material-ui/core/InputLabel';
import CircularProgress from '@material-ui/core/CircularProgress';

import messages from './TileEditor.messages';
import SymbolSearch from '../SymbolSearch';
import Symbol from '../Symbol';
import Tile from '../Tile';
import FullScreenDialog, {
  FullScreenDialogContent
} from '../../UI/FullScreenDialog';
import InputImage, { isAnimatedGifFile } from '../../UI/InputImage';
import IconButton from '../../UI/IconButton';
import ColorSelect from '../../UI/ColorSelect';
import VoiceRecorder from '../../VoiceRecorder';
import './TileEditor.css';
import EditIcon from '@material-ui/icons/Edit';
import VideocamIcon from '@material-ui/icons/Videocam';
import ImageEditor from '../ImageEditor';

import API from '../../../api';
import {
  COMMUNICATION_TILE_METADATA_KEYS,
  getCommunicationTileMetadata,
  setCommunicationTileMetadata
} from '../../../common/communicationSupport/tileMetadata';
import {
  applyPictogramMetadataSuggestionToTile,
  normalizePictogramMetadataSuggestion
} from '../../../common/communicationSupport/pictogramMetadataSuggestion';
import {
  COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES,
  getCommunicationEnhancementLimitScope
} from '../../../common/communicationSupport/communicationEnhancementError';
import {
  isAndroid,
  isCordova,
  requestCvaPermissions
} from '../../../cordova-util';
import { resolveBoardName } from '../../../helpers';
import PremiumFeature from '../../PremiumFeature';
import LoadBoardEditor from './LoadBoardEditor/LoadBoardEditor';
import { Typography } from '@material-ui/core';
import { LostedFolderForLoadBoardAlert } from './LostedFolderForLoadBoardAlert';
import { isLocalBoard } from '../Board.utils';
const NONE_VALUE = 'none';
export const MAX_TILE_VIDEO_SIZE_BYTES = 8 * 1024 * 1024;
export const MAX_TILE_VIDEO_DURATION_SECONDS = 10;
const TILE_VIDEO_TYPES = ['video/mp4', 'video/webm'];

export function validateTileVideoFile(file, duration) {
  if (!file || !TILE_VIDEO_TYPES.includes(String(file.type || ''))) {
    return 'format';
  }
  if (!Number.isFinite(file.size) || file.size <= 0) return 'empty';
  if (file.size > MAX_TILE_VIDEO_SIZE_BYTES) return 'size';
  if (!Number.isFinite(duration) || duration <= 0) return 'unreadable';
  if (duration > MAX_TILE_VIDEO_DURATION_SECONDS) return 'duration';
  return '';
}

function readTileVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const previewUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    const cleanup = () => URL.revokeObjectURL(previewUrl);
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const duration = Number(video.duration);
      cleanup();
      resolve(duration);
    };
    video.onerror = () => {
      cleanup();
      reject(new TypeError('Unable to read tile video metadata'));
    };
    video.src = previewUrl;
  });
}

export class TileEditor extends Component {
  static propTypes = {
    /**
     * @ignore
     */
    intl: intlShape.isRequired,
    /**
     * If true, TileEditor will be visibile
     */
    open: PropTypes.bool,
    /**
     * Callback fired on TileEditor request to be hidden
     */
    onClose: PropTypes.func.isRequired,
    /**
     * Tiles array to work on
     */
    editingTiles: PropTypes.array,
    /**
     * Callback fired when submitting edited board tiles
     */
    onEditSubmit: PropTypes.func.isRequired,
    /**
     * Callback fired when submitting a new board tile
     */
    onAddSubmit: PropTypes.func.isRequired,
    boards: PropTypes.array,
    userData: PropTypes.object,
    folders: PropTypes.array,
    onAddApiBoard: PropTypes.func,
    isSymbolSearchTourEnabled: PropTypes.bool,
    disableTour: PropTypes.func
  };

  static defaultProps = {
    editingTiles: [],
    openImageEditor: false
  };

  constructor(props) {
    super(props);

    this.defaultTileColors = {
      folder: '#bbdefb',
      button: '#fff176',
      board: '#999999'
    };

    this.defaultTile = {
      label: '',
      labelKey: '',
      vocalization: '',
      image: '',
      mediaType: 'image',
      video: '',
      loadBoard: '',
      sound: '',
      type: 'button',
      backgroundColor: this.defaultTileColors.button,
      linkedBoard: false
    };

    this.state = {
      activeStep: 0,
      editingTiles: props.editingTiles,
      isSymbolSearchOpen: false,
      autoFill: '',
      selectedBackgroundColor: '',
      tile: this.defaultTile,
      linkedBoard: '',
      imageUploadedData: [],
      videoUploadedData: [],
      videoUploadStatus: '',
      isEditImageBtnActive: false,
      isLoading: false,
      metadataSuggestionConsent: false,
      metadataSuggestionStatus: '',
      isMetadataSuggestionLoading: false,
      backgroundRemovalStatus: '',
      isBackgroundRemovalLoading: false,
      hasBackgroundRemovalOriginal: false
    };
    this.metadataSuggestionRequestId = 0;
    this.pendingMetadataSuggestionBlob = null;
    this.backgroundRemovalRequestId = 0;
    this.backgroundRemovalOriginal = null;
    this.backgroundRemovalPreviewUrl = '';
    this.videoPreviewUrl = '';

    this.defaultimageUploadedData = {
      isUploaded: false,
      fileName: '',
      blobHQ: null,
      blob: null
    };
    this.defaultVideoUploadedData = {
      isUploaded: false,
      fileName: '',
      blob: null
    };
  }

  UNSAFE_componentWillReceiveProps(props) {
    this.updateTileProperty('id', shortid.generate()); // todo not here
    this.setState({ editingTiles: props.editingTiles });
  }
  componentDidUpdate(prevProps) {
    if (this.props.open !== prevProps.open && this.props.open) {
      if (this.editingTile()) this.setLinkedBoard();
      if (isAndroid()) requestCvaPermissions();
    }
  }

  componentWillUnmount() {
    this.invalidateBackgroundRemoval();
    this.revokeVideoPreview();
  }

  editingTile() {
    return this.state.editingTiles[this.state.activeStep];
  }

  currentTileProp(prop) {
    const currentTile = this.editingTile();
    return currentTile ? currentTile[prop] : this.state.tile[prop];
  }

  updateEditingTile(id, property, value) {
    return state => {
      const editingTiles = state.editingTiles.map(b => {
        if (b.id !== id) {
          return b;
        }

        if (
          property === COMMUNICATION_TILE_METADATA_KEYS.synonyms ||
          property === COMMUNICATION_TILE_METADATA_KEYS.relatedTerms ||
          property === COMMUNICATION_TILE_METADATA_KEYS.excludeTokens ||
          property === COMMUNICATION_TILE_METADATA_KEYS.category
        ) {
          const metadata = getCommunicationTileMetadata(b);
          if (property === COMMUNICATION_TILE_METADATA_KEYS.synonyms) {
            metadata.synonyms = value;
          }
          if (property === COMMUNICATION_TILE_METADATA_KEYS.relatedTerms) {
            metadata.relatedTerms = value;
          }
          if (property === COMMUNICATION_TILE_METADATA_KEYS.excludeTokens) {
            metadata.excludeTokens = value;
          }
          if (property === COMMUNICATION_TILE_METADATA_KEYS.category) {
            metadata.category = value;
          }
          return setCommunicationTileMetadata(b, metadata);
        }

        return { ...b, ...{ [property]: value } };
      });
      return { ...state, editingTiles };
    };
  }

  updateNewTile(property, value) {
    return state => {
      let tile = { ...state.tile, [property]: value };

      if (
        property === COMMUNICATION_TILE_METADATA_KEYS.synonyms ||
        property === COMMUNICATION_TILE_METADATA_KEYS.relatedTerms ||
        property === COMMUNICATION_TILE_METADATA_KEYS.excludeTokens ||
        property === COMMUNICATION_TILE_METADATA_KEYS.category
      ) {
        const metadata = getCommunicationTileMetadata(tile);
        if (property === COMMUNICATION_TILE_METADATA_KEYS.synonyms) {
          metadata.synonyms = value;
        }
        if (property === COMMUNICATION_TILE_METADATA_KEYS.relatedTerms) {
          metadata.relatedTerms = value;
        }
        if (property === COMMUNICATION_TILE_METADATA_KEYS.excludeTokens) {
          metadata.excludeTokens = value;
        }
        if (property === COMMUNICATION_TILE_METADATA_KEYS.category) {
          metadata.category = value;
        }
        tile = setCommunicationTileMetadata(tile, metadata);
      }

      return { ...state, tile };
    };
  }

  updateTileProperty(property, value) {
    if (this.editingTile()) {
      this.setState(
        this.updateEditingTile(this.editingTile().id, property, value)
      );
    } else {
      this.setState(this.updateNewTile(property, value));
    }
  }

  handleSubmit = async () => {
    const { onEditSubmit, onAddSubmit } = this.props;
    if (this.editingTile()) {
      const { imageUploadedData, videoUploadedData } = this.state;
      if (imageUploadedData.length || videoUploadedData.length) {
        let tilesToAdd = JSON.parse(JSON.stringify(this.state.editingTiles));
        try {
          await Promise.all(
            tilesToAdd.map(async (tile, index) => {
              const imageData = imageUploadedData[index];
              const videoData = videoUploadedData[index];
              if (imageData && imageData.isUploaded) {
                tile.image = await this.updateTileImgURL(
                  imageData.blob,
                  imageData.fileName
                );
              }
              if (videoData && videoData.isUploaded) {
                tile.video = await this.updateTileVideoURL(
                  videoData.blob,
                  videoData.fileName
                );
              }
            })
          );
        } catch (error) {
          this.setState({
            videoUploadStatus: this.props.intl.formatMessage(
              messages.videoUploadFailed
            )
          });
          return;
        }
        onEditSubmit(tilesToAdd);
      } else {
        onEditSubmit(this.state.editingTiles);
      }
    } else {
      const tileToAdd = this.state.tile;
      const imageUploadedData = this.state.imageUploadedData[
        this.state.activeStep
      ];
      if (imageUploadedData && imageUploadedData.isUploaded) {
        tileToAdd.image = await this.updateTileImgURL(
          imageUploadedData.blob,
          imageUploadedData.fileName
        );
      }
      const videoUploadedData = this.state.videoUploadedData[
        this.state.activeStep
      ];
      if (videoUploadedData && videoUploadedData.isUploaded) {
        try {
          tileToAdd.video = await this.updateTileVideoURL(
            videoUploadedData.blob,
            videoUploadedData.fileName
          );
        } catch (error) {
          this.setState({
            videoUploadStatus: this.props.intl.formatMessage(
              messages.videoUploadFailed
            )
          });
          return;
        }
      }

      const selectedBackgroundColor = this.state.selectedBackgroundColor;
      if (selectedBackgroundColor) {
        tileToAdd.backgroundColor = selectedBackgroundColor;
      }
      onAddSubmit(tileToAdd);
    }

    this.metadataSuggestionRequestId += 1;
    this.pendingMetadataSuggestionBlob = null;
    this.invalidateBackgroundRemoval();
    this.revokeVideoPreview();
    this.setState({
      activeStep: 0,
      selectedBackgroundColor: '',
      tile: this.defaultTile,
      imageUploadedData: [],
      videoUploadedData: [],
      videoUploadStatus: '',
      isEditImageBtnActive: false,
      linkedBoard: '',
      metadataSuggestionConsent: false,
      metadataSuggestionStatus: '',
      isMetadataSuggestionLoading: false,
      backgroundRemovalStatus: '',
      isBackgroundRemovalLoading: false,
      hasBackgroundRemovalOriginal: false
    });
  };

  updateTileImgURL = async (blob, fileName) => {
    const { userData } = this.props;
    const user = userData.email ? userData : null;
    if (user) {
      try {
        return await API.uploadFile(blob, fileName);
      } catch (error) {
        return await this.blobToBase64(blob);
      }
    }
    return await this.blobToBase64(blob);
  };

  blobToBase64 = async blob => {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result);
      };
      reader.readAsDataURL(blob);
    });
  };

  handleCancel = () => {
    const { onClose } = this.props;
    this.metadataSuggestionRequestId += 1;
    this.pendingMetadataSuggestionBlob = null;
    this.invalidateBackgroundRemoval();
    this.revokeVideoPreview();
    this.setState({
      activeStep: 0,
      selectedBackgroundColor: '',
      tile: this.defaultTile,
      imageUploadedData: [],
      videoUploadedData: [],
      videoUploadStatus: '',
      isEditImageBtnActive: false,
      linkedBoard: '',
      metadataSuggestionConsent: false,
      metadataSuggestionStatus: '',
      isMetadataSuggestionLoading: false,
      backgroundRemovalStatus: '',
      isBackgroundRemovalLoading: false,
      hasBackgroundRemovalOriginal: false
    });
    onClose();
  };

  createimageUploadedDataArray() {
    if (this.editingTile()) {
      let imageUploadedDataArray = new Array(this.state.editingTiles.length);
      imageUploadedDataArray.fill(this.defaultimageUploadedData);
      this.setState({ imageUploadedData: imageUploadedDataArray });
    } else {
      this.setState({
        imageUploadedData: new Array(this.defaultimageUploadedData)
      });
    }
  }

  handleInputImageChange = async (blob, fileName, blobHQ) => {
    const isAnimatedGif = isAnimatedGifFile(blob, fileName);
    this.invalidateBackgroundRemoval();
    this.setState({
      backgroundRemovalStatus: '',
      isBackgroundRemovalLoading: false,
      hasBackgroundRemovalOriginal: false
    });
    if (!this.state.imageUploadedData.length) {
      this.createimageUploadedDataArray();
    }
    this.setimageUploadedData(true, fileName, blobHQ, blob);
    this.clearActiveVideoUpload();
    this.revokeVideoPreview();
    this.setState({ isEditImageBtnActive: !isAnimatedGif });
    const image = URL.createObjectURL(blob);
    this.updateTileProperty('image', image);
    this.updateTileProperty('mediaType', isAnimatedGif ? 'gif' : 'image');
    this.updateTileProperty('video', '');
    this.pendingMetadataSuggestionBlob = isAnimatedGif ? null : blob;
    if (isAnimatedGif) {
      this.setState({
        metadataSuggestionStatus: this.props.intl.formatMessage(
          messages.animatedImagePreserved
        )
      });
      return;
    }
    if (this.state.metadataSuggestionConsent) {
      await this.requestPictogramMetadataSuggestion(blob);
    } else if (!this.editingTile()) {
      this.setState({
        metadataSuggestionStatus: this.props.intl.formatMessage(
          messages.metadataSuggestionManual
        )
      });
    }
  };

  handleMetadataSuggestionConsentChange = event => {
    const consent = Boolean(event.target.checked);
    this.metadataSuggestionRequestId += 1;
    this.setState(
      {
        metadataSuggestionConsent: consent,
        metadataSuggestionStatus: '',
        isMetadataSuggestionLoading: false
      },
      () => {
        if (consent && this.pendingMetadataSuggestionBlob) {
          this.requestPictogramMetadataSuggestion(
            this.pendingMetadataSuggestionBlob
          );
        }
      }
    );
  };

  requestPictogramMetadataSuggestion = async blob => {
    const { intl, userData } = this.props;
    if (
      !this.state.metadataSuggestionConsent ||
      this.editingTile() ||
      this.currentTileProp('type') !== 'button'
    ) {
      return;
    }
    if (!(userData && userData.email)) {
      this.setState({
        metadataSuggestionStatus: intl.formatMessage(
          messages.metadataSuggestionLoginRequired
        )
      });
      return;
    }

    const requestId = ++this.metadataSuggestionRequestId;
    this.setState({
      isMetadataSuggestionLoading: true,
      metadataSuggestionStatus: intl.formatMessage(
        messages.metadataSuggestionLoading
      )
    });
    try {
      const response = await API.suggestCommunicationPictogramMetadata(blob);
      if (requestId !== this.metadataSuggestionRequestId) return;
      const suggestion = normalizePictogramMetadataSuggestion(response);
      if (!suggestion) {
        throw new Error('Invalid pictogram metadata suggestion');
      }
      this.setState(state => ({
        tile:
          state.tile.type === 'button'
            ? applyPictogramMetadataSuggestionToTile(state.tile, suggestion)
            : state.tile,
        isMetadataSuggestionLoading: false,
        metadataSuggestionStatus: intl.formatMessage(
          messages.metadataSuggestionApplied
        )
      }));
    } catch (error) {
      if (requestId !== this.metadataSuggestionRequestId) return;
      const limitScope = getCommunicationEnhancementLimitScope(error);
      const statusMessage =
        limitScope === COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES.month
          ? messages.metadataSuggestionMonthlyQuota
          : limitScope === COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES.minute
          ? messages.metadataSuggestionRateLimited
          : messages.metadataSuggestionUnavailable;
      this.setState({
        isMetadataSuggestionLoading: false,
        metadataSuggestionStatus: intl.formatMessage(statusMessage)
      });
    }
  };

  revokeBackgroundRemovalPreview = () => {
    if (
      this.backgroundRemovalPreviewUrl &&
      typeof URL.revokeObjectURL === 'function'
    ) {
      URL.revokeObjectURL(this.backgroundRemovalPreviewUrl);
    }
    this.backgroundRemovalPreviewUrl = '';
  };

  invalidateBackgroundRemoval = () => {
    this.backgroundRemovalRequestId += 1;
    this.backgroundRemovalOriginal = null;
    this.revokeBackgroundRemovalPreview();
  };

  handleBackgroundRemoval = async () => {
    const { intl, userData } = this.props;
    const imageData = this.state.imageUploadedData[this.state.activeStep];
    if (
      this.editingTile() ||
      this.currentTileProp('type') !== 'button' ||
      !imageData ||
      !imageData.isUploaded ||
      !imageData.blob ||
      isAnimatedGifFile(imageData.blob, imageData.fileName)
    ) {
      return;
    }
    if (!(userData && userData.email)) {
      this.setState({
        backgroundRemovalStatus: intl.formatMessage(
          messages.backgroundRemovalLoginRequired
        )
      });
      return;
    }
    if (
      !window.confirm(intl.formatMessage(messages.backgroundRemovalConsent))
    ) {
      return;
    }

    const requestId = ++this.backgroundRemovalRequestId;
    const original = {
      imageUploadedData: { ...imageData },
      image: this.currentTileProp('image')
    };
    this.setState({
      isBackgroundRemovalLoading: true,
      backgroundRemovalStatus: intl.formatMessage(
        messages.backgroundRemovalLoading
      )
    });

    try {
      const result = await API.removeCommunicationImageBackground(
        imageData.blob
      );
      if (requestId !== this.backgroundRemovalRequestId) return;

      this.backgroundRemovalOriginal = original;
      this.revokeBackgroundRemovalPreview();
      this.backgroundRemovalPreviewUrl = URL.createObjectURL(result.blob);
      this.setimageUploadedData(
        true,
        result.fileName,
        result.blob,
        result.blob
      );
      this.updateTileProperty('image', this.backgroundRemovalPreviewUrl);
      this.pendingMetadataSuggestionBlob = result.blob;
      this.setState({
        isBackgroundRemovalLoading: false,
        hasBackgroundRemovalOriginal: true,
        backgroundRemovalStatus: intl.formatMessage(
          messages.backgroundRemovalApplied
        )
      });
    } catch (error) {
      if (requestId !== this.backgroundRemovalRequestId) return;
      const limitScope = getCommunicationEnhancementLimitScope(error);
      const statusMessage =
        limitScope === COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES.month
          ? messages.backgroundRemovalMonthlyQuota
          : limitScope === COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES.minute
          ? messages.backgroundRemovalRateLimited
          : messages.backgroundRemovalUnavailable;
      this.setState({
        isBackgroundRemovalLoading: false,
        hasBackgroundRemovalOriginal: false,
        backgroundRemovalStatus: intl.formatMessage(statusMessage)
      });
    }
  };

  handleRestoreOriginalBackground = () => {
    const original = this.backgroundRemovalOriginal;
    if (!original) return;

    this.backgroundRemovalRequestId += 1;
    this.setimageUploadedData(
      original.imageUploadedData.isUploaded,
      original.imageUploadedData.fileName,
      original.imageUploadedData.blobHQ,
      original.imageUploadedData.blob
    );
    this.updateTileProperty('image', original.image);
    this.pendingMetadataSuggestionBlob = original.imageUploadedData.blob;
    this.backgroundRemovalOriginal = null;
    this.revokeBackgroundRemovalPreview();
    this.setState({
      isBackgroundRemovalLoading: false,
      hasBackgroundRemovalOriginal: false,
      backgroundRemovalStatus: this.props.intl.formatMessage(
        messages.backgroundRemovalRestored
      )
    });
  };

  updateTileVideoURL = async (blob, fileName) => {
    const { userData } = this.props;
    if (!(userData && userData.email)) {
      throw new Error('Authentication required for tile video upload');
    }
    return API.uploadFile(blob, fileName);
  };

  revokeVideoPreview = () => {
    if (this.videoPreviewUrl && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(this.videoPreviewUrl);
    }
    this.videoPreviewUrl = '';
  };

  setVideoUploadedData = (fileName, blob) => {
    this.setState(state => {
      const length = this.editingTile() ? state.editingTiles.length : 1;
      const videoUploadedData = state.videoUploadedData.length
        ? [...state.videoUploadedData]
        : Array.from({ length }, () => ({ ...this.defaultVideoUploadedData }));
      videoUploadedData[state.activeStep] = {
        isUploaded: true,
        fileName,
        blob
      };
      return { videoUploadedData };
    });
  };

  clearActiveVideoUpload = () => {
    this.setState(state => {
      if (!state.videoUploadedData.length) return null;
      const videoUploadedData = [...state.videoUploadedData];
      videoUploadedData[state.activeStep] = {
        ...this.defaultVideoUploadedData
      };
      return { videoUploadedData, videoUploadStatus: '' };
    });
  };

  handleInputVideoChange = async event => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (!(this.props.userData && this.props.userData.email)) {
      this.setState({
        videoUploadStatus: this.props.intl.formatMessage(
          messages.videoLoginRequired
        )
      });
      return;
    }

    let duration = 0;
    try {
      duration = await readTileVideoDuration(file);
    } catch (error) {
      duration = 0;
    }
    const validationError = validateTileVideoFile(file, duration);
    if (validationError) {
      const messageByError = {
        format: messages.videoFormatInvalid,
        empty: messages.videoUnreadable,
        size: messages.videoTooLarge,
        duration: messages.videoTooLong,
        unreadable: messages.videoUnreadable
      };
      this.setState({
        videoUploadStatus: this.props.intl.formatMessage(
          messageByError[validationError]
        )
      });
      return;
    }

    this.metadataSuggestionRequestId += 1;
    this.pendingMetadataSuggestionBlob = null;
    this.invalidateBackgroundRemoval();
    this.revokeVideoPreview();
    this.videoPreviewUrl = URL.createObjectURL(file);
    this.setVideoUploadedData(file.name, file);
    this.updateTileProperty('mediaType', 'video');
    this.updateTileProperty('video', this.videoPreviewUrl);
    this.setState({
      isEditImageBtnActive: false,
      metadataSuggestionStatus: '',
      backgroundRemovalStatus: '',
      videoUploadStatus: this.props.intl.formatMessage(messages.videoReady)
    });
  };

  handleLoadingStateChange = isLoading => {
    this.setState({ isLoading: isLoading });
  };

  setimageUploadedData = (isUploaded, fileName, blobHQ = null, blob = null) => {
    const { activeStep } = this.state;
    let imageUploadedData = this.state.imageUploadedData.map((item, indx) => {
      if (indx === activeStep) {
        return {
          ...item,
          isUploaded: isUploaded,
          fileName: fileName,
          blobHQ: blobHQ,
          blob: blob
        };
      } else {
        return item;
      }
    });
    this.setState({ imageUploadedData: imageUploadedData });
  };

  handleSymbolSearchChange = ({
    image,
    labelKey,
    label,
    keyPath,
    pictogramAttribution
  }) => {
    return new Promise(resolve => {
      this.invalidateBackgroundRemoval();
      this.setState({
        backgroundRemovalStatus: '',
        isBackgroundRemovalLoading: false,
        hasBackgroundRemovalOriginal: false
      });
      this.updateTileProperty('labelKey', labelKey);
      this.updateTileProperty('label', label);
      this.updateTileProperty('image', image);
      this.updateTileProperty('mediaType', 'image');
      this.updateTileProperty('video', '');
      this.clearActiveVideoUpload();
      this.revokeVideoPreview();
      this.updateTileProperty(
        'pictogramAttribution',
        pictogramAttribution || null
      );
      if (keyPath) this.updateTileProperty('keyPath', keyPath);
      if (this.state.imageUploadedData.length) {
        this.setimageUploadedData(false, '');
      }
      resolve();
    });
  };

  handleSymbolSearchClose = event => {
    const { imageUploadedData } = this.state;
    this.setState({ isSymbolSearchOpen: false });
    if (
      imageUploadedData.length &&
      imageUploadedData[this.state.activeStep].isUploaded
    ) {
      const activeImage = imageUploadedData[this.state.activeStep];
      this.setState({
        isEditImageBtnActive: !isAnimatedGifFile(
          activeImage.blob,
          activeImage.fileName
        )
      });
    }
  };

  handleLabelChange = event => {
    this.updateTileProperty('label', event.target.value);
    this.updateTileProperty('labelKey', '');
  };

  handleVocalizationChange = event => {
    this.updateTileProperty('vocalization', event.target.value);
  };
  handleCommunicationSynonymsChange = event => {
    this.updateTileProperty(
      COMMUNICATION_TILE_METADATA_KEYS.synonyms,
      event.target.value
    );
  };
  handleCommunicationRelatedTermsChange = event => {
    this.updateTileProperty(
      COMMUNICATION_TILE_METADATA_KEYS.relatedTerms,
      event.target.value
    );
  };
  handleCommunicationExcludeTokensChange = event => {
    this.updateTileProperty(
      COMMUNICATION_TILE_METADATA_KEYS.excludeTokens,
      event.target.value
    );
  };
  handleCommunicationCategoryChange = event => {
    this.updateTileProperty(
      COMMUNICATION_TILE_METADATA_KEYS.category,
      event.target.value
    );
  };
  handleSoundChange = sound => {
    this.updateTileProperty('sound', sound);
  };
  handleTypeChange = (event, type) => {
    let loadBoard = '';
    if (type === 'folder' || type === 'board') {
      loadBoard = shortid.generate();
    }
    let backgroundColor = this.defaultTileColors.button;
    if (type === 'board') {
      backgroundColor = this.defaultTileColors.board;
    }
    if (type === 'folder') {
      backgroundColor = this.defaultTileColors.folder;
    }
    const tile = {
      ...this.state.tile,
      linkedBoard: false,
      backgroundColor,
      loadBoard,
      type
    };
    this.setState({
      tile,
      linkedBoard: '',
      selectedBackgroundColor: backgroundColor
    });
  };

  handleBack = event => {
    this.setState({ activeStep: this.state.activeStep - 1 }, () => {
      this.setLinkedBoard();
    });
    this.setState({ selectedBackgroundColor: '' });
    this.setState({ isEditImageBtnActive: false });
  };

  handleNext = async event => {
    this.setState({ activeStep: this.state.activeStep + 1 }, () => {
      this.setLinkedBoard();
    });
    this.setState({ selectedBackgroundColor: '' });
    this.setState({ isEditImageBtnActive: false });
  };

  handleSearchClick = (event, currentLabel) => {
    this.setState({ isSymbolSearchOpen: true, autoFill: currentLabel || '' });
    this.setState({ isEditImageBtnActive: false });
  };

  getOriginalTileBackground() {
    const { editingTiles } = this.props;
    const { activeStep } = this.state;

    return (
      editingTiles?.[activeStep]?.backgroundColor || this.getDefaultColor()
    );
  }

  handleColorChange = event => {
    const color = event?.target?.value || '';

    this.setState({ selectedBackgroundColor: color });

    const backgroundColor =
      color ||
      (this.props.editingTiles.length
        ? this.getOriginalTileBackground()
        : this.getDefaultColor());

    this.updateTileProperty('backgroundColor', backgroundColor);
  };

  getDefaultColor = () => {
    if (this.currentTileProp('type') === 'folder') {
      return this.defaultTileColors.folder;
    }
    if (this.currentTileProp('type') === 'button') {
      return this.defaultTileColors.button;
    }
    if (this.currentTileProp('type') === 'board') {
      return this.defaultTileColors.board;
    }
  };

  handleBoardsChange = event => {
    const board = event ? event.target.value : '';
    this.setState({ linkedBoard: board });
    if (board && board !== NONE_VALUE) {
      this.updateTileProperty('linkedBoard', true);
      this.updateTileProperty('loadBoard', board.id);
    } else {
      this.updateTileProperty('linkedBoard', false);
      this.updateTileProperty('loadBoard', shortid.generate());
    }
  };

  handleLoadBoardChange = ({ boardId }) => {
    if (boardId) {
      this.props.onAddApiBoard(boardId);
      this.updateTileProperty('loadBoard', boardId);
      this.setLinkedBoard(boardId);
    }
  };

  handleOnClickImageEditor = () => {
    this.setState({ openImageEditor: true });
  };
  onImageEditorClose = () => {
    this.setState({ openImageEditor: false });
  };
  onImageEditorDone = blob => {
    this.invalidateBackgroundRemoval();
    this.setState({
      backgroundRemovalStatus: '',
      isBackgroundRemovalLoading: false,
      hasBackgroundRemovalOriginal: false
    });
    this.setState(prevState => {
      const newArray = [...prevState.imageUploadedData];
      newArray[this.state.activeStep].blob = blob;
      return { imageUploadedData: newArray };
    });
    const image = URL.createObjectURL(blob);
    this.updateTileProperty('image', image);
    this.updateTileProperty('mediaType', 'image');
    this.updateTileProperty('video', '');
    this.clearActiveVideoUpload();
    this.revokeVideoPreview();
  };

  setLinkedBoard = updatedLoadBoardId => {
    const loadBoard =
      updatedLoadBoardId ??
      (this.currentTileProp('linkedBoard') || this.editingTile()
        ? this.currentTileProp('loadBoard')
        : null);
    const linkedBoard =
      this.props.boards.find(board => board.id === loadBoard) || NONE_VALUE;
    this.setState({ linkedBoard: linkedBoard });
  };

  render() {
    const { open, intl, boards, folders } = this.props;
    const currentLabel = this.currentTileProp('labelKey')
      ? intl.formatMessage({ id: this.currentTileProp('labelKey') })
      : this.currentTileProp('label');
    const buttons = (
      <IconButton
        label={intl.formatMessage(messages.symbolSearch)}
        onClick={e => this.handleSearchClick(e, currentLabel)}
      >
        <SearchIcon />
      </IconButton>
    );

    const selectBoardElement = (
      <div style={{ marginTop: '16px' }}>
        <FormControl fullWidth>
          <InputLabel id="boards-input-label">
            {intl.formatMessage(messages.existingBoards)}
          </InputLabel>
          <Select
            labelId="boards-select-label"
            id="boards-select"
            autoWidth={true}
            value={this.state.linkedBoard}
            onChange={this.handleBoardsChange}
          >
            {!this.editingTile() && (
              <MenuItem value={NONE_VALUE}>
                <em>{intl.formatMessage(messages.none)}</em>
              </MenuItem>
            )}
            {boards.map(
              board =>
                !board.hidden && (
                  <MenuItem key={board.id} value={board}>
                    {board.name}
                  </MenuItem>
                )
            )}
          </Select>
        </FormControl>
      </div>
    );
    const tileInView = this.editingTile()
      ? this.editingTile()
      : this.state.tile;
    const communicationMetadata = getCommunicationTileMetadata(tileInView);
    const uploadedImageData = this.state.imageUploadedData[
      this.state.activeStep
    ];
    const isAnimatedImage = Boolean(
      uploadedImageData &&
        isAnimatedGifFile(uploadedImageData.blob, uploadedImageData.fileName)
    );
    const isVideo = tileInView.mediaType === 'video';

    const loadBoard = this.currentTileProp('loadBoard');
    const haveLoadBoard = loadBoard?.length > 0;

    const loadBoardData = haveLoadBoard
      ? folders?.find(({ id }) => id === loadBoard)
      : null;

    const loadBoardName =
      loadBoardData && resolveBoardName(loadBoardData, intl);
    const isLocalLoadBoard = loadBoard && isLocalBoard({ id: loadBoard });

    return (
      <div className="TileEditor">
        <FullScreenDialog
          disableSubmit={!currentLabel}
          buttons={buttons}
          open={open}
          title={
            <FormattedMessage
              {...(this.editingTile()
                ? messages.editTile
                : messages.createTile)}
            />
          }
          onClose={this.handleCancel}
          onSubmit={this.handleSubmit}
        >
          <Paper>
            <FullScreenDialogContent className="TileEditor__container">
              <div className="TileEditor__row">
                <div className="TileEditor__main-info">
                  <div className="TileEditor__picto-fields">
                    <div className="TileEditor__preview">
                      <Tile
                        backgroundColor={
                          this.state.selectedBackgroundColor ||
                          tileInView.backgroundColor
                        }
                        variant={
                          Boolean(tileInView.loadBoard) ? 'folder' : 'button'
                        }
                      >
                        {this.state.isLoading ? (
                          <CircularProgress />
                        ) : (
                          <Symbol
                            image={tileInView.image}
                            mediaType={tileInView.mediaType}
                            video={tileInView.video}
                            videoAutoPlay={tileInView.mediaType === 'video'}
                            videoControls={tileInView.mediaType === 'video'}
                            label={currentLabel}
                            keyPath={tileInView.keyPath}
                          />
                        )}
                      </Tile>
                    </div>
                    {this.state.isEditImageBtnActive &&
                      !isAnimatedImage &&
                      !isVideo && (
                        <React.Fragment>
                          <ImageEditor
                            intl={intl}
                            open={this.state.openImageEditor}
                            onImageEditorClose={this.onImageEditorClose}
                            onImageEditorDone={this.onImageEditorDone}
                            image={URL.createObjectURL(
                              this.state.imageUploadedData[
                                this.state.activeStep
                              ].blobHQ
                            )}
                          />
                          <Button
                            variant="contained"
                            color="secondary"
                            startIcon={<EditIcon />}
                            onClick={this.handleOnClickImageEditor}
                            style={{ marginBottom: '6px' }}
                          >
                            {intl.formatMessage(messages.editImage)}
                          </Button>
                        </React.Fragment>
                      )}
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<SearchIcon />}
                      onClick={e => this.handleSearchClick(e, currentLabel)}
                    >
                      {intl.formatMessage(messages.symbols)}
                    </Button>
                    <div className="TileEditor__input-image">
                      <InputImage
                        onChange={this.handleInputImageChange}
                        setIsLoadingImage={this.handleLoadingStateChange}
                      />
                    </div>
                    {this.currentTileProp('type') === 'button' && (
                      <div className="TileEditor__input-video">
                        <Button
                          component="label"
                          disabled={
                            !(this.props.userData && this.props.userData.email)
                          }
                          startIcon={<VideocamIcon />}
                          variant="outlined"
                        >
                          {intl.formatMessage(messages.chooseVideo)}
                          <input
                            accept="video/mp4,video/webm"
                            hidden
                            onChange={this.handleInputVideoChange}
                            type="file"
                          />
                        </Button>
                        <Typography variant="caption">
                          {intl.formatMessage(
                            this.props.userData && this.props.userData.email
                              ? messages.videoHelp
                              : messages.videoLoginRequired
                          )}
                        </Typography>
                        {this.state.videoUploadStatus && (
                          <Typography role="status" variant="body2">
                            {this.state.videoUploadStatus}
                          </Typography>
                        )}
                      </div>
                    )}
                    {!this.editingTile() &&
                      this.currentTileProp('type') === 'button' &&
                      uploadedImageData &&
                      !isAnimatedImage &&
                      !isVideo &&
                      uploadedImageData.isUploaded && (
                        <div className="TileEditor__background-removal">
                          <div className="TileEditor__background-removal-actions">
                            <Button
                              color="primary"
                              disabled={
                                this.state.isBackgroundRemovalLoading ||
                                this.state.hasBackgroundRemovalOriginal
                              }
                              onClick={this.handleBackgroundRemoval}
                              variant="outlined"
                            >
                              {intl.formatMessage(
                                messages.backgroundRemovalAction
                              )}
                            </Button>
                            {this.state.hasBackgroundRemovalOriginal && (
                              <Button
                                onClick={this.handleRestoreOriginalBackground}
                                variant="text"
                              >
                                {intl.formatMessage(
                                  messages.backgroundRemovalRestore
                                )}
                              </Button>
                            )}
                          </div>
                          <Typography variant="caption">
                            {intl.formatMessage(
                              messages.backgroundRemovalPrivacy
                            )}
                          </Typography>
                          {this.state.backgroundRemovalStatus && (
                            <Typography
                              className="TileEditor__background-removal-status"
                              role="status"
                              variant="body2"
                            >
                              {this.state.backgroundRemovalStatus}
                            </Typography>
                          )}
                          {this.state.isBackgroundRemovalLoading && (
                            <CircularProgress size={22} />
                          )}
                        </div>
                      )}
                    {!this.editingTile() &&
                      this.currentTileProp('type') === 'button' &&
                      !isVideo && (
                        <div className="TileEditor__metadata-suggestion">
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={this.state.metadataSuggestionConsent}
                                disabled={
                                  !(
                                    this.props.userData &&
                                    this.props.userData.email
                                  )
                                }
                                onChange={
                                  this.handleMetadataSuggestionConsentChange
                                }
                              />
                            }
                            label={intl.formatMessage(
                              messages.metadataSuggestionConsent
                            )}
                          />
                          <Typography variant="caption">
                            {intl.formatMessage(
                              this.props.userData && this.props.userData.email
                                ? messages.metadataSuggestionPrivacy
                                : messages.metadataSuggestionLoginRequired
                            )}
                          </Typography>
                          {this.state.metadataSuggestionStatus && (
                            <Typography
                              className="TileEditor__metadata-suggestion-status"
                              role="status"
                              variant="body2"
                            >
                              {this.state.metadataSuggestionStatus}
                            </Typography>
                          )}
                          {this.state.isMetadataSuggestionLoading && (
                            <CircularProgress size={22} />
                          )}
                        </div>
                      )}
                  </div>
                  <div className="TileEditor__form-fields">
                    <TextField
                      id="label"
                      label={
                        this.currentTileProp('type') === 'board'
                          ? intl.formatMessage(messages.boardName)
                          : intl.formatMessage(messages.label)
                      }
                      value={currentLabel}
                      onChange={this.handleLabelChange}
                      fullWidth
                      required
                    />

                    <TextField
                      multiline
                      id="vocalization"
                      disabled={this.currentTileProp('type') === 'board'}
                      label={intl.formatMessage(messages.vocalization)}
                      value={this.currentTileProp('vocalization') || ''}
                      onChange={this.handleVocalizationChange}
                      fullWidth
                    />
                    {this.currentTileProp('type') !== 'board' && (
                      <>
                        <TextField
                          multiline
                          id="communicationSynonyms"
                          label={intl.formatMessage(messages.matchingSynonyms)}
                          value={communicationMetadata.synonyms}
                          onChange={this.handleCommunicationSynonymsChange}
                          fullWidth
                          helperText={intl.formatMessage(
                            messages.matchingSynonymsHelper
                          )}
                        />
                        <TextField
                          multiline
                          id="communicationRelatedTerms"
                          label={intl.formatMessage(messages.relatedTerms)}
                          value={communicationMetadata.relatedTerms}
                          onChange={this.handleCommunicationRelatedTermsChange}
                          fullWidth
                          helperText={intl.formatMessage(
                            messages.relatedTermsHelper
                          )}
                        />
                        <TextField
                          multiline
                          id="communicationExcludeTokens"
                          label={intl.formatMessage(messages.excludeTokens)}
                          value={communicationMetadata.excludeTokens}
                          onChange={this.handleCommunicationExcludeTokensChange}
                          fullWidth
                          helperText={intl.formatMessage(
                            messages.excludeTokensHelper
                          )}
                        />
                        <TextField
                          id="communicationCategory"
                          label={intl.formatMessage(messages.semanticCategory)}
                          value={communicationMetadata.category}
                          onChange={this.handleCommunicationCategoryChange}
                          fullWidth
                          helperText={intl.formatMessage(
                            messages.semanticCategoryHelper
                          )}
                        />
                      </>
                    )}
                    {!this.editingTile() && (
                      <div className="TileEditor__radiogroup">
                        <FormControl fullWidth>
                          <FormLabel>
                            {intl.formatMessage(messages.type)}
                          </FormLabel>
                          <RadioGroup
                            row={true}
                            aria-label={intl.formatMessage(messages.type)}
                            name="type"
                            value={this.currentTileProp('type')}
                            onChange={this.handleTypeChange}
                          >
                            <FormControlLabel
                              value="button"
                              control={<Radio />}
                              label={intl.formatMessage(messages.button)}
                            />
                            <FormControlLabel
                              className="TileEditor__radiogroup__formcontrollabel"
                              value="folder"
                              control={<Radio />}
                              label={intl.formatMessage(messages.folder)}
                            />
                            <FormControlLabel
                              className="TileEditor__radiogroup__formcontrollabel"
                              value="board"
                              control={<Radio />}
                              label={intl.formatMessage(messages.board)}
                            />
                          </RadioGroup>
                        </FormControl>
                      </div>
                    )}
                    {this.currentTileProp('type') === 'folder' &&
                      selectBoardElement}

                    {haveLoadBoard &&
                      !isLocalLoadBoard &&
                      !isCordova() &&
                      this.editingTile() && (
                        <>
                          <FormLabel
                            id="boards-input-label"
                            style={{ marginTop: '16px' }}
                          >
                            {intl.formatMessage(messages.loadFolderBoard)}
                          </FormLabel>
                          <div className="TileEditor__loadBoard_section">
                            {loadBoardName ? (
                              this.state.linkedBoard === NONE_VALUE && (
                                <Typography variant="body1">
                                  {loadBoardName}
                                </Typography>
                              )
                            ) : (
                              <LostedFolderForLoadBoardAlert intl={intl} />
                            )}
                            <LoadBoardEditor
                              intl={intl}
                              onLoadBoardChange={this.handleLoadBoardChange}
                              isLostedFolder={loadBoardName === undefined}
                            />
                          </div>
                        </>
                      )}
                  </div>
                </div>
              </div>
              <div className="TileEditor__row">
                <div className="TileEditor__form-fields">
                  <div className="TileEditor__colorselect">
                    <ColorSelect
                      selectedColor={
                        this.state.selectedBackgroundColor ||
                        tileInView.backgroundColor
                      }
                      onChange={this.handleColorChange}
                      defaultColor={
                        this.editingTile()
                          ? this.getOriginalTileBackground()
                          : this.getDefaultColor()
                      }
                    />
                  </div>
                  {this.currentTileProp('type') !== 'board' && (
                    <div className="TileEditor__voicerecorder">
                      <FormLabel>
                        {intl.formatMessage(messages.voiceRecorder)}
                      </FormLabel>
                      <PremiumFeature>
                        <VoiceRecorder
                          src={this.currentTileProp('sound')}
                          onChange={this.handleSoundChange}
                        />
                      </PremiumFeature>
                    </div>
                  )}
                </div>
              </div>
            </FullScreenDialogContent>

            {this.state.editingTiles.length > 1 && (
              <MobileStepper
                variant="progress"
                steps={this.state.editingTiles.length}
                position="static"
                activeStep={this.state.activeStep}
                nextButton={
                  <Button
                    onClick={this.handleNext}
                    disabled={
                      this.state.activeStep ===
                      this.state.editingTiles.length - 1
                    }
                  >
                    {intl.formatMessage(messages.next)}{' '}
                    <KeyboardArrowRightIcon />
                  </Button>
                }
                backButton={
                  <Button
                    onClick={this.handleBack}
                    disabled={this.state.activeStep === 0}
                  >
                    <KeyboardArrowLeftIcon />
                    {intl.formatMessage(messages.back)}
                  </Button>
                }
              />
            )}
          </Paper>

          <SymbolSearch
            open={this.state.isSymbolSearchOpen}
            autoFill={this.state.autoFill}
            onChange={this.handleSymbolSearchChange}
            onClose={this.handleSymbolSearchClose}
            disableTour={this.props.disableTour}
            intl={intl}
            isSymbolSearchTourEnabled={this.props.isSymbolSearchTourEnabled}
          />
        </FullScreenDialog>
      </div>
    );
  }
}

export default injectIntl(TileEditor);
