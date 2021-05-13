import { Variant } from './types/variant';

/**
 * @category Configuration
 */
export interface SkylabConfig {
  /**
   * Set to true to log some extra information to the console.
   */
  debug?: boolean;

  /**
   * Set to true to view assignment requests in the UI debugger
   */
  debugAssignmentRequests?: boolean;

  /**
   * The default fallback variant for all {@link SkylabClient.getVariant} calls.
   */
  fallbackVariant?: string;

  /**
   * Initial variant values for flags. This is useful for bootstrapping the client with
   * values determined on the server.
   */
  initialFlags?: { [flagKey: string]: string | Variant };

  /**
   * The instance name for the SkylabClient. Instance names are case _insensitive_.
   */
  instanceName?: string;

  /**
   * True if this client is being initialized on the server side. This is useful for server side rendering.
   * Currently this flag is unused but is reserved for future use.
   */
  isServerSide?: boolean;

  /**
   * Whether to prioritize initialFlags over localStorage while async requests for variants are still in flight.
   */
  preferInitialFlags?: boolean;

  /**
   * The server endpoint from which to request variants.
   */
  serverUrl?: string;

  /**
   * The local storage key to use for storing metadata
   */
  storageKey?: 'amp-sl-meta';
}

/**
 Defaults for Skylab Config options

 | **Option**       | **Default**                       |
 |------------------|-----------------------------------|
 | **debug**        | false                             |
 | **debugAssignmentRequests** | false                  |
 | **fallbackVariant**         | ""                     |
 | **instanceName** | `"$default_instance"`             |
 | **isServerSide**            | false                  |
 | **preferInitialFlags**      | false                  |
 | **serverUrl**    | `"https://api.lab.amplitude.com"` |
 | **storageKey**    | `"amp-sl-meta"` |

 *
 * @category Configuration
 */
export const Defaults: SkylabConfig = {
  debug: false,
  debugAssignmentRequests: false,
  fallbackVariant: '',
  instanceName: '$default_instance',
  isServerSide: false,
  preferInitialFlags: false,
  serverUrl: 'https://api.lab.amplitude.com',
  storageKey: 'amp-sl-meta',
};
