"use strict";

function supportsRequiredAPIs() {
    return window.File && window.FileReader && window.FileList && Modernizr.canvas;
}

if (!supportsRequiredAPIs()) {
    alert("Your browser does not support the APIs required for reading log files.");
}

var
    GRAPH_STATE_PAUSED = 0,
    GRAPH_STATE_PLAY = 1,
    
    SMALL_JUMP_TIME = 100 * 1000;

var
    graphState = GRAPH_STATE_PAUSED,
    currentBlackboxTime = 0,
    lastRenderTime = false,
    dataArray, flightLog, 
    graph = null, 
    
    graphConfig = new GraphConfig(),
    graphLegend = null,
    fieldPresenter = FlightlogFieldPresenter,
    
    hasVideo = false, hasLog = false,
    video = $(".log-graph video")[0],
    canvas = $("#graphCanvas")[0],
    craftCanvas = $("#craftCanvas")[0],
    videoURL = false,
    videoOffset = 0.0,
    
    graphRendersCount = 0,
    
    seekBarCanvas = $(".log-seek-bar canvas")[0],
    seekBar = new SeekBar(seekBarCanvas),
    
    seekBarRepaintRateLimited = $.throttle(200, $.proxy(seekBar.repaint, seekBar)),
    
    updateValuesChartRateLimited,
    
    animationFrameIsQueued = false;

function blackboxTimeFromVideoTime() {
    return (video.currentTime - videoOffset) * 1000000 + flightLog.getMinTime();
}

function syncLogToVideo() {
    if (hasLog) {
        currentBlackboxTime = blackboxTimeFromVideoTime();
    }
}

function setVideoOffset(offset) {
    videoOffset = offset;
    
    /* 
     * Round to 2 dec places for display and put a plus at the start for positive values to emphasize the fact it's
     * an offset
     */
    $(".video-offset").val((videoOffset >= 0 ? "+" : "") + (videoOffset.toFixed(2) != videoOffset ? videoOffset.toFixed(2) : videoOffset));
    
    invalidateGraph();
}

function atMost2DecPlaces(value) {
    if (value == (value | 0))
        return value; //it's an integer already
    
    return value.toFixed(2);
}

function updateValuesChart() {
    var 
        table = $(".log-field-values table"),
        i,
        frame = flightLog.getSmoothedFrameAtTime(currentBlackboxTime),
        fieldNames = flightLog.getMainFieldNames();
    
    $("tr:not(:first)", table).remove();
    
    if (frame) {
        var 
            rows = [],
            rowCount = Math.ceil(fieldNames.length / 2);
        
        for (i = 0; i < rowCount; i++) {
            var 
                row = 
                    "<tr>" +
                    '<td>' + fieldPresenter.fieldNameToFriendly(fieldNames[i]) + '</td>' +
                    '<td class="raw-value">' + atMost2DecPlaces(frame[i]) + '</td>' +
                    '<td>' + fieldPresenter.decodeFieldToFriendly(flightLog, fieldNames[i], frame[i]) + "</td>",
                    
                secondColumn = i + rowCount;
            
            if (secondColumn < fieldNames.length) {
                row += 
                    '<td>' + fieldPresenter.fieldNameToFriendly(fieldNames[secondColumn]) + '</td>' +
                    '<td>' + atMost2DecPlaces(frame[secondColumn]) + '</td>' +
                    '<td>' + fieldPresenter.decodeFieldToFriendly(flightLog, fieldNames[secondColumn], frame[secondColumn]) + '</td>';
            }
            
            row += "</tr>";
            
            rows.push(row);
        }
        
        table.append(rows.join(""));
    }
}

updateValuesChartRateLimited = $.throttle(250, updateValuesChart);

function animationLoop() {
    var 
        now = Date.now();
    
    if (!graph)
        return;
    
    if (hasVideo) {
        currentBlackboxTime = blackboxTimeFromVideoTime();
    } else {
        var
            delta;
        
        if (lastRenderTime === false) {
            delta = 0;
        } else {
            delta = (now - lastRenderTime) * 1000;
        }
    
        currentBlackboxTime += delta;
        
        if (graphState == GRAPH_STATE_PLAY) {
            if (currentBlackboxTime > flightLog.getMaxTime()) {
                currentBlackboxTime = flightLog.getMaxTime();
                setGraphState(GRAPH_STATE_PAUSED);
            }
        }
    }
    
    graph.render(currentBlackboxTime);
    graphRendersCount++;
    
    seekBar.setCurrentTime(currentBlackboxTime);

    updateValuesChartRateLimited();
    
    if (graphState == GRAPH_STATE_PLAY) {
        lastRenderTime = now;
        
        seekBarRepaintRateLimited();
        
        animationFrameIsQueued = true;
        requestAnimationFrame(animationLoop);
    } else {
        seekBar.repaint();
        
        animationFrameIsQueued = false;
    }
}

function invalidateGraph() {
    if (!animationFrameIsQueued) {
        animationFrameIsQueued = true;
        requestAnimationFrame(animationLoop);
    }
}

function updateCanvasSize() {
    var
        width = $(canvas).width(),
        height = $(canvas).height();
    
    if (graph) {
        graph.resize(width, height);
        seekBar.resize(canvas.offsetWidth, 50);
        
        invalidateGraph();
    }
}

function renderLogFileInfo(file) {
    $(".log-filename").text(file.name);
    
    var 
        logIndexContainer = $(".log-index"),
        logIndexPicker,
        logCount = flightLog.getLogCount(),
        index;
    
    logIndexContainer.empty();
    
    if (logCount > 1) {
        logIndexPicker = $('<select class="log-index form-control">');
        
        logIndexPicker.change(function() {
            selectLog(parseInt($(this).val(), 10));
        });
    }
    
    for (index = 0; index < logCount; index++) {
        var
            logLabel,
            option, holder,
            error;
        
        error = flightLog.getLogError(index);
        
        if (error) {
            logLabel = "Error: " + error;
        } else {
            logLabel = formatTime(flightLog.getMinTime(index) / 1000, false) 
                + " - " + formatTime(flightLog.getMaxTime(index) / 1000 , false)
                + " [" + formatTime(Math.ceil((flightLog.getMaxTime(index) - flightLog.getMinTime(index)) / 1000), false) + "]";
        }
        
        if (logCount > 1) {
            option = $("<option></option>");
        
            option.text((index + 1) + "/" + (flightLog.getLogCount()) + ": " + logLabel);
            option.attr("value", index);
            
            if (error)
                option.attr("disabled", "disabled");
            
            logIndexPicker.append(option);
        } else {
            holder = $('<div class="form-control-static"></div>');
            
            holder.text(logLabel);
            logIndexContainer.append(holder);
        }
    }

    if (logCount > 1) {
        logIndexPicker.val(0);
        logIndexContainer.append(logIndexPicker);
    }
}

/**
 * Update the metadata displays to show information about the currently selected log index.
 */
function renderSelectedLogInfo() {
    $(".log-index").val(flightLog.getLogIndex());
    
    if (flightLog.getNumCellsEstimate()) {
        $(".log-cells").text(flightLog.getNumCellsEstimate() + "S (" + Number(flightLog.getReferenceVoltageMillivolts() / 1000).toFixed(2) + "V)");
        $(".log-cells-header,.log-cells").css('display', 'block');
    } else {
        $(".log-cells-header,.log-cells").css('display', 'none');
    }
    
    seekBar.setTimeRange(flightLog.getMinTime(), flightLog.getMaxTime(), currentBlackboxTime);
    seekBar.setActivityRange(flightLog.getSysConfig().minthrottle, flightLog.getSysConfig().maxthrottle);
    
    var 
        activity = flightLog.getActivitySummary();
    
    seekBar.setActivity(activity.times, activity.avgThrottle, activity.hasEvent);
    
    seekBar.repaint();
}

function setGraphState(newState) {
    graphState = newState;
    
    lastRenderTime = false;
    
    if (graphState == GRAPH_STATE_PLAY) {
        if (hasVideo)
            video.play();
        
        $(".log-play-pause span").attr('class', 'glyphicon glyphicon-pause');
    } else {
        if (hasVideo)
            video.pause();
        
        $(".log-play-pause span").attr('class', 'glyphicon glyphicon-play');
    }
    
    animationLoop();
}

function setCurrentBlackboxTime(newTime) {
    if (hasVideo) {
        video.currentTime = (newTime - flightLog.getMinTime()) / 1000000 + videoOffset;
    
        syncLogToVideo();
    } else {
        currentBlackboxTime = newTime;
    }
    
    invalidateGraph();
}

function setVideoTime(newTime) {
    video.currentTime = newTime;

    syncLogToVideo();
}

function configureGraphs() {
    var 
        sysConfig = flightLog.getSysConfig(),
    
        motorCurve = new ExpoCurve(-(sysConfig.maxthrottle + sysConfig.minthrottle) / 2, 1.0,
            (sysConfig.maxthrottle - sysConfig.minthrottle) / 2, 1.0, 0),
        servoCurve = new ExpoCurve(-1500, 1.0, 500, 1.0, 0),
        gyroCurve = new ExpoCurve(0, 0.25, 9.0e-6 / sysConfig.gyroScale, 1.0, 10),
        accCurve = new ExpoCurve(0, 0.7, 5000, 1.0, 10),
        pidCurve = new ExpoCurve(0, 0.7, 500, 1.0, 10),
        servoCurve = new ExpoCurve(-(sysConfig.maxservo + sysConfig.minservo) / 2, 1.0,
            (sysConfig.maxservo - sysConfig.minservo) / 2, 1.0, 0),
        
        motorSmoothing = 5000,
        gyroSmoothing = 3000,
        
        motorGraphs = {
            label: "Motors",
            fields: [],
            y: 0.25,
            height: 0.40
        },
        
        i;
    
    for (i = 0; i < flightLog.getNumMotors(); i++) {
        motorGraphs.fields.push({
            name: "motor[" + i + "]", curve: motorCurve, smoothing: motorSmoothing, color: GraphConfig.PALETTE[i % GraphConfig.PALETTE.length]
        });
    }
    
    if (flightLog.getMainFieldIndexByName("servo[5]") !== undefined) {
        motorGraphs.fields.push({
            name: "servo[5]", curve: servoCurve, smoothing: motorSmoothing, color: GraphConfig.PALETTE[flightLog.getNumMotors() % GraphConfig.PALETTE.length]
        });
    }
    
    graphConfig.setGraphs([
         motorGraphs,
         {
             label: "Servos",
             fields: [
                 {name: "servo[5]", curve: servoCurve, smoothing: motorSmoothing},
             ],
             y: 0.50,
             height: 0.40			
         },
         {
             label: "Gyros",
             fields: [
                 {name: "gyroData[0]", curve: gyroCurve, smoothing: gyroSmoothing, color: GraphConfig.PALETTE[0]},
                 {name: "gyroData[1]", curve: gyroCurve, smoothing: gyroSmoothing, color: GraphConfig.PALETTE[1]},
                 {name: "gyroData[2]", curve: gyroCurve, smoothing: gyroSmoothing, color: GraphConfig.PALETTE[2]},
             ],
             y: 0.70,
             height: 0.50
        }
    ]);
}

/**
 * Set the index of the log from the log file that should be viewed.
 */
function selectLog(logIndex) {
    flightLog.openLog(logIndex);
    
    if (graph) {
        graph.destroy();
    }
    
    graph = new FlightLogGrapher(flightLog, graphConfig, canvas, craftCanvas);

    configureGraphs();
    
    graph.onSeek = function(offset) {
        //Seek faster
        offset *= 2;
        
        if (hasVideo) {
            setVideoTime(video.currentTime + offset / 1000000);
        } else {
            setCurrentBlackboxTime(currentBlackboxTime + offset);
        }
        invalidateGraph();
    };
    
    if (hasVideo) {
        syncLogToVideo();
    } else {
        // Start at beginning:
        currentBlackboxTime = flightLog.getMinTime();
    }
    
    renderSelectedLogInfo();
    
    updateCanvasSize();
    
    setGraphState(GRAPH_STATE_PAUSED);
}

function loadLogFile(file) {
    var reader = new FileReader();

    reader.onload = function(e) {
        var bytes = e.target.result;
        
        dataArray = new Uint8Array(bytes);
        
        try {
            flightLog = new FlightLog(dataArray);
        } catch (e) {
            alert("Sorry, an error occured while trying to open this log:\n\n" + e);
            return;
        }
        
        renderLogFileInfo(file);
        
        hasLog = true;
        $("html").addClass("has-log");
        
        selectLog(0);
    };

    reader.readAsArrayBuffer(file);
}

function loadVideo(file) {
    if (videoURL) {
        URL.revokeObjectURL(videoURL);
        videoURL = false;
    }
    
    if (!URL.createObjectURL) {
        alert("Sorry, your web browser doesn't support showing videos from your local computer. Try Google Chrome instead.");
        return;
    }
        
    videoURL = URL.createObjectURL(file);
    video.volume = 0.05;
    video.src = videoURL;
}

function videoLoaded(e) {
    hasVideo = true;
    
    $("html").addClass("has-video");
    
    setGraphState(GRAPH_STATE_PAUSED);
}

function seekBarSeek(time) {
    setCurrentBlackboxTime(time);
    
    invalidateGraph();
}

function reportVideoError(e) {
    alert("Your video could not be loaded, your browser might not support this kind of video. Try Google Chrome instead.");
}

$(document).ready(function() {
    graphLegend = new GraphLegend($(".log-graph-legend"), graphConfig);
    
    $("#file-open").change(function(e) {
        var 
            files = e.target.files,
            i;
        
        for (i = 0; i < files.length; i++) {
            var
                isLog = files[i].name.match(/\.TXT$/i),
                isVideo = files[i].name.match(/\.(AVI|MOV|MP4|MPEG)$/i);
            
            if (!isLog && !isVideo) {
                if (files[i].size < 10 * 1024 * 1024)
                    isLog = true; //Assume small files are logs rather than videos
                else
                    isVideo = true;
            }
            
            if (isLog) {
                loadLogFile(files[i]);
            } else if (isVideo) {
                loadVideo(files[i]);
            }
        }
    });
    
    $(".log-jump-back").click(function() {
        if (hasVideo) {
            setVideoTime(video.currentTime - SMALL_JUMP_TIME / 1000000);
        } else {
            setCurrentBlackboxTime(currentBlackboxTime - SMALL_JUMP_TIME);
        }
        
        setGraphState(GRAPH_STATE_PAUSED);
    });

    $(".log-jump-forward").click(function() {
        if (hasVideo) {
            setVideoTime(video.currentTime + SMALL_JUMP_TIME / 1000000);
        } else {
            setCurrentBlackboxTime(currentBlackboxTime + SMALL_JUMP_TIME);
        }
        
        setGraphState(GRAPH_STATE_PAUSED);
    });
    
    $(".log-jump-start").click(function() {
        setCurrentBlackboxTime(flightLog.getMinTime());
        setGraphState(GRAPH_STATE_PAUSED);
    });

    $(".log-jump-end").click(function() {
        setCurrentBlackboxTime(flightLog.getMaxTime());
        setGraphState(GRAPH_STATE_PAUSED);
    });
    
    $(".video-jump-start").click(function() {
        setVideoTime(0);
        setGraphState(GRAPH_STATE_PAUSED);
    });

    $(".video-jump-end").click(function() {
        if (video.duration) {
            setVideoTime(video.duration);
            setGraphState(GRAPH_STATE_PAUSED);
        }
    });
    
    $(".log-play-pause").click(function() {
        if (graphState == GRAPH_STATE_PAUSED) {
            setGraphState(GRAPH_STATE_PLAY);
        } else {
            setGraphState(GRAPH_STATE_PAUSED);
        }
    });
    
    $(".log-sync-here").click(function() {
        setVideoOffset(video.currentTime);
    });
    
    $(".log-sync-back").click(function() {
        setVideoOffset(videoOffset - 1 / 15);
    });

    $(".log-sync-forward").click(function() {
        setVideoOffset(videoOffset + 1 / 15);
    });

    $(".video-offset").change(function() {
        var offset = parseFloat($(".video-offset").val());
        
        if (!isNaN(offset)) {
            videoOffset = offset;
            invalidateGraph();
        }
    });
    
    $(".open-graph-configuration-dialog").click(function(e) {
        e.preventDefault();
        $("#dlgGraphConfiguration").modal('show');
    });
    
    $(window).resize(updateCanvasSize);
    
    $(video).on({
        loadedmetadata: updateCanvasSize,
        error: reportVideoError,
        loadeddata: videoLoaded
    });
    
    seekBar.onSeek = seekBarSeek;
});