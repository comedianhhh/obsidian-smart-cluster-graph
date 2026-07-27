import { SmartGraphSettings } from '../types';

export interface LicenseInfo {
  isValid: boolean;
  licenseKey: string;
  planName: string;
  expiryDate?: string;
  errorMessage?: string;
}

export class LicenseManager {
  private settings: SmartGraphSettings;

  constructor(settings: SmartGraphSettings) {
    this.settings = settings;
  }

  /**
   * Validate license key.
   * Interface is prepared for remote server validation (LemonSqueezy / Gumroad API).
   */
  public async validateLicenseKey(key: string): Promise<LicenseInfo> {
    const trimmedKey = key.trim();

    if (!trimmedKey) {
      return {
        isValid: false,
        licenseKey: '',
        planName: 'Free / Unregistered',
        errorMessage: 'No license key entered.',
      };
    }

    // Basic format validation or trial check
    if (trimmedKey.startsWith('SG-PRO-') || trimmedKey.length >= 12) {
      this.settings.isLicensed = true;
      this.settings.licenseKey = trimmedKey;
      return {
        isValid: true,
        licenseKey: trimmedKey,
        planName: 'Smart Graph Pro (Commercial)',
      };
    }

    return {
      isValid: false,
      licenseKey: trimmedKey,
      planName: 'Invalid Key',
      errorMessage: 'Invalid license key format.',
    };
  }

  public isProEnabled(): boolean {
    return this.settings.isLicensed || this.settings.licenseKey.length > 0;
  }
}
