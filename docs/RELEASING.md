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

Builds are not code-signed yet. Once there is a certificate, set `CSC_LINK` / `CSC_KEY_PASSWORD` before step 3 and electron-builder signs both files.

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

To sign the builds, add `CSC_LINK` (base64 `.pfx`) and `CSC_KEY_PASSWORD` as repository secrets.
