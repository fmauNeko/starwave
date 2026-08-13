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

- `VoiceService` — join/leave, one `AudioPlayer` + `AudioResource` per guild, volume (clamped 0–2, default 0.25), and disconnect recovery (`NoSubscriberBehavior.Pause`). `MusicService` is the only caller. On audio-resource errors it only logs (`voice.player.error` with playback duration) — it must NEVER stop the player or advance the queue itself; `@discordjs/voice` auto-transitions to Idle and `MusicService.setupAutoPlay` owns the advance (calling both skips two tracks).
- `VoiceInactivityService` — `@On('voiceStateUpdate')`; when the bot's channel has no non-bot members it schedules an auto-leave after 30s (`INACTIVITY_TIMEOUT_MS`), cancelled if someone rejoins. Captures the client via `@Once('clientReady')`.
- `LeaveCommand` (`voice/leave.command.ts`) is registered in `DiscordModule` providers, not `VoiceModule`.

## YouTube Streaming (`youtube/`)

YouTube audio is streamed in-process via `youtubei.js` (Innertube) + `googlevideo` (SABR protocol).

**Services:**

- `InnertubeSessionService` — manages the Innertube client lifecycle. On startup, creates a jsdom window, generates a PoToken via `bgutils-js`, and creates an authenticated Innertube client. Exposes `getClient()`, `getSessionPoToken()`, `generateContentPoToken(videoId)`, and `refresh(reason)` for reactive token refresh. Also proactively refreshes the whole session every 6 h (`@Interval`, `SESSION_REFRESH_INTERVAL_MS`) so the BotGuard integrity token never expires mid-stream; the scheduled handler swallows failures (already logged by `refresh`).
- `YouTubeStreamService` — fetches video metadata, handles search, and acquires audio-only SABR streams. Returns a Node `Readable` with `StreamType.WebmOpus` (no ffmpeg needed for the streaming path).

**PoToken lifecycle:**

1. `InnertubeSessionService.onModuleInit()` bootstraps an Innertube client to get `visitor_data`
2. Fetches a BotGuard attestation challenge — **scraped from the YouTube homepage, not `/att/get`**. The page's `ytcfg.set({...})` is parsed and exposed as `globalThis.yt.config_` (BotGuard reads `yt.config_.EVENT_ID` during the snapshot), and the challenge is taken from the `window.ytAtN({...})` blob. If either regex misses, it falls back to the TV challenge from `tv_config` (which needs no `EVENT_ID`) using that response's own `challengeRequestKey`. **Do not revert this to `innertube.getAttestationChallenge()`** — see the gotcha below
3. Executes the BotGuard interpreter (required for attestation)
4. Generates a `WebPoMinter` and mints a session-bound PoToken
5. Creates the final Innertube client with `{ po_token, visitor_data }`
6. On playback failure (403/LOGIN_REQUIRED), `YouTubeStreamService` calls `session.refresh(reason)` which regenerates the PoToken (single-flight: concurrent calls share one refresh)
7. Mid-stream, `YouTubeStreamService` subscribes to SABR `streamProtectionStatusUpdate` and `reloadPlayerResponse`. A protection status >= 2 (PoToken/attestation rejection) triggers a per-stream single-flight recovery, capped at `MAX_RECOVERY_ATTEMPTS = 3` and escalating: attempts 1-2 only re-mint the content PoToken from the existing BotGuard minter (~free), and only attempt `SESSION_REBUILD_ON_ATTEMPT = 3` pays for a full `session.refresh()` (new jsdom + Innertube + attestation, ~1.5 s). Recovery stops once the stream emits `finish` or `abort`, and exhaustion logs `youtube.stream.protected` exactly once. A custom `fetch` passed to `SabrStream` gates every segment request behind any in-flight recovery or player reload, so retries never race stale credentials. Segment retries are capped at `SABR_MAX_RETRIES = 3` (fast fail instead of ~55 s of dead-air backoff).

**YtDlpService** is kept dormant in `MusicModule` for future non-YouTube providers. It still self-initializes (downloads the yt-dlp binary) but is not called for YouTube playback.

**Known limitation:** SABR streams survive typical Discord pause durations (tested: 60s). Very long pauses (many minutes) may still time out the CDN connection. Mid-stream PoToken rejections (`streamProtectionStatus >= 2`) are auto-recovered in-flight; if recovery repeatedly fails, the track fails fast (3 retries, ~3.5 s) and the queue advances via the player's Idle transition.

**The attestation challenge MUST come from the page, not `/att/get`.** As of 2026-08, YouTube binds the initial attestation challenge to `yt.config_.EVENT_ID` and **rejects any WebPO token minted from an `/att/get` challenge** on the `WEB`/`MWEB` clients ([BgUtils#44](https://github.com/LuanRT/BgUtils/pull/44)). The failure is silent and easy to misdiagnose: minting succeeds and returns a well-formed token, but the SABR server reports `streamProtectionStatus = 2` on the very first request and serves only a ~1 MB cold-start allowance (about a minute of audio) before withholding media — which surfaces as "music plays briefly then stops".

Diagnosing this is quick if you know the tell: a rejected token behaves **byte-for-byte identically to sending no token at all**. Measured on `kJQP7kiw5Fk`, same session, three challenge sources:

| Challenge source                      | Audio delivered  | `streamProtectionStatus` |
| ------------------------------------- | ---------------- | ------------------------ |
| `/att/get` (the old, broken path)       | 999 / 4497 KB    | `[2,2,2,2]` — rejected     |
| Homepage `window.ytAtN` + `yt.config_`    | 4497 / 4497 KB   | `[1,1,…]` — accepted       |
| `tv_config` `challengeParams.R`           | 4497 / 4497 KB   | `[1,1,…]` — accepted       |

`streamProtectionStatus = 1` means the token was accepted; `2` means rejected. If playback ever regresses to ~1 minute again, check the challenge source **first** — not the token binding, session options, or cookies, all of which were ruled out empirically and change nothing.

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

| Issue                                                   | Cause / Note                                                                                                                                                                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New provider silently unused                            | Class missing `@MusicProvider()` → no discovery flag → `MusicProviderDiscovery` skips it (no error)                                                                                                                                              |
| Search always hits YouTube                              | `searchAndPlay` uses `providers[0]`; provider order in `MusicModule` matters                                                                                                                                                                     |
| Queues lost on restart                                  | `MusicQueue` is in-memory only                                                                                                                                                                                                                   |
| Volume range                                            | Clamped 0–2 in `VoiceService` (default 0.25), not in the queue                                                                                                                                                                                   |
| Bot auto-leaves voice after 30s                         | Channel empty of non-bot members; expected — `VoiceInactivityService` schedules leave, cancels on rejoin                                                                                                                                         |
| YouTube streaming fails on startup                      | `InnertubeSessionService` failed to init; check logs for `innertube.session.init` / `innertube.session.refresh.failed`                                                                                                                           |
| Age-restricted video fails                              | PoToken-only mode has no cookie path; expected — age-restricted content is not supported                                                                                                                                                         |
| LOGIN_REQUIRED / "confirm you're not a bot" on server   | Datacenter IP bot detection; set `youtube.cookiesPath` to a burner-account cookies.txt, or use a residential proxy                                                                                                                               |
| `youtube.cookies` key in config.json                    | Stale key from old yt-dlp config; use `youtube.cookiesPath` (a file path) instead                                                                                                                                                                |
| Track dies mid-play with "Maximum retries (N) exceeded" | SABR stream protection rejected the PoToken; recovery auto-triggers — check `youtube.stream.recover` / `youtube.stream.recovered` logs; repeated `recover.failed` means the session cannot mint an accepted token (see cookie/IP guidance above) |
