'use strict';
// electron-builder hook: runs after the app is packed, before the installer is built.
// Stamps Auralyrics' own name, version and icon onto the exe. Without this the exe still says "Electron" in its file
// properties, so Task Manager lists "Electron (9)" and the shortcut and taskbar show the default atom icon.
// (electron-builder can do this itself with signAndEditExecutable, but that downloads a signing toolkit that does not
// unpack on a normal Windows account, so we use rcedit directly.)
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const { rcedit } = await import('rcedit');
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const v = context.packager.appInfo.version;
  await rcedit(exe, {
    icon: path.join(context.packager.projectDir, 'build', 'icon.ico'),
    'version-string': {
      ProductName: 'Auralyrics',
      FileDescription: 'Auralyrics',
      InternalName: 'Auralyrics',
      OriginalFilename: 'Auralyrics.exe',
      CompanyName: 'Auralyrics',
      LegalCopyright: 'Copyright (c) 2026 Auralyrics'
    },
    'file-version': v,
    'product-version': v
  });
  console.log(`  • stamped name and icon onto ${path.basename(exe)}`);
};
