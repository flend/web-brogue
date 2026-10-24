define([
    "jquery",
    "underscore",
    "backbone",
    "variantLookup"
], function ($, _, Backbone) {

var ItemView = Backbone.View.extend({
	tagName: 'div',
	className: 'ac-result',
	template: _.template('<%- name %>'),
	events: {
		'touchstart': 'onSelect', // has to be mousedown or touchstart, so we can prevent blur
		'mousedown': 'onSelect',
		'mouseenter': 'onHover'
	},
	initialize: function(options) {
		this.parentView = options.parentView;
		this.searchField = options.searchField;
	},
	onHover: function() {
		this.parentView.trigger('highlight', this.model);
	},
	onSelect: function(evt) {
		evt.preventDefault(); // prevent blur on input, we'll hide results on parent
		this.parentView.trigger('chosen', this.model);
	},
	render: function() {
		var data = this.model.toJSON();

		var html = this.template({
			name: data[this.searchField]
		});
		this.$el.html(html);
	}
});

var ResultsView = Backbone.View.extend({
	tagName: 'div',
	className: 'bb-autocomplete-results',
	initialize: function initialize(options) {
		this.views = [];
		this.viewsByModel = {};
		this.searchField = options.searchField;
		this.collection = options.collection;
		this.parentView = options.parentView;
		this.maxOptions = options.maxOptions || Number.MAX_SAFE_INTEGER;
		this.noResultsText = options.noResultsText || 'No results';
		this.on('show', this.show, this);
		this.on('hide', this.hide, this);

		var moveUp = _.bind(this.moveHighlight, this, -1);
		var moveDown = _.bind(this.moveHighlight, this, 1);
		this.on('up', moveUp);
		this.on('down', moveDown);
		this.on('highlight', this.highlight, this);
		this.on('chosen', function(model) {
			this.parentView.trigger('chosen', model);
		}, this);
		this.collection.on('reset', this.render, this);
	},

	show: function show() {
		this.$el.removeClass('hidden');
	},
	hide: function hide() {
		this.$el.addClass('hidden');
	},
	resetHighlightIndex: function resetHighlightIndex() {
		this.removeHighlights();
		this.highlightIndex = false;
		if (this.collection.length === 0) {
			var localisedWarning = this.noResultsText;
			this.$el.html('<span class="bb-autocomplete-no-results">' + localisedWarning + '</span>');
		}
	},
	removeHighlights: function removeHighlights() {
		this.$el.find('.highlight').removeClass('highlight');
	},
	highlight: function(model) {
		this.removeHighlights();
		model = model || this.collection.at(this.highlightIndex);
		var viewToHighlight = this._getViewByModel(model);
		if (viewToHighlight) {
			viewToHighlight.$el.addClass('highlight');
			this.highlightIndex = this.collection.indexOf(model);
			this.parentView.trigger('highlight', model);
		}
	},
	moveHighlight: function(direction) {
		if (this.collection.length === 0) {
			// do nothing as we have no results
			return;
		}

		if (this.highlightIndex === false) {
			if (direction < 0) {
				this.highlightIndex = this.collection.length - 1;
			} else if (direction > 0) {
				this.highlightIndex = 0;
			}
		} else {

			this.highlightIndex += direction;

			if (this.highlightIndex < 0) {
				this.highlightIndex = this.collection.length - 1;
			} else if (this.highlightIndex >= this.collection.length) {
				this.highlightIndex = 0;
			}

		}

		this.highlight();
	},
	_getViewByModel: function(model) {
		return this.viewsByModel[model.cid];
	},
	_createItemView: function(model) {
		var itemView = new ItemView({
			searchField: this.searchField,
			model: model,
			parentView: this
		});
		this.viewsByModel[model.cid] = itemView;
		return itemView;
	},
	_removeItemView: function() {

	},
	render: function render() {
		this.resetHighlightIndex();
		var views = this.views;
		_.invoke(views, 'remove');
		this.$el.empty();
		var frag = document.createDocumentFragment();

		var clippedCollection = this.collection.first(this.maxOptions);
		_.each(clippedCollection, function(model) {
			var result = this._createItemView(model);
			result.render();
			frag.appendChild(result.el);
			this.views.push(result);
		}.bind(this));
		this.$el.append(frag);

	}
});

// Captured by the keyfilter to control search results
var keys = {
	9: 'tab',
	13: 'enter',
	38: 'up',
	40: 'down',
	27: 'escape'
};

var noop = function() {};

var MIN_INPUT_LENGTH = 0;

var AutocompleteView = Backbone.View.extend({
	tagName: 'div',
	className: 'bb-autocomplete',
	events: {
		'keydown .ac-user-input': 'onKeydown',
		'blur .ac-user-input': 'onBlur'
	},
	template: _.template('<input class="ac-user-input" type="text" /><div class="ac-results"></div>'),
	initialize: function initialize(options) {
		Backbone.View.prototype.initialize.apply(this,arguments);
		options = options || {};
		this.searchField = options.searchField || 'name';
		this.MIN_INPUT_LENGTH = options.minimumInputLength || MIN_INPUT_LENGTH;

		this.collection = options.collection; // data to search against
		this.resultsCollection = new Backbone.Collection(); // where to put results of search

		this.searchMethod = _.bind(this.searchMethod, this);

		this.resultsView = new ResultsView({
			searchField: this.searchField,
			maxOptions: options.maxOptions,
			parentView: this,
			collection: this.resultsCollection
		});
		this.on('chosen', this._preOnSelect, this);
		this.on('highlight', this.onHighlight, this);

	},
	onKeydown: function onKeydown(evt) {
		var input = evt.target;
		// see if the user has pressed a key we are explicitly wanting to control
		// the behaviour for
		if (keys[evt.keyCode]) {
			evt.preventDefault();
			evt.stopPropagation();
			switch (keys[evt.keyCode]) {
				case 'enter':
					if (this.selectedModel) {
						this._preOnSelect(this.selectedModel);
					}
					break;
				case 'escape':
					input.blur();
					break;
				case 'tab':
					input.blur();
					break;
				default:
					this.resultsView.trigger(keys[evt.keyCode]);
					break;
			}
			return false;
		} else {
			setTimeout(function() {
				this.setSearchValue(evt.target.value);
				this.doSearch();
			}.bind(this));

		}
	},
	_preOnSelect: function(model) {
		this.$('input').blur();
		this.selectedModel = model;
		this.onSelect(model);
	},
	onBlur: function onBlur(evt) {
		this.resultsView.trigger('hide');
	},
	onHighlight: function(model) {
		this.selectedModel = model;
		var value = model.get(this.searchField);
		//this.setSearchValue(value);
		//this.$('input').val(value);

	},
	setSearchValue: function(value) {
		this.searchValue = value;
	},
	shouldSearch: function(){
		return this.searchValue.length > this.MIN_INPUT_LENGTH;
	},
	doSearch: function() {
		if (!this.shouldSearch()) {
			return;
		}

		this.selectedModel = null;
		var filteredResults = this.collection.filter(this.searchMethod);
		this.resultsCollection.reset(filteredResults);
		this.resultsView.trigger('show');
	},
	render: function render() {
		this.$el.html(this.template());
		this.resultsView.setElement(this.$('.ac-results'));
		return this;
	},
	// overwritten when subclassing
	// callback that receives the model that was chosen
	onSelect: function(){
		// for subclassing
	},
	// function used by .filter() to determine if the item should be included in results
	searchMethod: function searchMethod(item) {
		var label = item.get(this.searchField).toLowerCase();

		if (label.indexOf(this.searchValue.toLowerCase().trim()) !== -1) {
			return true;
		} else {
			return false;
		}
	}

});

return AutocompleteView;

});

