const config = require('./config');

require('./httpServer')(config).then(app => {
    console.log('Server listening on port ' + app.httpServer.address().port);
    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.once(signal, () => {
            app.close().then(() => process.exit(0)).catch(error => {
                console.error(error);
                process.exit(1);
            });
        });
    }
}).catch(error => {
    console.error('Server startup failed:', error);
    process.exit(1);
});
