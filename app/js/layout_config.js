"use strict";

const
	cloneDeep = require('clone-deep');

class LayoutConfig {
	
	constructor(layoutConfig) {
		this.config = layoutConfig || {};
	}
	
	static fixDisplayPosition(display) {
		if (display.position == "custom") {
			display.x = parseInt(display.x, 10) || 0;
			display.y = parseInt(display.y, 10) || 0;
		} else {
			let
				[vert, horz] = display.position.split(" ");
			
			switch (vert) {
				case "top":
				default:
					display.y = 0;
					break;
				
				case "center":
					display.y = 50;
					break;
				
				case "bottom":
					display.y = 100;
					break;
			}
			
			switch (horz) {
				case "left":
				default:
					display.x = 0;
					break;
				
				case "center":
					display.x = 50;
					break;
				
				case "right":
					display.x = 100;
					break;
			}
		}
	}
	
	/**
	 * Fix up a config loaded from user preferences to make sure it has all the latest components in it.
	 *
	 * @param {Object} config
	 * @param {Object} template - Exemplar system config to use as a base for fixing (use getDefaultConfig()).
	 */
	static fixUp(config, template) {
		const
			// Properties that should always be taken from the template (user config can't override them)
			SYSTEM_PROPERTIES = ["displayName"];
		
		let
			// Start off with a blank slate so we can drop configurations for objects that no longer exist as well
			newDisplays = {};
		
		for (let displayName in template.displays) {
			let
				templateDisplay = template.displays[displayName],
				oldDisplay = config.displays ? config.displays[displayName] : null,
				newDisplay = cloneDeep(templateDisplay);
			
			if (oldDisplay) {
				for (let propertyName in oldDisplay) {
					if (SYSTEM_PROPERTIES.indexOf(propertyName) == -1) {
						newDisplay[propertyName] = cloneDeep(oldDisplay[propertyName]);
					}
				}
			}
			
			this.fixDisplayPosition(newDisplay);
			
			if (newDisplay.scale !== undefined) {
				newDisplay.scale = parseInt(newDisplay.scale, 10) || 100;
			}
			
			newDisplays[displayName] = newDisplay;
		}
		
		config.displays = newDisplays;
	}
	
	static getDefaultConfig() {
		return {
			displays: {
				craft: {
					displayName: "Craft display",
					show: true,
					position: "top left",
					mode: "3D",
					scale: 100
				},
				time: {
					displayName: "Frame time/number",
					show: true,
					position: "bottom right"
				},
				sticks: {
					displayName: "Sticks",
					show: true,
					position: "top right",
					scale: 100
				}
			}
		};
	}
}

module.exports = LayoutConfig;