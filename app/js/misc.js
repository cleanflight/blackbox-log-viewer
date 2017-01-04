const
	path = require("path");

function leftPad(string, pad, minLength) {
	// Coerce value to string:
	string = "" + string;
	
	while (string.length < minLength) {
		string = pad + string;
	}
	
	return string;
}

function formatTime(msec, displayMsec, displayHours) {
	var
		secs, mins, hours;
	
	msec = Math.round(msec);
	
	secs = Math.floor(msec / 1000);
	msec %= 1000;
	
	mins = Math.floor(secs / 60);
	secs %= 60;
	
	hours = Math.floor(mins / 60);
	mins %= 60;
	
	return (hours > 0 || displayHours ? leftPad(hours, "0", 1) + ":" : "") + leftPad(mins, "0", 2) + ":" + leftPad(secs, "0", 2)
		+ (displayMsec ? "." + leftPad(msec, "0", 3) : "");
}

/**
 * Change the extension of the given filename.
 *
 * @param {String} filename - A valid path and filename
 * @param {String} extension - Should include the dot, e.g. ".jpg"
 * @returns {string}
 */
function setFileExtension(filename, extension) {
	var
		directory = path.dirname(filename),
		name = path.basename(filename);
	
	if (name.length == 0) {
		throw new Error("Empty filename not allowed");
	}
	
	// Remove existing file extension if present
	if (name.lastIndexOf(".") > -1) {
		name = name.substring(0, name.lastIndexOf("."));
	}
	
	return path.join(directory, name + extension);
}

function formatFilesize(bytes) {
	var
		megs = Math.round(bytes / (1024 * 1024));
	
	return megs + "MB";
}

module.exports = {leftPad, formatTime, setFileExtension, formatFilesize};