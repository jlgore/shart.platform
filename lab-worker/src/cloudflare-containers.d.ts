// Type stubs for Cloudflare Containers beta API.
// The Container class is exported from 'cloudflare:workers' at runtime but
// @cloudflare/workers-types doesn't include it yet.
// Remove this file when workers-types ships the Container type.

// CloudflareWorkersModule is the namespace behind `export = CloudflareWorkersModule`
// in workers-types. Namespace merging extends it here.
declare namespace CloudflareWorkersModule {
  abstract class Container<Env = unknown> {
    protected readonly ctx: DurableObjectState;
    protected readonly env: Env;
    defaultPort: number;
    sleepAfter: string;
    fetch(request: Request): Promise<Response>;
    containerStarted(): Promise<void>;
    containerStopped(): Promise<void>;
  }
}
