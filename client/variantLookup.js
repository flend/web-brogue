define([
    'jquery',
    'underscore',
    'backbone'
], function($, _, Backbone) {

    //Includes all historical variants, so the API response can be prettified
    var VariantLookup = {
        variants: {
            "BROGUECEV111": {
                code: "BROGUECEV111",
                display: "BrogueCE 1.11.1",
                consoleColumns: 100,
                consoleRows: 34,
                remapGlyphs: true,
                tiles: true,
                default: true
            },
            "BROGUECEV110": {
                code: "BROGUECEV110",
                display: "BrogueCE 1.10",
                consoleColumns: 100,
                consoleRows: 34,
                remapGlyphs: true,
                tiles: true,
                disabled: true
            },
            "BROGUECEV19": {
                code: "BROGUECEV19",
                display: "BrogueCE 1.9.3",
                consoleColumns: 100,
                consoleRows: 34,
                remapGlyphs: true,
                tiles: true,
                disabled: true
            },
            "BROGUECEV18": {
                code: "BROGUECEV18",
                display: "BrogueCE 1.8.3",
                consoleColumns: 100,
                consoleRows: 34,
                remapGlyphs: true,
                tiles: true,
                disabled: true
            },
            "BROGUEV175": {
                code: "BROGUEV175",
                display: "Brogue 1.7.5",
                consoleColumns: 100,
                consoleRows: 34
            },
            "BROGUEV174": {
                code: "BROGUEV174",
                display: "Brogue 1.7.4 [early 2019]",
                consoleColumns: 100,
                consoleRows: 34,
                disabled: true
            },
            "BROGUEV174DISCORD": {
                code: "BROGUEV174DISCORD",
                display: "Brogue 1.7.4",
                consoleColumns: 100,
                consoleRows: 34,
                disabled: true
            },
            "RAPIDBROGUEV130": {
                code: "RAPIDBROGUEV130",
                display: "Rapid Brogue v1.3.0",
                consoleColumns: 100,
                consoleRows: 34,
                remapGlyphs: true,
                tiles: true,
                highlight: true
            },
            "RAPIDBROGUEV120": {
                code: "RAPIDBROGUEV120",
                display: "Rapid Brogue v1.2.0",
                consoleColumns: 100,
                consoleRows: 34,
                remapGlyphs: true,
                tiles: true,
                highlight: false,
                disabled: true
            },
            "RAPIDBROGUEV110": {
                code: "RAPIDBROGUEV110",
                display: "Rapid Brogue v1.1.0",
                consoleColumns: 100,
                consoleRows: 34,
                remapGlyphs: true,
                tiles: true,
                highlight: false,
                disabled: true
            },
            "RAPIDBROGUEV100": {
                code: "RAPIDBROGUEV100",
                display: "Rapid Brogue v1.0.0",
                consoleColumns: 100,
                consoleRows: 34,
                remapGlyphs: true,
                tiles: true,
                disabled: true
            },
            "KBROGUE223": {
                code: "KBROGUE223",
                display: "kBrogue v2.2.3",
                consoleColumns: 100,
                consoleRows: 34,
                remapGlyphs: true,
                tiles: true,
                highlight: true
            },
            "GBROGUEV1180211": {
                code: "GBROGUEV1180211",
                display: "gBrogue v1.18.02.11",
                consoleColumns: 100,
                consoleRows: 36
            },
            "UNBROGUEV113": {
                code: "UNBROGUEV113",
                display: "unBrogue v1.1.6",
                consoleColumns: 100,
                consoleRows: 34
            },
            "BROGUEPLUSV1741": {
                code: "BROGUEPLUSV1741",
                display: "Brogue+ v1.7.4.1",
                consoleColumns: 100,
                consoleRows: 34
            },
        }
    };
    return VariantLookup;
});