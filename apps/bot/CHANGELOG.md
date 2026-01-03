# Changelog

## [1.0.0](https://github.com/fmauNeko/starwave/compare/bot@v0.5.0...bot@v1.0.0) (2026-01-03)


### ⚠ BREAKING CHANGES

* **bot:** Volume control no longer uses FFmpeg CLI or ZeroMQ IPC

### Bug Fixes

* **bot:** add build-deps to Dockerfile ([7790d83](https://github.com/fmauNeko/starwave/commit/7790d8347967a13ca1847e8dabb9ce0abf74c772))


### Performance Improvements

* **bot:** enable Opus passthrough to reduce CPU usage ([a156b62](https://github.com/fmauNeko/starwave/commit/a156b62a47fd183ca12d731fc440e2f68cbd8786))


### Code Refactoring

* **bot:** replace ZMQ/FFmpeg volume control with Discord.js inlineVolume ([b77b72a](https://github.com/fmauNeko/starwave/commit/b77b72a00815d1754017c2b9e5d0c7930ed8d966))

## [0.5.0](https://github.com/fmauNeko/starwave/compare/bot@v0.4.0...bot@v0.5.0) (2026-01-01)


### Features

* **bot:** detect musl libc to download correct yt-dlp binary for Alpine ([eaf9a47](https://github.com/fmauNeko/starwave/commit/eaf9a479dc9d35fa8f631cf4be901835fc146ffc))

## [0.4.0](https://github.com/fmauNeko/starwave/compare/bot@v0.3.1...bot@v0.4.0) (2026-01-01)


### Features

* **bot:** replace youtubei.js with yt-dlp for YouTube audio extraction ([f0343af](https://github.com/fmauNeko/starwave/commit/f0343afb951ed614ce50bc7277004c8e36565c63))

## [0.3.1](https://github.com/fmauNeko/starwave/compare/bot@v0.3.0...bot@v0.3.1) (2025-12-31)


### Bug Fixes

* **bot:** fix Dockerfile ([b29a0f0](https://github.com/fmauNeko/starwave/commit/b29a0f0f08deb3cb31a5300b0235e876f8cef6d8))

## [0.3.0](https://github.com/fmauNeko/starwave/compare/bot@v0.2.0...bot@v0.3.0) (2025-12-31)


### Features

* **bot:discord:music:** implement near-live volume management ([e76fc45](https://github.com/fmauNeko/starwave/commit/e76fc4560930ba90cc6d073d885651d8f17986d3))
* **bot:discord:music:** initial music playing feature ([cdbbe0b](https://github.com/fmauNeko/starwave/commit/cdbbe0b3e4dfb81a7420d85f4d8d6f3e501ef626))
* **bot:discord:music:** split youtube provider, add provider autodiscovery ([8fb134e](https://github.com/fmauNeko/starwave/commit/8fb134ec6b1894306e39c5b93352c0763d0a0047))
* **bot:discord:music:** test coverage ([8a7bb9b](https://github.com/fmauNeko/starwave/commit/8a7bb9bfde21cdb4d9934df8264b19d3366c11c2))
* **bot:** add vitest eslint rules ([39d908b](https://github.com/fmauNeko/starwave/commit/39d908b68b7e6f10cc92b71fbf2b13f5cc85db82))
* **bot:** rework Dockerfile for pnpm ([ec14a8b](https://github.com/fmauNeko/starwave/commit/ec14a8bf791f34a4ceacc37d93c54ff6ed383527))


### Bug Fixes

* **deps:** update dependency discord-api-types to ^0.38.0 ([f217dc1](https://github.com/fmauNeko/starwave/commit/f217dc1d64dfe8b12c65a0977c96e2feafb3a7aa))

## [0.2.0](https://github.com/fmauNeko/starwave/compare/bot@v0.1.0...bot@v0.2.0) (2025-12-21)


### Features

* **bot:config:** allow overriding json config with env vars ([093af95](https://github.com/fmauNeko/starwave/commit/093af95536d7261103207b7bd4a65ebf1a604e54))

## [0.1.0](https://github.com/fmauNeko/starwave/compare/bot@v0.0.1...bot@v0.1.0) (2025-12-20)


### Features

* **bot:discord:** add ping command ([8b65bcd](https://github.com/fmauNeko/starwave/commit/8b65bcdf9c982a72ffa035d9fe8d91a21b9c846f))
* **turbo:** init monorepo ([70a9e82](https://github.com/fmauNeko/starwave/commit/70a9e82ca721f9ddcf1bb908b1f00d95c1c9258d))


### Bug Fixes

* **bot:** update Dockerfile for turborepo ([d87410d](https://github.com/fmauNeko/starwave/commit/d87410d9219a2b9ec5c81b1de6841508916cea6f))
