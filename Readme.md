# Cleanflight Blackbox Explorer

![Main explorer interface](screenshots/main-interface.jpg)

This tool allows you to open logs recorded by Cleanflight's Blackbox feature in your web browser. You can seek through
the log to examine graphed values at each timestep. If you have a flight video, you can load that in as well and it'll
be played behind the log. You can export the graphs as a WebM video to share with others.

## Installation

You can grab our desktop app for Windows (32 and 64 bit), macOS and Linux (.deb) from our
[GitHub releases page](https://github.com/cleanflight/blackbox-log-viewer/releases).

On Windows, download the ".exe" installer, run it, and you should end up with an icon on your desktop.

On macOS, download the ".dmg" archive. Open it up, and drag the Blackbox Explorer icon to the Applications
folder to install it.

On Debian-based Linux (such as Ubuntu), download the ".deb" package that matches your architecture (32 or 64 bit). 
You can install that on Ubuntu with something like:

```
dpkg -i cleanflight-blackbox-explorer_1.0.0_amd64.deb

# Install any dependencies that prevented the deb from finishing installation:
apt-get install -f
```

After installing, Blackbox Explorer will automatically keep itself up to date on Windows and macOS. You'll
need to manually download new versions on Linux.

## Running from source without installation

If you're a developer, you can run Blackbox Explorer without installing one of our binary releases.
Clone this repository, install Node JS (I suggest the 6.9 LTS release), and run "npm install" in the root of our repo in order to fetch
our dependencies. Now you can launch the application by running "npm start", or start it with the JavaScript
inspector enabled with "npm run debug".

## Legacy browser / Chrome version

We're dropping support for our old "Chrome App" version, since Chrome will drop support for Chrome apps in 2017. 
You can still find that [legacy version here](https://github.com/cleanflight/blackbox-log-viewer/tree/chrome-legacy) if you want it.

## Usage
Click the "Open log file/video" button at the top right and select your logged ".TXT" file and your flight video (if 
you recorded one).

You can scroll through the log by clicking or dragging on the seek bar that appears underneath the main graph. The 
current time is represented by the vertical red bar in the center of the graph. You can also click and drag left and
right on the graph area to scrub backwards and forwards.

### Syncing your log to your flight video

The blackbox plays a short beep on the buzzer when arming, and this corresponds with the start of the logged data.
You can sync your log against your flight video by pressing the "start log here" button when you hear the beep in the
video. You can tune the alignment of the log manually by pressing the nudge left and nudge right buttons in the log
sync section, or by editing the value in the "log sync" box. Positive values move the log toward the end of the video, 
negative values move it towards the beginning.

### Customizing the graph display

Click the "Graph Setup" button on the right side of the display in order to choose which fields should be plotted on
the graph. You may, for example, want to remove the default gyro plot and add separate gyro plots for each rotation axis.
Or you may want to plot vbat against throttle to examine your battery's performance.

## Notes

Your web browser must support the video codec that your flight video uses in order to play it. Firefox doesn't support
H.264 videos on Mac, so if your video won't play, try Google Chrome instead. If it still won't play, follow the 
instructions in the next section to convert your video using Handbrake.

This tool is currently in the Beta stage, so a number of key features have yet to be implemented:

- There is no control over the amount of smoothing applied to the graph lines
- There is no way to single-step between loop iterations with the arrow keys

## Flight video won't load, or jumpy flight video upon export

Some flight video formats aren't supported by Chrome, so the viewer can't open them. You can fix this by re-encoding
your video using the free tool [Handbrake][]. Open your original video using Handbrake. In the output settings, choose
MP4 as the format, and H.264 as the video codec.

Because of [Google Bug #66631][], Chrome is unable to accurately seek within H.264 videos that use B-frames. This is
mostly fine when viewing the flight video inside Blackbox Explorer. However, if you use the "export video" feature, this
bug will cause the flight video in the background of the exported video to occasionally jump backwards in time for a
couple of frames, causing a very glitchy appearance.

To fix that issue, you need to tell Handbrake to render every frame as an intraframe, which will avoid any problematic
B-frames. Do that by adding "keyint=1" into the Additional Options box:

![Handbrake settings](screenshots/handbrake.png)

Hit start to begin re-encoding your video. Once it finishes, you should be able to load the new video into the Blackbox
Explorer.

[Handbrake]: https://handbrake.fr/
[Google Bug #66631]: http://code.google.com/p/chromium/issues/detail?id=66631

## License

This project is licensed under GPLv3.