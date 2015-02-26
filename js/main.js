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
    
    SMALL_JUMP_TIME = 100 * 1000,
    
    FRIENDLY_FIELD_NAMES = {
        'axisP[0]': 'PID_P[roll]',
        'axisP[1]': 'PID_P[pitch]',
        'axisP[2]': 'PID_P[yaw]',
        'axisI[0]': 'PID_I[roll]',
        'axisI[1]': 'PID_I[pitch]',
        'axisI[2]': 'PID_I[yaw]',
        'axisD[0]': 'PID_D[roll]',
        'axisD[1]': 'PID_D[pitch]',
        'axisD[2]': 'PID_D[yaw]',
        
        'rcCommand[0]': 'rcCommand[roll]',
        'rcCommand[1]': 'rcCommand[pitch]',
        'rcCommand[2]': 'rcCommand[yaw]',
        'rcCommand[3]': 'rcCommand[throttle]',

        'gyroData[0]': 'gyro[roll]',
        'gyroData[1]': 'gyro[pitch]',
        'gyroData[2]': 'gyro[yaw]',

        'accSmooth[0]': 'acc[X]',
        'accSmooth[1]': 'acc[Y]',
        'accSmooth[2]': 'acc[Z]',
        
        'magADC[0]': 'mag[X]',
        'magADC[1]': 'mag[Y]',
        'magADC[2]': 'mag[Z]',

        'vbatLatest': 'vbat',
        'BaroAlt': 'baro',
        
        'servo[5]': 'tail servo',
        
        'heading[0]': 'heading[roll]',
        'heading[1]': 'heading[pitch]',
        'heading[2]': 'heading[yaw]',
        
        //End-users prefer 1-based indexing
        'motor[0]': 'motor[1]', 'motor[1]': 'motor[2]', 'motor[2]': 'motor[3]', 'motor[3]': 'motor[4]',
        'motor[4]': 'motor[5]', 'motor[5]': 'motor[6]', 'motor[6]': 'motor[7]', 'motor[7]': 'motor[8]'
    };

var
    graphState = GRAPH_STATE_PAUSED,
    currentBlackboxTime = 0,
    lastRenderTime = false,
    dataArray, flightLog, graph = null,
    
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
    friendlyFieldNames = [],
    
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

function buildFriendlyFieldNames() {
    var
        i, fieldNames = flightLog.getMainFieldNames();
    
    friendlyFieldNames = [];
    
    for (i = 0; i < fieldNames.length; i++) {
        if (FRIENDLY_FIELD_NAMES[fieldNames[i]])
            friendlyFieldNames.push(FRIENDLY_FIELD_NAMES[fieldNames[i]]);
        else
            friendlyFieldNames.push(fieldNames[i]);
    }
}

/**
 * Attempt to decode the given raw logged value into something more human readable, or return an empty string if
 * no better representation is available.
 * 
 * @param fieldName Name of the field
 * @param value Value of the field
 */
function decodeFieldToFriendly(fieldName, value) {
    if (value === undefined)
        return "";
    
    switch (fieldName) {
        case 'time':
            return formatTime(value / 1000, true);
        case 'gyroData[0]':
        case 'gyroData[1]':
        case 'gyroData[2]':
            return Math.round(flightLog.gyroRawToDegreesPerSecond(value)) + " deg/s";
            
        case 'accSmooth[0]':
        case 'accSmooth[1]':
        case 'accSmooth[2]':
            return flightLog.accRawToGs(value).toFixed(2) + "g";
        
        case 'vbatLatest':
            return (flightLog.vbatADCToMillivolts(value) / 1000).toFixed(2) + "V" + ", " + (flightLog.vbatADCToMillivolts(value) / 1000 / flightLog.getNumCellsEstimate()).toFixed(2) + "V/cell";

        case 'amperageLatest':
            return (flightLog.amperageADCToMillivolts(value) / 1000).toFixed(2) + "A" + ", " + (flightLog.amperageADCToMillivolts(value) / 1000 / flightLog.getNumMotors()).toFixed(2) + "A/motor";

        case 'heading[0]':
        case 'heading[1]':
        case 'heading[2]':
            return (value / Math.PI * 180).toFixed(1) + "°";
            
        default:
            return "";
    }
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
                    "<tr><td>" + friendlyFieldNames[i] + '</td><td class="raw-value">' + atMost2DecPlaces(frame[i]) + '</td><td>' + decodeFieldToFriendly(fieldNames[i], frame[i]) + "</td>",
                secondColumn = i + rowCount;
            
            if (secondColumn < fieldNames.length) {
                row += "<td>" + friendlyFieldNames[secondColumn] + "</td><td>" + atMost2DecPlaces(frame[secondColumn]) + '</td><td>' + decodeFieldToFriendly(fieldNames[secondColumn], frame[secondColumn]) + "</td>";
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
            logLabel = formatTime(flightLog.getMinTime(index) / 1000, false) 
                + " - " + formatTime(flightLog.getMaxTime(index) / 1000 , false)
                + " [" + formatTime(Math.ceil((flightLog.getMaxTime(index) - flightLog.getMinTime(index)) / 1000), false) + "]",
            option, holder;
        
        if (logCount > 1) {
            option = $("<option></option>");
        
            option.text((index + 1) + "/" + (flightLog.getLogCount()) + ": " + logLabel);
            option.attr("value", index);
            
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
        gyroCurve = new ExpoCurve(0, 0.25, 9.0e-6 / sysConfig.gyroScale, 1.0, 10),
        accCurve = new ExpoCurve(0, 0.7, 5000, 1.0, 10),
        pidCurve = new ExpoCurve(0, 0.7, 500, 1.0, 10),
		servoCurve = new ExpoCurve(-(sysConfig.maxservo + sysConfig.minservo) / 2, 1.0,
            (sysConfig.maxservo - sysConfig.minservo) / 2, 1.0, 0),
        
        motorSmoothing = 5000,
        gyroSmoothing = 3000;
    
    graph.setGraphSetup([
         {
             label: "Motors",
             fields: [
                 {name: "motor[0]", curve: motorCurve, smoothing: motorSmoothing},
                 {name: "motor[1]", curve: motorCurve, smoothing: motorSmoothing},
                 {name: "motor[2]", curve: motorCurve, smoothing: motorSmoothing},
                 {name: "motor[3]", curve: motorCurve, smoothing: motorSmoothing}
             ],
             y: 0.25,
             height: 0.40
         },
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
                 {name: "gyroData[0]", curve: gyroCurve, smoothing: gyroSmoothing},
                 {name: "gyroData[1]", curve: gyroCurve, smoothing: gyroSmoothing},
                 {name: "gyroData[2]", curve: gyroCurve, smoothing: gyroSmoothing},
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
    
    graph = new FlightLogGrapher(flightLog, canvas, craftCanvas);

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
    
    buildFriendlyFieldNames();
    
    renderSelectedLogInfo();
    
    updateCanvasSize();
    configureGraphs();
    
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
    
    updateCanvasSize();
    
    seekBar.onSeek = seekBarSeek;
});