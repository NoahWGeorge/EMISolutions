requirejs.config({
    paths: {
      d3: "../extensions/CenTestingforNodes.js/d3.v4.min",
      lasso: "../extensions/CenTestingforNodes.js/d3.lasso.min"
    }
});
define([
    "jquery", "./properties", "./js/jsnetworkx", "text!./css/style.css", "d3", "lasso"
], function ($, props, jsnx, cssContent, d3, d3l) {
    'use strict';

    return {
        initialProperties: {
            version: 1.0,
            qHyperCubeDef: {
                qDimensions: [],
                qMeasures: [],
                qInitialDataFetch: [{
                    qWidth: 10,
                    qHeight: 1000
                }]
            }
        },
        snapshot: {
            canTakeSnapshot: true
        },
        definition: props,
        paint: function($element, layout) {
            /*
            Author: Anthony Garbin, Qliktech AU
            (Other author credits and notes removed for brevity)
            */
            var self = this;
            $element.empty();

            // Append CSS if not already present
            if (!$("style[id='ext']").length > 0) {
                if (!$("link[id='ext']").length > 0) {
                    $('<style id="ext">').html(cssContent).appendTo('head');
                }
            }

            // Get the data
            var qMatrix = layout.qHyperCube.qDataPages[0].qMatrix;
            var qDimensionInfo = layout.qHyperCube.qDimensionInfo;
            var dim_info = qDimensionInfo.map(function(d){
                return { "dimension": d.mapping };
            });
            var qMeasureInfo = layout.qHyperCube.qMeasureInfo;
            var measure_info = qMeasureInfo.map(function(d){
                return {
                    "measure": d.mapping,
                    "max": d.qMax,
                    "min": d.qMin
                };
            });

            // Container properties
            var height = $element.height(),
                width = $element.width(),
                id = "container_" + layout.qInfo.qId,
                chartID = "chart_" + layout.qInfo.qId,
                menuGroup = "menuGroup_" + layout.qInfo.qId,
                menuRadio = "menuRadio_" + layout.qInfo.qId,
                radioGrp = "radioGrp_" + layout.qInfo.qId,
                actionGrp = "actionGrp_" + layout.qInfo.qId,
                btnRefresh = "btnRefresh_" + layout.qInfo.qId,
                selector = "selector_" + layout.qInfo.qId,
                action = "action_" + layout.qInfo.qId;

            if(document.getElementById(id)) {
                $("#" + id).empty();
            } else {
                // Create container element if it doesn't exist
                var $Item = $('<div />');
                var html = '<div style="position:absolute;z-index:2"><div id="' + chartID +
                           '" width="' + width + '" height="' + height + '"></div></div>';
                html += '<table id="'+menuGroup+'" style="position:absolute;z-index:3;"><tr><td id="'+menuRadio+'">';
                html += '<div id="'+actionGrp+'" class="radio-group"></div></td></tr></table>';
                $Item.html(html);
                $element.append($Item.attr("id", id).width(width).height(height));
            }

            // Set up pointers to required dimensions/measures
            var node_a = 0, // First dimension: Node A
                node_b = 1; // Second dimension: Node B

            var edge_weight = measure_info.findIndex(x => x.measure === "q_edge_weight");
            var edge_weight_min, edge_weight_max;
            if (edge_weight >= 0) {
                edge_weight_min = measure_info[edge_weight].min;
                edge_weight_max = measure_info[edge_weight].max;
            } else {
                edge_weight_min = 1;
                edge_weight_max = 1;
            }
            var edge_color = measure_info.findIndex(x => x.measure === "q_edge_color");

            // *** NEW: Setup node measure mappings ***
            var node_size = measure_info.findIndex(x => x.measure === "q_node_size");
            var node_color = measure_info.findIndex(x => x.measure === "q_node_color");

            // Default options
            var oNodeColor = layout.props.q_defaultnodecolor || '#999999';
            var oNodeInitMin = layout.props.q_init_node_min > 0 ? layout.props.q_init_node_min : 8;
            var oNodeInitMax = layout.props.q_init_node_max > 0 ? layout.props.q_init_node_max : 18;
            var oEdgeColor = layout.props.q_defaultedgecolor || '#999999';
            var oForceStrength = !layout.props.q_force_strength == 0 ? layout.props.q_force_strength : -300;
            var oForceDistMax = !layout.props.q_force_distanceMax == 0 ? layout.props.q_force_distanceMax : 500;
            var oAlphaDecay = layout.props.q_alphadecay || 0.05;
            var oLabelSize = layout.props.q_defaultlabelsize || 10;
            var oLabelColor = layout.props.q_defaultlabelcolor || '#333333';
            var oLabelFont = layout.props.q_defaultlabelfont || "Arial";
            var oLabelThreshold = layout.props.q_defaultlabelthreshold || 0;
            var oMaxLineWidth = layout.props.q_maxlinewidth || 10;
            var oMinLineWidth = layout.props.q_minlinewidth || 2;
            var curTransK = 0; // current zoom scale

            // Menu options
            var oDegree = layout.props.q_showdegree || false;
            var oBetweenness = layout.props.q_showbetweenness || false;
            var oEigenvector = layout.props.q_showeigenvector || false;
            var oMenuX = layout.props.q_menu_x || "center";
            var oMenuY = function(){ return layout.props.q_menu_y === "top" ? 0 : height; };
            var oNodeWarning = layout.props.q_node_warn;
            var oCentralityRadio = [];

            if (oDegree || oBetweenness || oEigenvector) {
                oCentralityRadio = ["None"];
                if (oDegree) { oCentralityRadio.push('Degree'); }
                if (oBetweenness) { oCentralityRadio.push('Betweenness'); }
                if (oEigenvector) { oCentralityRadio.push('Eigenvector'); }
            }

            function scaleWidth(value) {
                return (value - edge_weight_min) * (oMaxLineWidth - oMinLineWidth) /
                    (edge_weight_max - edge_weight_min) + oMinLineWidth;
            }

            var edges = [];
            for (let x of qMatrix) {
                // Note the +2 offset (because the first 2 columns are dimensions)
                var e_w = scaleWidth(edge_weight >= 0 ? x[edge_weight+2].qNum : 2);
                var w = e_w === 0 ? 2 : e_w;
                var c = edge_color >= 0 ? x[edge_color+2].qText : oEdgeColor;
                edges.push([x[node_a].qText, x[node_b].qText, {"weight": w, "color": c}]);
            }

            var G = new jsnx.Graph();
            G.addEdgesFrom(edges); // Nodes auto created from edge table

            var gDegree = oDegree ? jsnx.degree(G) : '';
            var nodeCount = G.adj.size;
            var gBetweenness = oBetweenness ? jsnx.betweennessCentrality(G) : '';
            var gEigenvector = '';
            if (nodeCount > 7 && oEigenvector) {
                gEigenvector = jsnx.eigenvectorCentrality(G);
            } else {
                oEigenvector = false;
            }

            menuSetup();

            function menuSetup() {
                $('#'+menuRadio+' div').empty();
                var h = oMenuY() === 0 ? 0 : oMenuY() - $('#'+menuRadio).height() - 10;
                $('#'+menuGroup).css({'top': h});
                $('#'+menuRadio).attr('align', oMenuX);

                if (oNodeWarning > 0 && nodeCount > oNodeWarning) {
                    $('#'+menuRadio+' div').append('<button type="button" id="'+btnRefresh+'" class="btn btn-xs btn-default">Many Nodes: Load?</button>');
                    $('#'+btnRefresh).on("click", function(){
                        preStaging();
                    });
                } else {
                    try {
                        preStaging();
                    } catch(e) {
                        console.log(e);
                    }
                }
            }

            function preStaging() {
                // Build an array of node objects (gNodes) with properties for name, description, color, shape, etc.
                var gNodes = [];
                var node_dict = {};
                for (let x of qMatrix) {
                    // Process both dimensions (node_a and node_b)
                    buildNodeObj(node_b);
                    buildNodeObj(node_a);

                    function buildNodeObj(n) {
                        if (node_dict[x[n].qText] === undefined) {
                            var nodeObj = {
                                nodeID: x[n].qText,
                                degree: oDegree ? gDegree._stringValues[x[n].qText] : 1,
                                betweenness: oBetweenness ? gBetweenness._stringValues[x[n].qText] + 0.1 : 1,
                                eigenvector: oEigenvector ? gEigenvector._stringValues[x[n].qText] + 0.1 : 1
                            };

                            // Node name
                            if (x[n].qAttrExps.qValues[0].hasOwnProperty('qText')) {
                                nodeObj.name = x[n].qAttrExps.qValues[0].qText;
                            } else {
                                nodeObj.name = x[n].qText;
                            }
                            // Node description
                            if (x[n].qAttrExps.qValues[1].hasOwnProperty('qText')) {
                                nodeObj.desc = x[n].qAttrExps.qValues[1].qText;
                            } else {
                                nodeObj.desc = '';
                            }
                            // Node color from attribute
                            if (x[n].qAttrExps.qValues[2].hasOwnProperty('qText')) {
                                nodeObj.color = x[n].qAttrExps.qValues[2].qText;
                            } else {
                                nodeObj.color = oNodeColor;
                            }
                            // *** NEW: Get node shape from attribute expression index 3 ***
                            if (x[n].qAttrExps.qValues.length > 3 && x[n].qAttrExps.qValues[3].hasOwnProperty('qText')) {
                                nodeObj.shape = x[n].qAttrExps.qValues[3].qText.toLowerCase();
                            } else {
                                nodeObj.shape = "square";  // default to square
                            }
                            // *** NEW: Override node size if measure mapping exists ***
                            if (node_size >= 0) {
                                // Offset by 2 since the first two columns are dimensions
                                nodeObj.size = x[node_size + 2].qNum;
                            } else {
                                nodeObj.size = oNodeInitMin;
                            }
                            if (node_color >= 0) {
                                nodeObj.color = x[node_color + 2].qText;
                            }
                            // Save qElemNumber for lasso selection
                            n === 0 ? nodeObj.nodeqElemNumber0 = x[n].qElemNumber : nodeObj.nodeqElemNumber1 = x[n].qElemNumber;

                            gNodes.push(nodeObj);
                            node_dict[x[n].qText] = oDegree ? gDegree._stringValues[x[n].qText] : 1;
                        } else {
                            // Node already exists; update qElemNumber if coming from first dimension
                            var gNIndex = gNodes.findIndex(y => y.nodeID == x[n].qText);
                            if (n === 0) {
                                gNodes[gNIndex].nodeqElemNumber0 = x[n].qElemNumber;
                                x[n].qAttrExps.qValues[0].hasOwnProperty('qText') ?
                                    gNodes[gNIndex].name = x[n].qAttrExps.qValues[0].qText :
                                    gNodes[gNIndex].name = x[n].qText;
                                x[n].qAttrExps.qValues[1].hasOwnProperty('qText') ?
                                    gNodes[gNIndex].desc = x[n].qAttrExps.qValues[1].qText :
                                    gNodes[gNIndex].desc = '';
                                x[n].qAttrExps.qValues[2].hasOwnProperty('qText') ?
                                    gNodes[gNIndex].color = x[n].qAttrExps.qValues[2].qText :
                                    gNodes[gNIndex].color = oNodeColor;
                            }
                        }
                    }
                }

                // Build the edge objects for D3
                var gEdges = [];
                for (let x of edges) {
                    var o = {
                        source: x[0],
                        target: x[1],
                        weight: x[2].weight,
                        color: x[2].color
                    };
                    gEdges.push(o);
                }

                var graph = {
                    links: gEdges,
                    nodes: gNodes
                };

                // Main NetworkX and D3 code
                var svg = d3.select("#" + chartID).append("svg")
                    .attr("width", width)
                    .attr("height", height);

                var color = d3.scaleOrdinal(d3.schemeCategory20);

                var simulation = d3.forceSimulation().alphaDecay(oAlphaDecay)
                    .force("link", d3.forceLink().id(function(d) { return d.nodeID; }))
                    .force("charge", d3.forceManyBody().strength(oForceStrength).distanceMax(oForceDistMax))
                    .force("center", d3.forceCenter(width / 2, height / 2));

                svg.selectAll("*").remove();
                var container = svg.append('g');

                // Enable zooming
                svg.call(d3.zoom().on('zoom', zoomed));

                // Create a transparent rectangle for lassoing
                var bg = container.append('rect')
                    .attr('class','lassoable')
                    .attr('x', 0)
                    .attr('y', 0)
                    .attr('width', width)
                    .attr('height', height)
                    .attr('opacity', 0.0);

                var toggle = 0;  // Toggle for node selection highlighting

                // Build an index of neighbors for toggling
                var linkedByIndex = {};
                graph.links.forEach(function(d) {
                    linkedByIndex[d.source + ',' + d.target] = 1;
                    linkedByIndex[d.target + ',' + d.source] = 1;
                });
                function neighboring(a, b) {
                    return a.nodeID === b.nodeID ? true : linkedByIndex[a.nodeID + ',' + b.nodeID];
                }

                var nodeSize = nodeSizing(null);
                forceSim(nodeSize, null);

                var link = container.append("g")
                    .attr("class", "links")
                    .selectAll("line")
                    .data(graph.links, function(d) { return d.source + ", " + d.target; })
                    .enter().append("line")
                    .attr('class', 'link')
                    .style('stroke-width', function(d) { return d.weight; })
                    .style('stroke-linejoin', "bevel")
                    .style('opacity', 0.4)
                    .style('stroke', function(d) { return d.color; });

                var node = container.append('g')
                    .attr("class", "nodes")
                    .selectAll('g')
                    .data(graph.nodes)
                    .enter().append('g');

                // Render each node based on its own shape
                node.each(function(d) {
                    var selection = d3.select(this);
                    if(d.shape === "square"){
                        selection.append("rect")
                            .attr("width", function(d) {
                                return (typeof d.size !== "undefined") ? d.size * 2 : nodeSize(d.degree) * 2;
                            })
                            .attr("height", function(d) {
                                return (typeof d.size !== "undefined") ? d.size * 2 : nodeSize(d.degree) * 2;
                            })
                            // Center the square on the node's coordinates:
                            .attr("x", function(d) {
                                var size = (typeof d.size !== "undefined") ? d.size * 2 : nodeSize(d.degree) * 2;
                                return -size / 2;
                            })
                            .attr("y", function(d) {
                                var size = (typeof d.size !== "undefined") ? d.size * 2 : nodeSize(d.degree) * 2;
                                return -size / 2;
                            })
                            .attr("fill", function(d) { return d.color; })
                            .attr('class', 'lassoable')
                            .on('click', function(d, i) { toggleNodeSelect(d, i); })
                            .call(d3.drag()
                                .on("start", dragstarted)
                                .on("drag", dragged)
                                .on("end", dragended));
                    } else {
                        // Default to a circle if shape is not "square"
                        selection.append("circle")
                            .attr('r', function(d, i) {
                                return (typeof d.size !== "undefined") ? d.size : nodeSize(d.degree);
                            })
                            .attr('class', 'lassoable')
                            .attr("fill", function(d) { return d.color; })
                            .on('click', function(d, i) { toggleNodeSelect(d, i); })
                            .call(d3.drag()
                                .on("start", dragstarted)
                                .on("drag", dragged)
                                .on("end", dragended));
                    }
                });

                // Update label placement as before
                if(oLabelThreshold > -1){
                    var labels = node.append("text")
                        .text(function(d) { return d.name; })
                        .attr("dy", ".35em")
                        .attr("text-anchor", "middle")
                        .style("font-size", oLabelSize)
                        .style("font-family", oLabelFont)
                        .style("fill", oLabelColor)
                        .style("opacity", function(){
                            return oLabelThreshold === 0 ? 1 : 0;
                        })
                        .on("click", function(d,i){ toggleNodeSelect(d, i); })
                        .call(d3.drag()
                            .on("start", dragstarted)
                            .on("drag", dragged)
                            .on("end", dragended));
                }

                // NEW: Updated toggleNodeSelect to fade out non-neighbor nodes/links.
                // Instead of selecting only circles, we now select all node groups (the <g> elements within .nodes)
                function toggleNodeSelect(clickedNode, i) {
                    if (toggle === 0) {
                        // Transition links: if connected to the clicked node, keep full opacity; otherwise, fade.
                        d3.selectAll('line')
                            .transition().duration(300)
                            .style('stroke-opacity', function(l) {
                                return (l.source.nodeID === clickedNode.nodeID || l.target.nodeID === clickedNode.nodeID) ? 1 : 0.1;
                            });
                        // Transition node groups: select all <g> elements in the .nodes container
                        d3.selectAll('.nodes g')
                            .transition().duration(300)
                            .style('opacity', function(d) {
                                return (d.nodeID === clickedNode.nodeID || neighboring(clickedNode, d)) ? 1 : 0.1;
                            });
                        toggle = 1;
                    } else {
                        d3.selectAll('line')
                            .transition().duration(300)
                            .style('stroke-opacity', 0.6);
                        d3.selectAll('.nodes g')
                            .transition().duration(300)
                            .style('opacity', 1);
                        toggle = 0;
                    }
                }

                node.append("title")
                    .text(function(d) { return d.desc; });

                simulation
                    .nodes(graph.nodes)
                    .on("tick", ticked);

                simulation.force("link")
                    .links(graph.links);

                function ticked() {
                    link
                        .attr("x1", function(d) { return d.source.x; })
                        .attr("y1", function(d) { return d.source.y; })
                        .attr("x2", function(d) { return d.target.x; })
                        .attr("y2", function(d) { return d.target.y; });

                    node.attr("transform", function(d) {
                        return "translate(" + d.x + "," + d.y + ")";
                    });
                }

                function nodeSizing(cent) {
                    var nodeCountCutoff = 1000;
                    var rangeCalc = oNodeInitMax - oNodeInitMax * (nodeCount / nodeCountCutoff);
                    var rMin = rangeCalc < oNodeInitMin ? oNodeInitMin : rangeCalc;

                    var centralitySize = d3.scaleLinear()
                        .domain([d3.min(graph.nodes, function(d) { return d[cent] || 10; }),
                                 d3.max(graph.nodes, function(d) { return d[cent] || 10; })])
                        .range([rMin, 30]);
                    return centralitySize;
                }

                function forceSim(ns, cent) {
                    simulation.force("collide", d3.forceCollide().radius(function(d) { return ns(d[cent] || 10); }));
                }

                // Build the menu for centrality resizing if applicable
                $('#'+menuRadio+' .btn-opt').remove();
                if (oCentralityRadio.length > 0) {
                    $('#'+menuRadio).append('<div id="'+radioGrp+'" class="radio-group"></div>');
                }
                for (var i = 0; i < oCentralityRadio.length; i++){
                    $('#'+radioGrp).append('<input type="radio" class="btn-opt" name="'+selector+'" id="' + oCentralityRadio[i] + '">');
                    $('#'+radioGrp).append('<label class="btn-opt" for="' + oCentralityRadio[i] + '">' + oCentralityRadio[i] + '</label>');
                }

                $("input:radio[name="+selector+"]:first").attr('checked', true);
                $('#'+radioGrp+' input[type=radio]').on("click", function(){
                    var cent = $(this).attr("id").toLowerCase();
                    var nodeSize = nodeSizing(cent);
                    // Update all node shapes that are circles; you might also update rects if needed.
                    d3.selectAll('.lassoable.circle')
                        .attr('r', function(d) { return nodeSize(d[cent]); });
                    forceSim(nodeSize, cent);
                    simulation.restart();
                });

                $('#'+actionGrp).append('<input type="radio" class="btn-opt" name="'+action+'" id="Pan">');
                $('#'+actionGrp).append('<label class="btn-opt" for="Pan">Pan</label>');
                $('#'+actionGrp).append('<input type="radio" class="btn-opt" name="'+action+'" id="Lasso">');
                $('#'+actionGrp).append('<label class="btn-opt" for="Lasso">Lasso</label>');
                $("input:radio[name="+action+"]:first").attr('checked', true);
                $('#'+actionGrp+' input[type=radio]').on("click", function(){
                    $(this).attr('id') === "Pan" ? svg.call(d3.zoom().on('zoom', zoomed)) : enableLasso();
                });

                function dragstarted(d) {
                    if (!d3.event.active) simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                }
                function dragged(d) {
                    d.fx = d3.event.x;
                    d.fy = d3.event.y;
                }
                function dragended(d) {
                    if (!d3.event.active) simulation.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                }
                function zoomed() {
                    container.attr("transform", "translate(" + d3.event.transform.x + ", " + d3.event.transform.y + ") scale(" + d3.event.transform.k + ")");
                    curTransK = d3.event.transform.k;
                    curTransK >= oLabelThreshold ? d3.selectAll('text').style('opacity', 1) : d3.selectAll('text').style("opacity", 0);
                }

                function enableLasso(){
                    try{
                        var lasso2 = d3l.d3lasso(svg._groups)
                            .closePathDistance(75)
                            .closePathSelect(true)
                            .hoverSelect(false)
                            .area(svg.selectAll('.lassoable'))
                            // Use all node elements regardless of type
                            .items(d3.selectAll('.lassoable'))
                            .scale(d3.zoomTransform(svg.node()))
                            .on("start", lasso_start)
                            .on("draw", lasso_draw)
                            .on("end", lasso_end);
                    } catch(e){
                        console.log(e);
                    }
                    svg.call(d3.zoom().on('zoom', null));
                    svg.call(lasso2);

                    function lasso_start() {
                        lasso2.items().classed("not-possible", true);
                    }
                    function lasso_draw() {
                        var selected = container.selectAll('.lassoable').filter(function(d) { return d.possible === true; });
                        if (selected._groups[0].length > 0) {
                            selected.classed("not-possible", false);
                            selected.classed("possible", true);
                        }
                        var notSelected = container.selectAll('.lassoable').filter(function(d) { return d.possible === false; });
                        if (notSelected._groups[0].length > 0) {
                            notSelected.classed("not-possible", true);
                            notSelected.classed("possible", false);
                        }
                    }
                    function lasso_end() {
                        var selectedItems = lasso2.items().filter(function(d) { return d.selected; });
                        var elemNosA = [];
                        var elemNosB = [];
                        selectedItems.nodes().forEach(function(d) {
                            d.__data__.hasOwnProperty('nodeqElemNumber0') ? elemNosA.push(d.__data__.nodeqElemNumber0) : elemNosB.push(d.__data__.nodeqElemNumber1);
                        });
                        self.backendApi.selectValues(0, elemNosA, false);
                        self.backendApi.selectValues(1, elemNosB, true);
                    }
                }
            } // End preStaging
        } // End paint
    }; // End return
}); // End define
