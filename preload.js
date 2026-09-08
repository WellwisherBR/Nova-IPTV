const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  storeGet: (name) => ipcRenderer.invoke('store:get', name),
  storeSet: (name, value) => ipcRenderer.invoke('store:set', name, value),
  httpGet: (opts) => ipcRenderer.invoke('http:get', opts),
  openM3uFile: () => ipcRenderer.invoke('file:openM3u'),
  readText: (p) => ipcRenderer.invoke('file:readText', p),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  getVersion: () => ipcRenderer.invoke('app:version')
});
