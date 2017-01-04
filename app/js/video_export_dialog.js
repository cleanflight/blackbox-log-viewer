"use strict";

const
    EventEmitter = require('events'),
	{formatTime, formatFilesize} = require("./misc.js"),
	{Presets} = require("./presets.js");

/**
 *
 * @param {HTMLElement} dialog
 * @param {Presets} layoutPresets
 * @constructor
 */
function VideoExportDialog(dialog, layoutPresets) {
    const
        DIALOG_MODE_SETTINGS = 0,
        DIALOG_MODE_IN_PROGRESS = 1,
        DIALOG_MODE_COMPLETE = 2,
        
        videoDuration = $(".video-duration", dialog),
        progressBar = $("progress", dialog),
        progressRenderedFrames = $(".video-export-rendered-frames", dialog),
        progressRemaining = $(".video-export-remaining", dialog),
        progressSize = $(".video-export-size", dialog),
		videoLayoutList = $(".video-layout", dialog),
	
		that = this;
    
    var
	    dialogMode,
	
	    renderStartTime,
	    lastEstimatedTimeMsec,
		lastWrittenBytes = 0;
	
    function setDialogMode(mode) {
        dialogMode = mode;
        
        const
            settingClasses = [
                "video-export-mode-settings", 
                "video-export-mode-progress", 
                "video-export-mode-complete"
            ];
        
        dialog
            .removeClass(settingClasses.join(" "))
            .addClass(settingClasses[mode]);
        
        $(".video-export-dialog-start").toggle(mode == DIALOG_MODE_SETTINGS);
        $(".video-export-dialog-cancel").toggle(mode != DIALOG_MODE_COMPLETE);
        $(".video-export-dialog-close").toggle(mode == DIALOG_MODE_COMPLETE);
        
        var 
            title = "Export video";
        
        switch (mode) {
            case DIALOG_MODE_IN_PROGRESS:
                title = "Rendering video...";
            break;
            case DIALOG_MODE_COMPLETE:
                title = "Video rendering complete!";
            break;
        }
        
        $(".modal-title", dialog).text(title);
    }

    function populateUIWithVideoConfig(videoConfig) {
        if (videoConfig.frameRate) {
            $(".video-frame-rate").val(videoConfig.frameRate);
        }
        if (videoConfig.videoDim !== undefined) {
            // Look for a value in the UI which closely matches the stored one (allows for floating point inaccuracy)
            $(".video-dim option").each(function() {
                var
                    thisVal = parseFloat($(this).attr('value'));
                
                if (Math.abs(videoConfig.videoDim - thisVal) < 0.05) {
                    $(".video-dim").val($(this).attr('value'));
                }
            });
        }
        if (videoConfig.width) {
            $(".video-resolution").val(videoConfig.width + "x" + videoConfig.height);
        }
        if (videoConfig.format) {
        	$(".video-format").val(videoConfig.format);
        }
        if (videoConfig.layoutPresetName) {
        	videoLayoutList.val(videoConfig.layoutPresetName);
        } else {
	        videoLayoutList.val(layoutPresets.getActivePreset().name);
        }
    }
    
    function convertUIToVideoConfig() {
        var 
            videoConfig = {
                frameRate: parseInt($(".video-frame-rate", dialog).val(), 10),
                videoDim: parseFloat($(".video-dim", dialog).val())
            },
            resolution;
        
        resolution = $(".video-resolution", dialog).val();
        
        videoConfig.width = parseInt(resolution.split("x")[0], 10);
        videoConfig.height = parseInt(resolution.split("x")[1], 10);
        
        videoConfig.format = $(".video-format", dialog).val();
        
        videoConfig.layoutPresetName = videoLayoutList.val();
	    videoConfig.layoutPreset = videoConfig.layoutPresetName == "(current)" ? layoutPresets.getActivePreset() : layoutPresets.get(videoConfig.layoutPresetName).content;

        return videoConfig;
    }
    
    function onRenderProgress(frameIndex, frameCount, writtenBytes) {
    	const
		    PROGRESS_SMOOTHING = 0.0;
    	
	    progressBar.prop('max', frameCount - 1);
	    progressBar.prop('value', frameIndex);
	
	    progressRenderedFrames.text((frameIndex + 1) + " / " + frameCount + " (" + ((frameIndex + 1) / frameCount * 100).toFixed(1) + "%)");
	
	    if (frameIndex > 0) {
		    var
			    elapsedTimeMsec = Date.now() - renderStartTime,
			    estimatedTimeMsec = elapsedTimeMsec * frameCount / frameIndex;
		
		    if (lastEstimatedTimeMsec === false) {
			    lastEstimatedTimeMsec = estimatedTimeMsec;
		    } else {
			    lastEstimatedTimeMsec = lastEstimatedTimeMsec * PROGRESS_SMOOTHING + estimatedTimeMsec * (1.0 - PROGRESS_SMOOTHING);
		    }
		
		    var
			    estimatedRemaining = Math.max(lastEstimatedTimeMsec - elapsedTimeMsec, 0),
			    estimatedBytes = Math.round(frameCount / frameIndex * writtenBytes);
		
		    progressRemaining.text(formatTime(estimatedRemaining, false));
		
		    /*
		     * Only update the filesize estimate when a block is written (avoids the estimated filesize slowly
		     * decreasing between blocks)
		     */
		    if (writtenBytes != lastWrittenBytes) {
			    lastWrittenBytes = writtenBytes;
			
			    if (writtenBytes > 1000000) { // Wait for the first significant chunk to be written (don't use the tiny header as a size estimate)
				    progressSize.text(formatFilesize(writtenBytes) + " / " + formatFilesize(estimatedBytes));
			    }
		    }
	    }
    }
    
    function populateLayoutPresetsList() {
	    videoLayoutList.empty();
	    
	    videoLayoutList.append('<option value="(current)">Use viewer\'s current layout</option>');
	    
	    for (let preset of layoutPresets) {
		    let
			    option = $("<option></option>");
		
		    option.text(preset.name);
		    option.attr("value", preset.name);
		
		    videoLayoutList.append(option)
	    }
    }

    this.show = function(logParameters, videoConfig) {
        setDialogMode(DIALOG_MODE_SETTINGS);
        
        videoDuration.text(formatTime(Math.round((logParameters.outTime - logParameters.inTime) / 1000), false));
        
        $(".jumpy-video-note").toggle(!!logParameters.flightVideo);
   
        populateLayoutPresetsList();
        
        dialog.modal('show');
        
        this.logParameters = logParameters;
        
        populateUIWithVideoConfig(videoConfig);
    };
    
    this.close = function() {
		dialog.modal("hide");
    };
    
    this.onRenderingBegin = function(videoRenderer) {
	    progressBar.prop('value', 0);
	    progressRenderedFrames.text('');
	    progressRemaining.text('');
	    progressSize.text('Calculating...');
	
	    setDialogMode(DIALOG_MODE_IN_PROGRESS);
	    
	    renderStartTime = Date.now();
	    lastEstimatedTimeMsec = false;
	    
	    videoRenderer.on("progress", onRenderProgress);
	    
	    videoRenderer.once("complete", function(success, frameCount) {
	    	videoRenderer.removeListener("progress", onRenderProgress);
		
		    if (success) {
			    $(".video-export-result").text("Rendered " + frameCount + " frames in " + formatTime(Date.now() - renderStartTime, false));
			    setDialogMode(DIALOG_MODE_COMPLETE);
		    } else {
			    that.close();
		    }
	    });
    };
 
    $(".video-export-dialog-start").click(function(e) {
	    e.preventDefault();
	    
	    that.emit("optionsChosen", that.logParameters, convertUIToVideoConfig());
    });

    $(".video-export-dialog-cancel").click(function(e) {
    	that.emit("cancel");
    });
    
    dialog.modal({
        show: false,
        backdrop: "static" // Don't allow a click on the backdrop to close the dialog
    });
}

Object.setPrototypeOf(VideoExportDialog.prototype, EventEmitter.prototype);

module.exports = VideoExportDialog;