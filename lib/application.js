import { getGlobalScope } from '@Lib/utils';
import { SNAlertManager } from '@Services/alertManager';
import { SNSessionManager } from '@Services/api/session_manager';
import { SNComponentManager } from '@Services/componentManager';
import { SNDatabaseManager } from '@Services/database_manager';
import { SNHttpManager } from '@Services/httpManager';
import { SNKeyManager } from '@Services/keyManager';
import { SNMigrationManager } from '@Services/migrationManager';
import { SNModelManager } from '@Services/modelManager';
import { SNSingletonManager } from '@Services/singletonManager';
import { SNStorageManager } from '@Services/storageManager';
import { SNSyncManager } from '@Services/sync/sync_manager';
import {
  APPLICATION_EVENT_WILL_SIGN_IN,
  APPLICATION_EVENT_DID_SIGN_IN,
  APPLICATION_EVENT_DID_SIGN_OUT
} from '@Lib/events';

export class SNApplication {

  /**
   * @param namespace  Optional - a unique identifier to namespace storage and other persistent properties.
   *                   Defaults to empty string.
   */
  constructor({namespace, host} = {}) {
    this.namespace = namespace || '';
    this.host = host;
  }

  /**
   * The first thing consumers should call when starting their app.
   * This function will load all services in their correct order and run migrations.
   * It will also handle device authentication, and issue a callback if a device activation
   * requires user input (i.e local passcode or fingerprint).
   * @param keychainDelegate  A SNKeychainDelegate object.
   * @param swapClasses  Gives consumers the ability to provide their own custom subclass for a service.
   *                     swapClasses should be an array of key/value pairs consisting of keys 'swap' and 'with'.
   *                     'swap' is the base class you wish to replace, and 'with' is the custom subclass to use.
   *
   * @param skipClasses  An optional array of classes to skip making services for.
   *
   * @param timeout  A platform-specific function that is fed functions to run when other operations have completed.
   *                 This is similar to setImmediate on the web, or setTimeout(fn, 0).
   *
   * @param interval  A platform-specific function that is fed functions to perform repeatedly. Similar to setInterval.
   * @param callbacks
   *          .onRequiresAuthentication(sources, handleResponses)
   *            @param sources  An array of DeviceAuthenticationSources that require responses.
   *            @param handleResponses  Once the consumer has valid responses for all sources, they must
   *                                    call handleResponses with an array of DeviceAuthenticationResponses.
   */

  async initialize({keychainDelegate, swapClasses, skipClasses, callbacks, timeout, interval}) {
    if(!callbacks.onRequiresAuthentication) {
      throw 'Application.initialize callbacks are not properly configured.';
    }

    if(!timeout) {
      throw `'timeout' is required to initialize application.`
    }

    if(!keychainDelegate) {
      throw 'Keychain delegate must be supplied.';
    }

    // console.log("Initializing application with namespace", this.namespace);

    SFItem.AppDomain = 'org.standardnotes.sn';

    this.swapClasses = swapClasses;
    this.skipClasses = skipClasses;
    this.timeout = timeout || setTimeout.bind(getGlobalScope());
    this.interval = interval || setInterval.bind(getGlobalScope());
    this.eventHandlers = [];

    this.createAlertManager();
    this.createHttpManager();

    this.createDatabaseManager();
    await this.databaseManager.openDatabase();

    this.createModelManager();
    this.createProtocolManager();

    this.createStorageManager();
    await this.storageManager.initializeFromDisk();

    this.createApiService();

    this.createKeyManager();
    this.protocolManager.setKeyManager(this.keyManager);
    this.keyManager.setKeychainDelegate(keychainDelegate);

    this.createSessionManager();
    await this.sessionManager.initializeFromDisk();

    this.createSyncManager();
    const databasePayloads = await this.syncManager.getDatabasePayloads();
    /**
     * We don't want to await this, as we want to begin allow the app to function
     * before local data has been loaded fully and mapped. We only await initial
     * `getDatabasePayloads` to lock in on database state.
     */
    this.syncManager.loadDatabasePayloads(databasePayloads);

    this.createSingletonManager();
    // this.createMigrationManager();

    this.createComponentManager();
  }

  addEventObserver(observer) {
    this.eventHandlers.push(observer);
    return observer;
  }

  removeEventObserver(observer) {
    pull(this.eventHandlers, observer);
  }

  notifyEvent(event, data) {
    for(var observer of this.eventHandlers) {
      observer.callback(event, data || {});
    }
  }

  async saveItem({item}) {
    this.modelManager.setItemDirty(item, true);
    await this.modelManager.mapItem({item: item});
    await this.syncManager.sync();
  }

  async setHost(host) {
    this.apiService.setHost(host);
  }

  async register({email, password, ephemeral}) {
    const result = await this.sessionManager.register({
      email, password
    });
    if(!result.response.error) {
      await this.keyManager.setRootKey({key: result.rootKey, keyParams: result.keyParams});
      await this.keyManager.createNewItemsKey();
      await this.storageManager.setLocalStoragePolicy({encrypt: true, ephemeral: ephemeral});
      await this.storageManager.setLocalDatabaseStoragePolicy({ephemeral: ephemeral});
      await this.syncManager.sync();
    }
    return result.response;
  }

  async signIn({email, password, strict, ephemeral, mfaKeyPath, mfaCode}) {
    this.notifyEvent(APPLICATION_EVENT_WILL_SIGN_IN);

    const result = await this.sessionManager.signIn({
      email, password, strict, mfaKeyPath, mfaCode
    });

    if(!result.response.error) {
      await this.keyManager.setRootKey({key: result.rootKey, keyParams: result.keyParams});
      this.notifyEvent(APPLICATION_EVENT_DID_SIGN_IN);
    }

    return result.response;
  }

  async changePassword({email, currentPassword, currentKeyParams, newPassword}) {
    const result = await this.sessionManager.changePassword({
      url: await this.sessionManager.getServerUrl(),
      email, currentPassword, currentKeyParams, newPassword
    });

    if(!result.response.error) {
      await this.keyManager.setRootKey({key: result.rootKey, keyParams: result.keyParams});
      await this.keyManager.createNewItemsKey();
      await this.syncManager.sync();
    }

    return result.response;
  }

  async signOut({dontClearData} = {}) {
    await this.syncManager.handleSignOut();
    await this.modelManager.handleSignOut();
    await this.sessionManager.signOut();
    await this.keyManager.deleteRootKey();

    if(!dontClearData) {
      await this.storageManager.clearAllData();
    }

    this.notifyEvent(APPLICATION_EVENT_DID_SIGN_OUT);
  }

  createAlertManager() {
    if(this.shouldSkipClass(SNAlertManager)) {
      return;
    }
    this.alertManager = new (this.getClass(SNAlertManager))()
  }

  createApiService() {
    this.apiService = new (this.getClass(SNApiService))({
      storageManager: this.storageManager,
      httpManager: this.httpManager,
      host: this.host
    });
  }

  createComponentManager() {
    if(this.shouldSkipClass(SNComponentManager)) {
      return;
    }
    throw 'SNApplication.createComponentManager must be overriden';
  }

  createDatabaseManager() {
    this.databaseManager = new (this.getClass(SNDatabaseManager))({
      namespace: this.namespace
    });
  }

  createHttpManager() {
    this.httpManager = new (this.getClass(SNHttpManager))(
      this.timeout
    );
  }

  createKeyManager() {
    this.keyManager = new (this.getClass(SNKeyManager))({
      modelManager: this.modelManager,
      storageManager: this.storageManager,
      protocolManager: this.protocolManager
    });
  }

  createMigrationManager() {
    this.migrationManager = new (this.getClass(SNMigrationManager))({
      modelManager: this.modelManager,
      storageManager: this.storageManager,
      sessionManager: this.sessionManager,
      syncManager: this.syncManager
    });
  }

  createModelManager() {
    this.modelManager = new (this.getClass(SNModelManager))(
      this.timeout
    );
  }

  createSingletonManager() {
    this.singletonManager = new (this.getClass(SNSingletonManager))({
      modelManager: this.modelManager,
      syncManager: this.syncManager
    });
  }

  createStorageManager() {
    this.storageManager = new (this.getClass(SNStorageManager))({
      protocolManager: this.protocolManager,
      databaseManager: this.databaseManager,
      namespace: this.namespace
    });
  }

  createProtocolManager() {
    this.protocolManager = new (this.getClass(SNProtocolManager))({
      modelManager: this.modelManager
    });
  }

  createSessionManager() {
    this.sessionManager = new (this.getClass(SNSessionManager))({
      storageManager: this.storageManager,
      alertManager: this.alertManager,
      protocolManager: this.protocolManager,
      apiService: this.apiService,
      timeout: this.timeout
    });
  }

  createSyncManager() {
    this.syncManager = new (this.getClass(SNSyncManager))({
      modelManager: this.modelManager,
      storageManager: this.storageManager,
      sessionManager: this.sessionManager,
      protocolManager: this.protocolManager,
      apiService: this.apiService,
      interval: this.interval
    });
  }

  shouldSkipClass(classCandidate) {
    return this.skipClasses && this.skipClasses.includes(classCandidate);
  }

  getClass(base) {
    const swapClass = this.swapClasses && this.swapClasses.find((candidate) => candidate.swap === base);
    if(swapClass) {
      return swapClass.with;
    } else {
      return base;
    }
  }

}