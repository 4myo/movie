'use strict';
const { app, BrowserWindow, shell, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

const isDev = !app.isPackaged;

let mainWindow = null;
let splashWindow = null;
let splashMinDone = false;
let mainReady = false;

function tryReveal() {
  if (!splashMinDone || !mainReady) return;
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  mainWindow.show();
  mainWindow.focus();
  // Check for updates a few seconds after the app is visible
  if (!isDev) setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 4000);
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 270,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.center();
  // Minimum splash display time
  setTimeout(() => { splashMinDone = true; tryReveal(); }, 2200);
}

function createMain() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    title: 'Movieslo',
    show: false,
    backgroundColor: '#060512',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const startURL = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(app.getAppPath(), 'dist', 'index.html')}`;

  mainWindow.loadURL(startURL);

  // Open external links in the system browser, not inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => { mainReady = true; tryReveal(); });
  mainWindow.on('closed', () => { mainWindow = null; });
}

autoUpdater.on('update-available', () => mainWindow?.webContents.send('update-available'));
autoUpdater.on('update-downloaded', () => mainWindow?.webContents.send('update-downloaded'));
ipcMain.on('install-update', () => autoUpdater.quitAndInstall(false, true));

app.whenReady().then(() => {
  createSplash();
  createMain();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createMain(); });
