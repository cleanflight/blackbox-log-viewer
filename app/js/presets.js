"use strict";

const
	EventEmitter = require("events"),
	cloneDeep = require('clone-deep');

class Preset {
	constructor(name, content, system, basedOn) {
		/**
		 * @type {String}
		 */
		this.name = name;
		
		/**
		 * @type {Object}
		 */
		this.content = content;
		
		/**
		 * System presets are not editable by the user.
		 *
		 * @type {boolean}
		 */
		this.system = system;
		
		/**
		 * @type {Preset}
		 */
		this.basedOn = basedOn;
	}
}

class Presets {
	
	constructor(presets) {
		/**
		 * @type {Preset[]}
		 */
		this.presets = [];
		
		/**
		 * The preset that is currently selected by the user.
		 *
		 * @type {Preset}
		 */
		this.active = null;

		if (presets) {
			presets.forEach(preset => this.add(preset));
		}
	}
	
	count() {
		return this.presets.length;
	}
	
	/**
	 * Make an independent clone of the contents of this set of presets.
	 *
	 * @returns {Presets}
	 */
	clone() {
		let
			result = new Presets();
		
		result.copyFrom(this);
		
		return result;
	}
	
	/**
	 * Replace the contents of this set of presets with an independent copy of the given one.
	 *
	 * @param {Presets} that
	 */
	copyFrom(that) {
		this.presets = [];
		
		for (let preset of that.presets) {
			this.add(new Preset(preset.name, cloneDeep(preset.content), preset.system, preset.basedOn ? preset.basedOn.name : null));
		}
		
		// Resolve "basedOn" references in the newly cloned presets
		for (let preset of this.presets) {
			if (preset.basedOn) {
				preset.basedOn = this.get(preset.basedOn);
			}
		}
		
		this.active = that.active ? this.get(that.active.name) : null;
		
		this.emit("activePresetChange", this.active);
		this.emit("change");
	}
	
	/**
	 * Load a Presets object from a JSON object that was serialised with save()
	 *
	 * @param {Object} json
	 * @param {boolean} includeSystem - True to allow system presets to be loaded
	 */
	load(json, includeSystem) {
		if (json) {
			this.active = this.get(json.active);
			
			if (json.presets) {
				// First add all the presets in, keeping basedOn as a string temporarily
				json.presets
					.filter(preset => includeSystem || !preset.system)
					.forEach(preset => this.add(new Preset(preset.name, preset.content, preset.system, preset.basedOn)));
				
				// Now that they've all been added, we can resolve "basedOn" by-name references into preset references
				this.presets.forEach(preset => {
					if (preset.basedOn instanceof String) {
						preset.basedOn = this.get(preset.basedOn);
					}
				});
			}
		}
	}
	
	/**
	 * Render presets as a JSON-compatible object.
	 *
	 * @param {boolean} includeSystem - True to include presets marked as system.
	 *
	 * @return {Object}
	 */
	save(includeSystem) {
		return {
			presets:
				this.presets
					.filter(preset => includeSystem || !preset.system)
					.map(preset => {
						let
							newPreset = cloneDeep(preset);
						
						newPreset.basedOn = newPreset.basedOn ? newPreset.basedOn.name : null;
						
						return newPreset;
					}),
			active: this.active ? this.active.name : null
		};
	}
	
	/**
	 * Make the given preset name unique.
	 *
	 * @param {String} name
	 * @returns {String}
	 */
	getUniqueName(name) {
		let
			matches,
			base, copiesSeen, candidateName;
		
		// Does the name already end in "copy x"?
		matches = name.match(/(.*) copy(?: (\d+))?$/);
		
		if (matches) {
			base = matches[1];
			
			if (matches[2]) {
				copiesSeen = parseInt(matches[2], 10);
			} else {
				copiesSeen = 1;
			}
		} else {
			base = name;
			copiesSeen = 0;
		}
		
		candidateName = name;
		
		// Find a copy name in the series that isn't taken
		while (this.get(candidateName)) {
			copiesSeen++;
			candidateName = copiesSeen == 1 ? base + " copy" : base + " copy " + copiesSeen;
		}
		
		return candidateName;
	}
	
	/**
	 * Duplicate the given preset (or the active preset if the specified preset is null) as a user preset, and activates
	 * it if the original was active.
	 *
	 * @param {Preset?} preset
	 *
	 * @returns {Preset} The newly duplicated preset
	 */
	duplicate(preset) {
		if (!preset) {
			preset = this.active;
		}
		
		let
			duplicated = new Preset(this.getUniqueName(preset.name), cloneDeep(preset.content), false, preset);
		
		this.add(duplicated);
		
		if (this.active == preset) {
			this.activate(duplicated.name);
		}
		
		return duplicated;
	}
	
	/**
	 * Set the active preset
	 *
	 * @param {String} name
	 */
	activate(name) {
		let
			newActive = this.get(name);
		
		if (newActive && this.active != newActive) {
			this.active = newActive;
			this.emit("activePresetChange", this.active);
		}
	}
	
	/**
	 * Update the settings of a preset, or add a new preset if there was no preset with that name.
	 *
	 * @param {String?} name - Name of preset to update (or null to update current preset)
	 * @param {Object} content - JSON-compatible settings to replace the preset's contents
	 * @param {boolean} bySystem - True if we should be allowed to modify system presets
	 */
	updateSettings(name, content, bySystem) {
		let
			candidate = name ? this.get(name) : this.active;
		
		if (candidate) {
			// Users are not allowed to edit system presets, make a copy and update that instead
			if (candidate.system && !bySystem) {
				let
					duplicated = this.duplicate(candidate);
				
				this.updateSettings(duplicated.name, content, bySystem);
				
				return;
			} else if (!candidate.system && bySystem) {
				/*
				 * We're attempting to replace a user preset with a system one. I guess they chose a popular name
				 * for their preset (like "Default"). Copy their preset out of the way instead of trashing it.
				 */
				
				this.duplicate(candidate);
			}
			
			let
				updatedActivePreset = false;
			
			if (candidate == this.active) {
				updatedActivePreset = true;
			}
			
			candidate.content = content;
			candidate.system = bySystem;
			
			this.emit("validate", candidate.content);
			
			if (updatedActivePreset) {
				this.emit("activePresetChange", this.active);
			}
			this.emit("change");
		} else {
			this.add(new Preset(name, content, bySystem, null));
		}
	}
	
	/**
	 * Rename the active preset to have the specified name. If a preset with that name already exists, "copy x" (where
	 * x is a sequence number) is appended.
	 *
	 * @param {String} name
	 */
	rename(name) {
		if (this.active.name != name) {
			this.active.name = this.getUniqueName(name);
			
			this.emit("activePresetChange", this.active);
			this.emit("change");
		}
	}
	
	get(name) {
		for (let preset of this.presets) {
			if (preset.name === name) {
				return preset;
			}
		}
		
		return null;
	}
	
	add(preset) {
		if (this.get(preset.name)) {
			/*
			 * Tried to add a duplicate name? We might have added a new system preset and a user's custom preset
			 * has a name collision. If so, let's give theirs a new unique name.
			 */
			this.updateSettings(preset.name, preset.content, preset.system);
		} else {
			this.emit("validate", preset.content);
			
			this.presets.push(preset);
			
			if (!this.active) {
				this.active = preset;
				this.emit("activePresetChange", this.active);
			}
			this.emit("change");
		}
	}
	
	/**
	 * Remove the active preset
	 */
	remove() {
		let
			oldIndex = this.presets.indexOf(this.active);
		
		this.presets.splice(oldIndex, 1);
		
		this.active = this.presets[Math.min(oldIndex, this.presets.length - 1)];
		
		this.emit("activePresetChange", this.active);
		this.emit("change");
	}
	
	/**
	 * Get the content of the active preset. Do not modify the returned object, since this will bypass the change
	 * notification system, use updateSettings().
	 *
	 * @returns {Object}
	 */
	getActivePreset() {
		return this.active.content;
	}
	
	[Symbol.iterator]() {
		return this.presets[Symbol.iterator]();
	}
}

Object.setPrototypeOf(Presets.prototype, EventEmitter.prototype);

module.exports = {Preset, Presets};