import { SkylabConfig, Defaults } from './config';
import { IdentityProvider } from './types/identity';
import { Storage } from './types/storage';
import { LocalStorage } from './storage/localStorage';
import { HttpClient } from './types/transport';
import { Client } from './types/client';
import { SkylabUser } from './types/user';
import { base36Id } from './util/base36Id';
import { urlSafeBase64Encode } from './util/base64';

export class SkylabClient implements Client {
  protected readonly instanceName: string;
  protected readonly apiKey: string;
  protected readonly storage: Storage;
  protected readonly storageNamespace: string;
  protected readonly httpClient: HttpClient;

  protected serverUrl: string;
  protected config: SkylabConfig;
  protected user: SkylabUser;
  protected initialized: boolean;
  protected identityProvider: IdentityProvider;
  protected enrollmentId: string;

  public constructor(
    instanceName: string,
    apiKey: string,
    config: SkylabConfig,
    httpClient: HttpClient,
  ) {
    this.instanceName = instanceName;
    this.apiKey = apiKey;
    this.httpClient = httpClient;
    this.config = config;
    this.serverUrl = config?.serverUrl || Defaults.SERVER_URL;
    const shortApiKey = this.apiKey.substring(this.apiKey.length - 6);
    this.storageNamespace = `amp-sl-${shortApiKey}`;
    this.storage = new LocalStorage(this.storageNamespace);
  }

  public async setContext(user: SkylabUser): Promise<SkylabClient> {
    this.user = user;
    this.storage.clear();
    this.storage.save();
    return this.fetchAll();
  }

  public async start(user: SkylabUser): Promise<SkylabClient> {
    this.user = user || {};
    this.loadEnrollmentId();
    this.storage.load();
    if (this.config?.initialFlags && this.config?.preferInitialFlags) {
      // initial flags take precedent over local storage until flags are fetched
      for (const [flagKey, value] of Object.entries(this.config.initialFlags)) {
        this.storage.put(flagKey, value);
      }
    }
    return this.fetchAll();
  }

  public setIdentityProvider(identityProvider: IdentityProvider): SkylabClient {
    this.identityProvider = identityProvider;
    return this;
  }

  private loadEnrollmentId() {
    try {
      this.enrollmentId = localStorage.getItem(Defaults.METADATA_STORAGE_KEY);
    } catch (e) {
      // pass
    }
    if (!this.enrollmentId) {
      this.enrollmentId = base36Id();
      try {
        localStorage.setItem(Defaults.METADATA_STORAGE_KEY, this.enrollmentId);
      } catch (e) {
        // pass
      }
    }
  }

  protected async fetchAll(): Promise<SkylabClient> {
    if (this.apiKey === null) {
      return this;
    }
    try {
      const user = this.user;
      const userContext = {
        ...user,
      };
      if (!userContext.id) {
        userContext.id = this.enrollmentId;
      }
      if (this.identityProvider?.getDeviceId()) {
        userContext.device_id = this.identityProvider.getDeviceId();
      }
      if (this.identityProvider?.getUserId()) {
        userContext.user_id = this.identityProvider.getUserId();
      }
      const encodedContext = urlSafeBase64Encode(JSON.stringify(userContext));
      const response = await this.httpClient.request(
        `${this.serverUrl}/sdk/variants/${encodedContext}`,
        'GET',
        { Authorization: `Api-Key ${this.apiKey}` },
      );
      const json = await response.json();
      this.storage.clear();
      for (const flag of Object.keys(json)) {
        this.storage.put(flag, json[flag]);
      }
      this.storage.save();
    } catch (e) {
      console.error(e);
    }
    return this;
  }

  /**
   * Returns the variant for the provided flagKey.
   * Fallback order:
   * - Provided fallback
   * - Initial flags
   * - fallbackVariant in config
   * - Defaults.FALLBACK_VARIANT (empty string)
   * Fallbacks happen if a value is null or undefined
   */
  public getVariant(
    flagKey: string,
    fallback: string,
  ): string {
    if (this.apiKey === null) {
      return null;
    }
    let variant: string = this.storage.get(flagKey);
    variant = variant ?? fallback ?? this.config?.initialFlags?.[flagKey] ?? this.config?.fallbackVariant ?? Defaults.FALLBACK_VARIANT;
    return variant;
  }
}
