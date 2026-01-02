import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { MusicProviderDiscovery } from './music-provider-discovery.service';
import { MUSIC_PROVIDER_KEY } from './music-provider.decorator';
import type { MusicProvider } from './music-provider.interface';

describe('MusicProviderDiscovery', () => {
  let service: MusicProviderDiscovery;
  let discoveryService: DiscoveryService;
  let reflector: Reflector;

  const createMockProvider = (name: string): MusicProvider => ({
    name,
    canHandle: vi.fn(),
    fetchTrackInfo: vi.fn(),
    getAudioInfo: vi.fn(),
  });

  beforeEach(() => {
    discoveryService = {
      getProviders: vi.fn().mockReturnValue([]),
    } as unknown as DiscoveryService;

    reflector = {
      get: vi.fn().mockReturnValue(false),
    } as unknown as Reflector;

    service = new MusicProviderDiscovery(discoveryService, reflector);
  });

  describe('onModuleInit', () => {
    it('discovers providers with @MusicProvider decorator', () => {
      const mockYouTubeProvider = createMockProvider('YouTube');
      const mockSoundCloudProvider = createMockProvider('SoundCloud');

      // eslint-disable-next-line @typescript-eslint/no-extraneous-class
      class YouTubeProvider {}
      // eslint-disable-next-line @typescript-eslint/no-extraneous-class
      class SoundCloudProvider {}
      // eslint-disable-next-line @typescript-eslint/no-extraneous-class
      class RegularService {}

      vi.mocked(discoveryService.getProviders).mockReturnValue([
        { metatype: YouTubeProvider, instance: mockYouTubeProvider },
        { metatype: SoundCloudProvider, instance: mockSoundCloudProvider },
        { metatype: RegularService, instance: {} },
      ] as ReturnType<DiscoveryService['getProviders']>);

      vi.mocked(reflector.get).mockImplementation((key, target) => {
        if (key === MUSIC_PROVIDER_KEY) {
          return target === YouTubeProvider || target === SoundCloudProvider;
        }
        return false;
      });

      service.onModuleInit();

      const providers = service.getProviders();
      expect(providers).toHaveLength(2);
      expect(providers).toContain(mockYouTubeProvider);
      expect(providers).toContain(mockSoundCloudProvider);
    });

    it('returns empty array when no providers are decorated', () => {
      // eslint-disable-next-line @typescript-eslint/no-extraneous-class
      class RegularService {}

      vi.mocked(discoveryService.getProviders).mockReturnValue([
        { metatype: RegularService, instance: {} },
      ] as ReturnType<DiscoveryService['getProviders']>);

      service.onModuleInit();

      expect(service.getProviders()).toHaveLength(0);
    });

    it('filters out wrappers without metatype', () => {
      vi.mocked(discoveryService.getProviders).mockReturnValue([
        { metatype: null, instance: {} },
        { metatype: undefined, instance: {} },
      ] as unknown as ReturnType<DiscoveryService['getProviders']>);

      service.onModuleInit();

      expect(service.getProviders()).toHaveLength(0);
    });

    it('filters out null/undefined instances', () => {
      // eslint-disable-next-line @typescript-eslint/no-extraneous-class
      class YouTubeProvider {}

      vi.mocked(discoveryService.getProviders).mockReturnValue([
        { metatype: YouTubeProvider, instance: null },
        { metatype: YouTubeProvider, instance: undefined },
      ] as unknown as ReturnType<DiscoveryService['getProviders']>);

      vi.mocked(reflector.get).mockReturnValue(true);

      service.onModuleInit();

      expect(service.getProviders()).toHaveLength(0);
    });
  });

  describe('getProviders', () => {
    it('returns empty array before onModuleInit', () => {
      expect(service.getProviders()).toEqual([]);
    });
  });
});
