/* eslint-disable no-unused-expressions */
/* eslint-disable no-undef */
import * as Factory from './lib/factory.js';
chai.use(chaiAsPromised);
const expect = chai.expect;

describe('key recovery service', function () {
  this.timeout(Factory.TestTimeout);

  before(async function () {
    localStorage.clear();
  });

  after(async function () {
    localStorage.clear();
  });

  beforeEach(async function () {
    this.email = Uuid.GenerateUuidSynchronously();
    this.password = Uuid.GenerateUuidSynchronously();
  });

  afterEach(function () {

  });

  it('when encountering an undecryptable items key, should recover through recovery wizard', async function () {
    const namespace = Factory.randomString();
    const unassociatedPassword = 'randfoo';
    const unassociatedIdentifier = 'foorand';

    const application = await Factory.createApplication(namespace);
    const receiveChallenge = async (challenge) => {
      /** Give unassociated password when prompted */
      application.submitValuesForChallenge(
        challenge,
        [new ChallengeValue(challenge.types[0], unassociatedPassword)]
      );
    };
    await application.prepareForLaunch({ receiveChallenge });
    await application.launch(true);

    await Factory.registerUserToApplication({
      application: application,
      email: this.email,
      password: this.password
    });

    /** Create items key associated with a random root key */
    const randomRootKey = await application.protocolService.createRootKey(
      unassociatedIdentifier,
      unassociatedPassword,
      KeyParamsOrigination.Registration
    );
    const randomItemsKey = await application.protocolService.defaultOperator().createItemsKey();
    const encrypted = await application.protocolService.payloadByEncryptingPayload(
      randomItemsKey.payload,
      EncryptionIntent.Sync,
      randomRootKey
    );

    /** Attempt decryption and insert into rotation in errored state  */
    const decrypted = await application.protocolService.payloadByDecryptingPayload(encrypted);
    /** Expect to be errored */
    expect(decrypted.errorDecrypting).to.equal(true);

    /** Insert into rotation */
    await application.modelManager.emitPayload(decrypted, PayloadSource.Constructor);

    /** Wait and allow recovery wizard to complete */
    await Factory.sleep(0.3);

    /** Should be decrypted now */
    expect(application.findItem(encrypted.uuid).errorDecrypting).to.equal(false);

    application.deinit();
  });

  it('when changing password on another client, it should prompt us for new account password', async function () {
    const namespace = Factory.randomString();
    const newPassword = `${Math.random()}`;
    let didPromptForNewPassword = false;

    const appA = await Factory.createApplication(namespace);
    const receiveChallenge = async (challenge) => {
      didPromptForNewPassword = true;
      /** Give newPassword when prompted */
      appA.submitValuesForChallenge(
        challenge,
        [new ChallengeValue(challenge.types[0], newPassword)]
      );
    };
    await appA.prepareForLaunch({ receiveChallenge });
    await appA.launch(true);

    await Factory.registerUserToApplication({
      application: appA,
      email: this.email,
      password: this.password
    });

    expect(appA.getItems(ContentType.ItemsKey).length).to.equal(1);

    /** Create simultaneous appB signed into same account */
    const appB = await Factory.createApplication('another-namespace');
    await appB.prepareForLaunch({});
    await appB.launch(true);
    await Factory.loginToApplication({
      application: appB,
      email: this.email,
      password: this.password
    });

    /** Change password on appB */
    await appB.changePassword(this.password, newPassword);
    expect(appB.getItems(ContentType.ItemsKey).length).to.equal(2);
    await appB.sync();

    /** Sync appA and expect a new items key to be downloaded and errored */
    expect(appA.getItems(ContentType.ItemsKey).length).to.equal(1);
    await appA.sync();

    expect(appA.getItems(ContentType.ItemsKey).length).to.equal(2);
    const itemsKeys = appA.getItems(ContentType.ItemsKey);
    const errored = itemsKeys.filter(k => k.errorDecrypting);
    expect(errored.length).to.equal(1);

    /** Allow key recovery service ample time to do its thing */
    await Factory.sleep(5.0);

    expect(didPromptForNewPassword).to.equal(true);

    /** Same previously errored key should now no longer be errored, */
    const recovered = appA.findItem(errored[0].uuid);
    expect(recovered.errorDecrypting).to.not.be.ok;

    /** appA's root key should now match appB's. */
    const aKey = await appA.protocolService.getRootKey();
    const bKey = await appB.protocolService.getRootKey();
    expect(aKey.compare(bKey)).to.equal(true);

    appA.deinit();
    appB.deinit();
  }).timeout(20000);

  it('when client key params differ from server, and no matching items key exists, should perform sign in flow', async function () {
    /**
     * If we encounter an undecryptable items key, whose key params do not match the server's,
     * and the server's key params do not match our own, we have no way to validate a new
     * root key other than by signing in.
     */

    const application = await Factory.createApplication('some-namespace');
    const receiveChallenge = async (challenge) => {
      if (challenge.customReason.includes(KeyRecoveryStrings.KeyRecoveryLoginFlowReason)) {
        /** This is the sign in prompt, return proper value */
        application.submitValuesForChallenge(
          challenge,
          [new ChallengeValue(challenge.types[0], this.password)]
        );
      } else {
        /** Not the sign in prompt, return null value as a signal to abort */
        application.submitValuesForChallenge(
          challenge,
          [new ChallengeValue(challenge.types[0], undefined)]
        );
      }
    };
    await application.prepareForLaunch({ receiveChallenge });
    await application.launch(true);

    await Factory.registerUserToApplication({
      application: application,
      email: this.email,
      password: this.password
    });

    const correctRootKey = await application.protocolService.getRootKey();

    /**
     * 1. Change our root key locally so that its keys params doesn't match the server's
     * 2. Create an items key payload that is set to errorDecrypting, and which is encrypted
     *    with the incorrect root key, so that it cannot be used to validate the user's password
     */

    const unassociatedPassword = 'randfoo';
    const unassociatedIdentifier = 'foorand';
    /** Create items key associated with a random root key */
    const randomRootKey = await application.protocolService.createRootKey(
      unassociatedIdentifier,
      unassociatedPassword,
      KeyParamsOrigination.Registration
    );
    await application.protocolService.setNewRootKey(randomRootKey);
    const correctItemsKey = await application.protocolService.defaultOperator().createItemsKey();
    const encrypted = await application.protocolService.payloadByEncryptingPayload(
      correctItemsKey.payload,
      EncryptionIntent.Sync,
      randomRootKey
    );
    await application.modelManager.emitPayload(
      CopyPayload(
        encrypted,
        {
          errorDecrypting: true
        }
      ),
      PayloadSource.Constructor
    );

    /** At this point key recovery wizard will encounter an undecryptable items key,
     * whose key params do not match the server's. Key recovery wizard should prompt for sign in */
    await Factory.sleep(2.0);

    const clientRootKey = await application.protocolService.getRootKey();
    expect(clientRootKey.compare(correctRootKey)).to.equal(true);
    application.deinit();
  });

  it(`when encountering an items key that cannot be decrypted, for which we already have a decrypted value,
          it should be temporarily ignored and recovered separately`, async function () {
    const application = await Factory.createApplication(Factory.randomString());
    const receiveChallenge = async (challenge) => {
      application.submitValuesForChallenge(
        challenge,
        [new ChallengeValue(challenge.types[0], this.password)]
      );
    };
    await application.prepareForLaunch({ receiveChallenge });
    await application.launch(true);

    await Factory.registerUserToApplication({
      application: application,
      email: this.email,
      password: this.password
    });

    /** Create and emit errored encrypted items key payload */
    const itemsKey = await application.protocolService.getDefaultItemsKey();
    const encrypted = await application.protocolService.payloadByEncryptingPayload(
      itemsKey.payload,
      EncryptionIntent.Sync,
    );
    const newUpdated = new Date();
    await application.modelManager.emitPayload(
      CopyPayload(
        encrypted,
        {
          errorDecrypting: true,
          updated_at: newUpdated
        }
      ),
      PayloadSource.Constructor
    );

    /** Our current items key should not be overwritten */
    const currentItemsKey = application.findItem(itemsKey.uuid);
    expect(currentItemsKey.errorDecrypting).to.not.be.ok;
    expect(currentItemsKey.itemsKey).to.equal(itemsKey.itemsKey);
    expect(currentItemsKey.updated_at.getTime()).to.equal(itemsKey.updated_at.getTime());

    /** Payload should be persisted as unrecoverable */
    const undecryptables = await application.keyRecoveryService.getUndecryptables();
    expect(Object.keys(undecryptables).length).to.equal(1);

    /** Allow key recovery wizard to finish its processes */
    await Factory.sleep(1.5);

    /** Unrecoverable should be cleared, and key recovered and emitted */
    const latestUndecryptables = await application.keyRecoveryService.getUndecryptables();
    expect(Object.keys(latestUndecryptables).length).to.equal(0);

    const latestItemsKey = application.findItem(itemsKey.uuid);
    expect(latestItemsKey.errorDecrypting).to.not.be.ok;
    expect(latestItemsKey.itemsKey).to.equal(itemsKey.itemsKey);
    expect(latestItemsKey.updated_at.getTime()).to.not.equal(currentItemsKey.updated_at.getTime());
    expect(latestItemsKey.updated_at.getTime()).to.equal(newUpdated.getTime());

    application.deinit();
  }).timeout(20000);

  it('application should prompt to recover undecryptables on launch', async function () {
    const namespace = Factory.randomString();
    const application = await Factory.createApplication(namespace);
    await application.prepareForLaunch({});
    await application.launch(true);

    await Factory.registerUserToApplication({
      application: application,
      email: this.email,
      password: this.password
    });

    /** Create and emit errored encrypted items key payload */
    const itemsKey = await application.protocolService.getDefaultItemsKey();
    const encrypted = await application.protocolService.payloadByEncryptingPayload(
      itemsKey.payload,
      EncryptionIntent.Sync,
    );
    const newUpdated = new Date();
    await application.modelManager.emitPayload(
      CopyPayload(
        encrypted,
        {
          errorDecrypting: true,
          updated_at: newUpdated
        }
      ),
      PayloadSource.Constructor
    );
    /** Allow enough time to persist to disk, but not enough to complete recovery wizard */
    console.warn('Expecting some error below because we are destroying app in the middle of processing.');
    await Factory.sleep(0.1);
    application.deinit();

    /** Recreate application, and expect key recovery wizard to complete */
    const recreatedApp = await Factory.createApplication(namespace);
    let didReceivePasswordPrompt = false;
    const receiveChallenge = async (challenge) => {
      didReceivePasswordPrompt = true;
      recreatedApp.submitValuesForChallenge(
        challenge,
        [new ChallengeValue(challenge.types[0], this.password)]
      );
    };
    await recreatedApp.prepareForLaunch({ receiveChallenge });
    await recreatedApp.launch(true);

    /** Allow key recovery wizard to complete its processes */
    await Factory.sleep(1.5);

    /** Unrecoverable should be cleared, and key recovered and emitted */
    expect(didReceivePasswordPrompt).to.equal(true);
    const latestUndecryptables = await recreatedApp.keyRecoveryService.getUndecryptables();
    expect(Object.keys(latestUndecryptables).length).to.equal(0);

    const latestItemsKey = recreatedApp.findItem(itemsKey.uuid);
    expect(latestItemsKey.errorDecrypting).to.not.be.ok;
    expect(latestItemsKey.itemsKey).to.equal(itemsKey.itemsKey);
    expect(latestItemsKey.updated_at.getTime()).to.not.equal(itemsKey.updated_at.getTime());
    expect(latestItemsKey.updated_at.getTime()).to.equal(newUpdated.getTime());

    recreatedApp.deinit();
  }).timeout(20000);

  it('root key replacing recovery should prompt for app passcode if enabled', async function () {
    const namespace = Factory.randomString();
    const application = await Factory.createApplication(namespace);
    const passcode = 'mypasscode';
    let didPromptForPasscode = false;
    let didPromptForAccountPassword = false;
    const receiveChallenge = async (challenge) => {
      const type = challenge.types[0];
      if(type === ChallengeType.LocalPasscode) {
        didPromptForPasscode = true;
      } else {
        didPromptForAccountPassword = true;
      }
      application.submitValuesForChallenge(
        challenge,
        [new ChallengeValue(type, type === ChallengeType.LocalPasscode ? passcode : this.password)]
      );
    };
    await application.prepareForLaunch({ receiveChallenge });
    await application.launch(true);

    await Factory.registerUserToApplication({
      application: application,
      email: this.email,
      password: this.password
    });

    /** Set a passcode */
    await application.setPasscode(passcode);

    /**
     * Create a new items key that we manually set as errored
     * Because it is newer than we we have, key recovery service will perform
     * local root key change, and prompt for passcode.
     */
    const itemsKey = await application.protocolService.defaultOperator().createItemsKey();
    const encrypted = await application.protocolService.payloadByEncryptingPayload(
      itemsKey.payload,
      EncryptionIntent.Sync,
    );
    await application.modelManager.emitPayload(
      CopyPayload(
        encrypted,
        {
          errorDecrypting: true,

        }
      ),
      PayloadSource.Constructor
    );

    await Factory.sleep(2.5);

    expect(didPromptForPasscode).to.equal(true);
    expect(didPromptForAccountPassword).to.equal(true);

    const latestItemsKey = application.findItem(itemsKey.uuid);
    expect(latestItemsKey.errorDecrypting).to.not.be.ok;
    expect(latestItemsKey.itemsKey).to.equal(itemsKey.itemsKey);

    application.deinit();
  });
});
