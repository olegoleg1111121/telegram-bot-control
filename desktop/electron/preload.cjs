const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('botControl', {
  logs: (params) => ipcRenderer.invoke('control:logs', params),
  inspectProject: (directory, entrypoint) =>
    ipcRenderer.invoke('control:inspect-project', directory, entrypoint),
  registerProject: (params) => ipcRenderer.invoke('control:register-project', params),
  webStatus: () => ipcRenderer.invoke('web:status'),
  startWeb: (options) => ipcRenderer.invoke('web:start', options),
  stopWeb: () => ipcRenderer.invoke('web:stop'),
  openWebPanel: () => ipcRenderer.invoke('web:open'),
  desktopInfo: () => ipcRenderer.invoke('desktop:info'),
  saveDesktopPreferences: (next) => ipcRenderer.invoke('desktop:preferences', next),
  copyText: (text) => ipcRenderer.invoke('desktop:copy', text),
  onOpenGuide: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('desktop:open-guide', listener);
    return () => ipcRenderer.removeListener('desktop:open-guide', listener);
  },
  snapshot: (params) => ipcRenderer.invoke('control:snapshot', params),
  connection: () => ipcRenderer.invoke('control:connection'),
  connect: (profile) => ipcRenderer.invoke('control:connect', profile),
  previewRetention: (settings) => ipcRenderer.invoke('control:preview-retention', settings),
  saveSettings: (settings, confirmCleanup) =>
    ipcRenderer.invoke('control:save-settings', settings, confirmCleanup),
  launchProfile: (botId) => ipcRenderer.invoke('control:launch-profile', botId),
  saveLaunchProfile: (botId, profile) =>
    ipcRenderer.invoke('control:save-launch-profile', botId, profile),
  controlBot: (botId, action, force = false) =>
    ipcRenderer.invoke('control:bot', botId, action, force),
});
