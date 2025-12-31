import { Injectable, SetMetadata } from '@nestjs/common';

export const MUSIC_PROVIDER_KEY = Symbol('MUSIC_PROVIDER');

export function MusicProvider(): ClassDecorator {
  return (target) => {
    Injectable()(target);
    SetMetadata(MUSIC_PROVIDER_KEY, true)(target);
  };
}
