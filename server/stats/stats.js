var brogueConstants = require("../brogue/brogue-constants");

module.exports = {

    deathGamesWithCauses: function (games) {

        return games.filter(function(game) {
            return game.result === brogueConstants.notifyEvents.GAMEOVER_DEATH;
        }).map(function(game) {
            var description = typeof game.description === 'string' ? game.description : '';
            var cause = 'unknown';

            // Environmental causes take precedence over the generic "by ... on"
            // parser. Each death contributes once, even when descriptions overlap.
            if (/by lava\b/i.test(description)) {
                cause = 'lava';
            } else if (/Burned/i.test(description)) {
                cause = 'burned to death';
            } else if (/poison/i.test(description)) {
                cause = 'poison';
            } else if (/Starved/i.test(description)) {
                cause = 'starved';
            } else {
                var match = /\bby\s+(?:an?\s+)?(.+?)\s+on\b/i.exec(description);
                if (match) cause = match[1];
            }

            return Object.assign({}, game, { cause: cause });
        });
    },

    doesVariantSupportRecordingDownloads: function (config, variant) {
        return config.brogueVariants[variant] && config.brogueVariants[variant].supportsDownloads;
    }
};
