'use strict';
const { app, BrowserWindow, shell, ipcMain, protocol, net, Menu, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

const isDev = !app.isPackaged;

// Must be called before app is ready — registers app:// as a trusted secure origin
protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
}]);

let mainWindow = null;
let splashWindow = null;
let splashMinDone = false;
let mainReady = false;

function tryReveal() {
  if (!splashMinDone || !mainReady) return;
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  mainWindow.show();
  mainWindow.focus();
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
  setTimeout(() => { splashMinDone = true; tryReveal(); }, 2200);
}

function createMain() {
  const iconPath = isDev
    ? path.join(__dirname, '..', 'public', 'app-icon.png')
    : path.join(app.getAppPath(), 'dist', 'app-icon.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    title: 'Movieslo',
    icon: iconPath,
    show: false,
    backgroundColor: '#060512',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Remove the native File/Edit/View/Window/Help menu bar
  Menu.setApplicationMenu(null);

  mainWindow.loadURL(isDev ? 'http://localhost:5173' : 'app://movieslo/');

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
  // Strip "Electron/x.x.x" from the UA at the session level — userAgentFallback alone isn't enough
  const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  session.defaultSession.setUserAgent(chromeUA);
  app.userAgentFallback = chromeUA;

  // Serve the built app via app:// — gives a proper secure origin and fixes React Router navigation
  protocol.handle('app', async (request) => {
    const { pathname } = new URL(request.url);
    const rel = pathname.startsWith('/') ? pathname.slice(1) : pathname;
    const filePath = path.join(app.getAppPath(), 'dist', rel || 'index.html');

    try {
      const res = await net.fetch(`file://${filePath}`);
      if (res.ok) return res;
      // SPA fallback — unknown routes return index.html so React Router handles them
      return net.fetch(`file://${path.join(app.getAppPath(), 'dist', 'index.html')}`);
    } catch {
      return net.fetch(`file://${path.join(app.getAppPath(), 'dist', 'index.html')}`);
    }
  });

  createSplash();
  createMain();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createMain(); });
