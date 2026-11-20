# Changelog

All notable changes to Auralyrics (formerly Glowrim). Dates are release dates.

## [2.0.0] — 2026-11-21

Glowrim is now **Auralyrics**.

### Added
- **Auto lyric style** (new default). Reads each song's pace, line length, themes and the time of day, then picks the style that fits. Never repeats the style on screen.
- **Click the cover** in the full-screen player to show it big in place of the lyrics; click again (or press **C**) for the lyrics.
- **Auto chip** in the full-screen caption, and Auto in the Look tab, the full-screen Lyrics menu and the tray menu.
- Landing page (`site/`) with SEO metadata, Open Graph tags and structured data.
- Proprietary `LICENSE`, `CHANGELOG`, README with screenshots, FAQ and privacy section.

### Changed
- **Twin orbit** is the default glow; Orbit is second in every picker.
- The 17 style dots in the full-screen caption stay tucked away until the caption is hovered.
- Turning Auto or Shuffle off keeps the style that is on screen instead of snapping back to the one saved earlier.
- Renamed everywhere: app name, installer (`Auralyrics-Setup-<version>.exe`, `Auralyrics-<version>-portable.exe`), window titles, tray, log file (`%APPDATA%\Auralyrics\auralyrics.log`) and debug variables (`AURALYRICS_DEBUG`, `AURALYRICS_SHOT`).

### Migration
- On first launch, settings are copied once from the old `%APPDATA%\glowrim` folder. Uninstall Glowrim afterwards and remove its "Start with Windows" entry if you used it.
- People still on the old defaults (Shuffle off, Rim glow) are moved to Auto and Twin orbit.

## [1.5.0] — 2026-11-21

### Added
- Five glow styles: Rim, Corners, Orbit, Twin orbit, Top & bottom.
- Hover controls on the floating desktop lyrics.

### Changed
- Glow sizes follow the screen, so it looks the same on a laptop, an ultrawide or a 4K monitor.

## [1.4.0] — 2026-11-21

### Added
- **Poster** style: the album cover as a poster, with the sung line beside it.
- **Shuffle styles**: a new style every song or every minute, from your pinned styles.

## [1.2.0] — 2026-11-19

### Added
- Maps location cards mixed into the Native Design message thread.
- Menu-bar style Lyrics and Glow dropdowns at the top right of the full-screen view.

## [1.1.0] — 2026-11-19

First release: screen-edge glow that follows the album and the beat, synced word-by-word lyrics in 16 styles, full-screen view, floating lyrics, tray menu and Windows media-controls bridge.
