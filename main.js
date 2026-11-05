const { app, BrowserWindow } = require("electron");

function createWindow() {
  const window = new BrowserWindow({
    width: 360,
    height: 600,
    resizable: true,
    webPreferences:{
      contextIsolation: true
    }
  });

  window.loadFile("index.html");
}

app.whenReady().then(createWindow);