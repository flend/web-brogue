function Router(controllers) {
    this.routeCollection = Object.create(null);
    for (const controller of Object.values(controllers)) this.routeCollection[controller.controllerName] = controller;
}
Router.prototype.route = function(message) {
    const error = () => this.routeCollection.error?.send('Invalid request.');
    if (!message || typeof message !== 'object' || Array.isArray(message) ||
        typeof message.controller !== 'string' || typeof message.type !== 'string' ||
        !Object.hasOwn(this.routeCollection, message.controller)) return error();
    const controller = this.routeCollection[message.controller];
    if (!Object.hasOwn(controller.handlerCollection, message.type) ||
        typeof controller.handlerCollection[message.type] !== 'function') return error();
    try {
        return Promise.resolve(controller.handleIncomingMessage(message)).catch(() => error());
    } catch {
        return error();
    }
};
module.exports = Router;
