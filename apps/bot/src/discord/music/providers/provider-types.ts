export enum ProviderType {
  YouTube = 'youtube',
  SoundCloud = 'soundcloud',
  Bandcamp = 'bandcamp',
  Vimeo = 'vimeo',
  Dailymotion = 'dailymotion',
  Spotify = 'spotify',
  Radio = 'radio',
  Direct = 'direct',
}

export const PROVIDER_COLORS: Record<ProviderType, number> = {
  [ProviderType.YouTube]: 0xff0000,
  [ProviderType.SoundCloud]: 0xf35f2b,
  [ProviderType.Bandcamp]: 0x33a1c1,
  [ProviderType.Vimeo]: 0x3abae8,
  [ProviderType.Dailymotion]: 0x00d2f3,
  [ProviderType.Spotify]: 0x1db954,
  [ProviderType.Radio]: 0xc45c60,
  [ProviderType.Direct]: 0x31aff2,
};

export const PROVIDER_NAMES: Record<ProviderType, string> = {
  [ProviderType.YouTube]: 'YouTube',
  [ProviderType.SoundCloud]: 'SoundCloud',
  [ProviderType.Bandcamp]: 'Bandcamp',
  [ProviderType.Vimeo]: 'Vimeo',
  [ProviderType.Dailymotion]: 'Dailymotion',
  [ProviderType.Spotify]: 'Spotify',
  [ProviderType.Radio]: 'Radio',
  [ProviderType.Direct]: 'Direct URL',
};
