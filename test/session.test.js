/* eslint-disable no-unused-expressions */
/* eslint-disable no-undef */
import * as Factory from './lib/factory.js';
import WebDeviceInterface from './lib/web_device_interface.js';
chai.use(chaiAsPromised);
const expect = chai.expect;

describe('server session', function () {
  this.timeout(Factory.TestTimeout);

  const BASE_ITEM_COUNT = 2; /** Default items key, user preferences */

  const syncOptions = {
    checkIntegrity: true,
    awaitAll: true
  };

  before(async function () {
    localStorage.clear();
  });

  beforeEach(async function () {
    this.expectedItemCount = BASE_ITEM_COUNT;
    this.application = await Factory.createInitAppWithRandNamespace();
    this.email = Uuid.GenerateUuidSynchronously();
    this.password = Uuid.GenerateUuidSynchronously();
    this.newPassword = Factory.randomString();
  });

  afterEach(async function () {
    this.application.deinit();
    this.application = null;
    localStorage.clear();
  });

  async function sleepUntilSessionExpires(application, basedOnAccessToken = true) {
    const currentSession = application.apiService.getSession();
    const timestamp = basedOnAccessToken ? currentSession.accessExpiration : currentSession.refreshExpiration;
    const timeRemaining = (timestamp - Date.now()) / 1000; // in ms
    /*
      If the token has not expired yet, we will return the remaining time.
      Else, there's no need to add a delay.
    */
    const sleepTime = timeRemaining > 0
      ? timeRemaining + 0.3 /** Safety margin */
      : 0;
    await Factory.sleep(sleepTime);
  }

  async function getSessionFromStorage(application) {
    return application.storageService.getValue(StorageKey.Session);
  }

  it('should succeed when a sync request is perfomed with an expired access token', async function () {
    this.timeout(Factory.LongTestTimeout)

    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });

    await sleepUntilSessionExpires(this.application);

    const response = await this.application.apiService.sync([]);

    expect(response.status).to.equal(200);
  });

  it('should return the new session in the response when refreshed', async function () {
    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });

    const response = await this.application.apiService.refreshSession();

    expect(response.status).to.equal(200);
    expect(response.session.access_token).to.be.a('string');
    expect(response.session.access_token).to.not.be.empty;
    expect(response.session.refresh_expiration).to.be.a('number');
    expect(response.session.refresh_token).to.not.be.empty;
  });

  it('should be refreshed on any api call if access token is expired', async function () {
    this.timeout(Factory.LongTestTimeout)

    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });

    // Saving the current session information for later...
    const sessionBeforeSync = this.application.apiService.getSession();

    // Waiting enough time for the access token to expire, before performing a new sync request.
    await sleepUntilSessionExpires(this.application);

    // Performing a sync request with an expired access token.
    await this.application.sync(syncOptions);

    // After the above sync request is completed, we obtain the session information.
    const sessionAfterSync = this.application.apiService.getSession();

    expect(sessionBeforeSync).to.not.equal(sessionAfterSync);
    expect(sessionBeforeSync.accessToken).to.not.equal(sessionAfterSync.accessToken);
    expect(sessionBeforeSync.refreshToken).to.not.equal(sessionAfterSync.refreshToken);
    expect(sessionBeforeSync.accessExpiration).to.be.lessThan(sessionAfterSync.accessExpiration);
    // New token should expire in the future.
    expect(sessionAfterSync.accessExpiration).to.be.greaterThan(Date.now());
  });

  it('should succeed when a sync request is perfomed after signing into an ephemeral session', async function () {
    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });
    this.application = await Factory.signOutApplicationAndReturnNew(this.application);

    await this.application.signIn(
      this.email,
      this.password,
      false,
      true
    );

    const response = await this.application.apiService.sync([]);
    expect(response.status).to.equal(200);
  });

  it('should succeed when a sync request is perfomed after registering into an ephemeral session', async function () {
    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
      ephemeral: true
    });

    const response = await this.application.apiService.sync([]);
    expect(response.status).to.equal(200);
  });

  it('should be consistent between storage and apiService', async function () {
    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });

    const sessionFromStorage = await getSessionFromStorage(this.application);
    const sessionFromApiService = this.application.apiService.getSession();

    expect(sessionFromStorage).to.equal(sessionFromApiService);

    await this.application.apiService.refreshSession();

    const updatedSessionFromStorage = await getSessionFromStorage(this.application);
    const updatedSessionFromApiService = this.application.apiService.getSession();

    expect(updatedSessionFromStorage).to.equal(updatedSessionFromApiService);
  });

  it('should be performed successfully and terminate session with a valid access token', async function () {
    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });

    const signOutResponse = await this.application.apiService.signOut();
    expect(signOutResponse.status).to.equal(204);

    Factory.ignoreChallenges(this.application);
    const syncResponse = await this.application.apiService.sync([]);
    expect(syncResponse.status).to.equal(401);
    expect(syncResponse.error.tag).to.equal('invalid-auth');
    expect(syncResponse.error.message).to.equal('Invalid login credentials.');
  });

  it('sign out request should be performed successfully and terminate session with expired access token', async function () {
    this.timeout(Factory.LongTestTimeout);

    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });

    // Waiting enough time for the access token to expire, before performing a sign out request.
    await sleepUntilSessionExpires(this.application);

    const signOutResponse = await this.application.apiService.signOut();
    expect(signOutResponse.status).to.equal(204);

    Factory.ignoreChallenges(this.application);
    const syncResponse = await this.application.apiService.sync([]);
    expect(syncResponse.status).to.equal(401);
    expect(syncResponse.error.tag).to.equal('invalid-auth');
    expect(syncResponse.error.message).to.equal('Invalid login credentials.');
  });

  it('change password request should be successful with a valid access token', async function () {
    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });

    const changePasswordResponse = await this.application.changePassword(
      this.password,
      this.newPassword
    );

    expect(changePasswordResponse.status).to.equal(200);
    expect(changePasswordResponse.user).to.be.ok;

    this.application = await Factory.signOutApplicationAndReturnNew(this.application);
    const loginResponse = await Factory.loginToApplication({
      application: this.application,
      email: this.email,
      password: this.newPassword
    });

    expect(loginResponse).to.be.ok;
    expect(loginResponse.status).to.be.equal(200);
  });

  xit('change password request should be successful after the expired access token is refreshed', async function () {
    this.timeout(Factory.LongTestTimeout)

    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });

    // Waiting enough time for the access token to expire.
    await sleepUntilSessionExpires(this.application);

    const changePasswordResponse = await this.application.changePassword(
      this.password,
      this.newPassword
    );

    expect(changePasswordResponse).to.be.ok;
    expect(changePasswordResponse.status).to.equal(200);

    this.application = await Factory.signOutApplicationAndReturnNew(this.application);
    const loginResponse = await Factory.loginToApplication({
      application: this.application,
      email: this.email,
      password: this.newPassword
    });

    expect(loginResponse).to.be.ok;
    expect(loginResponse.status).to.be.equal(200);
  });

  it('change password request should fail with an invalid access token', async function () {
    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });

    const fakeSession = this.application.apiService.getSession();
    fakeSession.accessToken = 'this-is-a-fake-token-1234';
    Factory.ignoreChallenges(this.application);
    const changePasswordResponse = await this.application.changePassword(
      this.password,
      this.newPassword
    );
    expect(changePasswordResponse.error.message).to.equal('Invalid login credentials.');

    this.application = await Factory.signOutApplicationAndReturnNew(this.application);
    const loginResponse = await Factory.loginToApplication({
      application: this.application,
      email: this.email,
      password: this.newPassword
    });

    expect(loginResponse).to.be.ok;
    expect(loginResponse.status).to.be.equal(401);
  });

  it('change password request should fail with an expired refresh token', async function () {
    this.timeout(Factory.LongTestTimeout)

    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });

    /** Waiting for the refresh token to expire. */
    await sleepUntilSessionExpires(this.application, false);

    Factory.ignoreChallenges(this.application);
    const changePasswordResponse = await this.application.changePassword(
      this.password,
      this.newPassword
    );

    expect(changePasswordResponse).to.be.ok;
    expect(changePasswordResponse.error.message).to.equal('Invalid login credentials.');

    this.application = await Factory.signOutApplicationAndReturnNew(this.application);
    const loginResponseWithNewPassword = await Factory.loginToApplication({
      application: this.application,
      email: this.email,
      password: this.newPassword
    });

    expect(loginResponseWithNewPassword).to.be.ok;
    expect(loginResponseWithNewPassword.status).to.equal(401);

    const loginResponseWithOldPassword = await Factory.loginToApplication({
      application: this.application,
      email: this.email,
      password: this.password
    });

    expect(loginResponseWithOldPassword).to.be.ok;
    expect(loginResponseWithOldPassword.status).to.be.equal(200);
  }).timeout(25000);

  it('should sign in successfully after signing out', async function () {
    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });

    await this.application.apiService.signOut();
    this.application.apiService.session = undefined;

    await this.application.sessionManager.signIn(
      this.email,
      this.password
    );

    const currentSession = this.application.apiService.getSession();

    expect(currentSession).to.be.ok;
    expect(currentSession.accessToken).to.be.ok;
    expect(currentSession.refreshToken).to.be.ok;
    expect(currentSession.accessExpiration).to.be.greaterThan(Date.now());
  });

  it('should fail when renewing a session with an expired refresh token', async function () {
    this.timeout(Factory.LongTestTimeout)

    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });

    await sleepUntilSessionExpires(this.application, false);

    const refreshSessionResponse = await this.application.apiService.refreshSession();

    expect(refreshSessionResponse.status).to.equal(400);
    expect(refreshSessionResponse.error.tag).to.equal('expired-refresh-token');
    expect(refreshSessionResponse.error.message).to.equal('The refresh token has expired.');

    /*
      The access token and refresh token should be expired up to this point.
      Here we make sure that any subsequent requests will fail.
    */
    Factory.ignoreChallenges(this.application);
    const syncResponse = await this.application.apiService.sync([]);
    expect(syncResponse.status).to.equal(401);
    expect(syncResponse.error.tag).to.equal('invalid-auth');
    expect(syncResponse.error.message).to.equal('Invalid login credentials.');
  });

  it('should fail when renewing a session with an invalid refresh token', async function () {
    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });

    const fakeSession = this.application.apiService.getSession();
    fakeSession.refreshToken = 'this-is-a-fake-token-1234';

    await this.application.apiService.setSession(fakeSession, true);

    const refreshSessionResponse = await this.application.apiService.refreshSession();

    expect(refreshSessionResponse.status).to.equal(400);
    expect(refreshSessionResponse.error.tag).to.equal('invalid-refresh-token');
    expect(refreshSessionResponse.error.message).to.equal('The refresh token is not valid.');

    // Access token should remain valid.
    const syncResponse = await this.application.apiService.sync([]);
    expect(syncResponse.status).to.equal(200);
  });

  it('should fail if syncing while a session refresh is in progress', async function () {
    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });

    const refreshPromise = this.application.apiService.refreshSession();
    const syncResponse = await this.application.apiService.sync([]);

    expect(syncResponse.error).to.be.ok;

    const errorMessage = 'Your account session is being renewed with the server. Please try your request again.';
    expect(syncResponse.error.message).to.be.equal(errorMessage);
    /** Wait for finish so that test cleans up properly */
    await refreshPromise;
  });

  it('notes should be synced as expected after refreshing a session', async function () {
    this.timeout(Factory.LongTestTimeout)

    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });

    const notesBeforeSync = await Factory.createManyMappedNotes(this.application, 5);

    await sleepUntilSessionExpires(this.application);
    await this.application.syncService.sync(syncOptions);
    expect(this.application.syncService.isOutOfSync()).to.equal(false);

    this.application = await Factory.signOutApplicationAndReturnNew(this.application);
    await this.application.signIn(
      this.email,
      this.password,
      undefined, undefined, undefined,
      true
    );

    const expectedNotesUuids = notesBeforeSync.map(n => n.uuid);
    const notesResults = await this.application.itemManager.findItems(expectedNotesUuids);

    expect(notesResults.length).to.equal(notesBeforeSync.length);

    for (const aNoteBeforeSync of notesBeforeSync) {
      const noteResult = await this.application.itemManager.findItem(aNoteBeforeSync.uuid);
      expect(aNoteBeforeSync.isItemContentEqualWith(noteResult)).to.equal(true);
    }
  });

  it('changing password on one client should not invalidate other sessions', async function () {
    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });

    const appA = await Factory.createApplication(Factory.randomString());
    await appA.prepareForLaunch({});
    await appA.launch(true);

    const email = `${Math.random()}`;
    const password = `${Math.random()}`;

    await Factory.registerUserToApplication({
      application: appA,
      email: email,
      password: password
    });

    /** Create simultaneous appB signed into same account */
    const appB = await Factory.createApplication('another-namespace');
    await appB.prepareForLaunch({});
    await appB.launch(true);
    await Factory.loginToApplication({
      application: appB,
      email: email,
      password: password
    });

    /** Change password on appB */
    const newPassword = 'random';
    await appB.changePassword(password, newPassword);

    /** Create an item and sync it */
    const note = await Factory.createSyncedNote(appB);

    /** Expect appA session to still be valid */
    await appA.sync();
    expect(appA.findItem(note.uuid)).to.be.ok;

    appA.deinit();
    appB.deinit();
  });

  it('should prompt user for account password and sign back in on invalid session', async function () {
    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });

    const email = `${Math.random()}`;
    const password = `${Math.random()}`;
    let didPromptForSignIn = false;
    const receiveChallenge = async (challenge) => {
      didPromptForSignIn = true;
      appA.submitValuesForChallenge(
        challenge,
        [
          new ChallengeValue(challenge.prompts[0], email),
          new ChallengeValue(challenge.prompts[1], password),
        ]
      );
    };
    const appA = await Factory.createApplication(Factory.randomString());
    await appA.prepareForLaunch({ receiveChallenge });
    await appA.launch(true);

    await Factory.registerUserToApplication({
      application: appA,
      email: email,
      password: password
    });

    const oldRootKey = await appA.protocolService.getRootKey();

    /** Set the session as nonsense */
    appA.apiService.session.accessToken = 'foo';
    appA.apiService.session.refreshToken = 'bar';

    /** Perform an authenticated network request */
    await appA.sync();

    /** Allow session recovery to do its thing */
    await Factory.sleep(2.0);

    expect(didPromptForSignIn).to.equal(true);
    expect(appA.apiService.session.accessToken).to.not.equal('foo');
    expect(appA.apiService.session.refreshToken).to.not.equal('bar');

    /** Expect that the session recovery replaces the global root key */
    const newRootKey = await appA.protocolService.getRootKey();
    expect(oldRootKey).to.not.equal(newRootKey);

    appA.deinit();
  });

  it('should return current session in list of sessions', async function () {
    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });

    const sessions = await this.application.apiService.getSessionsList();
    expect(sessions[0].current).to.equal(true);
  });

  it('signing out should delete session from all list', async function () {
    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });

    /** Create new session aside from existing one */
    const app2 = await Factory.createAndInitializeApplication('app2');
    await app2.signIn(this.email, this.password);

    const response = await this.application.apiService.getSessionsList();
    expect(response.object.length).to.equal(2);

    await app2.signOut();

    const response2 = await this.application.apiService.getSessionsList();
    expect(response2.object.length).to.equal(1);
  });

  it('revoking a session should destroy local data @syncing-server-js-only', async function () {
    this.timeout(Factory.LongTestTimeout);

    const app2identifier = 'app2';

    const app2 = await Factory.createAndInitializeApplication(app2identifier);
    app2.prepareForLaunch({
      receiveChallenge() {}
    });
    this.application.setLaunchCallback({
      receiveChallenge: (challenge) => {
        const values = challenge.prompts.map(
          (prompt) =>
            new ChallengeValue(
              prompt,
              prompt.validation === ChallengeValidation.AccountPassword
                ? this.password
                : 0
            )
        );
        this.application.submitValuesForChallenge(challenge, values);
      }
    });

    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    }),
    await app2.signIn(this.email, this.password);

    const sessions = await this.application.getSessions();
    const app2session = sessions.find(session => !session.current);
    await this.application.revokeSession(app2session.uuid);
    void app2.sync();
    /** Wait for app2 to deinit */
    await Factory.sleep(3);
    expect(app2.dealloced).to.be.true;

    const deviceInterface = new WebDeviceInterface();
    const payloads = await deviceInterface.getAllRawDatabasePayloads(app2identifier);
    expect(payloads).to.be.empty;
  });

  it('signing out with invalid session token should still delete local data', async function () {
    await Factory.registerUserToApplication({
      application: this.application,
      email: this.email,
      password: this.password,
    });

    const invalidSession = this.application.apiService.getSession();
    invalidSession.accessToken = undefined;
    invalidSession.refreshToken = undefined;

    const storageKey = this.application.storageService.getPersistenceKey();
    expect(localStorage.getItem(storageKey)).to.be.ok;

    await this.application.signOut();
    expect(localStorage.getItem(storageKey)).to.not.be.ok;
  });
});
