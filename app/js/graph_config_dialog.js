"use strict";

const
    cloneDeep = require('clone-deep'),
    
	FlightLogFieldPresenter = require("./flightlog_fields_presenter.js"),
    GraphConfig = require("./graph_config.js"),
    {Presets} = require("./presets.js"),
    PresetPicker = require("./preset_picker.js");

/**
 *
 * @param {HTMLElement} dialog - Root dialog element to attach to
 * @param {Presets} graphPresets
 * @constructor
 */
function GraphConfigurationDialog(dialog, graphPresets) {
    var
        // Some fields it doesn't make sense to graph
        BLACKLISTED_FIELDS = {time:true, loopIteration:true},
        offeredFieldNames = [],
        exampleGraphs = [],
	
	    graphPresetsBackup,
	
	    presetPicker = new PresetPicker($(".graph-presets-picker", dialog), graphPresets),
	
	    removeAllGraphsButton = $(".config-graphs-remove-all-graphs", dialog);
	
	/**
     * Make a change to the current preset. Your action will be called with the preset for you to modify.
	 * @param action
	 */
	function updateActivePreset(action) {
	    let
		    newPreset = cloneDeep(graphPresets.getActivePreset());
	
	    action(newPreset);
	
	    graphPresets.updateSettings(graphPresets.active.name, newPreset, false);
	
    }
    
	function renderFieldOption(fieldName, selectedName) {
        var 
            option = $("<option></option>")
                .text(FlightLogFieldPresenter.fieldNameToFriendly(fieldName))
                .attr("value", fieldName);
    
        if (fieldName == selectedName) {
            option.attr("selected", "selected");
        }
        
        return option;
    }
    
    /**
     * Render the element for the "pick a field" dropdown box. Provide "field" from the config in order to set up the
     * initial selection.
     */
    function renderField(field) {
        let
            elem = $(
                '<li class="config-graph-field">'
                    + '<select class="form-control"><option value="">(choose a field)</option></select>'
                    + '<button type="button" class="btn btn-default btn-sm">Remove</button>'
                + '</li>'
            ),
            select = $('select', elem),
            selectedFieldName = field ? field.name : false;
        
        for (let fieldName of offeredFieldNames) {
            select.append(renderFieldOption(fieldName, selectedFieldName));
        }
        
        return elem;
    }
    
    function renderGraph(graphIndex, graph) {
        let
            graphElem = $(`
                <li class="config-graph">
                    <dl>
                        <dt><span>
                            <h4>Graph <span class="graph-index-number">${graphIndex + 1}</span></h4>
                            <button type="button" class="btn btn-default btn-sm pull-right remove-single-graph-button">Remove graph</button>
                        </span></dt>                 
                        <dd>
                            <div class="form-horizontal">
                                <div class="form-group">
                                    <label class="col-sm-2 control-label">Axis label</label>
                                    <div class="col-sm-10">
                                        <input class="form-control" type="text" placeholder="Axis label">
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label class="col-sm-2 control-label">Fields</label>
                                    <div class="col-sm-10">
                                        <ul class="config-graph-field-list form-group-sm form-inline list-unstyled"></ul>
                                        <button type="button" class="btn btn-default btn-sm add-field-button"><span class="glyphicon glyphicon-plus"></span> Add field</button>
                                    </div>
                                </div>
                            </div>
                        </dd>
                    </dl>
                </li>
	        `),
            fieldList = $(".config-graph-field-list", graphElem),
            graphNameField = $("input", graphElem);
        
        graphNameField
	        .val(graph.label)
	        .change(function(e) {
		        updateActivePreset(preset => preset.graphs[graphIndex].label = $(this).val());
	        });
        
        $(".add-field-button", graphElem).click(function(e) {
	        updateActivePreset(preset => preset.graphs[graphIndex].fields.push({name: ""}));
            
	        e.preventDefault();
        });
        
        $(".remove-single-graph-button", graphElem).click(function(e) {
	        updateActivePreset(preset => preset.graphs.splice(graphIndex, 1));
            
            e.preventDefault();
        });
                
        fieldList
	        .append(graph.fields.map(renderField))
        
            // Catch field dropdown changes
            .on("change", "select", function(e) {
		        let
			        fieldIndex = $(this).parents('.config-graph-field').index();
		
		        updateActivePreset(preset => preset.graphs[graphIndex].fields[fieldIndex].name = $(e.target).val());
	        })
        
            // Remove field button
            .on('click', 'button', function(e) {
	            let
	                fieldIndex = $(this).parents('.config-graph-field').index();
		
	            updateActivePreset(preset => preset.graphs[graphIndex].fields.splice(fieldIndex, 1));
		
		        e.preventDefault();
	        });

        return graphElem;
    }
    
    function renderGraphs() {
        let
            graphs = graphPresets.getActivePreset().graphs,
            graphList = $(".config-graphs-list", dialog);
        
        graphList.empty();
        
        for (let i = 0; i < graphs.length; i++) {
            graphList.append(renderGraph(i, graphs[i]));
        }
	
	    removeAllGraphsButton.toggle(graphPresets.getActivePreset().graphs.length > 0);
    }
    
    function populateExampleGraphs(flightLog, menu) {
        menu.empty();
        
        exampleGraphs = GraphConfig.getExampleGraphConfigs(flightLog);
        
        exampleGraphs.unshift({
            label: "Custom graph",
            fields: [{name:""}],
            dividerAfter: true
        });
        
        for (let i = 0; i < exampleGraphs.length; i++) {
            let
                graph = exampleGraphs[i],
                li = $('<li><a href="#"></a></li>');
            
            $('a', li)
                .text(graph.label)
                .data('graphIndex', i);
            
            menu.append(li);
            
            if (graph.dividerAfter) {
                menu.append('<li class="divider"></li>');
            }
        }
    }

    // Decide which fields we should offer to the user
    function buildOfferedFieldNamesList(flightLog) {
        let
            lastRoot = null,
            fieldNames = flightLog.getMainFieldNames(),
            fieldsSeen = {};
        
        offeredFieldNames = [];
        
        for (let fieldName of fieldNames) {
            // For fields with multiple bracketed x[0], x[1] versions, add an "[all]" option
            let
                matches = fieldName.match(/^(.+)\[[0-9]+]$/);
            
            if (BLACKLISTED_FIELDS[fieldName])
                continue;
            
            if (matches) {
                if (matches[1] != lastRoot) {
                    lastRoot = matches[1];
                    
                    offeredFieldNames.push(lastRoot + "[all]");
                    fieldsSeen[lastRoot + "[all]"] = true;
                }
            } else {
                lastRoot = null;
            }
            
            offeredFieldNames.push(fieldName);
            fieldsSeen[fieldName] = true;
        }
        
        /* 
         * If the graph config has any fields in it that we don't have available in our flight log, add them to
         * the GUI anyway. (This way we can build a config when using a tricopter (which includes a tail servo) and
         * keep that tail servo in the config when we're viewing a quadcopter).
         */
        for (let preset of graphPresets) {
            let
                config = preset.content;
            
	        for (let graph of config.graphs) {
		        for (let field of graph.fields) {
			        if (field.name && field.name.length > 0 && !fieldsSeen[field.name]) {
				        offeredFieldNames.push(field.name);
				        fieldsSeen[field.name] = true;
			        }
		        }
	        }
        }
    }
    
    this.show = function(flightLog) {
        // We'll restore this backup if the user cancels the dialog
        graphPresetsBackup = graphPresets.clone();
        
	    populateExampleGraphs(flightLog, exampleGraphsMenu);
	    buildOfferedFieldNamesList(flightLog, graphPresets.getActivePreset().graphs);
        
	    renderGraphs();
	
	    dialog.modal('show');
    };
 
    $(".graph-configuration-dialog-cancel", dialog).click(function(e) {
	    graphPresets.copyFrom(graphPresetsBackup);
    });
    
    let
        exampleGraphsButton = $(".config-graphs-add", dialog),
        exampleGraphsMenu = $(".config-graphs-add ~ .dropdown-menu", dialog);
	
	exampleGraphsButton.dropdown();
	
	// Add an example graph
    exampleGraphsMenu.on("click", "a", function(e) {
        let
            graph = exampleGraphs[$(this).data("graphIndex")];
	
        updateActivePreset(preset => preset.graphs.push(graph));
	
        // Dismiss the dropdown button
        exampleGraphsButton.dropdown("toggle");
        
        e.preventDefault();
    });
    
    removeAllGraphsButton.on("click", function() {
	    updateActivePreset(preset => preset.graphs = []);
	    
	    e.preventDefault();
    });
	
	graphPresets.on("activePresetChange", renderGraphs);
}

module.exports = GraphConfigurationDialog;