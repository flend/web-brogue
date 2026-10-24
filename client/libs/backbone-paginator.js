// The AMD distribution returns its class rather than attaching it to Backbone.
define(['backbone', 'backbone.paginator'], function(Backbone, PageableCollection) {
    Backbone.PageableCollection = PageableCollection;
    return PageableCollection;
});
