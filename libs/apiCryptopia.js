var request = require('request');
var nonce = require('nonce');

module.exports = function () {
    'use strict';

    // Module dependencies

    // Constants
    var version = '1.0',
        PUBLIC_API_URL = 'https://www.cryptopia.co.nz/api',
        PRIVATE_API_URL = 'https://www.cryptopia.co.nz/api',
        USER_AGENT = 'Mozilla/4.0 (compatible; ComputerGenie Cryptopia API)'

    // Constructor
    function Cryptopia(key, secret) {
        // Generate headers signed by this user's key and secret.
        // The secret is encapsulated and never exposed
        this._getPrivateHeaders = function (parameters) {
            var paramString, signature;

            if (!key || !secret) {
                throw 'cryptopia: Error. API key and secret required';
            }

            // Sort parameters alphabetically and convert to `arg1=foo&arg2=bar`
            paramString = Object.keys(parameters).sort().map(function (param) {
                return encodeURIComponent(param) + '=' + encodeURIComponent(parameters[param]);
            }).join('&');

            signature = crypto.createHmac('sha512', secret).update(paramString).digest('hex');

            return {
                Key: key,
                Sign: signature
            };
        };
    }

    // If a site uses non-trusted SSL certificates, set this value to false
    Cryptopia.STRICT_SSL = false;

    // Helper methods
    function joinCurrencies(currencyA, currencyB) {
        return currencyB + '_' + currencyA;
    }

    // Prototype
    Cryptopia.prototype = {
        constructor: Cryptopia,

        // Make an API request
        _request: function (options, callback) {
            if (!('headers' in options)) {
                options.headers = {};
            }

            options.headers['User-Agent'] = USER_AGENT;
            options.json = true;
            options.strictSSL = Cryptopia.STRICT_SSL;

            request(options, function (err, response, body) {
                callback(err, body);
                //   console.error('response ' + JSON.stringify(response));
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

        // Make a private API request
        _private: function (parameters, callback) {
            var options;

            parameters.nonce = nonce();
            options = {
                method: 'POST',
                url: PRIVATE_API_URL,
                form: parameters,
                headers: this._getPrivateHeaders(parameters)
            };

            return this._request(options, callback);
        },


        /////


        // PUBLIC METHODS

        getTicker: function (callback) {
            var options = {
                method: 'GET',
                url: PUBLIC_API_URL + '/GetMarkets',
                qs: null
            };
            return this._request(options, callback);
        },

        // getBuyOrderBook: function(currencyA, currencyB, callback){
        //     var options = {
        //         method: 'GET',
        //         url: PUBLIC_API_URL + '/orders/' + currencyB + '/' + currencyA + '/BUY',
        //         qs: null
        //     };

        //     return this._request(options, callback);
        // },

        getOrderBook: function (currencyA, currencyB, callback) {
            var parameters = {
                market: currencyA,
                type: 'all',
                depth: '50'
            }
            var options = {
                method: 'GET',
                url: PUBLIC_API_URL + '/GetMarketOrders/' + currencyA,
                //qs: parameters
            }

            //  console.error('invalid address length for ' + JSON.stringify(options) + " " +JSON.stringify(parameters));

            return this._request(options, callback);
        },

        getTradeHistory: function (currencyA, currencyB, callback) {
            var parameters = {
                command: 'returnTradeHistory',
                currencyPair: joinCurrencies(currencyA, currencyB)
            };

            return this._public(parameters, callback);
        },


        /////


        // PRIVATE METHODS

        myBalances: function (callback) {
            var parameters = {
                command: 'returnBalances'
            };

            return this._private(parameters, callback);
        },

        myOpenOrders: function (currencyA, currencyB, callback) {
            var parameters = {
                command: 'returnOpenOrders',
                currencyPair: joinCurrencies(currencyA, currencyB)
            };

            return this._private(parameters, callback);
        },

        myTradeHistory: function (currencyA, currencyB, callback) {
            var parameters = {
                command: 'returnTradeHistory',
                currencyPair: joinCurrencies(currencyA, currencyB)
            };

            return this._private(parameters, callback);
        },

        buy: function (currencyA, currencyB, rate, amount, callback) {
            var parameters = {
                command: 'buy',
                currencyPair: joinCurrencies(currencyA, currencyB),
                rate: rate,
                amount: amount
            };

            return this._private(parameters, callback);
        },

        sell: function (currencyA, currencyB, rate, amount, callback) {
            var parameters = {
                command: 'sell',
                currencyPair: joinCurrencies(currencyA, currencyB),
                rate: rate,
                amount: amount
            };

            return this._private(parameters, callback);
        },

        cancelOrder: function (currencyA, currencyB, orderNumber, callback) {
            var parameters = {
                command: 'cancelOrder',
                currencyPair: joinCurrencies(currencyA, currencyB),
                orderNumber: orderNumber
            };

            return this._private(parameters, callback);
        },

        withdraw: function (currency, amount, address, callback) {
            var parameters = {
                command: 'withdraw',
                currency: currency,
                amount: amount,
                address: address
            };

            return this._private(parameters, callback);
        }
    };

    return Cryptopia;
}();
