// This is the entry-point for the main Electron process

const
	electron = require('electron'),
	app = electron.app,
	BrowserWindow = electron.BrowserWindow,

	path = require('path'),
	url = require('url'),

	windowStateKeeper = require('electron-window-state');

if (require('electron-squirrel-startup')) {
	return;
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

function createWindow() {
	const
		screenSize = electron.screen.getPrimaryDisplay().workAreaSize,
	
		mainWindowState = windowStateKeeper({
			defaultWidth: Math.min(1440, screenSize.width - 100),
			defaultHeight: Math.min(1080, screenSize.height - 100)
		});
	
	mainWindow = new BrowserWindow({
		x: mainWindowState.x,
		y: mainWindowState.y,
		width: mainWindowState.width,
		height: mainWindowState.height,
		title: "Cleanflight Blackbox Explorer"
	});
	
	mainWindow.loadURL(url.format({
		pathname: path.join(__dirname, '../index.html'),
		protocol: 'file:',
		slashes: true
	}));
	
	if (process.argv.indexOf("--inspector") != -1) {
		mainWindow.webContents.openDevTools();
	}
	
	mainWindowState.manage(mainWindow);
	
	mainWindow.on('closed', function () {
		// Dereference the window object, usually you would store windows
		// in an array if your app supports multi windows, this is the time
		// when you should delete the corresponding element.
		mainWindow = null
	});
	
	// Avoid competing for the lock on our app with the Squirrel installer who could be locking us right now:
	if (process.argv[1] != '--squirrel-firstrun') {
		const
			AppUpdater = require("./updater");
		
		new AppUpdater(mainWindow);
	}
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
	// On OS X it is common for applications and their menu bar
	// to stay active until the user quits explicitly with Cmd + Q
	//if (process.platform !== 'darwin') {
	app.quit();
	//}
});

app.on('activate', function () {
	// On OS X it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	//if (mainWindow === null) {
	//	createWindow();
	//}
});

