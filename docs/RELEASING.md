# Releasing Auralyrics

1. Bump `version` in `package.json` and add a section to `CHANGELOG.md`.
2. Commit: `git commit -am "chore: release X.Y.Z"` and push `main`.
3. Build: `npm run dist` → `dist\Auralyrics-Setup-X.Y.Z.exe` and `dist\Auralyrics-X.Y.Z-portable.exe`.
4. Checksums (PowerShell, from `dist`):
   ```powershell
   Get-FileHash Auralyrics-Setup-X.Y.Z.exe, Auralyrics-X.Y.Z-portable.exe -Algorithm SHA256 |
     ForEach-Object { "$($_.Hash.ToLower())  $(Split-Path $_.Path -Leaf)" } | Set-Content SHA256SUMS.txt
   ```
5. Publish (tags the current `main`):
   ```powershell
   gh release create vX.Y.Z dist\Auralyrics-Setup-X.Y.Z.exe dist\Auralyrics-X.Y.Z-portable.exe dist\SHA256SUMS.txt `
     --title "Auralyrics X.Y.Z" --notes-file release-notes.md --target main
   ```

Also attach `dist\latest.yml` and `dist\Auralyrics-Setup-X.Y.Z.exe.blockmap` to the release. Installed copies read `latest.yml` to find and download updates, so a release without it will not update anyone. The workflow does this for you.

Builds are not code-signed yet. `package.json` keeps `signAndEditExecutable: false`, because electron-builder's signing toolkit does not unpack on a normal Windows account; the app's name and icon are stamped by `scripts/after-pack.js` instead. To sign a local build, set `CSC_LINK` / `CSC_KEY_PASSWORD` and run `npm run dist -- -c.win.signAndEditExecutable=true` from an admin prompt (or with Windows Developer Mode on) for step 3.

## Automatic releases (GitHub Actions)

Steps 3–5 above also run on their own. After steps 1–2, tag and push:

```powershell
git tag vX.Y.Z
git push origin vX.Y.Z
```

`.github/workflows/release.yml` checks the tag matches `package.json`, runs the tests, builds on a Windows runner and publishes the
release with `SHA256SUMS.txt` and notes taken from the matching `CHANGELOG.md` section.
Actions → Release → *Run workflow* does a dry run that only uploads the build as a 7-day workflow artifact.
`ci.yml` runs syntax checks, the unit tests and a version/changelog check on every push and pull request.

## How updates reach people

- Installed build: the app reads `latest.yml` from the latest GitHub Release (every ~6 hours and 30 seconds after launch), downloads the new installer in the background, and installs it when the app quits or from "Restart to update". The repository and its releases must be public for this to work without a token.
- Portable build: it cannot replace itself, so it only shows "Update available" and opens the release page.
- Pre-releases and drafts are ignored. To test, publish a normal release with a higher version than the one installed.

To sign the builds, add `CSC_LINK` (base64 `.pfx`) and `CSC_KEY_PASSWORD` as repository secrets. The release workflow sees them and turns signing on for that build. This path has not been tried with a real certificate yet, so check the first signed release (right-click the exe → Properties → Digital Signatures).
