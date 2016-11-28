"use strict";

const
    {dialog} = require('electron').remote,
    fs = require('fs'),
    
    WebMWriter = require('webm-writer');

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
 *     frameRate
 *     width
 *     height
 *     videoDim   - Amount of dimming applied to background video from 0.0 to 1.0
 *
 * events - Object with these fields:
 *     onComplete - On render completion, called with (success, frameCount)
 *     onProgress - Called periodically with (frameIndex, frameCount) to report progress
 */
function FlightLogVideoRenderer(flightLog, logParameters, videoOptions, events) {
    var
        WORK_CHUNK_SIZE_FOCUSED = 8,
        WORK_CHUNK_SIZE_UNFOCUSED = 32,
        
        videoWriter,
        
        canvas = document.createElement('canvas'),
        craftCanvas = document.createElement('canvas'),
        craftCanvasLeft, craftCanvasTop,
        
        canvasContext = canvas.getContext("2d"),
        
        frameCount, frameDuration /* Duration of a frame in Blackbox's microsecond time units */,
        frameTime, frameIndex,
        cancel = false,
        
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
    
    /**
     * Returns a Promise that resolves to a fd for the file the user chose, or fails if the user cancels/
     * something else bad happens.
     */
    function openFileForWrite(suggestedName) {
        return new Promise(function(resolve, reject) {
            dialog.showSaveDialog({
                title: "Write video to file...",
                defaultPath: suggestedName,
                filters: [
                    {
                        name: "WebM video",
                        extensions: ["webm"]
                    }
                ]
            }, function(filename) {
                if (!filename) {
                    reject(null);
                } else {
                    fs.open(filename, "w", (err, fd) => {
                        if (err) {
                            reject(err);
                        } else {
	                        resolve(fd);
                        }
                    });
                }
            });
        });
    }

    function notifyCompletion(success, frameCount) {
        removeVisibilityHandler();
        
        if (events && events.onComplete) {
            events.onComplete(success, frameCount);
        }
    }
    
    function finishRender() {
        videoWriter.complete().then(function() {
            notifyCompletion(true, frameIndex);
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
            notifyCompletion(false);
            return;
        }
        
        var
            completeChunk = function() {
                if (events && events.onProgress) {
                    events.onProgress(frameIndex, frameCount);
                }
                
                if (frameIndex >= frameCount) {
                    finishRender();
                } else {
                    setTimeout(renderChunk, 0);
                }
            },
            
            renderFrame = function() {
                graph.render(frameTime);
                
                canvasContext.drawImage(craftCanvas, craftCanvasLeft, craftCanvasTop);
                
                videoWriter.addFrame(canvas);
                
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
        
        installVisibilityHandler();
        
        var
            webMOptions = {
                frameRate: videoOptions.frameRate,
            };
        
        openFileForWrite("video.webm").then(function(fd) {
            webMOptions.fd = fd;
            
            videoWriter = new WebMWriter(webMOptions);
            renderChunk();
        }, function(error) {
            console.error(error);
            notifyCompletion(false);
        });
    };
    
    /**
     * Get the number of bytes flushed out to the device so far.
     */
    this.getWrittenSize = function() {
        return videoWriter ? videoWriter.getWrittenSize() : 0;
    };

    canvas.width = videoOptions.width;
    canvas.height = videoOptions.height;

    // If we've asked to blank the flight video completely then just don't render that
    if (videoOptions.videoDim >= 1.0) {
        delete logParameters.flightVideo;
    }
    
    graph = new FlightLogGrapher(flightLog, logParameters.graphConfig, canvas, craftCanvas, {
        background: logParameters.flightVideo ? "none" : "fill"
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
}
