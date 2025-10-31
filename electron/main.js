const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

function createWindow () {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    }
  })

  // In dev we set VITE_DEV_SERVER_URL env var so we can load the dev server
  const devUrl = process.env.VITE_DEV_SERVER_URL || null
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    // production: try a few likely locations for the built renderer `index.html`.
    // Packaging sometimes nests files differently depending on how the package step was run,
    // so probe a few candidates and pick the first that exists.
    const candidates = [
      path.join(__dirname, '..', 'dist', 'index.html'),
      path.join(__dirname, 'dist', 'index.html'),
      path.join(process.cwd(), 'dist', 'index.html'),
      path.join(app.getAppPath(), 'dist', 'index.html')
    ];

    const found = candidates.find(p => {
      try { return fs.existsSync(p); } catch (e) { return false; }
    });

    if (found) {
      win.loadFile(found);
    } else {
      // Fallback: show a helpful message so the user can debug missing files
      win.loadURL('data:text/html,<h2>Renderer files not found</h2><p>Expected dist/index.html but none of the candidate paths existed.</p>');
    }
  }

  // Optionally open DevTools in dev
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools()
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})
