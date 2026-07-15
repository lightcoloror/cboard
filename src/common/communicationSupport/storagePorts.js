import {
  createBrowserKeyValueStore,
  createUnavailableKeyValueStore
} from './adapters/browserStorage';
import { createWechatKeyValueStore } from './adapters/wechatStorage';

export const createBrowserStoragePort = createBrowserKeyValueStore;
export const createUnavailableStoragePort = createUnavailableKeyValueStore;
export const createWechatStoragePort = createWechatKeyValueStore;
