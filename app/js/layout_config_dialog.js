"use strict";

const
	cloneDeep = require('clone-deep'),
	
	{Presets} = require("./presets.js"),
	PresetPicker = require("./preset_picker.js");

/**
 *
 * @param {HTMLElement} dialog - Root dialog element to attach to
 * @param {Presets} layoutPresets
 * @constructor
 */
function LayoutConfigurationDialog(dialog, layoutPresets) {
	var
		layoutPresetsBackup,
		
		presetPicker = new PresetPicker($(".layout-presets-picker", dialog), layoutPresets);
	
	/**
	 * Make a change to the current preset. Your action will be called with the preset for you to modify.
	 * @param action
	 */
	function updateActivePreset(action) {
		let
			newPreset = cloneDeep(layoutPresets.getActivePreset());
		
		action(newPreset);
		
		layoutPresets.updateSettings(layoutPresets.active.name, newPreset, false);
	}
	
	function renderDisplay(displayName) {
		let
			display = layoutPresets.getActivePreset().displays[displayName],
			displayElem = $(`
				<tr class="layout-display">
					<td class="layout-display-name"></td>	
					<td class="layout-display-settings"></td>
				</tr>
			`),
			displayNameField = $(".layout-display-name", displayElem),
			displaySettings = $(".layout-display-settings", displayElem);
		
		displayNameField.text(display.displayName);
		
		displaySettings.append(`
			<div class="form-inline">
				<div class="form-group">
					<div class="checkbox-inline">
						<label>
							<input type="checkbox" class="layout-display-show">
							Show
						</label>
					</div>
				</div>
				<div class="form-group">
					<label>Position</label>
					<select class="form-control layout-display-position">
						<option value="custom"       >Custom...</option>
						<option value="top left"     >Top left</option>
						<option value="top center"   >Top center</option>
						<option value="top right"    >Top right</option>
						<option value="center left"  >Center left</option>
						<option value="center center">Center center</option>
						<option value="center right" >Center right</option>
						<option value="bottom left"  >Bottom left</option>
						<option value="bottom center">Bottom center</option>
						<option value="bottom right" >Bottom right</option>
					</select>
				</div>
				<div class="form-group layout-display-xy">
					<label>&nbsp;</label>
					<div class="form-group">
						<label>X</label>
					    <input type="text" class="form-control layout-display-x" value="" min="-50" max="150" size="3" maxlength="4">
					</div>
					<div class="form-group">
						<label>Y</label>
						<input type="text" class="form-control layout-display-y" value="" min="-50" max="150" size="3" maxlength="4">
					</div>
				</div>
			</div>
		`);
		
		$(".layout-display-show", displaySettings)
			.prop("checked", display.show)
			.change(function() {
				updateActivePreset(preset => preset.displays[displayName].show = $(this).prop("checked"));
			});
		
		$(".layout-display-position", displaySettings)
			.val(display.position)
			.change(function() {
				updateActivePreset(preset => preset.displays[displayName].position = $(this).val());
			});
		
		let
			positionStepSize = displayName == "time" ? 1 : 4;
		
		$(".layout-display-x", displaySettings)
			.attr("disabled", display.position != "custom")
			.val(display.x || "0")
			.attr("step", positionStepSize)
			.spinner()
			.change(function() {
				updateActivePreset(preset => preset.displays[displayName].x = parseInt($(this).val(), 10) || 0);
			});
		
		$(".layout-display-y", displaySettings)
			.attr("disabled", display.position != "custom")
			.val(display.y || "0")
			.attr("step", positionStepSize)
			.spinner()
			.change(function() {
				updateActivePreset(preset => preset.displays[displayName].y = parseInt($(this).val(), 10) || 0);
			});
		
		if (displayName == "craft") {
			$(".form-inline", displaySettings).append(`
				<div class="form-group">
					<label>Mode</label>
					<select class="form-control layout-craft-mode">
						<option value="2D">2D</option>
						<option value="3D">3D (WebGL)</option>
					</select>
				</div>
			`);
			
			$(".layout-craft-mode", displaySettings)
				.val(display.mode || "3D")
				.change(function() {
					updateActivePreset(preset => preset.displays[displayName].mode = $(this).val());
				});
		}
		
		if ("scale" in display) {
			$(".form-inline", displaySettings).append(`
				<div class="form-group">
					<label>Size</label>
					<input type="text" class="form-control layout-craft-scale" value="" min="1" max="999" maxlength="3" size="3" step="10" />
				</div>
			`);
			
			$(".layout-craft-scale", displaySettings)
				.val(display.scale)
				.spinner()
				.change(function() {
					updateActivePreset(preset => preset.displays[displayName].scale = $(this).val());
				});
		}
		
		return displayElem;
	}
	
	function renderConfiguration() {
		let
			displays = layoutPresets.getActivePreset().displays,
			displayList = $(".layout-displays-list", dialog);
		
		displayList.empty();
		
		for (let displayName in displays) {
			displayList.append(renderDisplay(displayName));
		}
	}
	
	this.show = function(flightLog) {
		// We'll restore this backup if the user cancels the dialog
		layoutPresetsBackup = layoutPresets.clone();
		
		renderConfiguration();
		
		dialog.modal('show');
	};
	
	$(".layout-settings-dialog-cancel", dialog).click(function(e) {
		layoutPresets.copyFrom(layoutPresetsBackup);
	});
	
	layoutPresets.on("activePresetChange", renderConfiguration);
}

module.exports = LayoutConfigurationDialog;