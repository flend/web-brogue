const mongoose = require('mongoose');
const config = require('../../server/config');
const argv = require('minimist')(process.argv.slice(2));
const News = require('./news-model');
const Counter = require('./seq-model');

async function main() {
    const [command, value] = argv._;
    if (!['save', 'delete', 'list'].includes(command) ||
        (command !== 'list' && value === undefined)) {
        throw new Error("Usage: news.js save 'story' | delete <sequence> | list all");
    }
    try {
        await mongoose.connect(config.db.url, { serverSelectionTimeoutMS: 10000 });
        if (command === 'save') {
            const counter = await Counter.findOneAndUpdate(
                { _id: 'newsrecords' }, { $inc: { seq: 1 } },
                { upsert: true, returnDocument: 'after' });
            console.log(await News.create({ date: new Date(), story: value, seq: counter.seq }));
        } else if (command === 'delete') {
            const story = await News.findOneAndDelete({ seq: Number(value) });
            if (!story) throw new Error('Story not found');
            console.log('Deleted story with id: ' + story.seq);
        } else {
            console.log(await News.find({}).sort({ seq: 1 }).lean());
        }
    } finally {
        await mongoose.disconnect();
    }
}
main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
