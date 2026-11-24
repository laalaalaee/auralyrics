# Changelog

Glowrim was renamed to Auralyrics in 2.0.0.

## [2.1.0] — 2026-11-24

### Added
- Updates. The installed app now checks GitHub for a new version in the background, downloads it, and installs it when you quit. "Restart to update" in the tray finishes it straight away. The portable build only tells you a new version exists and opens the download page.
- A "Check for updates" item in the tray menu, and an Updates row in Settings with a switch to turn the background check off.

### Changed
- The lyrics are now a normal window you can move, resize and minimise, with the same toolbar and menus as full screen. The maximise button (or F11) goes to full screen, and Esc comes back to the window. The window remembers its size and position.
- Auto now also changes the style during a song, every 40 to 75 seconds, picking the same weighted way. The first change of each song never lands right after the song's own pick, and a style you pick by hand stays until the next song.
- The little style-name pill ("✨ Branches") no longer pops up over the middle of the lyrics. It sits small in the top-left corner.
- Auralyrics opens to that window instead of straight to full screen. If you liked the old behaviour, turn on "Open full screen when Auralyrics starts" in Settings.
- The separate main window is gone. Its jobs moved into the lyrics window's toolbar: the status button opens the player checklist, lyric timing (per song and Bluetooth delay) and Reconnect, and ⚙ opens Settings (Start with Windows, open full screen at launch, updates, quick tour and privacy notes). The tray's "Open Auralyrics" opens the lyrics window.
- The glow shows in full screen by default. The screen-edge glow on the rest of the desktop is now off unless you turn on "Glow on the desktop too" in the Glow menu or the tray.
- The full-screen background is a smooth, slowly drifting colour field from the cover, with a fine grain, instead of one big blur that showed blocks and banding.
- The Glow menu has "Reset glow strength to default", for glow that has been turned down to a hairline, and the Speed slider.
- The Lyrics menu has the floating lyrics' dark backdrop and "Put floating lyrics back in place".
- If you lock your PC while in full screen, the lyrics window comes back when you unlock.
- Source-available under the PolyForm Noncommercial License 1.0.0. See LICENSE and CONTRIBUTING.md.
- Auralyrics has its own app icon (a twin-colour glow ring) on the exe, the installer, the shortcuts and the taskbar.

### Fixed
- Task Manager listed the app as "Electron" with the default atom icon. The exe now identifies itself as Auralyrics.

### Note
- 2.0.0 has no updater, so install 2.1.0 yourself once. After that, updates come on their own.

## [2.0.0] — 2026-11-21

Glowrim is now Auralyrics.

### Added
- Auto lyric style, now the default. It picks a style for each song from its pace, line length, themes and the time of day.
- Click the cover in full screen to see it big. Click again, or press C, to get the lyrics back.

### Changed
- Twin orbit is the default glow.
- The style dots in the full-screen caption stay hidden until you hover over it.
- Turning Auto or Shuffle off keeps the style that is on screen.
- Renamed everywhere, including the installer names and the settings and log folder (`%APPDATA%\Auralyrics`).

### Migration
- On first launch your settings are copied once from the old `%APPDATA%\glowrim` folder. Uninstall Glowrim afterwards and remove its "Start with Windows" entry if it had one.

## [1.5.0] — 2026-11-21

- Five glow styles: Rim, Corners, Orbit, Twin orbit and Top & bottom.
- Hover controls on the floating desktop lyrics.
- Glow sizes follow the screen, so it looks the same on any monitor.

## [1.4.0] — 2026-11-21

- Poster style: the album cover with the sung line beside it.
- Shuffle styles: a new style every song or every minute.

## [1.2.0] — 2026-11-19

- Maps cards in the Native Design message thread.
- Lyrics and Glow menus at the top right of full screen.

## [1.1.0] — 2026-11-19

First release: screen-edge glow, synced lyrics in 16 styles, full-screen view, floating lyrics, tray menu.
