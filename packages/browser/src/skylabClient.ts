/**
 * @packageDocumentation
 * @module skylab-js-client
 */

import { version as PACKAGE_VERSION } from '../package.json';

import { SkylabConfig, Defaults } from './config';
import { LocalStorage } from './storage/localStorage';
import { FetchHttpClient } from './transport/http';
import { Client } from './types/client';
import { ContextProvider } from './types/context';
import { Storage } from './types/storage';
import { HttpClient } from './types/transport';
import { SkylabUser } from './types/user';
import { Variant, Variants } from './types/variant';
import { urlSafeBase64Encode } from './util/base64';
import { normalizeInstanceName } from './util/normalize';
import { randomString } from './util/randomstring';

/**
 * The default {@link Client} used to fetch variations from Skylab's servers.
 * @category Core Usage
 */
export class SkylabClient implements Client {
  protected readonly instanceName: string;
  protected readonly apiKey: string;
  protected readonly storage: Storage;
  protected readonly storageNamespace: string;
  protected readonly httpClient: HttpClient;
  protected readonly debug: boolean;
  protected readonly debugAssignmentRequests: boolean;

  protected config: SkylabConfig;
  protected user: SkylabUser;
  protected contextProvider: ContextProvider;

  private retry = 0;

  /**
   * Creates a new SkylabClient instance.
   * @param apiKey The Client key for the Skylab project
   * @param config See {@link SkylabConfig} for config options
   */
  public constructor(apiKey: string, config: SkylabConfig) {
    this.apiKey = apiKey;
    this.config = { ...Defaults, ...config };
    const normalizedInstanceName = normalizeInstanceName(
      this.config.instanceName,
    );

    this.instanceName = normalizedInstanceName;
    this.httpClient = FetchHttpClient;

    const shortApiKey = this.apiKey.substring(this.apiKey.length - 6);
    this.storageNamespace = `amp-sl-${shortApiKey}`;
    this.storage = new LocalStorage(this.storageNamespace);

    this.debug = this.config.debug;
    this.debugAssignmentRequests = this.config.debugAssignmentRequests;
  }

  /**
   * Starts the client. This will
   * 1. Load the id from local storage, or generate a new one if one does not exist.
   * 2. Asynchronously fetch all variants with the provided user context.
   * 3. Fall back on local storage (or initialFlags if `preferInitialFlags` is true) while the async
   *    request for variants is continuing.
   * 4. If the fetch fails and the retry flag is set, start the retry interval until success.
   *
   * If you are using the `initialFlags` config option to pre-load this SDK from the
   * server, you do not need to call `start`.
   *
   * @param user The user context for variants. See {@link SkylabUser} for more details.
   * @returns A promise that resolves when the async request for variants is complete.
   */
  public async start(user: SkylabUser): Promise<SkylabClient> {
    this.user = user || {};
    this.storage.load();
    if (this.config.initialFlags && this.config.preferInitialFlags) {
      // initial flags take precedent over local storage until flags are fetched
      for (const [flagKey, value] of Object.entries(this.config.initialFlags)) {
        this.storage.put(flagKey, this._convertVariant(value));
      }
    }
    try {
      await this.fetchAll(
        user,
        this.config.fetchTimeoutMillis,
        this.config.fetchRetry,
      );
    } catch (e) {
      console.error(e);
    }
    return this;
  }

  /**
   * Sets the user context. Skylab will continue to serve variation assignments
   * from the old user context until new variants are fetched.
   *
   * If the fetch triggered by this function fails, the retry interval will be started
   * if the flag is set and continue until the fetch succeeds.
   * @param user The user context for variants. See {@link SkylabUser} for more details.
   * @returns A promise that resolves when the async request for variants is complete.
   */
  public async setUser(user: SkylabUser): Promise<SkylabClient> {
    this.user = user;
    try {
      await this.fetchAll(
        user,
        this.config.fetchTimeoutMillis,
        this.config.fetchRetry,
      );
    } catch (e) {
      console.error(e);
    }
    return this;
  }

  /**
   * Sets an context provider that will inject identity information into the user
   * context. The context provider will override any device ID or user ID set on
   * the SkylabUser object.
   * See {@link ContextProvider} for more details
   * @param contextProvider
   */
  public setContextProvider(contextProvider: ContextProvider): SkylabClient {
    this.contextProvider = contextProvider;
    return this;
  }

  protected async fetchAll(
    user: SkylabUser,
    timeoutMillis: number,
    retry: boolean,
  ): Promise<Variants> {
    // Don't even try to fetch variants if API key is not set
    if (!this.apiKey) {
      throw Error('Skylab API key is empty');
    }

    // Proactively stop retries if active in order to avoid unecessary API requests.
    // A failure will restart the retry
    if (retry) {
      this.stopRetries();
    }

    try {
      // Do fetch, parse response body, and store.
      const response = await this.doFetch(user, timeoutMillis);
      const variants = await this.parseResponse(response);
      this.storeVariants(variants);
      return variants;
    } catch (e) {
      console.error(e);
      if (retry) {
        this.startRetries();
      }
      throw e;
    }
  }

  protected async doFetch(
    user: SkylabUser,
    timeoutMillis: number,
  ): Promise<Response> {
    const userContext = this.addContext(user);
    const encodedContext = urlSafeBase64Encode(JSON.stringify(userContext));
    let queryString = '';
    let debugAssignmentRequestsParam: string;
    if (this.debugAssignmentRequests) {
      debugAssignmentRequestsParam = `d=${randomString(8)}`;
    }
    if (debugAssignmentRequestsParam) {
      queryString = '?' + debugAssignmentRequestsParam;
    }
    const endpoint = `${this.config.serverUrl}/sdk/vardata/${encodedContext}${queryString}`;
    const headers = {
      Authorization: `Api-Key ${this.apiKey}`,
    };
    if (this.debug) {
      console.debug('[Skylab] Fetch variants for user: ', userContext);
    }
    const response = await this.httpClient.requestWithTimeout(
      timeoutMillis,
      endpoint,
      'GET',
      headers,
    );
    if (this.debug) {
      console.debug('[Skylab] Received fetch response:', response);
    }
    return response;
  }

  protected async parseResponse(response: Response): Promise<Variants> {
    const json = await response.json();
    const variants: Variants = {};
    for (const flag of Object.keys(json)) {
      variants[flag] = {
        value: json[flag].key,
        payload: json[flag].payload,
      };
    }
    if (this.debug) {
      console.debug('[Skylab] Received variants:', variants);
    }
    return variants;
  }

  protected storeVariants(variants: Variants): void {
    this.storage.clear();
    for (const key in variants) {
      this.storage.put(key, variants[key]);
    }
    this.storage.save();
    if (this.debug) {
      console.debug('[Skylab] Stored flags:', variants);
    }
  }

  protected startRetries(): void {
    if (this.debug) {
      console.debug('[Skylab] Retry fetch all');
    }
    // Non-zero retry means we already have a retry interval in progress.
    if (this.retry != 0) {
      if (this.debug) {
        console.debug('[Skylab] Retry fetch interval already in progress');
      }
      return;
    }
    // Run fetchAll for the current user at an interval defined by the
    // fetchRetryIntervalMillis config.
    this.retry = window.setInterval(async () => {
      try {
        await this.fetchAll(
          this.user,
          this.config.fetchRetryTimeoutMillis,
          false,
        );
      } catch (e) {
        console.error(e);
      }
    }, this.config.fetchRetryIntervalMillis);
  }

  protected stopRetries(): void {
    window.clearInterval(this.retry);
    this.retry = 0;
  }

  private addContext(user: SkylabUser) {
    return {
      device_id: this.contextProvider?.getDeviceId() || undefined,
      user_id: this.contextProvider?.getUserId() || undefined,
      version: this.contextProvider?.getVersion() || undefined,
      language: this.contextProvider?.getLanguage() || undefined,
      platform: this.contextProvider?.getPlatform() || undefined,
      os: this.contextProvider?.getOs() || undefined,
      device_model: this.contextProvider?.getDeviceModel() || undefined,
      library: `skylab-js-client/${PACKAGE_VERSION}`,
      ...user,
    };
  }

  /**
   * Returns the variant for the provided flagKey.
   * Fallback order:
   * - Provided fallback
   * - Initial flags
   * - fallbackVariant in config
   * - Defaults.fallbackVariant (empty string)
   * Fallbacks happen if a value is null or undefined
   * @param flagKey
   * @param fallback A fallback value that takes precedence over any other fallback value.
   */
  public getVariant(flagKey: string, fallback?: string | Variant): Variant {
    if (!this.apiKey) {
      return { value: undefined };
    }
    const variant = this._convertVariant(
      this.storage.get(flagKey) ??
        fallback ??
        this.config.initialFlags?.[flagKey] ??
        this.config.fallbackVariant,
    );

    if (this.debug) {
      console.debug(`[Skylab] variant for flag ${flagKey} is ${variant.value}`);
    }

    return variant;
  }

  /**
   * Returns all variants for the user
   */
  public getVariants(): Variants {
    if (!this.apiKey) {
      return {};
    }
    return this.storage.getAll();
  }

  /**
   * Converts a string value or Variant to a Variant object
   * @param value
   * @returns
   */
  private _convertVariant(value: string | Variant): Variant | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value == 'string') {
      return {
        value: value,
      };
    } else {
      return value;
    }
  }
}
