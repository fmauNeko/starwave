# Changelog

## [1.4.2](https://github.com/fmauNeko/starwave/compare/bot@v1.4.1...bot@v1.4.2) (2026-08-14)


### Bug Fixes

* **deps:** update dependency youtubei.js to v18 ([4a0ece7](https://github.com/fmauNeko/starwave/commit/4a0ece72932d7a6e12a07f1ed6cb37e8541f76ca))
* **deps:** update dependency youtubei.js to v18 ([9b11f15](https://github.com/fmauNeko/starwave/commit/9b11f15613473e435a52efbcd6def1c50a8e3d59))

## [1.4.1](https://github.com/fmauNeko/starwave/compare/bot@v1.4.0...bot@v1.4.1) (2026-08-13)


### Bug Fixes

* **bot:** cap SABR recovery instead of rebuilding the session per retry ([9973491](https://github.com/fmauNeko/starwave/commit/9973491697234e875de6673803da9c34e69ebc33))
* **bot:** log voice player stream errors without racing queue auto-advance ([023c368](https://github.com/fmauNeko/starwave/commit/023c36854ed64951bd0615ea1d38109def8ae8ce))
* **bot:** recover SABR streams in-flight from PoToken rejection ([84c6173](https://github.com/fmauNeko/starwave/commit/84c6173071ba6a55755d1b42c5384e67b99b4153))
* **bot:** schedule proactive innertube session refresh every 6h ([b70a2da](https://github.com/fmauNeko/starwave/commit/b70a2da0198bc3e9af0ec9a1aaab31e537774e21))
* **bot:** separate reload and protection recovery budgets, harden challenge extraction ([a3622ae](https://github.com/fmauNeko/starwave/commit/a3622ae211462adad605459e726693ae6b9b0ea1))
* **bot:** source BotGuard challenge from the page instead of /att/get ([cde6f86](https://github.com/fmauNeko/starwave/commit/cde6f86aeefd9b3970937035ea1be1303838ba6f))

## [1.4.0](https://github.com/fmauNeko/starwave/compare/bot@v1.3.0...bot@v1.4.0) (2026-08-11)


### Features

* **web:** init web app ([2da2ddf](https://github.com/fmauNeko/starwave/commit/2da2ddf689f6d078bf8e14500617816dfa37d35b))


### Bug Fixes

* **bot:** adopt bgutils-js v4 subpath exports ([99f22e2](https://github.com/fmauNeko/starwave/commit/99f22e2888f7303f7bfdcb3b42116260c17565c0))
* **bot:** reply instead of rethrowing in forbidden filter ([0717159](https://github.com/fmauNeko/starwave/commit/07171598b75b0e16ac3b9fd0c37e5164818fd126))
* **bot:** reset music state when leaving voice and recover from playback failures ([8048d2f](https://github.com/fmauNeko/starwave/commit/8048d2f66373cc1f316f8a8b71f70d1d67229259))
* **bot:** tighten accentColor schema to reject malformed values ([34d2830](https://github.com/fmauNeko/starwave/commit/34d2830f6c1f9bc792d2612ea30f8fcd1e1bf4de))
* **deps:** update dependency arkregex to ^0.0.6 ([#429](https://github.com/fmauNeko/starwave/issues/429)) ([65cf2b2](https://github.com/fmauNeko/starwave/commit/65cf2b29072115948f68c26f1bf7b2c825dc4cef))
* **deps:** update dependency arkregex to ^0.0.7 ([#462](https://github.com/fmauNeko/starwave/issues/462)) ([928bc1c](https://github.com/fmauNeko/starwave/commit/928bc1c736b3f4d4239ec9d7c67b5bf13aa78cae))
* **deps:** update dependency arkregex to ^0.0.8 ([#479](https://github.com/fmauNeko/starwave/issues/479)) ([49ce4ca](https://github.com/fmauNeko/starwave/commit/49ce4ca82dd372acad354f148ba565e62b8c8724))
* **deps:** update dependency bgutils-js to v4 ([b376364](https://github.com/fmauNeko/starwave/commit/b3763644c8ba44c713bfa41df1248a4a33ce8477))
* **deps:** update dependency bgutils-js to v4.0.2 ([#534](https://github.com/fmauNeko/starwave/issues/534)) ([b64e45f](https://github.com/fmauNeko/starwave/commit/b64e45f9bc2b7c2ccd7b49e9232a530bb70d8081))
* **deps:** update dependency bgutils-js to v4.0.3 ([#573](https://github.com/fmauNeko/starwave/issues/573)) ([0ddaed3](https://github.com/fmauNeko/starwave/commit/0ddaed3bdc4fb014d53ca5c1841ca9a1b121ee8c))
* **deps:** update dependency googlevideo to v4.1.1 ([#501](https://github.com/fmauNeko/starwave/issues/501)) ([7cf5eaf](https://github.com/fmauNeko/starwave/commit/7cf5eaf74a46c7d82340564ef210a46367962359))
* **deps:** update dependency jsdom to v30 ([a0a6bfd](https://github.com/fmauNeko/starwave/commit/a0a6bfdca83fb784620d819e86eacbc2ef45c258))
* **deps:** update dependency jsdom to v30.0.1 ([#551](https://github.com/fmauNeko/starwave/issues/551)) ([71ddabb](https://github.com/fmauNeko/starwave/commit/71ddabb8790baaaf5d25617ab964bfac6460dfdd))
* **deps:** update dependency youtubei.js to v17.1.0 ([#442](https://github.com/fmauNeko/starwave/issues/442)) ([07e13af](https://github.com/fmauNeko/starwave/commit/07e13afb20aa10c23920a18a2b9da603dca66bf6))
* **deps:** update dependency youtubei.js to v17.2.0 ([17d6cf8](https://github.com/fmauNeko/starwave/commit/17d6cf8e6c58fa0b43a1b8b03c30bc43abed5bc6))
* **deps:** update dependency youtubei.js to v17.2.0 ([0038fe4](https://github.com/fmauNeko/starwave/commit/0038fe4e4db12a55e5959604e3d2828fff745f3a))

## [1.3.0](https://github.com/fmauNeko/starwave/compare/bot@v1.2.0...bot@v1.3.0) (2026-06-01)


### Features

* **music:** add InnertubeSessionService with in-process PoToken ([d308da2](https://github.com/fmauNeko/starwave/commit/d308da269fa83b53a42af0e6d21afdad61e515f2))
* **music:** add YouTubeStreamService (SABR audio acquisition) ([24f423a](https://github.com/fmauNeko/starwave/commit/24f423a3891aa3e94ffdbd31a52aa475d3b96ce4))
* **music:** authenticate Innertube with cookies to bypass LOGIN_REQUIRED ([9437c00](https://github.com/fmauNeko/starwave/commit/9437c0047571af80937efada3fad374be30417a2))
* **music:** handle SABR reloadPlayerResponse to keep long streams alive ([78c3e48](https://github.com/fmauNeko/starwave/commit/78c3e4897e520be7569803b845f84afea616b5d9))
* **music:** migrate youtube from yt-dlp to youtubei.js ([df52ab7](https://github.com/fmauNeko/starwave/commit/df52ab792cabc30092e9bd8e67e50ba69c980219))
* **music:** stream YouTube via youtubei.js, keep yt-dlp dormant ([1d76f06](https://github.com/fmauNeko/starwave/commit/1d76f06a8d51cbd7b04081208ed65d00f80a88b0))
* **music:** switch to using InnerTube and SABR for Youtube ([57e9e48](https://github.com/fmauNeko/starwave/commit/57e9e4824c331bce935264952e02031761c106e4))


### Bug Fixes

* **bot:** remove deprecated baseUrl form tsconfig ([4aa4562](https://github.com/fmauNeko/starwave/commit/4aa4562fe05ee435b266a98c12454d5947df66c1))
* **deps:** align jsdom with @types/jsdom v28 ([7d9b604](https://github.com/fmauNeko/starwave/commit/7d9b604d89870c23fc5b9905b99be9fcf9b16ead))
* **deps:** update dependency jsdom to v29 ([fcdb11e](https://github.com/fmauNeko/starwave/commit/fcdb11e9205252c7483288304a5062b75d13c588))
* **deps:** update dependency jsdom to v29 ([e586918](https://github.com/fmauNeko/starwave/commit/e586918b14b7c43a794f2ecda9089e2ba2e173bc))
* **docker:** fix wrong pnpm version being used, skip corepack in runner ([2c41cf0](https://github.com/fmauNeko/starwave/commit/2c41cf0d6b2eb528afb1958d48348b017c780dbf))
* **music:** add timeout to BotGuard fetches to prevent hung session refresh ([0197e9c](https://github.com/fmauNeko/starwave/commit/0197e9c3f95b46193685d73a6044235a9336be2d))
* **music:** decipher SABR streaming URL to prevent 403 on media segments ([6cd94fc](https://github.com/fmauNeko/starwave/commit/6cd94fc8c5edfbb749b3211badba136e2ab7db37))
* **music:** match YouTube Shorts URLs in provider pattern ([721e275](https://github.com/fmauNeko/starwave/commit/721e27543d8a8886a77e41002f50a3222eb3649c))

## [1.2.0](https://github.com/fmauNeko/starwave/compare/bot@v1.1.0...bot@v1.2.0) (2026-02-25)


### Features

* **bot:** auto-repost now-playing message on channel activity ([a2281d9](https://github.com/fmauNeko/starwave/commit/a2281d95e786d06a0725bdd5b36241a6ba326838))

## [1.1.0](https://github.com/fmauNeko/starwave/compare/bot@v1.0.0...bot@v1.1.0) (2026-01-05)


### Features

* **bot:** add auto-leave on voice inactivity and /leave command ([bda4899](https://github.com/fmauNeko/starwave/commit/bda489930571f6cd3c843d85377d564ec247f45c))
* **bot:** add now playing message with interactive controls ([ab02810](https://github.com/fmauNeko/starwave/commit/ab028107360e6eb21cd3e8967e2e0b03ef223987))
* **bot:** add YouTube search support to /music play command ([56c1a0c](https://github.com/fmauNeko/starwave/commit/56c1a0cd9f59cca406c34d6381271a4b9db0ef50))


### Bug Fixes

* **bot:** fix queue stuck after track ends and auto-delete now playing message ([106e955](https://github.com/fmauNeko/starwave/commit/106e95505eb124530c409a4256e6a26d0fbf4991))

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
