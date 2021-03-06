import { isNullOrUndefined } from '@Lib/utils';
import { ValueModesKeys } from './../../services/storage_service';
import { RawStorageKey, StorageKey, namespacedKey } from '@Lib/storage_keys';
import { StorageReader } from './reader';
import { PreviousSnjsVersion2_0_0 } from '@Lib/version';

export class StorageReader2_0_0 extends StorageReader {

  static version() {
    return PreviousSnjsVersion2_0_0;
  }

  private async getStorage() {
    const storageKey = namespacedKey(this.identifier, RawStorageKey.StorageObject);
    const storage = await this.deviceInterface!.getRawStorageValue(storageKey);
    const values = storage ? JSON.parse(storage as any) : undefined;
    return values;
  }

  private async getNonWrappedValue(key: string) {
    const values = await this.getStorage();
    if (!values) {
      return undefined;
    }
    return values[ValueModesKeys.Nonwrapped]?.[key];
  }

  /**
   * In 2.0.0+, account key params are stored in NonWrapped storage
   */
  public async getAccountKeyParams() {
    return this.getNonWrappedValue(StorageKey.RootKeyParams);
  }

  public async hasNonWrappedAccountKeys() {
    const value = await this.deviceInterface.getNamespacedKeychainValue(this.identifier);
    return !isNullOrUndefined(value);
  }

  public async hasPasscode() {
    const wrappedRootKey = await this.getNonWrappedValue(StorageKey.WrappedRootKey);
    return !isNullOrUndefined(wrappedRootKey);
  }

  public usesKeychain() {
    return true;
  }
}