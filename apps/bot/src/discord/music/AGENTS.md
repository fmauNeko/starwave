# music AGENTS

Discord music subsystem. Orchestrates per-guild queues and playback by composing the `voice/` module (low-level `@discordjs/voice`) with pluggable source providers. **Single source of truth for music and its voice playback layer.**

## Layering

```
MusicCommands (slash) ─▶ MusicService (orchestration) ─▶ VoiceService (playback)
                              │
                              ├─▶ MusicProviderDiscovery ─▶ MusicProvider[] (sources)
                              └─▶ EventEmitter2 (MUSIC_EVENTS) ─▶ NowPlayingService
```

`MusicModule` imports `VoiceModule` + `DiscoveryModule`; exports `MusicService`, `NowPlayingService`.

## Provider Plugin Pattern (non-obvious)

New audio sources auto-register via NestJS discovery — there is **no central provider list** to edit.

1. Implement `MusicProvider` (`providers/music-provider.interface.ts`): `name`, `canHandle(url)`, `fetchTrackInfo`, `getAudioInfo`, `search`.
2. Annotate the class with `@MusicProvider()` (`providers/music-provider.decorator.ts`) — applies `@Injectable()` **and** sets the `MUSIC_PROVIDER_KEY` metadata flag.
3. Add it to `MusicModule` providers.
4. `MusicProviderDiscovery.onModuleInit()` scans all DI providers via `DiscoveryService` + `Reflector` and collects those carrying the flag.

`MusicService` selects a provider with `provider.canHandle(url)`; `searchAndPlay` uses `providers[0]` (currently `YouTubeProvider`). Reference implementation: `providers/youtube.provider.ts` (arkregex URL/ID extraction, delegates to `YouTubeStreamService`).

## Queue Semantics (`music-queue.ts`)

- `MusicQueue` is plain in-memory state (not a NestJS provider); `MusicService` holds one per guild in a `Map<guildId, MusicQueue>`.
- `currentIndex` tracks the playing track; `getNext()` / `skip()` honor `LoopMode` (`None` | `Track` | `Queue`).
- `clearQueue()` keeps the current track; `remove()` refuses the currently-playing index.
- `shuffle()` pins the current track at index 0 and Fisher-Yates shuffles the rest.

## Playback Flow (`music.service.ts`)

- `play(guildId, url, requestedBy)`: resolve provider → `fetchTrackInfo` → enqueue → if the queue was empty, `playTrack` immediately.
- `playTrack`: `provider.getAudioInfo(url)` → `voiceService.play(...)` → emit `MUSIC_EVENTS.TRACK_START`.
- Auto-advance: `setupAutoPlay` subscribes to the player's `Idle` state; `handleTrackEnd` is single-flighted per guild (`handlingTrackEnd` Set) and emits `MUSIC_EVENTS.QUEUE_END` when nothing is next.
- `MUSIC_EVENTS`: `music.track.start`, `music.queue.end`.

## Voice Playback Layer (`../voice/`)

`voice/` is a separate NestJS module used only by music; it wraps `@discordjs/voice`.

- `VoiceService` — join/leave, one `AudioPlayer` + `AudioResource` per guild, volume (clamped 0–2, default 0.25), and disconnect recovery (`NoSubscriberBehavior.Pause`). `MusicService` is the only caller.
- `VoiceInactivityService` — `@On('voiceStateUpdate')`; when the bot's channel has no non-bot members it schedules an auto-leave after 30s (`INACTIVITY_TIMEOUT_MS`), cancelled if someone rejoins. Captures the client via `@Once('clientReady')`.
- `LeaveCommand` (`voice/leave.command.ts`) is registered in `DiscordModule` providers, not `VoiceModule`.

## YouTube Streaming (`youtube/`)

YouTube audio is streamed in-process via `youtubei.js` (Innertube) + `googlevideo` (SABR protocol).

**Services:**

- `InnertubeSessionService` — manages the Innertube client lifecycle. On startup, creates a jsdom window, generates a PoToken via `bgutils-js`, and creates an authenticated Innertube client. Exposes `getClient()`, `getSessionPoToken()`, `generateContentPoToken(videoId)`, and `refresh(reason)` for reactive token refresh.
- `YouTubeStreamService` — fetches video metadata, handles search, and acquires audio-only SABR streams. Returns a Node `Readable` with `StreamType.WebmOpus` (no ffmpeg needed for the streaming path).

**PoToken lifecycle:**

1. `InnertubeSessionService.onModuleInit()` bootstraps an Innertube client to get `visitor_data`
2. Fetches a BotGuard attestation challenge from YouTube
3. Executes the BotGuard interpreter (required for attestation)
4. Generates a `WebPoMinter` and mints a session-bound PoToken
5. Creates the final Innertube client with `{ po_token, visitor_data }`
6. On playback failure (403/LOGIN_REQUIRED), `YouTubeStreamService` calls `session.refresh(reason)` which regenerates the PoToken (single-flight: concurrent calls share one refresh)

**YtDlpService** is kept dormant in `MusicModule` for future non-YouTube providers. It still self-initializes (downloads the yt-dlp binary) but is not called for YouTube playback.

**Known limitation:** SABR streams survive typical Discord pause durations (tested: 60s). Very long pauses (many minutes) may cause the CDN connection to time out; if this occurs, the track will end and the queue will advance to the next track.

**Age-restricted / region-locked content:** PoToken-only mode does not support age-restricted videos (no cookie path). These will fail with a clear error message.

### YouTube Authentication (server / datacenter IPs)

- **Why**: On datacenter or VPS IPs, YouTube bot detection returns `playability_status: LOGIN_REQUIRED` ("Sign in to confirm you're not a bot"), causing `getInfo` to return no `streaming_data` and the bot to log `No SABR streaming URL available`. The in-process PoToken alone does not bypass IP-reputation checks.
- **Setup**:
  1. Using a dedicated burner Google account (never a personal one), log into YouTube in a browser.
  2. Export cookies in Netscape `cookies.txt` format (e.g. using a "Get cookies.txt LOCALLY" browser extension), restricted to `youtube.com`.
  3. Place the file on the server and set `youtube.cookiesPath` in `config.json` (or env `BOT__YOUTUBE__COOKIES_PATH`) to its absolute path.
  4. Restart the bot. Confirm `InnertubeSessionService` logs `innertube.session.init [<ms>ms, logged_in=true]`.
- **How it works**: `InnertubeSessionService` parses `cookies.txt` (including `#HttpOnly_` lines, filtered to YouTube/Google domains) into a `Cookie:` header and passes it to `Innertube.create({ cookie })`. The same `youtube.cookiesPath` is also used by the dormant `YtDlpService`. Cookies are optional. Without them, the session runs anonymously (which works on residential IPs).
- **Caveats**:
  - **No guaranteed bypass**: Cookie authentication is account authentication, not an IP-reputation bypass. Per the youtubei.js maintainer, there is no guaranteed fix for datacenter bot detection. Cookies often help but are not guaranteed. The most reliable fix is a residential/mobile proxy or running from a residential IP.
  - **Account ban risk**: Streaming from a datacenter IP can get the account flagged, so always use a burner account.
  - **Manual rotation**: Cookies expire or rotate and are not auto-refreshed. Re-export them periodically when playback starts failing again.
  - **Security**: Never commit `cookies.txt` or `config.json` (both are gitignored).

## Now-Playing UI

- `now-playing.components.ts` — `@Button` interaction handlers (pause / skip / loop / etc.).
- `now-playing.service.ts` — listens to `MUSIC_EVENTS` via `@OnEvent` and Discord events via `@On`; renders/updates the now-playing message using the guild `theme.accentColor` from config.

## Commands (`music.commands.ts`)

13 slash commands grouped via `createCommandGroupDecorator({ name: 'music' })`. They delegate to `MusicService` only — never touch `VoiceService` or providers directly.

## Architecture Decisions

| Decision                      | Rationale                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **youtubei.js + googlevideo** | In-process YouTube streaming via SABR protocol; PoToken generated by bgutils-js + jsdom; avoids yt-dlp binary for YouTube |
| **Provider plugin discovery** | Music sources self-register via `@MusicProvider()` + NestJS `DiscoveryService`; no central registry to edit               |
| **Voice module split**        | `voice/` wraps `@discordjs/voice` (connection, player, volume, 30s inactivity auto-leave); `music/` orchestrates on top   |

## Gotchas

| Issue                                                 | Cause / Note                                                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| New provider silently unused                          | Class missing `@MusicProvider()` → no discovery flag → `MusicProviderDiscovery` skips it (no error)                    |
| Search always hits YouTube                            | `searchAndPlay` uses `providers[0]`; provider order in `MusicModule` matters                                           |
| Queues lost on restart                                | `MusicQueue` is in-memory only                                                                                         |
| Volume range                                          | Clamped 0–2 in `VoiceService` (default 0.25), not in the queue                                                         |
| Bot auto-leaves voice after 30s                       | Channel empty of non-bot members; expected — `VoiceInactivityService` schedules leave, cancels on rejoin               |
| YouTube streaming fails on startup                    | `InnertubeSessionService` failed to init; check logs for `innertube.session.init` / `innertube.session.refresh.failed` |
| Age-restricted video fails                            | PoToken-only mode has no cookie path; expected — age-restricted content is not supported                               |
| LOGIN_REQUIRED / "confirm you're not a bot" on server | Datacenter IP bot detection; set `youtube.cookiesPath` to a burner-account cookies.txt, or use a residential proxy     |
| `youtube.cookies` key in config.json                  | Stale key from old yt-dlp config; use `youtube.cookiesPath` (a file path) instead                                      |
