const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('salesphere', {
  version: '2.0.0',
})
