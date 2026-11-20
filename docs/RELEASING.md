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
