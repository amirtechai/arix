import { ArixError } from '../errors.js'
import type { Provider } from './base.js'

type ProviderFactory = () => Provider

export class ProviderRegistry {
  private readonly providers  = new Map<string, Provider>()
  private readonly factories  = new Map<string, ProviderFactory>()
  private defaultId: string | undefined

  /** Register an already-instantiated provider (eager). */
  register(provider: Provider): void {
    if (!this.defaultId) this.defaultId = provider.id
    this.providers.set(provider.id, provider)
  }

  /**
   * Register a factory function. The provider is instantiated only when first
   * accessed via get() or getDefault() — reduces startup latency.
   */
  registerLazy(id: string, factory: ProviderFactory): void {
    if (!this.defaultId) this.defaultId = id
    this.factories.set(id, factory)
  }

  get(id: string): Provider | undefined {
    const existing = this.providers.get(id)
    if (existing) return existing
    const factory = this.factories.get(id)
    if (!factory) return undefined
    const provider = factory()
    this.providers.set(id, provider)
    this.factories.delete(id)
    return provider
  }

  list(): Provider[] {
    // Instantiate all lazy factories so callers see full list
    for (const [id, factory] of this.factories) {
      this.providers.set(id, factory())
      this.factories.delete(id)
    }
    return Array.from(this.providers.values())
  }

  getDefault(): Provider {
    if (!this.defaultId) {
      throw new ArixError('PROVIDER_UNAVAILABLE', 'No providers registered')
    }
    const provider = this.get(this.defaultId)
    if (!provider) throw new ArixError('PROVIDER_UNAVAILABLE', `Default provider '${this.defaultId}' not found`)
    return provider
  }
}
