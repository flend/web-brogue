class AuthLimiter {
    constructor({ ipLimit = 30, accountLimit = 10, windowMs = 60000, maxEntries = 10000, now = Date.now } = {}) {
        Object.assign(this, { ipLimit, accountLimit, windowMs, maxEntries, now });
        this.buckets = new Map();
    }
    take(ip, username) {
        const now = this.now();
        const keys = [['ip:' + ip, this.ipLimit]];
        if (username) keys.push(['account:' + JSON.stringify([ip, username]), this.accountLimit]);
        for (const [key, limit] of keys) {
            let bucket = this.buckets.get(key);
            if (!bucket || now >= bucket.until) {
                if (!bucket && this.buckets.size >= this.maxEntries) {
                    for (const [oldKey, old] of this.buckets) if (now >= old.until) this.buckets.delete(oldKey);
                    if (this.buckets.size >= this.maxEntries) return false;
                }
                bucket = { count: 0, until: now + this.windowMs };
                this.buckets.set(key, bucket);
            }
            if (bucket.count >= limit) return false;
            bucket.count++;
        }
        return true;
    }
}
module.exports = AuthLimiter;
