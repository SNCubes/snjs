import { PurePayload } from '@Payloads/pure_payload';
import { CreateSourcedPayloadFromObject } from '@Payloads/generator';
import { ResponseSignalReceiver, SyncSignal } from '@Services/sync/signals';
import { PayloadField } from '@Payloads/fields';
import { PayloadSource } from '@Payloads/sources';
import { SyncResponse } from '@Services/sync/response';
import { Copy } from '@Lib/utils';

export class OfflineSyncOperation {

  payloads: PurePayload[]
  receiver: ResponseSignalReceiver

  /**
   * @param payloads  An array of payloads to sync offline
   * @param receiver  A function that receives callback multiple times during the operation
   */
  constructor(
    payloads: PurePayload[],
    receiver: ResponseSignalReceiver
  ) {
    this.payloads = payloads;
    this.receiver = receiver;
  }

  async run() {
    const responsePayloads = this.payloads.map((payload) => {
      return CreateSourcedPayloadFromObject(
        payload,
        PayloadSource.LocalSaved,
        {
          dirty: false,
          lastSyncEnd: new Date()
        }
      );
    });
    /* Since we are simulating a server response, they should be pure JS objects */
    const savedItems = Copy(responsePayloads) as any[];
    const response = new SyncResponse({saved_items: savedItems});
    await this.receiver(SyncSignal.Response, response);
  }
}
