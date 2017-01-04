(function ($) {
	
	/**
	 * Turns a text input field with "min" and "max" attributes into a Bootstrap integer value spinner.
	 *
	 * @returns {jQuery}
	 */
	$.fn.spinner = function () {
		
		function updateButtonStates() {
			var
				spinner = $(this).closest(".spinner"),
				input = $(this);
			
			spinner.find(".btn:first-of-type").prop("disabled", input.prop("disabled") || input.attr('max') !== undefined && parseInt(input.val()) >= parseInt(input.attr('max')));
			spinner.find(".btn:last-of-type").prop("disabled",  input.prop("disabled") || input.attr('min') !== undefined && parseInt(input.val()) <= parseInt(input.attr('min')));
		}
		
		function twiddleSpinner(direction) {
			return function() {
				var
					spinner = $(this).closest('.spinner'),
					input = spinner.find('input'),
					step = input.attr("step") !== undefined ? parseInt(input.attr("step")) : 1,
					newVal = parseInt(input.val(), 10) + direction * step;
			
				if (input.attr("min") !== undefined) {
					newVal = Math.max(newVal, parseInt(input.attr("min"), 10));
				}
				
				if (input.attr("max") !== undefined) {
					newVal = Math.min(newVal, parseInt(input.attr("max"), 10));
				}
				
				input
					.val(newVal)
					.change();
			};
		}
		
		this
			.wrap('<div class="input-group spinner"></div>')
			.after(
				'<div class="input-group-btn-vertical"> ' +
				'    <button class="btn btn-default" type="button"><span class="glyphicon glyphicon-triangle-top"></span></button>' +
				'    <button class="btn btn-default" type="button"><span class="glyphicon glyphicon-triangle-bottom"></span></button>' +
				'</div>'
			)
			.change(updateButtonStates)
			.each(updateButtonStates);
		
		var
			spinners = this.closest(".spinner");
		
		spinners.find('.btn:first-of-type').on('click', twiddleSpinner(1));
		spinners.find('.btn:last-of-type').on('click', twiddleSpinner(-1));
		
		return this;
	};
}(jQuery));
 