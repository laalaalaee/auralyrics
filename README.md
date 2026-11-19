# Glowrim

Ambient screen-edge glow **and** synced lyrics for Windows, driven by whatever is playing —
Spotify, Apple Music, YouTube in a browser, or anything else in Windows' media controls.

- **Glow** — a rim of light around your screen in the two strongest colours of the album cover, pulsing with the beat.
- **Full-screen lyrics** — the main lyrics view: blurred cover art, a lock-screen clock and one of 16 lyric styles,
  with a Verci-style settings bar (Style · Size · Font · Aesthetics · Display) along the top. The glow runs here too.
- **Floating lyrics** — a click-through lyrics window on the desktop when you're not in full screen.
- **Now playing** — cover, title, play/pause, skip and ±15 s.

## Using it

| | |
|---|---|
| **Ctrl + Alt + L** | Open / close full-screen lyrics from anywhere |
| **← / →** (in full screen) | Previous / next lyric style |
| **Space** | Play / pause |
| **+ / −** | Bigger / smaller lyrics |
| **Esc** | Close the open panel, then leave full screen |

Glowrim lives in the system tray (bottom-right, `^`). The tray menu holds what you reach for mid-song:
playback, pinned styles, keep screen awake, desktop lyrics, text size and which display glows.

## Lyric styles

| Family | Styles |
|---|---|
| Kinetic type | Ship · Fisheye · Visual · Fisheye Visual |
| Motion scenes | Codestyle · Codestyle Visual · Branches · Web · Constellation |
| Native Design (iPhone screens) | Messages · Money · Map · Notifications |
| Classic | Stack · Karaoke · Minimal |

Words light up as they're sung. Lyrics come from [LRCLIB](https://lrclib.net) (free and open); when a song has
real per-word timing it's used, otherwise word timing is estimated within each line. The Status tab says which.

## Glow options

Default / Music Sync / Idle / None animation · one or two colours · album colours or your own · thickness, glow,
brightness, reactivity, speed · all displays, main display or a chosen monitor · optionally hides over full-screen
apps · rests while the PC is locked or asleep.

## Privacy

- Now playing is read locally from Windows media controls — no account or login.
- Audio is read from the PC's **output** to find the beat, never the microphone.
- The only network request is to LRCLIB, with the song title, artist and length.

## Develop

```powershell
npm install
npm start                 # run from source
npm run dist              # build dist\Glowrim-Setup-<ver>.exe and a portable .exe
```

Debug helpers: `GLOWRIM_DEBUG=1` prints the log to the console (it's always written to
`%APPDATA%\glowrim\glowrim.log`). `GLOWRIM_SHOT=<folder>` renders the windows off-screen and saves screenshots.
`dev-gallery.html` shows every lyric style side by side in demo mode (serve the folder over http to view it).

## How it's built

| File | Role |
|---|---|
| `main.js` | Electron main process: windows, tray, settings, lyrics lookup, hotkey, power events |
| `media.ps1` | PowerShell bridge to Windows media controls (track, art, timeline, controls, full-screen detection) |
| `audio.html` | Hidden window: system-audio loopback beat analysis + album-art palette extraction |
| `glow.js` | Shared edge-glow renderer (desktop overlay + full-screen view) |
| `engine.js` / `engine.css` | Lyrics engine and all 16 styles |
| `stage.html` | Full-screen lyrics view with the settings bar |
| `lyrics.html` | Floating desktop lyrics |
| `panel.html` | Main window: live style preview, gallery, player, settings, status checklist |
| `overlay.html` | Click-through glow overlay, one per display |
| `preload.js` | Safe IPC bridge for the pages |

Inspired by [Lumn](https://www.trylumn.xyz/) and [Verci](https://www.verci.xyz/); an independent re-implementation for Windows.
