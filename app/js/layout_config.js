"use strict";

class LayoutConfig {
	
	constructor(layoutConfig) {
		this.config = layoutConfig || {};
	}
	
	static getDefaultConfig() {
		return {
			displays: {
				craft: {
					show: true,
					position: "top left"
				},
				frameNumber: {
					show: true,
					position: "bottom right"
				},
				sticks: {
					show: true,
					position: "top center"
				}
			}
		};
	}
}

module.exports = LayoutConfig;