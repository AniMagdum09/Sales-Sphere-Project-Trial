const { app, BrowserWindow } = require('electron')
const path = require('path')

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    backgroundColor: '#0A0F1E',
    autoHideMenuBar: true,
    title: 'SalesSphere',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })

  win.once('ready-to-show', () => win.show())

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  if (devServerUrl) {
    // Development: load the Vite dev server.
    win.loadURL(devServerUrl)
  } else {
    // Production: load the built bundle from dist/.
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
    win
      .loadFile(indexPath)
      .catch(() => win.loadURL('file://' + indexPath.split(path.sep).join('/')))
  }

  return win
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
