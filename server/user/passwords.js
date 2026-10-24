const { Worker } = require('node:worker_threads');
const path = require('node:path');

class PasswordPool {
    constructor({ size = 2, maxQueue = 16 } = {}) {
        this.size = size;
        this.maxQueue = maxQueue;
        this.workers = new Set();
        this.queue = [];
        this.closed = false;
    }
    run(operation, password, hash) {
        if (this.closed || this.queue.length >= this.maxQueue) return Promise.reject(new Error('Authentication is busy. Please try again shortly.'));
        return new Promise((resolve, reject) => {
            this.queue.push({ operation, password, hash, resolve, reject });
            this.dispatch();
        });
    }
    dispatch() {
        while (this.queue.length) {
            let slot = [...this.workers].find(slot => !slot.job);
            if (!slot && this.workers.size < this.size) slot = this.startWorker();
            if (!slot) return;
            const job = this.queue.shift();
            slot.job = job;
            slot.worker.ref();
            slot.worker.postMessage({ operation: job.operation, password: job.password, hash: job.hash });
        }
    }
    startWorker() {
        const slot = { worker: new Worker(path.join(__dirname, 'password-worker.js')), job: null };
        this.workers.add(slot);
        slot.worker.on('message', ({ result, error }) => {
            const job = slot.job;
            slot.job = null;
            if (job) error ? job.reject(new Error(error)) : job.resolve(result);
            slot.worker.unref();
            this.dispatch();
        });
        const failed = () => {
            if (!this.workers.delete(slot)) return;
            if (slot.job) slot.job.reject(new Error('Authentication worker stopped. Please try again.'));
            if (!this.closed) this.dispatch();
        };
        slot.worker.on('error', failed);
        slot.worker.on('exit', failed);
        slot.worker.unref();
        return slot;
    }
    async close() {
        this.closed = true;
        for (const job of this.queue.splice(0)) job.reject(new Error('Authentication stopped.'));
        for (const slot of this.workers) {
            if (slot.job) { slot.job.reject(new Error('Authentication stopped.')); slot.job = null; }
        }
        await Promise.all([...this.workers].map(slot => slot.worker.terminate()));
        this.workers.clear();
    }
}
let pool;
const current = () => pool || (pool = new PasswordPool());
module.exports = {
    PasswordPool,
    hash: password => current().run('hash', password),
    compare: (password, hash) => current().run('compare', password, hash),
    close: async () => { if (pool) { const previous = pool; pool = null; await previous.close(); } }
};
