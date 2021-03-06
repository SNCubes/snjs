/* eslint-disable no-unused-expressions */
/* eslint-disable no-undef */
import * as Factory from './lib/factory.js';
chai.use(chaiAsPromised);
const expect = chai.expect;

describe('history manager', () => {
  const largeCharacterChange = 15;

  const syncOptions = {
    checkIntegrity: true,
    awaitAll: true
  };

  before(async function () {
    localStorage.clear();
  });

  after(async function () {
    localStorage.clear();
  });

  describe('session', async function () {
    beforeEach(async function () {
      this.application = await Factory.createInitAppWithRandNamespace();
      this.historyManager = this.application.historyManager;
      this.modelManager = this.application.modelManager;
      /** Automatically optimize after every revision by setting this to 0 */
      this.historyManager.setSessionItemRevisionThreshold(0);
    });

    afterEach(async function () {
      await this.application.deinit();
    });

    async function setTextAndSync(application, item, text) {
      return application.changeAndSaveItem(
        item.uuid,
        (mutator) => {
          mutator.text = text;
        },
        undefined,
        undefined,
        syncOptions
      );
    }

    function deleteCharsFromString(string, amount) {
      return string.substring(0, string.length - amount);
    }

    it('create basic history entries', async function () {
      const item = await Factory.createSyncedNote(this.application);
      const itemHistory = this.historyManager.sessionHistoryForItem(item);
      expect(itemHistory).to.be.ok;
      expect(itemHistory.entries.length).to.equal(1);

      /** Sync with same contents, should not create new entry */
      await this.application.saveItem(item.uuid);
      expect(itemHistory.entries.length).to.equal(1);

      /** Sync with different contents, should create new entry */
      await this.application.changeAndSaveItem(
        item.uuid,
        (mutator) => {
          mutator.title = Math.random();
        },
        undefined,
        undefined,
        syncOptions
      );
      expect(itemHistory.entries.length).to.equal(2);

      this.historyManager.clearHistoryForItem(item);
      const newItemHistory = this.historyManager.sessionHistoryForItem(item);
      expect(newItemHistory.entries.length).to.equal(0);

      await this.application.saveItem(item.uuid);
      expect(newItemHistory.entries.length).to.equal(1);

      this.historyManager.clearAllHistory();
      expect(this.historyManager.sessionHistoryForItem(item).entries.length).to.equal(0);
    });

    it('should optimize basic entries', async function () {
      let item = await Factory.createSyncedNote(this.application);
      const itemHistory = this.historyManager.sessionHistoryForItem(item);
      /** It should keep the first revision, regardless of character delta. */
      expect(itemHistory.entries.length).to.equal(1);
      /**
       * Add 1 character. This typically would be discarded as an entry, but it
       * won't here because it's the last one, which we want to keep.
       */
      await setTextAndSync(
        this.application,
        item,
        item.content.text + Factory.randomString(1)
      );
      expect(itemHistory.entries.length).to.equal(2);

      /**
       * Now changing it by one character should discard this entry,
       * keeping the total at 2.
       */
      item = await setTextAndSync(
        this.application,
        item,
        item.content.text + Factory.randomString(1)
      );
      expect(itemHistory.entries.length).to.equal(2);
      /**
       * Change it over the largeCharacterChange threshold. It should keep this
       * revision, but now remove the previous revision, since it's no longer
       * the last, and is a small change.
       */
      item = await setTextAndSync(
        this.application,
        item,
        item.content.text + Factory.randomString(largeCharacterChange + 1)
      );
      expect(itemHistory.entries.length).to.equal(2);
      /**
       * Change it again over the delta threshhold. It should keep this revision,
       * and the last one, totaling 3.
       */
      item = await setTextAndSync(
        this.application,
        item,
        item.content.text + Factory.randomString(largeCharacterChange + 1)
      );
      expect(itemHistory.entries.length).to.equal(3);

      /** Delete over threshold text. It should keep this revision. */
      item = await setTextAndSync(
        this.application,
        item,
        deleteCharsFromString(item.content.text, largeCharacterChange + 1)
      );
      expect(itemHistory.entries.length).to.equal(4);
      /**
       * Delete just 1 character. It should keep this entry, because it's the
       * last, upping the total to 5. However, the next small revision after that
       * should delete it, keeping it at 5.
       */
      item = await setTextAndSync(
        this.application,
        item,
        deleteCharsFromString(item.content.text, 1)
      );
      expect(itemHistory.entries.length).to.equal(5);
      item = await setTextAndSync(
        this.application,
        item,
        deleteCharsFromString(item.content.text, 1)
      );
      expect(itemHistory.entries.length).to.equal(5);
    });

    it('should keep the entry right before a large deletion, regardless of its delta',
      async function () {
        const payload = CreateMaxPayloadFromAnyObject(
          Factory.createNoteParams({
            text: Factory.randomString(100)
          })
        );
        let item = await this.application.itemManager.emitItemFromPayload(
          payload,
          PayloadSource.LocalChanged
        );
        await this.application.itemManager.setItemDirty(item.uuid);
        await this.application.syncService.sync(syncOptions);
        const itemHistory = this.historyManager.sessionHistoryForItem(item);
        /** It should keep the first and last by default */
        item = await setTextAndSync(
          this.application,
          item,
          item.content.text
        );
        item = await setTextAndSync(
          this.application,
          item,
          item.content.text + Factory.randomString(1)
        );
        expect(itemHistory.entries.length).to.equal(2);
        /**
         * We want to delete a large number of characters. The revision right before
         * this one was a small negligible revision of +1 char. This would typically
         * be discarded after optimization. However, because this next revision will
         * delete a large number of characters, we want to preserve the entry right
         * before the deletion. This is because the deletion will only have the value
         * of the text after the large deletion. We want to keep the value directly
         * preceding this deletion as a way to recover from the deletion.
         */
        /**
         * It would have been 2 typically. But because we're hanging on to a small
         * revision right before a large deletion, the total will be 3.
         */
        item = await setTextAndSync(
          this.application,
          item,
          deleteCharsFromString(item.content.text, largeCharacterChange + 1)
        );
        expect(itemHistory.entries.length).to.equal(3);
        /**
         * Now we're going to make sure that the rule above only applies to large
         * negative deltas, and not large positive deltas. We don't care about
         * hanging on to the preceding revision of a large revision, since the
         * large revision will have more information.
         */
        /** Make a small positive change. This should be kept, because it's the last. */
        item = await setTextAndSync(
          this.application,
          item,
          item.content.text + Factory.randomString(1)
        );
        expect(itemHistory.entries.length).to.equal(4);
        /**
         * Make a large positive change. The previous small positive change should
         * now be discarded, keeping a total of 4.
         */
        item = await setTextAndSync(
          this.application,
          item,
          item.content.text + Factory.randomString(largeCharacterChange + 1)
        );
        expect(itemHistory.entries.length).to.equal(4);
      });

    it('entries should be ordered from newest to oldest', async function () {
      const payload = CreateMaxPayloadFromAnyObject(
        Factory.createNoteParams({
          text: Factory.randomString(200)
        })
      );

      let item = await this.application.itemManager.emitItemFromPayload(
        payload,
        PayloadSource.LocalChanged
      );

      await this.application.itemManager.setItemDirty(item.uuid);
      await this.application.syncService.sync(syncOptions);
      await Factory.sleep(0.5);

      const itemHistory = this.historyManager.sessionHistoryForItem(item);

      item = await setTextAndSync(
        this.application,
        item,
        item.content.text + Factory.randomString(1)
      );
      await Factory.sleep(0.5);

      item = await setTextAndSync(
        this.application,
        item,
        deleteCharsFromString(item.content.text, largeCharacterChange + 1)
      );
      await Factory.sleep(0.5);

      item = await setTextAndSync(
        this.application,
        item,
        item.content.text + Factory.randomString(1)
      );
      await Factory.sleep(0.5);

      item = await setTextAndSync(
        this.application,
        item,
        item.content.text + Factory.randomString(largeCharacterChange + 1)
      );
      await Factory.sleep(0.5);

      /** We should have a total of 4 revisions. */
      expect(itemHistory.entries.length).to.equal(4);

      /** First entry should be the latest revision. */
      const latestRevision = itemHistory.entries[0];
      /** Last entry should be the initial revision. */
      const initialRevision = itemHistory.entries[itemHistory.entries.length - 1];

      /** The latest entry should have the latest change of 16 characters. */
      expect(latestRevision.textCharDiffLength).to.equal(16);
      /** The oldest entry should have the initial text length of 200 characters. */
      expect(initialRevision.textCharDiffLength).to.equal(200);
      /** Finally, the latest revision updated_at value date should be more recent than the initial revision one. */
      expect(latestRevision.payload.updated_at).to.be.greaterThan(initialRevision.payload.updated_at);
    }).timeout(10000);
  });

  describe('remote', async function () {
    beforeEach(async function () {
      this.application = await Factory.createInitAppWithRandNamespace();
      this.historyManager = this.application.historyManager;
      this.modelManager = this.application.modelManager;
      this.email = Uuid.GenerateUuidSynchronously();
      this.password = Uuid.GenerateUuidSynchronously();
      await Factory.registerUserToApplication({
        application: this.application,
        email: this.email,
        password: this.password
      });
    });

    afterEach(async function () {
      await this.application.deinit();
    });

    it('response from server should be empty if not signed in', async function () {
      await this.application.signOut();
      this.application = await Factory.createInitAppWithRandNamespace();
      this.historyManager = this.application.historyManager;
      this.modelManager = this.application.modelManager;
      const item = await Factory.createSyncedNote(this.application);
      await this.application.syncService.sync(syncOptions);
      const itemHistory = await this.historyManager.remoteHistoryForItem(item);
      expect(itemHistory).to.be.undefined;
    });

    it('create basic history entries', async function () {
      const item = await Factory.createSyncedNote(this.application);
      let itemHistory = await this.historyManager.remoteHistoryForItem(item);

      /** Server history should save initial revision */
      expect(itemHistory).to.be.ok;
      expect(itemHistory.length).to.equal(1);

      /** Sync within 5 minutes, should not create a new entry */
      await this.application.saveItem(item.uuid);
      itemHistory = await this.historyManager.remoteHistoryForItem(item);
      expect(itemHistory.length).to.equal(1);

      /** Sync with different contents, should not create a new entry */
      await this.application.changeAndSaveItem(
        item.uuid,
        (mutator) => {
          mutator.title = Math.random();
        },
        undefined,
        undefined,
        syncOptions
      );
      itemHistory = await this.historyManager.remoteHistoryForItem(item);
      expect(itemHistory.length).to.equal(1);
    });

    xit('create consecutive history entries', async function () {
      // implement remote history fetching more than 1 entry
      // after 5 minutes delay apart of the updates
      // setting updated_at is not permitted via the API
    })

    xit('returns revisions from server', async function () {
      let item = await Factory.createSyncedNote(this.application);

      /** Sync with different contents, should create new entry */
      const newTitleAfterFirstChange = `The title should be: ${Math.random()}`;
      await this.application.changeAndSaveItem(
        item.uuid,
        (mutator) => {
          mutator.title = newTitleAfterFirstChange;
        },
        undefined,
        undefined,
        syncOptions
      );
      let itemHistory = await this.historyManager.remoteHistoryForItem(item);
      expect(itemHistory.length).to.equal(1);

      let revisionEntry = itemHistory[0];
      let revisionFromServer = await this.historyManager.fetchRemoteRevision(item.uuid, revisionEntry);
      expect(revisionFromServer).to.be.ok;

      let payloadFromServer = revisionFromServer.payload;
      expect(payloadFromServer.errorDecrypting).to.be.false;
      expect(payloadFromServer.uuid).to.eq(item.payload.uuid);
      expect(payloadFromServer.content).to.eql(item.payload.content);

      item = this.application.itemManager.findItem(item.uuid);
      expect(payloadFromServer.content).to.not.eql(item.payload.content);

      const newTitleAfterSecondChange = 'Something totally different.';
      await this.application.changeAndSaveItem(
        item.uuid,
        (mutator) => {
          mutator.title = newTitleAfterSecondChange;
        },
        undefined,
        undefined,
        syncOptions
      );
      itemHistory = await this.historyManager.remoteHistoryForItem(item);
      expect(itemHistory.length).to.equal(2);

      /** The first entry from response should be the previous revision before the actual, current item. */
      revisionEntry = itemHistory[0];
      revisionFromServer = await this.historyManager.fetchRemoteRevision(item.uuid, revisionEntry);
      expect(revisionFromServer).to.be.ok;

      payloadFromServer = revisionFromServer.payload;
      expect(payloadFromServer.errorDecrypting).to.be.false;
      expect(payloadFromServer.uuid).to.eq(item.payload.uuid);
      expect(payloadFromServer.content).to.eql(item.payload.content);
      expect(payloadFromServer.content.title).to.eq(newTitleAfterFirstChange);
    });

    xit('revisions count matches original for duplicated items', async function () {
      const note = await Factory.createSyncedNote(this.application);
      /** Make a few changes to note */
      await this.application.saveItem(note.uuid);
      await this.application.saveItem(note.uuid);
      await this.application.saveItem(note.uuid);
      const dupe = await this.application.itemManager.duplicateItem(note.uuid, true);
      await this.application.saveItem(dupe.uuid);

      const expectedRevisions = 3;
      const noteHistory = await this.historyManager.remoteHistoryForItem(note);
      const dupeHistory = await this.historyManager.remoteHistoryForItem(dupe);
      expect(noteHistory.length).to.equal(expectedRevisions);
      expect(dupeHistory.length).to.equal(expectedRevisions);
    });

    xit('duplicate revisions should have the originals uuid', async function () {
      const note = await Factory.createSyncedNote(this.application);
      await this.application.saveItem(note.uuid);
      const dupe = await this.application.itemManager.duplicateItem(note.uuid, true);
      await this.application.saveItem(dupe.uuid);

      const dupeHistory = await this.historyManager.remoteHistoryForItem(dupe);
      const dupeRevision = await this.historyManager.fetchRemoteRevision(
        dupe.uuid,
        dupeHistory[0]
      );
      expect(dupeRevision.payload.uuid).to.equal(note.uuid);
    });

    it('can decrypt revisions for duplicate_of items', async function () {
      const note = await Factory.createSyncedNote(this.application);
      const changedText = `${Math.random()}`;
      /** Make a few changes to note */
      await this.application.changeAndSaveItem(note.uuid, (mutator) => {
        mutator.title = changedText;
      });
      await this.application.saveItem(note.uuid);

      const dupe = await this.application.itemManager.duplicateItem(note.uuid, true);
      await this.application.saveItem(dupe.uuid);
      const itemHistory = await this.historyManager.remoteHistoryForItem(dupe);
      const newestRevision = itemHistory[0];

      const fetched = await this.historyManager.fetchRemoteRevision(
        dupe.uuid,
        newestRevision
      );
      expect(fetched.payload.errorDecrypting).to.not.be.ok;
      expect(fetched.payload.content.title).to.equal(changedText);
    });
  });
});
