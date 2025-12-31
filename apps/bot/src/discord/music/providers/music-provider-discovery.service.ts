import { Injectable, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { MUSIC_PROVIDER_KEY } from './music-provider.decorator';
import type { MusicProvider } from './music-provider.interface';

export const MUSIC_PROVIDERS = Symbol('MUSIC_PROVIDERS');

@Injectable()
export class MusicProviderDiscovery implements OnModuleInit {
  private providers: MusicProvider[] = [];

  public constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly reflector: Reflector,
  ) {}

  public onModuleInit(): void {
    const wrappers = this.discoveryService.getProviders();

    this.providers = wrappers
      .filter((wrapper) => {
        if (!wrapper.metatype) {
          return false;
        }
        return (
          this.reflector.get(MUSIC_PROVIDER_KEY, wrapper.metatype) === true
        );
      })
      .map((wrapper) => wrapper.instance as MusicProvider)
      .filter(Boolean);
  }

  public getProviders(): MusicProvider[] {
    return this.providers;
  }
}
