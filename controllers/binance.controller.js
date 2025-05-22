// import package
import mongoose from "mongoose";
import lodash from "lodash";
import axios from "axios";

// import config
import config from "../config";
import { binanceApiNode } from "../config/binance";
import { socketEmitAll, socketEmitOne } from "../config/socketIO";
import { binOrderTask } from "../config/cron";
import { passbook } from "../grpc/walletService";
// import controller
import {
  newOrderHistory,
  FetchpairData,
  newTradeHistory,
  getOpenOrderSocket,
  getOrderHistorySocket,
  setDepthBinanceHist,
} from "./spot.controller";

// import model
import { SpotPair, SpotTrade, SpotOrder } from "../models";

// import lib
import isEmpty from "../lib/isEmpty";
import { replacePair } from "../lib/pairHelper";
import { withoutServiceFee, calculateServiceFee } from "../lib/calculation";
import {
  hset,
  hget,
  hgetall,
  hincby,
  hincbyfloat,
  hdel,
  hdetall,
} from "../controllers/redis.controller";
import { toFixed, toFixedDown, truncateDecimals } from "../lib/roundOf";

axios.defaults.baseURL = config.BINANCE_GATE_WAY.API_URL;
axios.defaults.headers.common["X-MBX-APIKEY"] = config.BINANCE_GATE_WAY.API_KEY;
const ObjectId = mongoose.Types.ObjectId;
let partialDepth, markDepth, RecentDepth;
export const spotOrderBookWS = async () => {
  try {
    console.log(partialDepth, "---partialDepth")
    if (partialDepth) {
      partialDepth();
    }
    let getSpotPair = await SpotPair.aggregate([
      {
        $match: { botstatus: "off" }
      },
      {
        $project: {
          _id: 1,
          symbol: {
            $concat: [
              "$firstCurrencySymbol",
              {
                $switch: {
                  branches: [
                    {
                      case: { $eq: ["$secondCurrencySymbol", "USD"] },
                      then: "USDT",
                    },
                  ],
                  default: "$secondCurrencySymbol",
                },
              },
            ],
          },
          level: { $literal: 20 },
          markupPercentage: 1,
        },
      },
    ]);
    console.log(getSpotPair, "------77");

    if (getSpotPair && getSpotPair.length > 0) {
      partialDepth = binanceApiNode.ws.partialDepth(
        getSpotPair,
        async (depth) => {
          if (depth) {
            let pairData = getSpotPair.find((el) => el.symbol == depth.symbol);
            if (pairData) {
              // sell order book
              let sellOrder = [],
                binanceSellOrder = depth.asks;
              for (let sellItem of binanceSellOrder) {
                sellOrder.push({
                  _id: sellItem.price,
                  quantity: parseFloat(sellItem.quantity),
                  filledQuantity: 0,
                });
                // }
              }

              sellOrder = sellOrder.sort(
                (a, b) => parseFloat(a.price) - parseFloat(b.price)
              );

              if (sellOrder.length > 0) {
                let sumAmount = 0;
                for (let i = 0; i < sellOrder.length; i++) {
                  let quantity =
                    parseFloat(sellOrder[i].quantity) -
                    parseFloat(sellOrder[i].filledQuantity);
                  sumAmount = parseFloat(sumAmount) + parseFloat(quantity);
                  sellOrder[i].total = sumAmount;
                  sellOrder[i].quantity = quantity;
                }
              }
              sellOrder = sellOrder;

              // buy order book
              let buyOrder = [],
                binanceBuyOrder = depth.bids;

              for (let buyItem of binanceBuyOrder) {
                buyOrder.push({
                  _id: buyItem.price,
                  quantity: parseFloat(buyItem.quantity),
                  filledQuantity: 0,
                });
                // }
              }

              buyOrder = buyOrder.sort(
                (a, b) => parseFloat(b._id) - parseFloat(a._id)
              );
              if (buyOrder.length > 0) {
                let sumAmount = 0;
                for (let i = 0; i < buyOrder.length; i++) {
                  let quantity =
                    parseFloat(buyOrder[i].quantity) -
                    parseFloat(buyOrder[i].filledQuantity);
                  sumAmount = parseFloat(sumAmount) + parseFloat(quantity);
                  buyOrder[i].total = sumAmount;
                  buyOrder[i].quantity = quantity;
                }
              }
              // socketEmitAll("orderBook", {
              //   timestamp: Date.now(),
              //   symbol: pairData.symbol,
              //   pairId: pairData._id,
              //   sellOrder: sellOrder,
              //   buyOrder: buyOrder,
              // });
              socketEmitOne(
                "orderBook",
                {
                  timestamp: Date.now(),
                  symbol: pairData.symbol,
                  pairId: pairData._id,
                  sellOrder: sellOrder,
                  buyOrder: buyOrder,
                },
                pairData.symbol
              );
            }
          }
        }
      );
    }
  } catch (err) {
    console.log("Error on websocketcall in binanceHelper ", err);
  }
};

export const spotTickerPriceWS = async () => {
  try {
    if (markDepth) {
      markDepth();
    }
    let getSpotPair = await SpotPair.aggregate([
      {
        $match: { botstatus: "off" }
      },
      {
        $group: {
          _id: null,
          symbol: {
            $push: {
              $concat: [
                "$firstCurrencySymbol",
                {
                  $switch: {
                    branches: [
                      {
                        case: { $eq: ["$secondCurrencySymbol", "USD"] },
                        then: "USDT",
                      },
                    ],
                    default: "$secondCurrencySymbol",
                  },
                },
              ],
            },
          },
          pairData: {
            $push: {
              pairId: "$_id",
              symbol: {
                $concat: [
                  "$firstCurrencySymbol",
                  {
                    $switch: {
                      branches: [
                        {
                          case: { $eq: ["$secondCurrencySymbol", "USD"] },
                          then: "USDT",
                        },
                      ],
                      default: "$secondCurrencySymbol",
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ]);
    if (
      getSpotPair &&
      getSpotPair.length > 0 &&
      getSpotPair[0].symbol &&
      getSpotPair[0].symbol.length > 0
    ) {
      markDepth = binanceApiNode.ws.ticker(
        getSpotPair[0].symbol,
        async (tickerdata) => {
          let pairData = getSpotPair[0].pairData.find(
            (el) => el.symbol == tickerdata.symbol
          );
          if (pairData) {
            let updateSpotPair = await SpotPair.findOneAndUpdate(
              {
                _id: pairData.pairId,
              },
              {
                low: tickerdata.low,
                high: tickerdata.high,
                changePrice: tickerdata.priceChange,
                change: tickerdata.priceChangePercent,
                firstVolume: tickerdata.volume,
                secondVolume: tickerdata.volumeQuote,
                last: tickerdata.bestBid,
                markPrice: tickerdata.bestBid,
                last_ask: tickerdata.bestAsk,
                last_bid: tickerdata.bestBid,
              },
              {
                new: true,
                fields: {
                  last: 1,
                  markPrice: 1,
                  low: 1,
                  high: 1,
                  firstVolume: 1,
                  secondVolume: 1,
                  changePrice: 1,
                  change: 1,
                  botstatus: 1,
                  secondCurrencySymbol: 1,
                  firstCurrencySymbol: 1
                },
              }
            ).lean();
            // updateSpotPair = updateSpotPair.toJSON()
            let pairDoc = await hget(
              "spotPairdata",
              updateSpotPair._id.toString()
            );
            if (!isEmpty(pairDoc)) {
              pairDoc = await JSON.parse(pairDoc);
              pairDoc["last"] = updateSpotPair.last;
              pairDoc["markPrice"] = updateSpotPair.markPrice;
              pairDoc["low"] = updateSpotPair.low;
              pairDoc["high"] = updateSpotPair.high;
              pairDoc["firstVolume"] = updateSpotPair.firstVolume;
              pairDoc["secondVolume"] = updateSpotPair.secondVolume;
              pairDoc["changePrice"] = updateSpotPair.changePrice;
              pairDoc["change"] = updateSpotPair.change;
              await hset(
                "spotPairdata",
                updateSpotPair._id.toString(),
                pairDoc
              );
            }
            socketEmitOne(
              "marketPrice",
              {
                pairId: pairData.pairId,
                data: updateSpotPair,
              },
              "spot"
            );
            await hset(
              "spot24hrsChange",
              updateSpotPair._id.toString(),
              updateSpotPair
            );
            // triggerStopLimitOrder(updateSpotPair);
            // trailingStopOrder(updateSpotPair);
          }
        }
      );
    }
  } catch (err) {
    console.log("Error on ticker binance ", err);
  }
};

/**
 * Account Info
 */
export const accountInfo = async () => {
  try {
    let accountInfo = await binanceApiNode.accountInfo();

    if (accountInfo) {
      return {
        status: true,
        data: accountInfo,
      };
    }
    return {
      status: false,
    };
  } catch (err) {
    console.log("bianceaccountInfoaccountInfoerrrrrrrrrrrrrr", err);
    return {
      status: false,
    };
  }
};

/**
 * Balance Info
 * BODY : currencySymbol
 */
export const balanceInfo = async ({ currencySymbol }) => {
  try {
    let info = await accountInfo();
    if (!info.status) {
      return {
        status: false,
      };
    }

    let currencyBalance = info.data.balances.find(
      (el) => el.asset == currencySymbol
    );
    console.log("-------currencyBalance", currencyBalance);
    if (!currencyBalance) {
      return {
        status: false,
      };
    }
    return {
      status: true,
      data: currencyBalance,
    };
  } catch (err) {
    console.log("-------bainaceacccoutnerrr", err);
    return {
      status: false,
    };
  }
};
// balanceInfo({ currencySymbol: "BTC" });
// balanceInfo({ currencySymbol: "USDT" });
/**
 * Check Currency Balance
 * BODY : firstCurrency, secondCurrency, buyorsell, price, quantity
 */
export const checkBalance = async ({
  firstCurrencySymbol,
  secondCurrencySymbol,
  buyorsell,
  price,
  quantity,
  Market_orderValue,
  side,
}) => {
  try {
    let currencySymbol, orderValue;
    if (side == "limit") {
      price = parseFloat(price);
      quantity = parseFloat(quantity);
      if (buyorsell == "buy") {
        orderValue = price * quantity;
      } else if (buyorsell == "sell") {
        orderValue = quantity;
      }
    } else {
      orderValue = Market_orderValue;
    }

    currencySymbol =
      buyorsell == "buy" ? secondCurrencySymbol : firstCurrencySymbol;
    let balanceData = await balanceInfo({ currencySymbol });
    if (!balanceData.status) {
      return {
        status: false,
      };
    }
    console.log(
      "checkBalancecheckBalance",
      balanceData,
      orderValue,
      price,
      quantity,
      Market_orderValue
    );
    if (parseFloat(balanceData.data.free) > orderValue) {
      return {
        status: true,
      };
    } else {
      return {
        status: false,
      };
    }
  } catch (err) {
    console.log("bianacecheckBalancecheckBalance", err);
    return {
      status: false,
    };
  }
};

/**
 * Binance Order Place
 * firstCoin, secondCoin, side, price, quantity, orderType (limit, market, stop_limit, stop_market), markupPercentage, minimumValue, stopPrice, markPrice
 */
export const orderPlace = async (reqBody, pairData) => {
  try {
    console.log("reqBody: ", reqBody);
    // const checkBinanceBalance = await checkBalance({
    //   firstCurrencySymbol: reqBody.firstCurrency,
    //   secondCurrencySymbol: replacePair(reqBody.secondCurrency),
    //   buyorsell: reqBody.buyorsell,
    //   price: reqBody.price,
    //   quantity: reqBody.quantity,
    //   Market_orderValue:
    //     reqBody.buyorsell == "buy" ? reqBody.orderValue : reqBody.amount,
    //   side: reqBody.orderType,
    // });

    // if (!checkBinanceBalance.status) {
    //   return {
    //     status: false,
    //   };
    // }

    if (reqBody.orderType == "limit") {
      return await limitOrderPlace({
        price: reqBody.price,
        quantity: reqBody.quantity,
        buyorsell: reqBody.buyorsell,
        markupPercentage: pairData.markupPercentage,
        minimumValue: pairData.minQuantity,
        firstCurrencySymbol: reqBody.firstCurrency,
        secondCurrencySymbol: reqBody.secondCurrency,
        OrderDetails: reqBody,
      });
    } else if (reqBody.orderType == "market") {
      return await marketOrderPlace(reqBody, pairData);
    } else if (reqBody.orderType == "stop_limit") {
      return await stopLimitOrderPlace({
        price: reqBody.price,
        stopPrice: reqBody.stopPrice,
        quantity: reqBody.quantity,
        buyorsell: reqBody.buyorsell,
        markupPercentage: reqBody.markupPercentage,
        minimumValue: reqBody.minimumValue,
        firstCurrencySymbol: reqBody.firstCurrency,
        secondCurrencySymbol: reqBody.secondCurrency,
        markPrice: reqBody.markPrice,
      });
    }

    return {
      status: false,
    };
  } catch (err) {
    console.log("-----orderrrrrrrrrrrrrrplaceeeeeee", err);
    return {
      status: false,
    };
  }
};

export const limitOrderPlace = async ({
  price,
  quantity,
  buyorsell,
  markupPercentage,
  minimumValue,
  firstCurrencySymbol,
  secondCurrencySymbol,
  OrderDetails,
}) => {
  try {
    price = parseFloat(price);
    quantity = parseFloat(quantity);

    let withMarkupPrice;

    if (buyorsell == "buy") {
      withMarkupPrice = calculateMarkup(price, markupPercentage, "-");
    } else if (buyorsell == "sell") {
      withMarkupPrice = calculateMarkup(price, markupPercentage, "+");
    }

    let orderValue = quantity * withMarkupPrice;
    console.log(
      "lkimttttttttttttttttt",
      orderValue,
      quantity,
      withMarkupPrice,
      minimumValue
    );
    if (orderValue) {
      let orderOption = {
        symbol: firstCurrencySymbol + secondCurrencySymbol,
        side: buyorsell.toUpperCase(),
        type: "LIMIT",
        quantity: quantity,
        price: toFixed(withMarkupPrice, OrderDetails.secondFloatDigit),
      };

      let neworder = await binanceApiNode.order(orderOption);
      console.log("binanceApiNodelimitorder errrrrrrrrrrr", neworder);

      if (!neworder) {
        return {
          status: false,
        };
      }

      return {
        status: true,
        data: {
          orderId: neworder.orderId,
          status: neworder.status,
          executedQty: neworder.executedQty,
          origQty: neworder.origQty,
        },
      };
    } else {
      return {
        status: false,
      };
    }
  } catch (err) {
    console.log("OrderDetailsOrderDetailsOrderDetails", err);
    return {
      status: false,
    };
  }
};

export const marketOrderPlace = async (OrderDetails, pairData) => {
  try {
    console.log("---------------market entry-------------------------");
    console.log("OrderDetails: ", OrderDetails);
    let buyorsell = OrderDetails.buyorsell,
      firstCurrencySymbol = OrderDetails.firstCurrency,
      secondCurrencySymbol = OrderDetails.secondCurrency;

    // price = parseFloat(price);
    // quantity = parseFloat(quantity);

    // let withMarkupPrice;

    // if (buyorsell == "buy") {
    //   withMarkupPrice = calculateMarkup(price, markupPercentage, "-");
    // } else if (buyorsell == "sell") {
    //   withMarkupPrice = calculateMarkup(price, markupPercentage, "+");
    // }

    // let orderValue = quantity * withMarkupPrice;

    // if (orderValue >= minimumValue) {
    let cost = OrderDetails.buyorsell == "buy" ? "quoteOrderQty" : "quantity";

    let orderOption = {
      symbol: firstCurrencySymbol + secondCurrencySymbol,
      side: buyorsell.toUpperCase(),
      type: "MARKET",
      [cost]:
        OrderDetails.buyorsell == "buy"
          ? toFixed(OrderDetails.orderValue, OrderDetails.secondFloatDigit)
          : toFixed(OrderDetails.amount, OrderDetails.firstFloatDigit),
    };
    console.log("----------orderOption", orderOption);
    let binOrder = await binanceApiNode.order(orderOption);
    console.log("binOrder: ", binOrder);
    console.log("neworderneworderneworderneworder", binOrder);
    if (isEmpty(binOrder.status)) {
      return {
        status: false,
      };
    }

    OrderDetails.liquidityId = binOrder.orderId;
    OrderDetails.liquidityType = "binance";
    OrderDetails.isLiquidity = true;

    if (binOrder.status == "FILLED") {
      let binFill = binOrder;
      let uniqueId = Math.floor(Math.random() * 1000000000);
      let Biancerice = parseFloat(binFill.fills[0].price),
        binanceExecqudedQuantity = parseFloat(binFill.executedQty);
      let updateBal = 0;

      let markupPrice, markupQty;
      if (OrderDetails.buyorsell == "buy") {
        markupPrice = liquidityMarkup(
          Biancerice,
          pairData.markupPercentage,
          "+"
        );
        let BinOrderMarkPrice = markupPrice * binanceExecqudedQuantity;
        if (
          parseFloat(OrderDetails.orderValue) > parseFloat(BinOrderMarkPrice)
        ) {
          let retriveBal =
            parseFloat(OrderDetails.orderValue) - parseFloat(BinOrderMarkPrice);
          let updateBal = await hincbyfloat(
            "walletbalance_spot",
            OrderDetails.userId.toString() +
            "_" +
            OrderDetails.secondCurrencyId.toString(),
            retriveBal
          );
          passbook({
            userId: OrderDetails.userId,
            coin: OrderDetails.secondCurrency,
            currencyId: OrderDetails.secondCurrencyId,
            tableId: OrderDetails._id,
            beforeBalance: parseFloat(updateBal) - retriveBal,
            afterBalance: parseFloat(updateBal),
            amount: retriveBal,
            type: "spot_MarketOrder_Binance_exec_balretrive",
            category: "credit",
          });
        }
        markupQty = (markupPrice * binanceExecqudedQuantity) / markupPrice;
        console.log("markupQty: ", markupQty);
        console.log("markupPrice: ", markupPrice);
        console.log("binanceExecqudedQuantity: ", binanceExecqudedQuantity);
        console.log("Biancerice: ", Biancerice);
        console.log(" pairData.taker_fees: ", pairData.taker_fees);
        updateBal = withoutServiceFee({
          price: markupQty,
          serviceFee: pairData.taker_fees,
        });
        console.log("updateBal: ", updateBal);
      } else if (OrderDetails.buyorsell == "sell") {
        markupPrice = liquidityMarkup(
          Biancerice,
          pairData.markupPercentage,
          "-"
        );
        markupQty = binanceExecqudedQuantity;
        updateBal = withoutServiceFee({
          price: markupPrice * binanceExecqudedQuantity,
          serviceFee: pairData.taker_fees,
        });
      }
      let filledFees = calculateServiceFee({
        price:
          OrderDetails.buyorsell == "sell"
            ? markupPrice * binanceExecqudedQuantity
            : markupQty,
        serviceFee: pairData.taker_fees,
      });

      let CoinId =
        OrderDetails.buyorsell == "sell"
          ? OrderDetails.secondCurrencyId.toString()
          : OrderDetails.firstCurrencyId.toString();
      let UserId = OrderDetails.userId.toString();
      let userBalanceUpdate = await hincbyfloat(
        "walletbalance_spot",
        UserId + "_" + CoinId,
        updateBal
      );

      let beforBlance = userBalanceUpdate - updateBal,
        afterBalance = toFixed(parseFloat(userBalanceUpdate), 8),
        coinSymbole =
          OrderDetails.buyorsell == "sell"
            ? OrderDetails.secondCurrency
            : OrderDetails.firstCurrency;

      passbook({
        userId: UserId,
        coin: coinSymbole,
        currencyId: CoinId,
        tableId: OrderDetails._id,
        beforeBalance: beforBlance,
        afterBalance: afterBalance,
        amount: updateBal,
        type: "spot_MarketOrder_Binance_exec",
        category: "credit",
      });
      socketEmitOne(
        "updateTradeAsset",
        {
          currencyId: CoinId,
          spotBal: userBalanceUpdate,
        },
        UserId
      );
      markupQty = toFixedDown(markupQty, OrderDetails.firstFloatDigit);

      OrderDetails.status = "completed";
      OrderDetails.filledQuantity += markupQty;
      OrderDetails.averagePrice += markupPrice * markupQty;
      OrderDetails.price = markupPrice * markupQty;
      await newTradeHistory({
        buyOrderData: OrderDetails.buyorsell == "buy" ? OrderDetails : {},
        sellOrderData: OrderDetails.buyorsell == "sell" ? OrderDetails : {},
        uniqueId: uniqueId,
        execPrice: parseFloat(markupPrice),
        Maker: OrderDetails.buyorsell,
        buyerFee: filledFees,
        sellerFee: filledFees,
        execQuantity: markupQty,
      });
      await newOrderHistory(OrderDetails);
      await hset(
        "orderHistory_" + OrderDetails.userId.toString(),
        OrderDetails._id.toString(),
        OrderDetails
      );

      getOpenOrderSocket(OrderDetails.userId, OrderDetails.pairId);
      getOrderHistorySocket(OrderDetails.userId, OrderDetails.pairId);
      return {
        status: true,
      };
    } else {
      return {
        status: false,
      };
    }
  } catch (err) {
    console.log("Markett order", err);

    return {
      status: false,
    };
  }
};

export const stopLimitOrderPlace = async ({
  price,
  stopPrice,
  quantity,
  buyorsell,
  markupPercentage,
  minimumValue,
  firstCurrencySymbol,
  secondCurrencySymbol,
  markPrice,
}) => {
  try {
    console.log("insdedsadsdsds stop limit");
    price = parseFloat(price);
    quantity = parseFloat(quantity);
    stopPrice = parseFloat(stopPrice);
    markPrice = parseFloat(markPrice);

    let withMarkupPrice;
    let withStopMarkupprice;

    let currentprice = calculateMarkup(markPrice, markupPercentage, "-");

    let type =
      currentprice < stopPrice ? "TAKE_PROFIT_LIMIT" : "STOP_LOSS_LIMIT";

    if (buyorsell == "buy") {
      withMarkupPrice = calculateMarkup(price, markupPercentage, "-");
      withStopMarkupprice = calculateMarkup(stopPrice, markupPercentage, "-");
    } else if (buyorsell == "sell") {
      withMarkupPrice = calculateMarkup(price, markupPercentage, "+");
      withStopMarkupprice = calculateMarkup(stopPrice, markupPercentage, "+");
    }

    let orderValue = quantity * withMarkupPrice;

    if (orderValue >= minimumValue) {
      console.log("Inside the Minimum Valueee");
      let orderOption = {
        symbol: firstCurrencySymbol + secondCurrencySymbol,
        side: buyorsell.toUpperCase(),
        type: type,
        quantity: quantity,
        price: withMarkupPrice.toFixed(4),
        stopPrice: withStopMarkupprice.toFixed(4),
      };

      console.log("orderOptionorderOptionorderOptionorderOption", orderOption);

      let neworder = await binanceApiNode.order(orderOption);

      console.log("neworderneworderneworderneworderneworderneworder", neworder);

      if (!neworder) {
        return {
          status: false,
        };
      }
      return {
        status: true,
        data: {
          orderId: neworder.orderId,
          status: neworder.status,
          executedQty: neworder.executedQty,
          origQty: neworder.origQty,
        },
      };
    } else {
      return {
        status: false,
      };
    }
  } catch (err) {
    console.log("Stoplimiterrorrrrrrrr", err);
    return {
      status: false,
    };
  }
};

export const stopMarketOrderPlace = async ({
  stopPrice,
  quantity,
  buyorsell,
  markupPercentage,
  minimumValue,
  firstCurrencySymbol,
  secondCurrencySymbol,
  markPrice,
}) => {
  try {
    console.log("insdedsadsdsds stop limit");
    quantity = parseFloat(quantity);
    stopPrice = parseFloat(stopPrice);
    markPrice = parseFloat(markPrice);

    let withStopMarkupprice;

    let currentprice = calculateMarkup(markPrice, markupPercentage, "-");

    let type =
      currentprice < stopPrice ? "TAKE_PROFIT_MARKET" : "STOP_LOSS_MARKET";

    if (buyorsell == "buy") {
      withStopMarkupprice = calculateMarkup(stopPrice, markupPercentage, "-");
    } else if (buyorsell == "sell") {
      withStopMarkupprice = calculateMarkup(stopPrice, markupPercentage, "+");
    }

    console.log("Inside the Minimum Valueee");
    let orderOption = {
      symbol: firstCurrencySymbol + secondCurrencySymbol,
      side: buyorsell.toUpperCase(),
      type: type,
      quantity: quantity,
      stopPrice: withStopMarkupprice.toFixed(4),
    };

    console.log(
      "stopMarketOrderPlacestopMarketOrderPlace--before",
      orderOption
    );

    let neworder = await binanceApiNode.order(orderOption);

    console.log("stopMarketOrderPlacestopMarketOrderPlace--after", neworder);

    if (!neworder) {
      return {
        status: false,
      };
    }
    return {
      status: true,
      data: {
        orderId: neworder.orderId,
        status: neworder.status,
        executedQty: neworder.executedQty,
        origQty: neworder.origQty,
      },
    };
  } catch (err) {
    console.log("Stoplimiterrorrrrrrrr", err);
    return {
      status: false,
    };
  }
};

export const calculateMarkup = (price, percentage, type = "+") => {
  price = parseFloat(price);
  percentage = parseFloat(percentage);

  if (!isEmpty(price)) {
    if (type == "+") {
      return price + price * (percentage / 100);
    } else if (type == "-") {
      return price - price * (percentage / 100);
    }
  }
  return 0;
};

/**
 * Cancel Order
 * symbol
 */
export const cancelOrder = async ({ firstCoin, secondCoin, binanceId }) => {
  try {
    console.log(
      "checkOrder.firstCurrencycheckOrder.firstCurrency",
      firstCoin,
      secondCoin,
      binanceId
    );
    let cancelOrder = await binanceApiNode.cancelOrder({
      symbol: firstCoin + secondCoin,
      orderId: binanceId,
    });
    console.log("biancecancelOrdercancelOrderstats", cancelOrder);

    if (cancelOrder) {
      return {
        status: true,
        data: cancelOrder,
      };
    } else {
      return {
        status: false,
      };
    }
  } catch (err) {
    console.log("binancebinancebinancebinancecacenlERRRRRR", err);
    return {
      status: false,
    };
  }
};

/**
 * Get Order Status
 * BODY : pairName, binanceOrderId
 */
export const orderStatus = async ({ pairName, binanceOrderId }) => {
  try {
    var orderstatus = await binanceApiNode.getOrder({
      symbol: pairName,
      orderId: binanceOrderId,
    });
    if (orderstatus) {
      return {
        status: true,
        data: orderstatus,
      };
    } else {
      return {
        status: false,
      };
    }
  } catch (err) {
    return {
      status: false,
    };
  }
};

/**
 * Check Binance Order Status
 */
export const checkStatus = async (req, res) => {
  try {
    let orderData = await SpotTrade.find({
      binType: true,
      status: { $in: ["open", "pending"] },
    });
    if (orderData && orderData.length > 0) {
      for (let item of orderData) {
        if (!isEmpty(item.binorderId)) {
          const orderStatus = await orderStatus({
            pairName: item.firstCurrency + item.secondCurrency,
            binanceOrderId: item.binorderId,
          });

          if (orderStatus.status) {
            respArray.push({
              binanceOrderId: orderStatus.data.orderId,
              binanceStatus: orderStatus.data.status,
              executedQty: orderStatus.data.executedQty,
              origQty: orderStatus.data.origQty,
            });
          }
        }
      }
    }
  } catch (err) { }
};

/**
 * Check Binance Order
 */
binOrderTask.start();
let binCronStart = false;
export const checkOrder = async () => {
  // binOrderTask.stop();
  try {
    if (binCronStart) {
      return false;
    }
    binCronStart = true;
    const orderList = await SpotOrder.find({
      isLiquidity: true,
      liquidityType: "binance",
      status: { $in: ["open", "pending", "conditional"] },
    });
    if (orderList && orderList.length > 0) {
      for (let orderData of orderList) {
        console.log("orderData: ", orderData);
        let binOrder = await orderStatus({
          pairName: orderData.firstCurrency + orderData.secondCurrency,
          binanceOrderId: parseFloat(orderData.liquidityId),
        });
        console.log("binOrder: ", binOrder);
        if (binOrder.status) {
          let pairData = await FetchpairData(orderData.pairId);
          let binData = binOrder.data;

          if (pairData && binOrder.data.status == "PARTIALLY_FILLED") {
            let uniqueId = Math.floor(Math.random() * 1000000000);
            let filledQty = Math.abs(
              orderData.filledQuantity + parseFloat(binData.executedQty)
            );

            orderData.filledQuantity = filledQty;
            orderData.averagePrice += orderData.price * filledQty;
            let inOrderVal =
              orderData.buyorsell == "sell"
                ? orderData.filledQuantity
                : orderData.price * orderData.filledQuantity;
            let inOrderCoinID =
              orderData.buyorsell == "sell"
                ? orderData.firstCurrencyId.toString()
                : orderData.secondCurrencyId.toString();
            let inOrder = await hincbyfloat(
              "walletbalance_spot_inOrder",
              UserId + "_" + inOrderCoinID,
              -inOrderVal
            );
            let balanceUpdate =
              orderData.buyorsell == "sell"
                ? orderData.price * binData.executedQty
                : binData.executedQty;
            let balanceUpdatewithoutServiceFee = withoutServiceFee({
              price: balanceUpdate,
              serviceFee: pairData.taker_fees,
            });
            //wallet
            let CoinId =
              orderData.buyorsell == "sell"
                ? orderData.secondCurrencyId.toString()
                : orderData.firstCurrencyId.toString();
            let UserId = orderData.userId.toString();
            let userBalanceUpdate = await hincbyfloat(
              "walletbalance_spot",
              UserId + "_" + CoinId,
              balanceUpdatewithoutServiceFee
            );
            let beforBlance =
              userBalanceUpdate - balanceUpdatewithoutServiceFee,
              afterBalance = userBalanceUpdate;
            passbook({
              userId: UserId,
              coin:
                orderData.buyorsell == "sell"
                  ? orderData.secondCurrency
                  : orderData.firstCurrency,
              currencyId: CoinId,
              tableId: orderData._id,
              beforeBalance: beforBlance,
              afterBalance: afterBalance,
              amount: balanceUpdatewithoutServiceFee,
              type: "spot_OrderMatch_Binance_exec",
              category: "credit",
            });
            socketEmitOne(
              "updateTradeAsset",
              {
                currencyId: CoinId,
                spotBal: userBalanceUpdate,
                inOrder,
              },
              UserId
            );
            await newOrderHistory(orderData);
            getOpenOrderSocket(orderData.userId, orderData.pairId);
            getOrderHistorySocket(orderData.userId, orderData.pairId);
          } else if (pairData && binOrder.data.status == "FILLED") {
            let uniqueId = Math.floor(Math.random() * 1000000000);
            let filledQty = Math.abs(
              orderData.filledQuantity + parseFloat(binData.executedQty)
            );

            orderData.status = "completed";
            orderData.filledQuantity = filledQty;
            orderData.averagePrice += orderData.price * binData.executedQty;

            let balanceUpdate =
              orderData.buyorsell == "sell"
                ? orderData.price * binData.executedQty
                : binData.executedQty;
            let balanceUpdatewithoutServiceFee = withoutServiceFee({
              price: balanceUpdate,
              serviceFee: pairData.taker_fees,
            });
            //wallet
            let inOrderVal =
              orderData.buyorsell == "sell"
                ? orderData.filledQuantity
                : orderData.price * orderData.filledQuantity;
            let inOrderCoinID =
              orderData.buyorsell == "sell"
                ? orderData.firstCurrencyId.toString()
                : orderData.secondCurrencyId.toString();
            let inOrder = await hincbyfloat(
              "walletbalance_spot_inOrder",
              UserId + "_" + inOrderCoinID,
              -inOrderVal
            );
            let CoinId =
              orderData.buyorsell == "sell"
                ? orderData.secondCurrencyId.toString()
                : orderData.firstCurrencyId.toString();
            let UserId = orderData.userId.toString();
            let userBalanceUpdate = await hincbyfloat(
              "walletbalance_spot",
              UserId + "_" + CoinId,
              balanceUpdatewithoutServiceFee
            );
            let beforBlance =
              userBalanceUpdate - balanceUpdatewithoutServiceFee,
              afterBalance = userBalanceUpdate;
            passbook({
              userId: UserId,
              coin:
                orderData.buyorsell == "sell"
                  ? orderData.secondCurrency
                  : orderData.firstCurrency,
              currencyId: CoinId,
              tableId: orderData._id,
              beforeBalance: beforBlance,
              afterBalance: afterBalance,
              amount: balanceUpdatewithoutServiceFee,
              type: "spot_OrderMatch_Binance_exec",
              category: "credit",
            });
            socketEmitOne(
              "updateTradeAsset",
              {
                currencyId: CoinId,
                spotBal: userBalanceUpdate,
                inOrder,
              },
              UserId
            );

            //saveOrder

            let tradeFee = calculateServiceFee({
              price:
                orderData.buyorsell == "sell"
                  ? orderData.price * binData.executedQty
                  : binData.executedQty,
              serviceFee: pairData.taker_fees,
            });
            console.log("bianceFILLLER", filledQty, orderData.price);
            newTradeHistory({
              buyOrderData: orderData.buyorsell == "buy" ? orderData : {},
              sellOrderData: orderData.buyorsell == "sell" ? orderData : {},
              uniqueId: uniqueId,
              execPrice: orderData.price,
              Maker: orderData.buyorsell,
              buyerFee: tradeFee,
              sellerFee: tradeFee,
              execQuantity: binData.executedQty,
              ordertype: "Binance",
            });
            orderData.orderDate = new Date(orderData.orderDate).getTime();
            await hset(
              "orderHistory_" + orderData.userId.toString(),
              orderData._id.toString(),
              orderData
            );
            // getOpenOrderSocket(current_buy.userId, current_buy, 'del');
            await hdel(
              `${orderData.buyorsell}OpenOrders_` + orderData.pairId.toString(),
              orderData._id.toString()
            );
            await newOrderHistory(orderData);
            getOpenOrderSocket(orderData.userId, orderData.pairId);
            getOrderHistorySocket(orderData.userId, orderData.pairId);
          } else if (pairData && binOrder.data.status == "CANCELED") {
            let filledQty = Math.abs(
              orderData.openQuantity - parseFloat(orderData.filledQuantity)
            );

            orderData.status = "cancel";
            let balanceUpdate =
              orderData.buyorsell == "buy"
                ? orderData.price * filledQty
                : filledQty;

            //wallet
            let CoinId =
              orderData.buyorsell == "buy"
                ? orderData.secondCurrencyId.toString()
                : orderData.firstCurrencyId.toString();
            let UserId = orderData.userId.toString();
            let userBalanceUpdate = await hincbyfloat(
              "walletbalance_spot",
              UserId + "_" + CoinId,
              balanceUpdate
            );
            let inOrder = await hincbyfloat(
              "walletbalance_spot_inOrder",
              UserId + "_" + CoinId,
              -balanceUpdate
            );
            let beforBlance = userBalanceUpdate - balanceUpdate,
              afterBalance = userBalanceUpdate;
            passbook({
              userId: UserId,
              coin:
                orderData.buyorsell == "buy"
                  ? orderData.secondCurrency
                  : orderData.firstCurrency,
              currencyId: CoinId,
              tableId: orderData._id,
              beforeBalance: beforBlance,
              afterBalance: afterBalance,
              amount: balanceUpdate,
              type: "spot_OrderMatch_Binance_Cancel",
              category: "debit",
            });
            socketEmitOne(
              "updateTradeAsset",
              {
                currencyId: CoinId,
                spotBal: userBalanceUpdate,
                inOrder,
              },
              orderData.userId
            );
            orderData.orderDate = new Date(orderData.orderDate).getTime();
            //saveOrder
            await hset(
              "orderHistory_" + orderData.userId.toString(),
              orderData._id.toString(),
              orderData
            );

            // getOpenOrderSocket(current_buy.userId, current_buy, 'del');
            await hdel(
              `${orderData.buyorsell}OpenOrders_` + orderData.pairId.toString(),
              orderData._id.toString()
            );
            await newOrderHistory(orderData);
            getOpenOrderSocket(orderData.userId, orderData.pairId);
            getOrderHistorySocket(orderData.userId, orderData.pairId);
          }
        }
      }
    }
    binCronStart = false;
  } catch (err) {
    console.log("------err", err);
    binCronStart = false;
  }
};

/**
 * Recent Trade
 */
export const recentTrade = async ({
  firstCurrencySymbol,
  secondCurrencySymbol,
}) => {
  try {
    secondCurrencySymbol = replacePair(secondCurrencySymbol);
    let recentTradeData = await binanceApiNode.trades({
      symbol: firstCurrencySymbol + secondCurrencySymbol,
      limit: 50,
    });
    let recentTrade = [];
    recentTradeData.filter((el) => {
      recentTrade.push({
        createdAt: new Date(el.time),
        Type: el.isBuyerMaker ? "buy" : "sell",
        tradePrice: el.price,
        tradeQty: el.qty,
      });
    });

    return recentTrade;
  } catch (err) {
    console.log("err: ", err);
    console.log("\x1b[31m", "Error on binance trade list");
    return [];
  }
};

export const getSpotPair = async () => {
  try {
    let pairLists = await SpotPair.find(
      { botstatus: "off" },
      {
        firstCurrencySymbol: 1,
        secondCurrencySymbol: 1,
      }
    );
    if (pairLists && pairLists.length > 0) {
      recentTradeWS(pairLists);
    }
    return true;
  } catch (err) {
    return false;
  }
};

export const recentTradeWS = async (pairList) => {
  try {
    if (RecentDepth) {
      RecentDepth();
    }
    console.log(pairList, "---------1412");
    let symbolList = lodash.map(pairList, (item) => {
      return item.firstCurrencySymbol + replacePair(item.secondCurrencySymbol);
    });

    if (symbolList && symbolList.length > 0) {
      RecentDepth = binanceApiNode.ws.trades(symbolList, async (trade) => {
        if (trade) {
          let pairData = pairList.find(
            (el) =>
              el.firstCurrencySymbol + replacePair(el.secondCurrencySymbol) ==
              trade.symbol
          );
          let recentTrade = [
            {
              createdAt: new Date(trade.tradeTime),
              Type: trade.isBuyerMaker ? "buy" : "sell",
              tradePrice: trade.price,
              tradeQty: trade.quantity,
            },
          ];
          setDepthBinanceHist(
            {
              PairId: pairData._id,
              tradePrice: trade.price,
              tradeQty: trade.quantity,
            },
            trade.isBuyerMaker ? "buy" : "sell"
          );
          let pair =
            pairData.firstCurrencySymbol + pairData.secondCurrencySymbol;
          socketEmitOne(
            "recentTrade",
            {
              pairId: pairData._id,
              data: recentTrade,
            },
            pair
          );
        }
      });
    }
  } catch (err) {
    console.log(err, "Error on recentTradeWS");
  }
};

// Initial Function Call
getSpotPair();
spotOrderBookWS();
spotTickerPriceWS();

export const liquidityMarkup = (price, percentage, type = "+") => {
  price = parseFloat(price);
  percentage = parseFloat(percentage);

  if (!isEmpty(price)) {
    if (type == "+") {
      return price + price * (percentage / 100);
    } else if (type == "-") {
      return price - price * (percentage / 100);
    }
  }
  return 0;
};
