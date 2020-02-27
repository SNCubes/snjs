import { PureService } from '@Lib/services/pure_service';
import { StorageKeys } from '@Lib/storage_keys';
import { StorageValueModes } from '@Services/storage_service';
import { Challenges } from '@Lib/challenges';

export class DeviceAuthService extends PureService {

  constructor({ storageService, keyManager, protocolService }) {
    super();
    this.storageService = storageService;
    this.keyManager = keyManager;
    this.protocolService = protocolService;
  }

  /** @access public */
  isPasscodeLocked() {
    return this.keyManager.rootKeyNeedsUnwrapping();
  }

  async getLaunchChallenges() {
    const challenges = [];

    const hasPasscode = await this.keyManager.hasPasscode();
    if (hasPasscode) {
      challenges.push(Challenges.LocalPasscode);
    }

    const biometricPrefs = await this.storageService.getValue(
      StorageKeys.BiometricPrefs,
      StorageValueModes.Nonwrapped
    );
    const biometricEnabled = biometricPrefs && biometricPrefs.enabled;
    if (biometricEnabled) {
      challenges.push(Challenges.Biometric);
    }

    return challenges;
  }

  async enableBiometrics() {
    await this.storageService.setValue(
      StorageKeys.BiometricPrefs,
      { enabled: true },
      StorageValueModes.Nonwrapped
    );
  }

  async validateChallengeResponse(response) {
    if (response.challenge === Challenges.LocalPasscode) {
      return this.keyManager.validatePasscode(response.value);
    }
    else if (response.challenge === Challenges.AccountPassword) {
      return this.keyManager.validateAccountPassword(response.value);
    }
    else if (response.challenge === Challenges.Biometric) {
      return response.value === true;
    }
    throw `Cannot validate challenge type ${response.challenge}`;
  }

  async handleChallengeResponse(response) {
    if (response.challenge === Challenges.LocalPasscode) {
      const key = await this.keyManager.computeWrappingKey({
        passcode: response.value
      });
      await this.keyManager.unwrapRootKey({
        wrappingKey: key
      });
    } else {
      /** No action. */
    }
  }
}