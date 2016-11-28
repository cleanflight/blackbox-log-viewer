const
	electron = require("electron"),
	autoUpdater = require("electron-auto-updater").autoUpdater,
	os = require("os"),
	
	SUPPORTED_PLATFORMS = ["win32", "darwin"],
	UPDATE_SERVER = "updates.flysherlockair.com",
	UPDATE_PRODUCT = "blackbox-log-viewer",
	
	USE_AUTOMATIC_UPDATES = true,

	platform = os.platform(),
	arch = os.arch(),
	version = electron.app.getVersion();

function log(message) {
	console.log(message);
}

function configureUpdater() {
	autoUpdater.addListener("checking-for-update",function() {
		log("Checking for update...");
	});
	
	autoUpdater.addListener("update-available", function() {
		log("A new update is available! Downloading now...")
	});
	
	autoUpdater.addListener("update-downloaded", function(event, releaseNotes, releaseName, releaseDate, updateURL) {
		log("Update downloaded, will install on next launch. (new version " + releaseName + ")");
		
		return true;
	});
	
	autoUpdater.addListener("update-not-available", function() {
		log("Already up to date");
	});
	
	autoUpdater.addListener("error", function(error) {
		log("Update error: " + error);
	});
	
	if (platform == "darwin") {
		autoUpdater.setFeedURL(`https://${UPDATE_SERVER}/${UPDATE_PRODUCT}/update/${platform}_${arch}/${version}`);
	}
}

class AppUpdater {
	updaterSupported() {
		return SUPPORTED_PLATFORMS.indexOf(platform) != -1;
	}
	
	constructor(window) {
		console.log("App version " + version);
		
		if (USE_AUTOMATIC_UPDATES) {
			if (this.updaterSupported()) {
				configureUpdater();
				
				window.webContents.once("did-frame-finish-load", function () {
					autoUpdater.checkForUpdates();
				});
			} else {
				log("This platform (" + platform + ") not supported for auto-updates, not checking.");
			}
		} else {
			log("Automatic updates disabled.");
		}
	}
}

module.exports = AppUpdater;