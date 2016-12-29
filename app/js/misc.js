function leftPad(string, pad, minLength) {
	// Coerce value to string:
	string = "" + string;
	
	while (string.length < minLength) {
		string = pad + string;
	}
	
	return string;
}

function formatTime(msec, displayMsec) {
	var
		secs, mins, hours;
	
	msec = Math.round(msec);
	
	secs = Math.floor(msec / 1000);
	msec %= 1000;
	
	mins = Math.floor(secs / 60);
	secs %= 60;
	
	hours = Math.floor(mins / 60);
	mins %= 60;
	
	return (hours ? leftPad(hours, "0", 2) + ":" : "") + leftPad(mins, "0", 2) + ":" + leftPad(secs, "0", 2)
		+ (displayMsec ? "." + leftPad(msec, "0", 3) : "");
}

module.exports = {leftPad, formatTime};