// Commit generated libraries so deployments can serve the client without a build step.
const fs = require('node:fs');
const path = require('node:path');
const libraries = {
    'jquery/dist/jquery.min.js': 'jquery.js',
    'underscore/underscore-umd-min.js': 'underscore.js',
    'backbone/backbone-min.js': 'backbone.js',
    'backbone.paginator/lib/backbone.paginator.js': 'backbone.paginator.js',
    'backgrid/lib/backgrid.js': 'backgrid.js',
    'backgrid-paginator/backgrid-paginator.js': 'backgrid-paginator.js',
    'moment/min/moment.min.js': 'moment.js',
    'chart.js/dist/chart.umd.min.js': 'chart.js',
    'requirejs/require.js': 'require.js'
};
for (const [source, target] of Object.entries(libraries)) {
    const contents = fs.readFileSync(path.join(__dirname, 'node_modules', source), 'utf8');
    fs.writeFileSync(path.join(__dirname, 'libs', target), contents.replace(/[ \t]+$/gm, ''));
}
