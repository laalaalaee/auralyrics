const { contextBridge, ipcRenderer } = require('electron');
const on = ch => cb => ipcRenderer.on(ch, (_e, v) => cb(v));
contextBridge.exposeInMainWorld('api', {
  set: patch => ipcRenderer.send('set', patch),
  control: (cmd, arg) => ipcRenderer.send('control', cmd, arg),
  reconnect: () => ipcRenderer.send('reconnect'),
  stage: on => ipcRenderer.send('stage', on),
  openWindow: tab => ipcRenderer.send('openWindow', tab),
  onTab: on('tab'),
  level: lv => ipcRenderer.send('level', lv),
  artColors: cols => ipcRenderer.send('artColors', cols),
  onSettings: on('settings'),
  onLevel: on('level'),
  onNow: on('now'),
  onTime: on('time'),
  onLyrics: on('lyrics'),
  onStatus: on('status'),
  onDisplays: on('displays'),
  onExtract: on('extract'),
  onAudio: on('audio')
});
