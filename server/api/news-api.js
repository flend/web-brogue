var NewsRecord = require("../database/news-model");
var sanitize = require('mongo-sanitize');
var _ = require("underscore");

module.exports = function(app) {

    var sortFromQueryParams = function(req, defaultSort) {

        if (req.query.sort) {
            if (req.query.order && req.query.order === "desc") {
                return { [sanitize(req.query.sort)] : -1 }
            }
            else {
                return { [sanitize(req.query.sort)] : 1 };
            }
        }
        else {
            return defaultSort;
        }
    };

    var filterNewsRecords = function (newsRecords, queryDays) {

        var filteredNewsRecords = [];
        var d = new Date();
        var now = d.getTime();

        var days = 30;

        if(queryDays && queryDays > 0) {
            days = queryDays;
        }

        _.each(newsRecords, function (newsRecord) {

            if(now - newsRecord.date.getTime() < 1000 * 60 * 60 * 24 * days) {
                filteredNewsRecords.push(newsRecord);
            }
        });

        return filteredNewsRecords;
    };

    app.get("/api/news", function (req, res, next) {
        NewsRecord.paginate({}, {
            page: req.pagination.page,
            limit: req.pagination.limit,
            sort: sortFromQueryParams(req, { date: -1 })
        }, function (err, newsRecords) {

            if (err) return next(err);

            res.format({
                json: function () {
                    res.json({
                        object: 'list',
                        data: filterNewsRecords(newsRecords.docs, req.query.days),
                        pageCount: newsRecords.totalPages,
                        itemCount: newsRecords.totalDocs
                    });
                }
            });
        });
    });
};