// Object containing global constants for server program

var path = require('path');

var config = {
    port : {
        HTTP : Number(process.env.PORT || 8080)
    },
    brogueVariants : {
        "BROGUEPLUSV1741": {
            binaryPath: "binaries/brogueplus-v1741",
            version: "1.7.4.1",
            versionGroup: "1.7.4.1",
            modernCmdLine: false,    //Uses v1.8.x+ standard command line
            supportsDownloads: true, //Replays should work with desktop version
            maxSeed: 4294967295n
        },
        "BROGUECEV151": {
            binaryPath: "binaries/brogue-ce151",
            version: "1.15.1",
            versionGroup: "1.15.x",
            modernCmdLine: true,    //Uses v1.8.x+ standard command line
            supportsDownloads: true, //Replays should work with desktop version
            maxSeed: 9223372036854775807n
        },
        "BROGUECEV140": {
            binaryPath: "binaries/brogue-ce140",
            version: "1.14",
            versionGroup: "1.14.x",
            modernCmdLine: true,    //Uses v1.8.x+ standard command line
            supportsDownloads: true, //Replays should work with desktop version
            maxSeed: 9223372036854775807n
        },
        "BROGUECEV130": {
            binaryPath: "binaries/brogue-ce130",
            version: "1.13",
            versionGroup: "1.13.x",
            modernCmdLine: true,    //Uses v1.8.x+ standard command line
            supportsDownloads: true, //Replays should work with desktop version
            maxSeed: 9223372036854775807n
        },
        "BROGUECEV120": {
            binaryPath: "binaries/brogue-ce120",
            version: "1.12",
            versionGroup: "1.12.x",
            modernCmdLine: true,    //Uses v1.8.x+ standard command line
            supportsDownloads: true, //Replays should work with desktop version
            maxSeed: 9223372036854775807n
        },
        "BROGUECEV111": {
            binaryPath: "binaries/brogue-ce111",
            version: "1.11.1",
            versionGroup: "1.11.x",
            modernCmdLine: true,    //Uses v1.8.x+ standard command line
            supportsDownloads: true, //Replays should work with desktop version
            maxSeed: 9223372036854775807n
        },
        "BROGUECEV110": {
            binaryPath: "binaries/brogue-ce110",
            version: "1.10",
            versionGroup: "1.10.x",
            modernCmdLine: true,    //Uses v1.8.x+ standard command line
            supportsDownloads: true, //Replays should work with desktop version
            maxSeed: 4294967295n
        },
        "BROGUECEV19": {
            binaryPath: "binaries/brogue-ce193-d22c4a1",
            version: "1.9.3",
            versionGroup: "1.9.x",
            modernCmdLine: true,    //Uses v1.8.x+ standard command line
            supportsDownloads: true, //Replays should work with desktop version
            maxSeed: 4294967295n
        },
        "BROGUECEV18": {
          binaryPath: "binaries/brogue-ce18",
          version: "1.8.3",
          versionGroup: "1.8.x",
          modernCmdLine: true,    //Uses v1.8.x+ standard command line
          supportsDownloads: true, //Replays should work with desktop version
          maxSeed: 4294967295n
        },
        "BROGUEV174": {
            binaryPath: "binaries/brogue-fd99bbe",
            version: "1.7.4",
            versionGroup: "1.7.4",
            modernCmdLine: false,
            supportsDownloads: false,
            maxSeed: 4294967295n
        },
        "GBROGUEV1180211": {
            binaryPath: "binaries/gbrogue-v1180211",
            version: "1.18.02.11",
            versionGroup: "1.18.02.11",
            modernCmdLine: false,
            supportsDownloads: false,
            maxSeed: 4294967295n
        },
        "BROGUEV175": {
            binaryPath: "binaries/brogue-v175",
            version: "1.7.5",
            versionGroup: "1.7.5",
            modernCmdLine: false,
            supportsDownloads: false,
            maxSeed: 4294967295n
        },
        "UNBROGUEV113": {
            binaryPath: "binaries/unbrogue-v116",
            version: "1.1.3",
            versionGroup: "1.1.3",
            modernCmdLine: false,
            supportsDownloads: false,
            maxSeed: 2147483647n
        },
        "BROGUEV174DISCORD": {
            binaryPath: "binaries/brogue-v174",
            version: "1.7.4b",
            versionGroup: "1.7.4b",
            modernCmdLine: false,
            supportsDownloads: false,
            maxSeed: 4294967295n
        },
        "RAPIDBROGUEV100": {
            binaryPath: "binaries/rapid-brogue-v100",
            version: "1.0.0",
            versionGroup: "1.0.x",
            modernCmdLine: true,    //Uses v1.8.x+ standard command line
            supportsDownloads: true, //Replays should work with desktop version
            maxSeed: 4294967295n
        },
        "RAPIDBROGUEV110": {
            binaryPath: "binaries/rapid-brogue-v110",
            version: "1.1.0",
            versionGroup: "1.1.x",
            modernCmdLine: true,    //Uses v1.8.x+ standard command line
            supportsDownloads: true, //Replays should work with desktop version
            maxSeed: 4294967295n
        },
        "RAPIDBROGUEV120": {
            binaryPath: "binaries/rapid-brogue-v120",
            version: "1.2.0",
            versionGroup: "1.2.x",
            modernCmdLine: true,    //Uses v1.8.x+ standard command line
            supportsDownloads: true, //Replays should work with desktop version
            maxSeed: 4294967295n
        },
        "RAPIDBROGUEV130": {
            binaryPath: "binaries/rapid-brogue-v130",
            version: "1.3.0",
            versionGroup: "1.3.x",
            modernCmdLine: true,    //Uses v1.8.x+ standard command line
            supportsDownloads: true, //Replays should work with desktop version
            maxSeed: 9223372036854775807n
        },
        "RAPIDBROGUEV140": {
            binaryPath: "binaries/rapid-brogue-v140",
            version: "1.4.0",
            versionGroup: "1.4.x",
            modernCmdLine: true,    //Uses v1.8.x+ standard command line
            supportsDownloads: true, //Replays should work with desktop version
            maxSeed: 9223372036854775807n
        },
        "RAPIDBROGUEV150": {
            binaryPath: "binaries/brogue-ce130",
            version: "1.5.0",
            versionGroup: "1.5.x",
            modernCmdLine: true,    //Uses v1.8.x+ standard command line
            customCmdLine: ["--variant", "rapid_brogue"],
            supportsDownloads: true, //Replays should work with desktop version
            maxSeed: 9223372036854775807n
        },
        "RAPIDBROGUEV160": {
            binaryPath: "binaries/brogue-ce140",
            version: "1.6.0",
            versionGroup: "1.6.x",
            modernCmdLine: true,    //Uses v1.8.x+ standard command line
            customCmdLine: ["--variant", "rapid_brogue"],
            supportsDownloads: true, //Replays should work with desktop version
            maxSeed: 9223372036854775807n
        },
        "RAPIDBROGUEV171": {
            binaryPath: "binaries/brogue-ce151",
            version: "1.7.1",
            versionGroup: "1.7.x",
            modernCmdLine: true,    //Uses v1.8.x+ standard command line
            customCmdLine: ["--variant", "rapid_brogue"],
            supportsDownloads: true, //Replays should work with desktop version
            maxSeed: 9223372036854775807n
        },
        "BULLETBROGUEV100": {
            binaryPath: "binaries/bullet-brogue-v100",
            version: "1.0.0",
            versionGroup: "1.0.x",
            modernCmdLine: true,    //Uses v1.8.x+ standard command line
            supportsDownloads: true, //Replays should work with desktop version
            maxSeed: 9223372036854775807n
        },
        "BULLETBROGUEV110": {
            binaryPath: "binaries/bullet-brogue-v110",
            version: "1.1.0",
            versionGroup: "1.1.x",
            modernCmdLine: true,    //Uses v1.8.x+ standard command line
            customCmdLine: ["--variant", "bullet_brogue"],
            supportsDownloads: true, //Replays should work with desktop version
            maxSeed: 9223372036854775807n
        },
        "BULLETBROGUEV121": {
            binaryPath: "binaries/brogue-ce151",
            version: "1.2.1",
            versionGroup: "1.2.x",
            modernCmdLine: true,    //Uses v1.8.x+ standard command line
            customCmdLine: ["--variant", "bullet_brogue"],
            supportsDownloads: true, //Replays should work with desktop version
            maxSeed: 9223372036854775807n
        }
    },
    defaultBrogueVariant: "BROGUECEV18",
    path : {
        CLIENT_DIR : path.normalize(__dirname + "/../client/"),
        GAME_DATA_DIR : path.normalize(__dirname + "/../game-data/")
    },
    db : {
        url : process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/brogue"
    },
    lobby : {
        UPDATE_INTERVAL : 1000,
        TIMEOUT_INTERVAL : 300000
    },
    auth : {
        secret: process.env.SESSION_SECRET || 'asecret',
        tokenExpiryTime: 90 * 24 * 60 * 60 * 1000,
        rateLimit: { ipLimit: 30, accountLimit: 10, windowMs: 60000 },
        trustedProxyAddresses: ['127.0.0.1', '::1']
    }
};

module.exports = config;
