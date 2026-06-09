'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  isDesktop: true,
  platform: process.platform,
  onUpdateAvailable:  (cb) => { ipcRenderer.removeAllListeners('update-available');  ipcRenderer.on('update-available',  () => cb()) },
  onUpdateProgress:   (cb) => { ipcRenderer.removeAllListeners('update-progress');   ipcRenderer.on('update-progress',   (_e, pct) => cb(pct)) },
  onUpdateDownloaded: (cb) => { ipcRenderer.removeAllListeners('update-downloaded'); ipcRenderer.on('update-downloaded', () => cb()) },
  onUpdateError:      (cb) => { ipcRenderer.removeAllListeners('update-error');      ipcRenderer.on('update-error',      (_e, msg) => cb(msg)) },
  installUpdate: () => ipcRenderer.send('install-update')
});
