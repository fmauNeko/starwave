# Music Features Implementation Roadmap

## Overview

This document outlines the plan for porting music features from the **katvinsky** Discord.js Commando bot to the **starwave** NestJS/Necord bot.

### Current State (starwave)

- YouTube-only playback via yt-dlp
- Basic queue operations (add, remove, shuffle, loop)
- Play, pause, resume, skip, stop, volume
- Now playing with interactive buttons
- Voice inactivity auto-leave
- Provider pattern ready for extension

### Target State

- Multi-provider support (YouTube, SoundCloud, Bandcamp, Vimeo, Dailymotion, Spotify)
- 2500+ French radio stations
- Lyrics via Genius API
- Advanced queue operations (move, duplicates, clear by user)
- Voting system for skip/shuffle/reverse
- Genre playlists (Synthwave, Disco, Electro, Mozinor)
- Play modes (force play, play next)
- Progress tracking with ETA
- Search with autocomplete across providers

---

## Phase Overview

| Phase | Name               | Features                                             | Complexity | Dependencies                  |
| ----- | ------------------ | ---------------------------------------------------- | ---------- | ----------------------------- |
| 1     | Providers          | SoundCloud, Bandcamp, Vimeo, Dailymotion, Spotify    | L          | None                          |
| 2     | Queue Enhancements | Move, duplicates, clear by user, reverse, play modes | M          | None                          |
| 3     | Extras             | Lyrics, Radio, Voting, Genre Playlists               | L          | Phase 1 (for genre playlists) |

---

## Phase 1: Multi-Provider Support

**Detailed spec:** [music-features-phase1-providers.md](./music-features-phase1-providers.md)

### Goals

1. Implement providers for: SoundCloud, Bandcamp, Vimeo, Dailymotion
2. Implement Spotify resolver (resolves to YouTube)
3. Add `/search` command with provider selection autocomplete
4. Extend Track interface with provider metadata

### Key Decisions

- **yt-dlp supports**: YouTube, SoundCloud, Bandcamp, Vimeo, Dailymotion (and 1000+ more)
- **Spotify**: Cannot stream directly (ToS), must resolve tracks to YouTube
- **Approach**: Leverage yt-dlp for all direct providers, Spotify Web API for metadata

### Deliverables

- [ ] SoundCloud provider
- [ ] Bandcamp provider
- [ ] Vimeo provider
- [ ] Dailymotion provider
- [ ] Spotify resolver service
- [ ] Spotify provider (using resolver)
- [ ] `/music search` command with autocomplete
- [ ] Provider selection in play command
- [ ] Config schema updates for API keys
- [ ] Unit tests for each provider

---

## Phase 2: Queue Enhancements

**Detailed spec:** [music-features-phase2-queue.md](./music-features-phase2-queue.md)

### Goals

1. Add move track operation
2. Add remove duplicates operation
3. Add clear by user operation
4. Add reverse queue operation
5. Implement play modes (force play, play next)
6. Add progress tracking with time remaining/ETA

### Deliverables

- [ ] `MusicQueue.move(from, to)` method
- [ ] `MusicQueue.removeDuplicates()` method
- [ ] `MusicQueue.clearByUser(userId)` method
- [ ] `MusicQueue.reverse()` method
- [ ] `MusicQueue.addNext(track)` method (priority queue)
- [ ] `MusicService.forcePlay(track)` method
- [ ] Progress tracking in MusicService
- [ ] `/music move` command
- [ ] `/music duplicates` command
- [ ] `/music clearuser` command
- [ ] `/music reverse` command
- [ ] `/music playnext` command
- [ ] `/music forceplay` command
- [ ] `/music remaining` command
- [ ] Updated queue display with ETA
- [ ] Unit tests for queue operations

---

## Phase 3: Extras

**Detailed spec:** [music-features-phase3-extras.md](./music-features-phase3-extras.md)

### Goals

1. Implement lyrics via Genius API
2. Implement radio streaming (2500+ stations)
3. Implement voting system for queue operations
4. Implement genre playlists (Synthwave, Disco, Electro, Mozinor)
5. Add autodisplay feature

### Deliverables

- [ ] LyricsService with Genius API
- [ ] `/music lyrics` command
- [ ] RadioService with station search
- [ ] `/music radio` command
- [ ] VotingService for queue operations
- [ ] Vote-gated skip/shuffle/reverse/clear
- [ ] GenrePlaylistService
- [ ] `/music synthwave`, `/music disco`, `/music electro` commands
- [ ] Autodisplay toggle
- [ ] Config schema updates
- [ ] Unit tests

---

## Config Schema Changes

Add to `apps/bot/src/config/config.type.ts`:

```typescript
export const configSchema = type.module({
  // ... existing
  json: {
    // ... existing discord, youtube
    'spotify?': {
      clientId: 'string',
      clientSecret: 'string',
    },
    'genius?': {
      apiKey: 'string',
    },
    'soundcloud?': {
      clientId: 'string',
    },
    'vimeo?': {
      accessToken: 'string',
    },
    'radio?': {
      stationsUrl: 'string', // default: https://radios.music-hub.fr/radios/all.json
    },
    'voting?': {
      enabled: 'boolean',
      thresholdPercent: 'number', // default: 50 (majority)
      minVoters: 'number', // default: 2
    },
    'genrePlaylists?': {
      synthwave: 'string', // JSON URL
      disco: 'string',
      electro: 'string',
      mozinor: 'string',
    },
  },
});
```

---

## Architecture Decisions

### 1. Provider Pattern Extension

Keep the existing `@MusicProvider()` decorator pattern. Each provider:

- Implements `MusicProvider` interface
- Is auto-discovered via `MusicProviderDiscovery`
- Handles URL detection and track fetching

### 2. yt-dlp as Primary Extractor

yt-dlp supports all target platforms natively:

```bash
yt-dlp --list-extractors | grep -E "soundcloud|bandcamp|vimeo|dailymotion"
```

This simplifies implementation - providers mainly handle URL detection and delegate extraction to `YtDlpService`.

### 3. Spotify Resolution Flow

```
Spotify URL → SpotifyService.getTrackInfo() → YouTube search query
                                            → YouTubeProvider.search()
                                            → Track
```

### 4. Voting System Design

- Per-action vote tracking: `Map<ActionType, Set<UserId>>`
- Threshold calculation: `Math.ceil(voiceMembers / 2)`
- Actions: skip, shuffle, reverse, clear
- Staff bypass: users with `KICK_MEMBERS` permission

### 5. Track Interface Extension

```typescript
export interface Track {
  url: string;
  title: string;
  duration: number; // seconds, 0 for live
  thumbnail: string;
  requestedBy: string;
  // New fields
  provider: ProviderType; // 'youtube' | 'soundcloud' | etc.
  artist?: string; // channel/artist name
  isLive?: boolean;
  addedAt: Date;
}
```

---

## Testing Strategy

### Unit Tests

- Each provider: URL detection, track fetching mocks
- Queue operations: move, duplicates, clear, reverse
- Voting logic: threshold calculation, vote tracking
- Spotify resolver: API mocking

### E2E Tests

- Play command with various provider URLs
- Queue manipulation flows
- Voting interaction simulation

### Coverage Requirements

Maintain existing thresholds per `vitest.config.ts`.

---

## Dependencies to Add

```json
{
  "spotify-web-api-node": "^5.0.2",
  "genius-lyrics-api": "^3.2.1"
}
```

Note: yt-dlp handles SoundCloud, Bandcamp, Vimeo, Dailymotion natively.

---

## Migration Notes

### From katvinsky

1. **Provider helpers** (`src/helpers/music/providers.js`): Port URL patterns to TypeScript
2. **MusicPlugin class**: Logic distributed across services
3. **Command patterns**: Convert to Necord decorators
4. **Vote system**: Extract to dedicated service
5. **Config keys**: Map to new schema structure

### Backwards Compatibility

- Existing `/music play` command unchanged
- New commands added, no breaking changes
- Config additions are optional with defaults

---

## Timeline Estimate

| Phase     | Estimated Effort |
| --------- | ---------------- |
| Phase 1   | 3-4 days         |
| Phase 2   | 2-3 days         |
| Phase 3   | 3-4 days         |
| **Total** | **8-11 days**    |

---

## File Structure After Implementation

```
apps/bot/src/discord/music/
├── music.module.ts              # Updated imports
├── music.service.ts             # Extended methods
├── music.commands.ts            # Extended commands
├── music-queue.ts               # Extended operations
├── now-playing.service.ts       # Updated for new fields
├── now-playing.components.ts
├── yt-dlp.service.ts
├── yt-dlp.util.ts
├── providers/
│   ├── music-provider.interface.ts   # Extended Track
│   ├── music-provider.decorator.ts
│   ├── music-provider-discovery.service.ts
│   ├── provider-types.ts             # NEW: Provider enum
│   ├── youtube.provider.ts
│   ├── soundcloud.provider.ts        # NEW
│   ├── bandcamp.provider.ts          # NEW
│   ├── vimeo.provider.ts             # NEW
│   ├── dailymotion.provider.ts       # NEW
│   └── spotify.provider.ts           # NEW
├── spotify/                          # NEW
│   ├── spotify.module.ts
│   └── spotify.service.ts
├── lyrics/                           # NEW
│   ├── lyrics.module.ts
│   ├── lyrics.service.ts
│   └── lyrics.commands.ts
├── radio/                            # NEW
│   ├── radio.module.ts
│   ├── radio.service.ts
│   └── radio.commands.ts
├── voting/                           # NEW
│   ├── voting.module.ts
│   └── voting.service.ts
└── genre-playlists/                  # NEW
    ├── genre-playlists.module.ts
    ├── genre-playlists.service.ts
    └── genre-playlists.commands.ts
```

---

## Next Steps

1. Review and approve this plan
2. Begin Phase 1 implementation
3. Update `config.example.json` with API key placeholders
4. Set up API accounts (Spotify Developer, Genius)
