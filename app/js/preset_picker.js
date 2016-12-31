"use strict";

const
	jquery = require("jquery"),
	
	{Presets, Preset} = require("./presets.js");

class PresetPicker {
	
	_updateSelection() {
		let
			listElem = $(".preset-picker-presets", this.element),
			preset = this.presets.active;
		
		listElem.val(preset.name);
		
		$(".preset-picker-preset-delete", this.element).prop("disabled", preset.system || this.presets.count() == 1);
		$(".preset-picker-preset-rename", this.element).prop("disabled", preset.system);
		$(".preset-picker-preset-copy", this.element).prop("disabled", false);
	}
	
	_buildList() {
		let
			listElem = $(".preset-picker-presets", this.element),
			options = [];
		
		for (let preset of this.presets.presets) {
			var
				option = document.createElement("option");
			
			option.value = preset.name;
			option.innerText = preset.name;
			
			options.push(option);
		}
		
		listElem.empty();
		listElem.append(options);
		
		this._updateSelection();
	}
	
	_leaveRenameMode(save) {
		if (this._renameMode) {
			let
				nameBox = $(".preset-picker-preset-name", this.element);
			
			this._renameMode = false;
			
			$(".preset-picker-presets", this.element).show();
			$(".preset-picker-preset-buttons").show();
			
			nameBox.hide();
			$(".preset-picker-name-buttons").hide();
			
			if (save) {
				this.presets.rename(nameBox.val().trim());
			}
			
			this._buildList();
		}
	}
	
	_enterRenameMode() {
		let
			nameBox = $(".preset-picker-preset-name", this.element);
		
		this._renameMode = true;
		
		$(".preset-picker-presets", this.element).hide();
		$(".preset-picker-preset-buttons").hide();
		
		nameBox.show();
		$(".preset-picker-name-buttons").show();
		
		nameBox
			.val(this.presets.active.name)
			.show()
			.focus();
		
		$(".preset-picker-preset-delete, .preset-picker-preset-copy", this.element).prop("disabled", true);
	}
	
	/**
	 *
	 * @param {HTMLElement} element
	 * @param {Presets} presets
	 */
	constructor(element, presets) {
		this.element = element;
		this.presets = presets;
		
		this._renameMode = false;
		
		$(element)
			.addClass("preset-picker")
			.append(`
				<div class="form-inline">
					<div class="form-group">
						<label>Preset</label>
						<select class="preset-picker-presets form-control"></select>
						<input class="preset-picker-preset-name form-control" type="text" value="">
					</div>
					<div class="form-group preset-picker-name-buttons">
						<button class="btn btn-primary preset-picker-preset-name-save">Save</button>
						<button class="btn btn-default preset-picker-preset-name-cancel">Cancel</button>
					</div>
					<div class="form-group preset-picker-preset-buttons">
						<button class="btn btn-default preset-picker-preset-rename">Rename</button>
						<button class="btn btn-default preset-picker-preset-delete">Delete</button>
						<button class="btn btn-default preset-picker-preset-copy">Copy</button>
					</div>
				</div>
			`);
		
		let
			nameBox = $(".preset-picker-preset-name", this.element);
		
		$(".preset-picker-preset-delete", this.element).click(e => {
			this.presets.remove();
			
			e.preventDefault();
		});
		
		$(".preset-picker-preset-rename", this.element).click(e => {
			this._enterRenameMode();
			
			e.preventDefault();
		});
		
		$(".preset-picker-preset-copy", this.element).click(e => {
			this.presets.duplicate();
			
			e.preventDefault();
		});
		
		presets.on("change", e => this._buildList());
		presets.on("activePresetChange", e => this._updateSelection());
		
		$(".preset-picker-preset-name-save", this.element).click(e => this._leaveRenameMode(true));
		$(".preset-picker-preset-name-cancel", this.element).click(e => this._leaveRenameMode(false));
		
		nameBox.on("keydown", e => {
			switch (e.which) {
				case 27: // Escape
					this._leaveRenameMode(false);
					e.preventDefault();
					e.stopPropagation(); // Don't dismiss the dialog
				break;
				case 13: // Enter
					this._leaveRenameMode(true);
					e.preventDefault();
					e.stopPropagation();
				break;
			}
		});
		
		let
			listElem = $(".preset-picker-presets", this.element);
		
		listElem.change(e => {
			this.presets.activate(listElem.val());
		});
		
		this._buildList();
	}
}

module.exports = PresetPicker;