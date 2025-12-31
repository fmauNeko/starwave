import { beforeEach, describe, expect, it, vi } from 'vitest';
import { YouTubeProvider } from './youtube.provider';

const { mockGetBasicInfo } = vi.hoisted(() => ({
  mockGetBasicInfo: vi.fn().mockResolvedValue({
    basic_info: {
      title: 'Test Video',
      duration: 180,
      thumbnail: [{ url: 'https://example.com/thumb.jpg' }],
    },
    streaming_data: {
      adaptive_formats: [
        {
          has_audio: true,
          has_video: false,
          url: 'https://example.com/audio.webm',
          mime_type: 'audio/webm; codecs="opus"',
        },
      ],
    },
  }),
}));

vi.mock('youtubei.js', () => ({
  Innertube: {
    create: vi.fn().mockResolvedValue({
      getBasicInfo: mockGetBasicInfo,
    }),
  },
  UniversalCache: vi.fn(),
  ClientType: {
    ANDROID: 'ANDROID',
  },
}));

describe('YouTubeProvider', () => {
  let provider: YouTubeProvider;

  beforeEach(async () => {
    vi.clearAllMocks();
    provider = new YouTubeProvider();
    await provider.onModuleInit();
  });

  describe('canHandle', () => {
    it('returns true for youtube.com watch URL', () => {
      expect(
        provider.canHandle('https://youtube.com/watch?v=dQw4w9WgXcQ'),
      ).toBe(true);
    });

    it('returns true for youtu.be URL', () => {
      expect(provider.canHandle('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
    });

    it('returns true for youtube.com embed URL', () => {
      expect(provider.canHandle('https://youtube.com/embed/dQw4w9WgXcQ')).toBe(
        true,
      );
    });

    it('returns true for bare video ID', () => {
      expect(provider.canHandle('dQw4w9WgXcQ')).toBe(true);
    });

    it('returns false for non-YouTube URL', () => {
      expect(provider.canHandle('https://soundcloud.com/artist/track')).toBe(
        false,
      );
    });

    it('returns false for invalid URL', () => {
      expect(provider.canHandle('not-a-valid-url')).toBe(false);
    });
  });

  describe('fetchTrackInfo', () => {
    it('returns track info for valid URL', async () => {
      const track = await provider.fetchTrackInfo(
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
        'user#1234',
      );

      expect(track).toMatchObject({
        url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Test Video',
        duration: 180,
        thumbnail: 'https://example.com/thumb.jpg',
        requestedBy: 'user#1234',
      });
    });

    it('throws error for invalid URL', async () => {
      await expect(
        provider.fetchTrackInfo('https://example.com/not-youtube', 'user#1234'),
      ).rejects.toThrow('Invalid YouTube URL');
      expect(mockGetBasicInfo).not.toHaveBeenCalled();
    });
  });

  describe('getAudioUrl', () => {
    it('returns audio URL for valid video URL', async () => {
      const audioUrl = await provider.getAudioUrl(
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
      );

      expect(audioUrl).toBe('https://example.com/audio.webm');
    });

    it('throws error for invalid URL', async () => {
      await expect(
        provider.getAudioUrl('https://example.com/not-youtube'),
      ).rejects.toThrow('Invalid YouTube URL');
      expect(mockGetBasicInfo).not.toHaveBeenCalled();
    });
  });

  describe('name', () => {
    it('returns YouTube as provider name', () => {
      expect(provider.name).toBe('YouTube');
    });
  });
});
