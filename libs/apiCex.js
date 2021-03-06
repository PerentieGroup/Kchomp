var request = require('request');
var nonce = require('nonce');

module.exports = function () {
    'use strict';

    // Module dependencies

    // Constants
    var version = '1.1',
        PUBLIC_API_URL = 'https://www.coinexchange.io/api/v1',
        PRIVATE_API_URL = 'https://www.coinexchange.io/api/v1',
        USER_AGENT = 'nomp/node-open-mining-portal'

    // Constructor
    function coinexchange() {
        // Generate headers signed by this user's key and secret.
        // The secret is encapsulated and never exposed
        this._getPrivateHeaders = function (parameters) {
            // Sort parameters alphabetically and convert to `arg1=foo&arg2=bar`
            paramString = Object.keys(parameters).sort().map(function (param) {
                return encodeURIComponent(param) + '=' + encodeURIComponent(parameters[param]);
            });
        };
    }

    // If a site uses non-trusted SSL certificates, set this value to false
    coinexchange.STRICT_SSL = true;


    // Prototype
    coinexchange.prototype = {
        constructor: coinexchange,

        // Make an API request
        _request: function (options, callback) {
            if (!('headers' in options)) {
                options.headers = {};
            }
            options.headers['User-Agent'] = USER_AGENT;
            options.json = true;
            options.strictSSL = coinexchange.STRICT_SSL;
            request(options, function (err, response, body) {
                callback(err, body);
            });
            return this;
        },

        // Make a public API request
        _public: function (parameters, callback) {
            var options = {
                method: 'GET',
                url: PUBLIC_API_URL,
                qs: parameters
            };
            return this._request(options, callback);
        },

        // PUBLIC METHODS
        getMarkets: function (callback) {
            var options = {
                method: 'GET',
                url: PUBLIC_API_URL + '/getmarkets',
                qs: null
            };
            return this._request(options, callback);
        },

        getTicker: function (callback) {
            var options = {
                method: 'GET',
                url: PUBLIC_API_URL + '/getmarketsummaries',
                qs: null
            };
            return this._request(options, callback);
        },

        getOrderBook: function (MarketID, callback) {
            var options = {
                method: 'GET',
                url: PUBLIC_API_URL + '/getorderbook?market_id=' + MarketID,
            }
            return this._request(options, callback);
        }

        // PRIVATE METHODS


    };
    return coinexchange;
}();