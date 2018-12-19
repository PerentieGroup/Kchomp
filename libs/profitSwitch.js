var async = require('async');
var net = require('net');
var bignum = require('bignum');
var algos = require('js-stratum/lib/algoProperties.js');
var util = require('js-stratum/lib/util.js');
var Cryptopia = require('./apiCryptopia.js');
var Bittrex = require('./apiBittrex.js');
var TradeSatoshi = require('./apiTradeSatoshi.js');
var Cex = require('./apiCex.js');

var Stratum = require('js-stratum');
function addCommas(nStr) {
	nStr += '';
	var x = nStr.split('.');
	var x1 = x[0];
	var x2 = x.length > 1 ? '.' + x[1] : '';
	var rgx = /(\d+)(\d{3})/;
	while (rgx.test(x1)) {
		x1 = x1.replace(rgx, '$1' + ',' + '$2');
	}
	return x1 + x2;
}
module.exports = function (logger) {

	var _this = this;
	var CurrentkH = 300
	var CurrentASSETkH = 3
	var portalConfig = JSON.parse(process.env.portalConfig);
	var poolConfigs = JSON.parse(process.env.pools);
	var logSystem = 'Profit';
	var profitStatus = {};
	var symbolToAlgorithmMap = {};
	var checkProfitability = function () {
		logger.warning(logSystem, 'Check', 'Collecting profitability data.');

		profitabilityTasks = [];

		if (portalConfig.profitSwitch.useCryptopia)
			profitabilityTasks.push(_this.getProfitDataCryptopia);

		if (portalConfig.profitSwitch.useBittrex)
			profitabilityTasks.push(_this.getProfitDataBittrex);

		if (portalConfig.profitSwitch.useTradeSatoshi)
			profitabilityTasks.push(_this.getProfitDataTradeSatoshi);

		if (portalConfig.profitSwitch.useCex)
			profitabilityTasks.push(_this.getProfitDataCex);

		profitabilityTasks.push(_this.getCoindDaemonInfo);
		profitabilityTasks.push(_this.getMiningRate);

		// has to be series 
		async.series(profitabilityTasks, function (err) {
			if (err) {
				logger.error(logSystem, 'Check', 'Error while checking profitability 53: ' + err);
				return;
			}
			/*
				TODO offer support for a userConfigurable function for deciding on coin to override the default
			*/
			_this.switchToMostProfitableCoins();
		});
	};
	setInterval(checkProfitability, portalConfig.profitSwitch.updateInterval * 1000);
	/* 
		build status tracker for collecting coin market information
	*/
	Object.keys(poolConfigs).forEach(function (coin) {

		var poolConfig = poolConfigs[coin];
		var algo = poolConfig.coin.algorithm;

		if (!profitStatus.hasOwnProperty(algo)) {
			profitStatus[algo] = {};
		}
		var coinStatus = {
			name: poolConfig.coin.name,
			symbol: poolConfig.coin.symbol.toUpperCase(),
			difficulty: 0,
			reward: 0,
			exchangeInfo: {}

		};

		profitStatus[algo][poolConfig.coin.symbol] = coinStatus;
		symbolToAlgorithmMap[poolConfig.coin.symbol] = algo;
	});

	/* 
		ensure we have something to switch
	*/
	Object.keys(profitStatus).forEach(function (algo) {
		if (Object.keys(profitStatus[algo]).length <= 1) {

			delete profitStatus[algo];
			Object.keys(symbolToAlgorithmMap).forEach(function (symbol) {
				if (symbolToAlgorithmMap[symbol] === algo)
					delete symbolToAlgorithmMap[symbol];
			});
		}
	});
	if (Object.keys(profitStatus).length == 0) {
		logger.error(logSystem, 'Config', 'No alternative coins to switch to in current config, switching disabled.');
		return;
	}

	/* 
		setup APIs
	*/

	var cryptopiaApi = new Cryptopia(
		'ad573d7cab3944c189da6b10a01311dd',
		'yM4Ecv537snPIyJUbrusLtoljfCTXWAp4xvUzyBYIQU='
	);

	var bittrexApi = new Bittrex(
		'5c73d091d6ce435dab544e563fbb4dd2',
		'184c76b6478e4f09b08a01d009a54b75'
	);
	//TradeSatoshi requires no key for public
	var TradeSatoshiApi = new TradeSatoshi;

	var cexApi = new Cex;

	/* 
		Get Market TradeSatoshi
	*/
	this.getProfitDataTradeSatoshi = function (callback) {
		async.series([
			function (taskCallback) {
				TradeSatoshiApi.getTicker(function (err, data) {
					if (err) {
						taskCallback(err);
						return;
					}
					try {
						Object.keys(symbolToAlgorithmMap).forEach(function (symbol) {

							data.result.forEach(function (market) {
								var exchangeInfo = profitStatus[symbolToAlgorithmMap[symbol]][symbol].exchangeInfo;
								if (!exchangeInfo.hasOwnProperty('TradeSatoshi'))
									exchangeInfo['TradeSatoshi'] = {};
								var marketData = exchangeInfo['TradeSatoshi'];
								var MarketName = JSON.stringify(market).substr(1).slice(0, -1);
								var myRegexp = /(([\w]+)_([\w-_]+))/g;
								var marketPair = myRegexp.exec(MarketName);
								var symbolA = marketPair[2];
								var symbolB = marketPair[3];
								//logger.error(logSystem, 'CALC', '' + symbolB);
								// marketPair= ["DOT/BTC","DOT","BTC"] 
								try {
									market.exchange = symbolB
									market.code = symbolA

									if (symbolB == 'BTC' && symbolA == symbol.toUpperCase()) {

										//logger.error(logSystem, 'Checking', 'GRRRRR: ' + market.code + ' ' + symbol.toUpperCase());
										if (!marketData.hasOwnProperty('BTC'))
											marketData['BTC'] = {};
										marketData['BTC'].last = new Number(market.last);
										marketData['BTC'].baseVolume = new Number(market.baseVolume);
										marketData['BTC'].quoteVolume = new Number(market.baseVolume / market.last);
										marketData['BTC'].ask = new Number(market.ask);
										marketData['BTC'].bid = new Number(market.bid);
										//console.error('marketData ' + JSON.stringify(marketData['BTC']));
									}
								} catch (err) { }
							});
						});
					}
					catch (err) { logger.error(logSystem, 'CALC', 'TradeSatoshi fucked up ticker ' + err); }
					taskCallback();
				});
			},
			function (taskCallback) {
				var depthTasks = [];
				Object.keys(symbolToAlgorithmMap).forEach(function (symbol) {
					var marketData = profitStatus[symbolToAlgorithmMap[symbol]][symbol].exchangeInfo['TradeSatoshi'];
					if (marketData.hasOwnProperty('BTC') && marketData['BTC'].bid > 0) {
						depthTasks.push(function (callback) {
							_this.getMarketDepthFromTradeSatoshi(symbol, 'BTC', marketData['BTC'].bid, callback)
						});
					}
				});
				if (!depthTasks.length) {
					taskCallback();
					return;
				}
				async.series(depthTasks, function (err) {
					if (err) {
						taskCallback(err);
						return;
					}
					taskCallback();
				});
			}
		], function (err) {
			if (err) {
				callback(err);
				return;
			}
			callback(null);
		});
	};
	this.getMarketDepthFromTradeSatoshi = function (symbolA, symbolB, coinPrice, callback) {
		var bookdepth = new Number(500);
		if (symbolA == "BTCZ") { bookdepth = 400 }
		TradeSatoshiApi.getOrderBook(symbolA, symbolB, bookdepth, function (err, response) {
			if (err) {
				callback(err);
				return;
			}
			var depth = new Number(0);
			try {
				//console.error(' response ' + JSON.stringify(response));
				if (response.hasOwnProperty('result')) {
					if (response['result'].hasOwnProperty('buy')) {
						//console.error('Result result ' + JSON.stringify(response['result'].buy));
					}
					var totalQty = new Number(0);
					response['result'].buy.forEach(function (order) {
						//console.error('order result ' + JSON.stringify(order));
						var qty = new Number(order.quantity);
						var price = new Number(order.rate);
						//console.error('price result ' + price);

						var limit = new Number(coinPrice * portalConfig.profitSwitch.depth);
						//if (symbolA == "BTCZ") { limit = 0 }
						// only measure the depth down to configured depth
						if (price >= limit) {

							depth += (qty * price);
							totalQty += qty;
						}
						//console.error(symbolA + ' totalQty result ' + totalQty);
					});
				}
			}
			catch (err) { logger.error(logSystem, 'CALC', 'TradeSatoshi fucked up depth ' + err); }
			var marketData = profitStatus[symbolToAlgorithmMap[symbolA]][symbolA].exchangeInfo['TradeSatoshi'];
			marketData['BTC'].depth = depth;
			if (totalQty > 0)
				marketData['BTC'].weightedBid = new Number(depth / totalQty);
			//console.error(symbolA + ' depth result ' + depth);
			callback();
		});
	};


	/* 
		Get Market Cryptopia
	*/
	this.getProfitDataCryptopia = function (callback) {
		async.series([
			function (taskCallback) {
				cryptopiaApi.getTicker(function (err, data) {
					if (err) {
						taskCallback(err);
						return;
					}
					try {
						Object.keys(symbolToAlgorithmMap).forEach(function (symbol) {

							data.Data.forEach(function (market) {
								var exchangeInfo = profitStatus[symbolToAlgorithmMap[symbol]][symbol].exchangeInfo;
								if (!exchangeInfo.hasOwnProperty('Cryptopia'))
									exchangeInfo['Cryptopia'] = {};
								var marketData = exchangeInfo['Cryptopia'];
								var marketPair = market.Label.match((/([\w]+)\/([\w-_]+)/))
								//logger.error(logSystem, 'CALC', '' + marketPair);
								// marketPair= ["DOT/BTC","DOT","BTC"] 
								try {
									market.exchange = marketPair[1]
									market.code = marketPair[2]

									if (market.code == 'BTC' && market.exchange == symbol.toUpperCase()) {

										//logger.error(logSystem, 'Checking', 'GRRRRR: ' + market.Label + ' ' + symbol.toUpperCase());
										if (!marketData.hasOwnProperty('BTC'))
											marketData['BTC'] = {};
										marketData['BTC'].last = new Number(market.LastPrice);
										marketData['BTC'].baseVolume = new Number(market.Volume);
										marketData['BTC'].quoteVolume = new Number(market.Volume / market.LastPrice);
										marketData['BTC'].ask = new Number(market.AskPrice);
										marketData['BTC'].bid = new Number(market.BidPrice);
										marketData['BTC'].id = new Number(market.TradePairId);
										//marketData= marketData {"last":0.00053366,"baseVolume":4.63832493,"quoteVolume":8691.535678147133,"ask":0.00053133,"bid":0.00050546,"id":2394}

										// console.error('marketData ' + JSON.stringify(marketData['BTC']));
									}
								} catch (err) { }
							});
						});
					}
					catch (err) { logger.error(logSystem, 'CALC', 'Cryptopia fucked up big 274 ' + err); }
					taskCallback();
				});
			},
			function (taskCallback) {
				var depthTasks = [];
				Object.keys(symbolToAlgorithmMap).forEach(function (symbol) {
					var marketData = profitStatus[symbolToAlgorithmMap[symbol]][symbol].exchangeInfo['Cryptopia'];
					if (marketData.hasOwnProperty('BTC') && marketData['BTC'].bid > 0) {
						depthTasks.push(function (callback) {
							_this.getMarketDepthFromCryptopia(marketData['BTC'].id, symbol, marketData['BTC'].bid, callback)
						});
					}
				});
				if (!depthTasks.length) {
					taskCallback();
					return;
				}
				async.series(depthTasks, function (err) {
					if (err) {
						taskCallback(err);
						return;
					}
					taskCallback();
				});
			}
		], function (err) {
			if (err) {
				callback(err);
				return;
			}
			callback(null);
		});
	};
	this.getMarketDepthFromCryptopia = function (symbolA, symbolB, coinPrice, callback) {
		cryptopiaApi.getOrderBook(symbolA, symbolB, function (err, response) {
			if (err) {
				callback(err);
				return;
			}
			var depth = new Number(0);
			try {
				if (response.hasOwnProperty('Data')) {
					// if (response['result'].hasOwnProperty('buy')){
					// console.error('blue result ' + JSON.stringify(response['result'].buy));
					// }

					var totalQty = new Number(0);
					response['Data'].Buy.forEach(function (order) {
						var price = new Number(order.Price);
						var limit = new Number(coinPrice * portalConfig.profitSwitch.depth);
						var qty = new Number(order.Volume);
						// only measure the depth down to configured depth
						if (price >= limit) {
							depth += (qty * price);
							totalQty += qty;
						}
					});
				}
			}
			catch (err) { logger.error(logSystem, 'CALC', 'Cryptopia fucked up market 334 ' + err); }
			var marketData = profitStatus[symbolToAlgorithmMap[symbolB]][symbolB].exchangeInfo['Cryptopia'];
			marketData['BTC'].depth = depth;
			if (totalQty > 0)
				marketData['BTC'].weightedBid = new Number(depth / totalQty);
			callback();
		});
	};


	/* 
		Get Market Bittrex
	*/
	this.getProfitDataBittrex = function (callback) {
		async.series([
			function (taskCallback) {
				bittrexApi.getTicker(function (err, response) {
					if (err || !response.result) {
						taskCallback(err);
						return;
					}
					Object.keys(symbolToAlgorithmMap).forEach(function (symbol) {
						response.result.forEach(function (market) {
							var exchangeInfo = profitStatus[symbolToAlgorithmMap[symbol]][symbol].exchangeInfo;
							if (!exchangeInfo.hasOwnProperty('Bittrex'))
								exchangeInfo['Bittrex'] = {};
							var marketData = exchangeInfo['Bittrex'];
							var marketPair = market.MarketName.match(/([\w]+)-([\w-_]+)/)
							market.exchange = marketPair[1]
							market.code = marketPair[2]
							if (market.exchange == 'BTC' && market.code == symbol.toUpperCase()) {
								if (!marketData.hasOwnProperty('BTC'))
									marketData['BTC'] = {};
								marketData['BTC'].last = new Number(market.Last);
								marketData['BTC'].baseVolume = new Number(market.BaseVolume);
								marketData['BTC'].quoteVolume = new Number(market.BaseVolume / market.Last);
								marketData['BTC'].ask = new Number(market.Ask);
								marketData['BTC'].bid = new Number(market.Bid);
							}
						});
					});
					taskCallback();
				});
			},
			function (taskCallback) {
				var depthTasks = [];
				Object.keys(symbolToAlgorithmMap).forEach(function (symbol) {
					var marketData = profitStatus[symbolToAlgorithmMap[symbol]][symbol].exchangeInfo['Bittrex'];
					if (marketData.hasOwnProperty('BTC') && marketData['BTC'].bid > 0) {
						depthTasks.push(function (callback) {
							_this.getMarketDepthFromBittrex('BTC', symbol, marketData['BTC'].bid, callback)
						});
					}
				});

				if (!depthTasks.length) {
					taskCallback();
					return;
				}
				async.series(depthTasks, function (err) {
					if (err) {
						taskCallback(err);
						return;
					}
					taskCallback();
				});
			}
		], function (err) {
			if (err) {
				callback(err);
				return;
			}
			callback(null);
		});
	};
	this.getMarketDepthFromBittrex = function (symbolA, symbolB, coinPrice, callback) {
		bittrexApi.getOrderBook(symbolA, symbolB, function (err, response) {
			if (err) {
				callback(err);
				return;
			}
			var depth = new Number(0);
			if (response.hasOwnProperty('result') && response.success == true) {
				var totalQty = new Number(0);
				response['result'].forEach(function (order) {
					//console.error('Bitrex result ' + JSON.stringify(response));

					var price = new Number(order.Rate);
					var limit = new Number(coinPrice * portalConfig.profitSwitch.depth);
					var qty = new Number(order.Quantity);
					// only measure the depth down to configured depth
					if (price >= limit) {
						depth += (qty * price);
						totalQty += qty;
					}
				});
			}
			var marketData = profitStatus[symbolToAlgorithmMap[symbolB]][symbolB].exchangeInfo['Bittrex'];
			marketData[symbolA].depth = depth;
			if (totalQty > 0)
				marketData[symbolA].weightedBid = new Number(depth / totalQty);
			callback();
		});
	};

	/*
	Get Market Cex
	 */
	this.getProfitDataCex = function (callback) {
		async.series([
			function (taskCallback) {
				cexApi.getMarkets(function (err, response) {
					if (err) {
						taskCallback(err);
						return;
					}
					try {
						Object.keys(symbolToAlgorithmMap).forEach(function (symbol) {
							response.result.forEach(function (market) {
								var exchangeInfo = profitStatus[symbolToAlgorithmMap[symbol]][symbol].exchangeInfo;
								if (!exchangeInfo.hasOwnProperty('Cex'))
									exchangeInfo['Cex'] = {};
								var marketData = exchangeInfo['Cex'];
								var marketBase = market.BaseCurrencyCode
								if (market.MarketAssetCode == symbol.toUpperCase()) {
									if (marketBase == 'BTC') {
										if (!marketData.hasOwnProperty('BTC')) {
											marketData['BTC'] = {};
										};
										marketData['BTC'].MID = new Number(market.MarketID);
										//logger.error(logSystem, 'READ', 'THIS INFO 1 ' + JSON.stringify(marketData));
									};
								};
							});
						});
					} catch (err) {
						logger.error(logSystem, 'GRRRR', 'Cex fucked up getMarkets ' + err.message);
						logger.error(logSystem, 'GRRRR', 'Cex fucked up getMarkets ' + response);
					}
					taskCallback();
				});
			},
			function (taskCallback) {
				cexApi.getTicker(function (err, response) {
					if (err || !response.result) {
						taskCallback(err);
						return;
					}
					Object.keys(symbolToAlgorithmMap).forEach(function (symbol) {
						response.result.forEach(function (market) {
							var marketData = profitStatus[symbolToAlgorithmMap[symbol]][symbol].exchangeInfo['Cex'];
							if (!marketData.hasOwnProperty('BTC')) {
								marketData['BTC'] = {};
							};
							if (marketData['BTC'].hasOwnProperty('MID')) {
								if (market.MarketID == marketData['BTC'].MID) {
									marketData['BTC'].last = new Number(market.LastPrice);
									marketData['BTC'].baseVolume = new Number(market.Volume);
									marketData['BTC'].quoteVolume = new Number(market.Volume / market.LastPrice);
									marketData['BTC'].ask = new Number(market.AskPrice);
									marketData['BTC'].bid = new Number(market.BidPrice);
								};
							};
						});
					});
					taskCallback();
				});
			},
			function (taskCallback) {
				var depthTasks = [];
				Object.keys(symbolToAlgorithmMap).forEach(function (symbol) {
					var marketData = profitStatus[symbolToAlgorithmMap[symbol]][symbol].exchangeInfo['Cex'];
					try {
						if (marketData.hasOwnProperty('BTC') && marketData['BTC'].hasOwnProperty('bid')) {
							if (marketData['BTC'].bid > 0) {
								depthTasks.push(function (callback) {
									_this.getMarketDepthFromCex(symbol, marketData['BTC'].MID, marketData['BTC'].bid, callback)
								});
							}
						}
					} catch (err) {
						logger.error(logSystem, symbol, 'Cex fucked up getdepth ' + err.message);
						return;
					}
				});
				if (!depthTasks.length) {
					taskCallback();
					return;
				}
				async.series(depthTasks, function (err) {
					if (err) {
						taskCallback(err);
						return;
					}
					taskCallback();
				});
			}
		], function (err) {
			if (err) {
				callback(err);
				return;
			}
			callback(null);
		});
	};
	this.getMarketDepthFromCex = function (symbolB, ID, coinPrice, callback) {
		cexApi.getOrderBook(ID, function (err, response) {
			try {
				if (err || !response.result) {
					callback(err);
					return;
				}
				var depth = new Number(0);
				var totalQty = new Number(0);
				response.result.BuyOrders.forEach(function (order) {
					//console.error('Bitrex result ' + JSON.stringify(response));
					var price = new Number(order.Price);
					var limit = new Number(coinPrice * portalConfig.profitSwitch.depth);
					var qty = new Number(order.Quantity);
					// only measure the depth down to configured depth
					if (price >= limit) {
						depth += (qty * price);
						totalQty += qty;
					}
				});
				var marketData = profitStatus[symbolToAlgorithmMap[symbolB]][symbolB].exchangeInfo['Cex'];
				marketData['BTC'].depth = depth;
				if (totalQty > 0)
					marketData['BTC'].weightedBid = new Number(depth / totalQty);
				callback();
			} catch (err) {
				logger.info(logSystem, 'CALC', 'Cex fucked up getOrderBook ' + err);
			}
		});
	};

	/* 
		Get Coind Info
	*/
	this.getCoindDaemonInfo = function (callback) {
		var daemonTasks = [];
		Object.keys(profitStatus).forEach(function (algo) {
			Object.keys(profitStatus[algo]).forEach(function (symbol) {
				var coinName = profitStatus[algo][symbol].name;
				var poolConfig = poolConfigs[coinName];
				var daemonConfig = poolConfig.paymentProcessing.daemon;
				daemonTasks.push(function (callback) {
					_this.getDaemonInfoForCoin(symbol, daemonConfig, callback)
				});
			});
		});

		if (daemonTasks.length == 0) {
			callback();
			return;
		}
		async.series(daemonTasks, function (err) {
			if (err) {
				callback(err);
				return;
			}
			callback(null);
		});
	};
	this.getDaemonInfoForCoin = function (symbol, cfg, callback) {
		var daemon = new Stratum.daemon.interface([cfg], function (severity, message) {
			logger[severity](logSystem, symbol, message);
			callback(null); // fail gracefully for each coin
		});

		daemon.cmd('getblocktemplate', [], function (result) {
			if (result[0].error != null) {
				logger.error(logSystem, symbol, 'Error while reading daemon info: ' + JSON.stringify(result[0]));
				callback(null); // fail gracefully for each coin
				return;
			}
			var coinStatus = profitStatus[symbolToAlgorithmMap[symbol]][symbol];
			var response = result[0].response;

			// some shitcoins dont provide target, only bits, so we need to deal with both
			var target = response.target ? bignum(response.target, 16) : util.bignumFromBitsHex(response.bits);
			coinStatus.difficulty = parseFloat((diff1 / target.toNumber()).toFixed(9));
			if (symbol == 'BLA' || symbol == 'bla') {
				logger.debug(logSystem, symbol, 'grr difficulty is ' + coinStatus.difficulty);
				logger.debug(logSystem, symbol, 'grr string is ' + JSON.stringify(response));
			}
			coinStatus.reward = response.coinbasetxn.coinbasevalue / 100000000;
			if (symbol == 'SUPERNET' || symbol == 'supernet') { coinStatus.reward = Math.abs((Math.abs(response.coinbasetxn.fee) / 100000000) + (0.0001)); }
			if (symbol == 'DEX' || symbol == 'dex') { coinStatus.reward = Math.abs(0.001); }
			if (symbol == 'HUSH' || symbol == 'hush') { coinStatus.reward = Math.abs((Math.abs(response.coinbasetxn.fee) / 100000000) + (12.5)); }
			//logger.debug(logSystem, symbol, 'Block reward is ' + coinStatus.reward);
			callback(null);
		});
	};

	/* 
		Get Average Coins per day
	*/
	this.getMiningRate = function (callback) {
		var daemonTasks = [];
		Object.keys(profitStatus).forEach(function (algo) {
			Object.keys(profitStatus[algo]).forEach(function (symbol) {
				var coinStatus = profitStatus[symbolToAlgorithmMap[symbol]][symbol];

				coinStatus.blocksPerHashRatePerDay = 24 / ((coinStatus.difficulty * Math.pow(2, 32)) / ((Math.pow(10, 9) * CurrentkH) * 3600));


				if (symbol == 'KMD' || symbol == 'kmd') { coinStatus.blocksPerHashRatePerDay = Math.abs(coinStatus.blocksPerHashRatePerDay * 0.36); }
				if (symbol == 'SUPERNET' || symbol == 'supernet') {
					var perday = Math.abs(24 / ((coinStatus.difficulty * Math.pow(2, 32)) / ((Math.pow(10, 9) * CurrentASSETkH) * 3600)))
					coinStatus.blocksPerHashRatePerDay = Math.abs(perday - (perday * 0.16));
				}
				//logger.debug(logSystem, symbol, 'Blocks per day is ' + coinStatus.blocksPerHashRatePerDay);

				coinStatus.coinsPerHashRatePerDay = Math.abs((coinStatus.reward * coinStatus.blocksPerHashRatePerDay));
				//logger.debug(logSystem, symbol, 'Coinage per day is ' + coinStatus.coinsPerHashRatePerDay);
			});
		});
		callback(null);
	};

	/* 
		Calculate and switch
	*/
	this.switchToMostProfitableCoins = function () {
		Object.keys(profitStatus).forEach(function (algo) {
			var algoStatus = profitStatus[algo];

			var bestExchange;
			var bestCoin;
			var bestBtcPerHashRatePerDay = 0;

			Object.keys(profitStatus[algo]).forEach(function (symbol) {
				var coinStatus = profitStatus[algo][symbol];
				var mineStatus = profitStatus[algo][symbol];
				Object.keys(coinStatus.exchangeInfo).forEach(function (exchange) {
					var exchangeData = coinStatus.exchangeInfo[exchange];
					//logger.error(logSystem, 'CALC', JSON.stringify(coinStatus));
					if (exchangeData.hasOwnProperty('BTC') && exchangeData['BTC'].hasOwnProperty('weightedBid')) {

						var btcPerHashRatePerDay = exchangeData['BTC'].weightedBid * coinStatus.coinsPerHashRatePerDay;

						if (btcPerHashRatePerDay > bestBtcPerHashRatePerDay) {
							bestBtcPerHashRatePerDay = btcPerHashRatePerDay;
							bestExchange = exchange;
							bestCoin = profitStatus[algo][symbol].name;
						}
						coinStatus.btcPerHashRatePerDay = btcPerHashRatePerDay;
						//logger.error(logSystem, 'CALC', 'BTC/' + symbol + ' on ' + exchange + '\t' + coinStatus.btcPerHashRatePerDay.toFixed(8) + ' BTC/day\t' + (coinStatus.btcPerHashRatePerDay.toFixed(8)/Math.round(mineStatus.coinsPerHashRatePerDay)).toFixed(8) + ' BTC p/coin\t Mining average of ' + addCommas(Math.round(mineStatus.coinsPerHashRatePerDay)) + ' coins per day\t\t at ' + CurrentkH + 'kH/s');
					}
				});
			});
			logger.warning(logSystem, 'RESULT', 'Best coin is ' + bestCoin + ' on ' + bestExchange + ' with ' + bestBtcPerHashRatePerDay.toFixed(8) + ' BTC/day');

			var client = net.connect(portalConfig.cliPort, function () {
				client.write(JSON.stringify({
					command: 'coinswitch',
					params: [bestCoin],
					options: { algorithm: algo }
				}) + '\n');
			}).on('error', function (error) {
				if (error.code === 'ECONNREFUSED')
					logger.error(logSystem, 'CLI', 'Could not connect to NOMP instance on port ' + portalConfig.cliPort);
				else
					logger.error(logSystem, 'CLI', 'Socket error ' + JSON.stringify(error));
			});
		});
	};
};