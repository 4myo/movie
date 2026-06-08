'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  isDesktop: true,
  platform: process.platform,
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', () => cb()),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', () => cb()),
  installUpdate: () => ipcRenderer.send('install-update')
});
