"use strict";

const
    fs = require('fs'),
    path = require('path'),
	EventEmitter = require('events'),
    
    WebMWriter = require('webm-writer'),
	
	FlightLogGrapher = require("./grapher.js"),
    {leftPad} = require("./misc.js");

/**
 * Decode a Base64 data URL into a Buffer.
 *
 * @param url {string}
 * @returns {Buffer}
 */
function decodeBase64PNGDataURL(url) {
	if (typeof url !== "string" || !url.match(/^data:image\/png;base64,/i)) {
		return null;
	}
	
	return Buffer.from(url.substring("data:image\/png;base64,".length), "base64");
}

function canvasToPNG(canvas) {
	return decodeBase64PNGDataURL(canvas.toDataURL('image/png'));
}

/**
 * Render a video of the given log using the given videoOptions (user video settings) and logParameters.
 * 
 * flightLog - FlightLog object to render
 * 
 * logParameters - Object with these fields:
 *     inTime      - Blackbox time code the video should start at, or false to start from the beginning
 *     outTime     - Blackbox time code the video should end at, or false to end at the end
 *     graphConfig - GraphConfig object to be used for drawing the graphs
 *     flightVideo - Flight video to display behind the graphs (optional)
 *     flightVideoOffset - Offset of flight video start time relative to start of log in seconds
 *
 * videoOptions - Object with these fields:
 *     filename   - For WebM video, the file to export to, for PNG the name of the file will be used as a prefix
 *     frameRate
 *     width
 *     height
 *     videoDim   - Amount of dimming applied to background video from 0.0 to 1.0
 *     format     - webm or png
 *
 * Emits these events:
 *     complete - On render completion, called with (success, frameCount)
 *     progress - Called periodically with (frameIndex, frameCount) to report progress
 */
function FlightLogVideoRenderer(flightLog, logParameters, videoOptions) {
    const
        WORK_CHUNK_SIZE_FOCUSED = 8,
        WORK_CHUNK_SIZE_UNFOCUSED = 32,
        
        that = this;
        
    var
	    /**
         * @type {WebMWriter}
	     */
	    videoWriter,
        
        canvas = document.createElement('canvas'),
        craftCanvas = document.createElement('canvas'),
        craftCanvasLeft, craftCanvasTop,
        
        canvasContext = canvas.getContext("2d"),
        
        frameCount, frameDuration /* Duration of a frame in Blackbox's microsecond time units */,
        frameTime, frameIndex,
        writtenBytes,
	    videoFd,
        cancel = false,
        
        filenameTemplate,
        
        workChunkSize = WORK_CHUNK_SIZE_FOCUSED,
        hidden, visibilityChange,
        
        graph;
    
    // From https://developer.mozilla.org/en-US/docs/Web/Guide/User_experience/Using_the_Page_Visibility_API
    if (typeof document.hidden !== "undefined") { // Opera 12.10 and Firefox 18 and later support 
       hidden = "hidden";
       visibilityChange = "visibilitychange";
    } else if (typeof document.mozHidden !== "undefined") {
       hidden = "mozHidden";
       visibilityChange = "mozvisibilitychange";
    } else if (typeof document.msHidden !== "undefined") {
       hidden = "msHidden";
       visibilityChange = "msvisibilitychange";
    } else if (typeof document.webkitHidden !== "undefined") {
       hidden = "webkitHidden";
       visibilityChange = "webkitvisibilitychange";
    }
    
    /**
     * Chrome slows down timers when the tab loses focus, so we want to fire fewer timer events (render more frames
     * in a chunk) in order to compensate.
     */
    function handleVisibilityChange() {
        if (document[hidden]) {
            workChunkSize = WORK_CHUNK_SIZE_UNFOCUSED;
        } else {
            workChunkSize = WORK_CHUNK_SIZE_FOCUSED;
        }
    }

    function installVisibilityHandler() {
        if (typeof document[hidden] !== "undefined") {
            document.addEventListener(visibilityChange, handleVisibilityChange, false);
        }
    }
    
    function removeVisibilityHandler() {
        if (typeof document[hidden] !== "undefined") {
            document.removeEventListener(visibilityChange, handleVisibilityChange);
        }
    }
    
    function createFrameFilename(frameIndex) {
        return filenameTemplate.replace("$1", leftPad(frameIndex, "0", 7));
    }

    function notifyCompletion(success, frameCount) {
        removeVisibilityHandler();
        
        that.emit("complete", success, frameCount);
    }
    
    function finishRender(success) {
        var
            complete;
        
        if (videoOptions.format == "webm") {
            complete = videoWriter.complete().then(function() {
	            fs.closeSync(videoFd);
            })
        } else {
            complete = Promise.resolve();
        }
        
        complete.then(function() {
            notifyCompletion(success, frameIndex);
        });
    }
    
    function renderChunk() {
        /* 
         * Allow the UI to have some time to run by breaking the work into chunks, yielding to the browser
         * between chunks.
         * 
         * I'd dearly like to run the rendering process in a Web Worker, but workers can't use Canvas because
         * it happens to be a DOM element (and Workers aren't allowed access to the DOM). Stupid!
         */
        var
            framesToRender = Math.min(workChunkSize, frameCount - frameIndex);
        
        if (cancel) {
            finishRender(false);
            return;
        }
        
        var
            completeChunk = function() {
                that.emit("progress", frameIndex, frameCount, that.getWrittenSize());
                
                if (frameIndex >= frameCount) {
                    finishRender(true);
                } else {
                    setTimeout(renderChunk, 0);
                }
            },
            
            renderFrame = function() {
                graph.render(frameTime);
                
                canvasContext.drawImage(craftCanvas, craftCanvasLeft, craftCanvasTop);
                
                if (videoOptions.format == "webm") {
	                videoWriter.addFrame(canvas);
                } else {
                    var
	                    fd = fs.openSync(createFrameFilename(frameIndex), "w"),
                        frame = canvasToPNG(canvas);
                    
                    fs.writeFileSync(fd, frame);
                    writtenBytes += frame.length;
                    
                    fs.closeSync(fd);
                }
                
                frameIndex++;
                frameTime += frameDuration;
            };
        
        if (logParameters.flightVideo) {
            var
                renderFrames = function(frameCount) {
                    if (frameCount == 0) {
                        completeChunk();
                        return;
                    }

                    logParameters.flightVideo.onseeked = function() {
                        canvasContext.drawImage(logParameters.flightVideo, 0, 0, videoOptions.width, videoOptions.height);
                        
                        if (videoOptions.videoDim > 0) {
                            canvasContext.fillStyle = 'rgba(0,0,0,' + videoOptions.videoDim + ')';
                            
                            canvasContext.fillRect(0, 0, canvas.width, canvas.height);
                        }
                        
                        // Render the normal graphs and add frame to video
                        renderFrame();
                        
                        renderFrames(frameCount - 1);
                    };
                    
                    logParameters.flightVideo.currentTime = (frameTime - flightLog.getMinTime()) / 1000000 + (logParameters.flightVideoOffset || 0);
                };
                
            renderFrames(framesToRender);
        } else {
            for (var i = 0; i < framesToRender; i++) {
                renderFrame();
            }
            
            completeChunk();
        }
    }
 
    /**
     * Attempt to cancel rendering sometime soon. An onComplete() event will be triggered with the 'success' parameter set
     * appropriately to report the outcome.
     */
    this.cancel = function() {
        cancel = true;
    };
    
    /**
     * Begin rendering the video and return immediately.
     */
    this.start = function() {
        cancel = false;
        
        frameTime = logParameters.inTime;
        frameIndex = 0;
        writtenBytes = 0;
        
        installVisibilityHandler();
        
        var
            prepareRender;
        
        if (videoOptions.format == "webm") {
	        prepareRender = new Promise(function(resolve) {
		        videoFd = fs.openSync(videoOptions.filename, "w");
		
		        var
                    webMOptions = {
                        frameRate: videoOptions.frameRate,
                        fd: videoFd
                    };
        
                videoWriter = new WebMWriter(webMOptions);
                
                resolve();
            });
        } else {
            prepareRender = Promise.resolve();
        }
	
        /* Ensure caller can have a chance to update the DOM before we start trying to render (so they can throw up
         * a "video rendering..." message)
         */
        setTimeout(
            function() {
                prepareRender
		            .then(function() {
			            renderChunk();
		            })
		            .catch(function(error) {
			            console.error(error);
			            notifyCompletion(false);
		            })
            },
            0
        );
    };
    
    /**
     * Get the number of bytes flushed out to the device so far.
     */
    this.getWrittenSize = function() {
        if (videoOptions.format == "webm") {
	        return videoWriter ? videoWriter.getWrittenSize() : 0;
        } else {
            return writtenBytes;
        }
    };

    canvas.width = videoOptions.width;
    canvas.height = videoOptions.height;

    // If we've asked to blank the flight video completely then just don't render that
    if (videoOptions.videoDim >= 1.0) {
        delete logParameters.flightVideo;
    }
    
    var
        videoBackground;
	
	if (logParameters.flightVideo) {
		videoBackground = "none";
	} else {
	    switch (videoOptions.format) {
            case "webm":
            default:
                // No transparency support in this format
                videoBackground = "fill";
	        break;
            case "png":
	            videoBackground = "clear";
        }
	}
    
    graph = new FlightLogGrapher(flightLog, logParameters.graphConfig, videoOptions.layoutPreset, canvas, craftCanvas, {
        background: videoBackground
    });
    
    craftCanvasLeft = parseInt($(craftCanvas).css('left'), 10);
    craftCanvasTop = parseInt($(craftCanvas).css('top'), 10);
    
    if (!("inTime" in logParameters) || logParameters.inTime === false) {
        logParameters.inTime = flightLog.getMinTime();
    }
    
    if (!("outTime" in logParameters) || logParameters.outTime === false) {
        logParameters.outTime = flightLog.getMaxTime();
    }
    
    frameDuration = 1000000 / videoOptions.frameRate;
    
    // If the in -> out time is not an exact number of frames, we'll round the end time of the video to make it so:
    frameCount = Math.round((logParameters.outTime - logParameters.inTime) / frameDuration);
    
    if (logParameters.flightVideo) {
        logParameters.flightVideo.muted = true;
    }
    
    var
        destinationDir = path.dirname(videoOptions.filename),
        destinationName = path.basename(videoOptions.filename),
        destinationExt;
    
    if (destinationName.lastIndexOf(".") > -1) {
        destinationExt = destinationName.substring(destinationName.lastIndexOf("."));
        destinationName = destinationName.substring(0, destinationName.lastIndexOf("."));
    } else {
        destinationExt = "." + videoOptions.format;
        destinationName = "video";
    }
    
    filenameTemplate = path.join(destinationDir, destinationName + "-$1" + destinationExt);
}

Object.setPrototypeOf(FlightLogVideoRenderer.prototype, EventEmitter.prototype);

module.exports = FlightLogVideoRenderer;