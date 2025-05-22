// ANtttttttttttttttttttttt price socket update marketprice
import mongoose from "mongoose";
import axios from "axios";
import lodash from "lodash";
// import model
import { SpotPair, SpotTrade, SpotOrder,WazarixRecentTrade } from "../models";
import isEmpty from "../lib/isEmpty";
import { replacePair } from "../lib/pairHelper";
import { toFixed,truncateDecimals } from "../lib/roundOf";
//import config
import config from "../config";
import { warazixApi, warazix_get_allOrder } from "../config/cron";
import { socketEmitAll, socketEmitOne } from "../config/socketIO";
import { withoutServiceFee, calculateServiceFee } from "../lib/calculation";
import moment from "moment";
import { passbook } from "../grpc/walletService";
const baseurl = "https://public.coindcx.com";
const apiurl = "https://api.coindcx.com";
// import controller
import {
  triggerStopLimitOrder,
  trailingStopOrder,
  assetUpdate,
  newOrderHistory,
  FetchpairData,
  newTradeHistory,
  getOpenOrderSocket,
  getOrderHistorySocket,
} from "./spot.controller";
import {
  hset,
  hget,
  hgetall,
  hincby,
  hincbyfloat,
  hdel,
  hdetall,
} from "../controllers/redis.controller";
const WebSocket = require("ws");
const ObjectId = mongoose.Types.ObjectId;
var crypto = require("crypto");
const qs = require("qs");

// warazixApi.start();

export const spotPriceTicker = async (tikerRoot = "", status = "") => {
  // warazixApi.stop();
  try {
    if (tikerRoot) {
      if (status == "disable") {
        // wazirx sockets disconnect
        if (global[`wazirxOrderBookWs${tikerRoot}`])
          await global[`wazirxOrderBookWs${tikerRoot}`].onclose(tikerRoot);
        if (global[`wazirxRecentTradeWs${tikerRoot}`])
          await global[`wazirxRecentTradeWs${tikerRoot}`].onclose(tikerRoot);
      } else {
        if (!global[`wazirxOrderBookWs${tikerRoot}`]) {
          tikerRoot = tikerRoot.toUpperCase();
          let pair = await SpotPair.findOne(
            { botstatus: "wazirx", tikerRoot },
            { tikerRoot: 1, markupPercentage: 1 }
          ).lean();
          getorderBook(
            pair.tikerRoot.toLowerCase(),
            pair,
            pair.markupPercentage
          );
          recentTradeWS(
            pair.tikerRoot.toLowerCase(),
            pair._id,
            pair.markupPercentage
          );
        }
      }
    } else {
      if (!global["wazirxTickerPriceWs"]) spotTickerPriceWS();

      let getSpotPair = await SpotPair.find(
        { botstatus: "wazirx" },
        { tikerRoot: 1, markupPercentage: 1 }
      );
      getSpotPair.forEach(async (data, i) => {
        if (!global[`wazirxOrderBookWs${data.tikerRoot}`])
          getorderBook(
            data.tikerRoot.toLowerCase(),
            data,
            data.markupPercentage
          );
        if (!global[`wazirxRecentTradeWs${data.tikerRoot}`])
          recentTradeWS(
            data.tikerRoot.toLowerCase(),
            data._id,
            data.markupPercentage
          );
      });
    }
    // warazixApi.start();
  } catch (err) {
    console.log("spotPriceTicker Err : ", err);
    // warazixApi.start();
  }
};

const spotTickerPriceWS = async () => {
  try {
    try {
      return 
      let socket = new WebSocket("wss://stream.wazirx.com/stream");

      socket.onopen = function (e) {
        let data = { event: "subscribe", streams: ["!ticker@arr"] };
        socket.send(JSON.stringify(data));
      };

      socket.onclose = function () {
        delete global["wazirxTickerPriceWs"];
        let data = { event: "unsubscribe", streams: ["!ticker@arr"] };
        socket.send(JSON.stringify(data));
      };

      socket.onmessage = async function (event) {
        try {
          let res = JSON.parse(event.data);
          if (res.data.length > 0) {
            for (var i = 0; i < res.data.length; i++) {
              let pairExist = await SpotPair.exists({
                tikerRoot: res.data[i].s.toUpperCase(),
                botstatus: "wazirx",
              });

              if (pairExist) {
                var openPrice = parseFloat(res.data[i].o);
                var closePrice = parseFloat(res.data[i].l);
                var priceDiff = closePrice - openPrice;
                var changePercentage = (priceDiff / openPrice) * 100;

                let updateSpotPair = await SpotPair.findOneAndUpdate(
                  { _id: pairExist._id },
                  {
                    low: toFixed(res.data[i].l, 6),
                    high: toFixed(res.data[i].h, 6),
                    firstVolume: toFixed(res.data[i].q, 6), //1 hours
                    secondVolume: toFixed(res.data[i].q * 24, 6), //24 hours
                    changePrice: toFixed(priceDiff, 6),
                    markPrice: toFixed(res.data[i].c, 6),
                    change: toFixed(changePercentage, 2),
                  },
                  {
                    new: true,
                  }
                );
                hset("spot24hrsChange", pairExist._id.toString(), updateSpotPair);
                socketEmitAll("marketPrice", {
                  pairId: pairExist._id,
                  data: updateSpotPair,
                });
                // triggerStopLimitOrder(updateSpotPair);
              }
            }
          }
        } catch (err) {
          console.log("spot ticker 1", err);
        }
      };

      global["wazirxTickerPriceWs"] = socket;
    } catch (err) {
      console.log("spot ticker 2", err);
    }
  } catch (err) {
    console.log("spot ticker 3", err);
  }
};
/**
 * Recent Trade
 */
export const wazirixRecentTrades = async ({
  firstCurrencySymbol,
  secondCurrencySymbol,
}) => {
  try {
    secondCurrencySymbol = replacePair(secondCurrencySymbol);
    let pair = (firstCurrencySymbol + secondCurrencySymbol)
      .toLowerCase()
      .toString();

    let recentTrade = await WazarixRecentTrade.findOne({pair:pair},{Trade:1})
      return recentTrade.Trade;
    
  } catch (err) {
    console.log("Error on binance trade list", err);
    return [];
  }
};

export const recentTradeWS = async (pair, pairId, markupPercentage) => {
  try {
    // if (symbolList && symbolList.length > 0) {
    let socket = new WebSocket("wss://stream.wazirx.com/stream");

    socket.onopen = function (e) {
      let data = { event: "subscribe", streams: [pair + "@trades"] };
      socket.send(JSON.stringify(data));
    };
    socket.onclose = function (pair) {
      delete global[`wazirxRecentTradeWs${pair}`];
      let data = { event: "unsubscribe", streams: [`${pair}@trades`] };
      socket.send(JSON.stringify(data));
    };

    socket.onmessage = async function (event) {
      let res = JSON.parse(event.data);
      if (res && res.data && res.data.trades) {
        for (let trade of res.data.trades) {
          if (trade) {
            let recentTrade = [
              {
                createdAt: new Date(trade.E),
                Type: trade.m ? "buy" : "sell",
                tradePrice: trade.p,
                tradeQty: trade.q,
              },
            ];
            await WazarixRecentTrade.findOneAndUpdate({pairId:pairId},
              {$push: {"Trade":recentTrade[0]},pair:pair
            },{upsert:true})
            await WazarixRecentTrade.findOneAndUpdate({pairId:pairId,
               $where: "this.Trade.length > 30"} ,
              {$pop: {"Trade":-1}
            })
            socketEmitAll("recentTrade", {
              pairId: pairId,
              data: recentTrade,
            });
          }
        }
      }
    };
    global[`wazirxRecentTradeWs${pair}`] = socket;
    // }
  } catch (err) {
    console.log("Error on recentTradeWS", err);
  }
};

const getorderBook = async (pairName, pairId, markupPercentage) => {
  try {
    const ws = new WebSocket("wss://stream.wazirx.com/stream");

    ws.on("open", function open() {
      let data = {
        event: "subscribe",
        streams: [pairName.toLowerCase() + "@depth"],
      };
      ws.send(JSON.stringify(data));
    });
    ws.onclose = function (pairName) {
      console.log("wazirxOrderBookWswazirxOrderBookWswazirxOrderBookWs",pairName);
      delete global[`wazirxOrderBookWs${pairName}`];
      let data = { event: "unsubscribe", streams: [`${pairName}@depth`] };
      ws.send(JSON.stringify(data));
    };

    ws.on("message", async function incoming(responseData) {
      try {
        if (!isEmpty(responseData)) {
          // console.log(responseData, "--responseData");
          responseData = JSON.parse(responseData);
          if (responseData.stream == pairName.toLowerCase() + "@depth") {
            let wazirxSellOrder =
              responseData && responseData.data && responseData.data.a;
            // console.log(pairName, wazirxSellOrder, "--wazirxSellOrder");
            let sellOrder = [],
              buyOrder = [];
            // let { sellOrder, buyOrder } = await syncpublic_socket(
            //   pairName.toUpperCase()
            // );
            // console.log("socccccccccccc", sellOrder, buyOrder);
            // let sellOrderData = await SpotTrade.aggregate([
            //   {
            //     $match: {
            //       pairId: ObjectId(pairId),
            //       $or: [{ status: "open" }, { status: "pending" }],
            //       buyorsell: "sell",
            //     },
            //   },
            //   {
            //     $group: {
            //       _id: "$price",
            //       quantity: { $sum: "$quantity" },
            //       filledQuantity: { $sum: "$filledQuantity" },
            //     },
            //   },
            //   { $sort: { _id: 1 } },
            //   { $limit: 10 },
            // ]);

            // sellOrder = sellOrderData;

            for (let sellItem of wazirxSellOrder) {
              // let orderData = sellOrder.find(
              //   (x) => x._id === parseFloat(sellItem[0])
              // );
              // if (!orderData) {
              // console.log("iffforderDataorderData")
              sellOrder.push({
                _id: calculateMarkup(sellItem[0], markupPercentage, "+"),
                quantity: parseFloat(sellItem[1]),
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

            sellOrder = sellOrder.reverse();

            let wazirxBuyOrder =
              responseData && responseData.data && responseData.data.b;

            // let buyOrderData = await SpotTrade.aggregate([
            //   {
            //     $match: {
            //       pairId: ObjectId(pairId),
            //       $or: [{ status: "open" }, { status: "pending" }],
            //       buyorsell: "buy",
            //     },
            //   },
            //   {
            //     $group: {
            //       _id: "$price",
            //       quantity: { $sum: "$quantity" },
            //       filledQuantity: { $sum: "$filledQuantity" },
            //     },
            //   },
            //   { $sort: { _id: -1 } },
            //   { $limit: 10 },
            // ]);

            // buyOrder = buyOrderData;
            // console.log("buyOrderbuyOrderbuyOrder",binanceBuyOrder[0])

            for (let buyItem of wazirxBuyOrder) {
              // console.log("buyItembuyItembuyItembuyItem",buyItem,markupPercentage)
              // let orderData = buyOrder.find(
              //   (x) => x._id === parseFloat(buyItem[0])
              // );
              // if (!orderData) {
              buyOrder.push({
                _id: calculateMarkup(buyItem[0], markupPercentage, "-"),
                quantity: parseFloat(buyItem[1]),
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
                // console.log("buyOrderbuyOrderbuyOrder",quantity)
              }
            }

            socketEmitAll("orderBook", {
              pairId: pairId._id,
              sellOrder: sellOrder,
              buyOrder: buyOrder,
            });

            limitToMarketOrderPrice({
              pairId: pairId._id,
              ask: wazirxSellOrder[0],
              bid: wazirxBuyOrder[0],
            });
          }
        }
      } catch (err) {
        console.log(err, "---err");
        console.log("Error on wazirx spotOrderBookWS WebSocket");
      }
    });
    global[`wazirxOrderBookWs${pairName}`] = ws;
  } catch (err) {
    console.log("spotOrderBookWS Err : ", err);
  }
};



export const wazirxServerTime = async () => {
  try {
    let respData = await axios({
      url: `${config.WAZIRIX.API_URL}/sapi/v1/time`,
      method: "get",
    });
   
    if (!isEmpty(respData.data.serverTime)) {
      return respData.data.serverTime;
    }

    return new Date().getTime();
  } catch (err) {
    console.log("wazirxServerTime Err : ", err);
    return new Date().getTime();
  }
};

/**
 * Account Info
 */
export const accountInfo = async (serverTime) => {
  const timeStamp = serverTime;
  let payload = {
    recvWindow: 20000,
    timestamp: timeStamp,
  };

  let signature = createSignature(payload);

  try {
    let resData = await axios({
      url: `${config.WAZIRIX.API_URL}/sapi/v1/funds`,
      method: "get",
      params: {
        recvWindow: 20000,
        timestamp: timeStamp,
        signature: signature,
      },
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=utf-8",
        "X-Api-Key": config.WAZIRIX.API,
      },
    });
    // console.log(resData,'---resData')
    return {
      status: true,
      data: resData.data,
    };
  } catch (err) {
    console.log(err, "---accountInfoaccountInfoaccountInfoerrr");
    return {
      status: false,
      message: "Something went wrong, please try again later.",
    };
  }
};
// accountInfo()
/**
 * Balance Info
 * BODY : currencySymbol
 */
export const balanceInfo = async ({ currencySymbol, serverTime }) => {
  try {
    let info = await accountInfo(serverTime);
    
    if (!info.status) {
      return {
        status: false,
        message: "Something went wrong, please try again later.",
      };
    }

    let currencyBalance = info.data.find((el) => el.asset == currencySymbol);
    // console.log(currencyBalance,'---currencyBalance')
    if (!currencyBalance) {
      return {
        status: false,
        message: "INVALID_CURRENCY",
      };
    }

    return {
      status: true,
      data: currencyBalance,
    };
  } catch (err) {
    console.log(err, "---err");
    return {
      status: false,
      message: "Something went wrong, please try again later.",
    };
  }
};
// balanceInfo({ currencySymbol: "inr" })
// balanceInfo({ currencySymbol: "BNB" })
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
  serverTime,
}) => {
  try {
    let currencySymbol, orderValue;
    price = parseFloat(price);
    quantity = parseFloat(quantity);

    if (buyorsell == "buy") {
      currencySymbol = secondCurrencySymbol;
      orderValue = price * quantity;
    } else if (buyorsell == "sell") {
      currencySymbol = firstCurrencySymbol;
      orderValue = quantity;
    }

    console.log(orderValue, currencySymbol, serverTime, "----orderValue");
    let balanceData = await balanceInfo({
      currencySymbol: currencySymbol.toLowerCase(),
      serverTime: serverTime,
    });
    console.log(balanceData, "----balanceData");
    if (!balanceData.status) {
      return {
        status: false,
        message: balanceData.message,
      };
    }

    if (parseFloat(balanceData.data.free) >= orderValue) {
      return {
        status: true,
      };
    } else {
      return {
        status: false,
        message: "INSUFFICIENT_BALANCE",
      };
    }
  } catch (err) {
    console.log(err, "---err");
    return {
      status: false,
      message: "Something went wrong, please try again later.",
    };
  }
};

export const createSignature = (payload) => {
  try {
    const signature = crypto
      .createHmac("sha256", config.WAZIRIX.SECRET)
      .update(qs.stringify(payload))
      .digest("hex");

    return signature;
  } catch (err) {
    console.log(
      "createSignaturecreateSignaturecreateSignaturecreateSignature",
      err
    );
    return "";
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

export const calculateMarkup1 = (price, percentage, type = "+") => {
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

export const wazirixOrderPlace = async (payloadObj = {}, pairData) => {
  try {
    console.log("wazirixOrderPlacewazirixOrderPlace", payloadObj);
    const api = config.WAZIRIX.API;
    const secret = config.WAZIRIX.SECRET;
    // const serverTimeWa = await axios.get("https://api.wazirx.com/sapi/v1/time");
    // const timeStamp = serverTime.data.serverTime;
    const timeStamp=new Date().getTime();
    console.log("timestamptimestamptimestamp",timeStamp);
    let symbol = (
      payloadObj.firstCurrency + payloadObj.secondCurrency
    ).toLowerCase();
    // const checkWazirxBalance = await checkBalance({
    //   firstCurrencySymbol: payloadObj.firstCurrency,
    //   secondCurrencySymbol: payloadObj.secondCurrency,
    //   buyorsell: payloadObj.buyorsell,
    //   price: payloadObj.price,
    //   quantity: payloadObj.quantity,
    //   serverTime: timeStamp,
    // });
    // if (!checkWazirxBalance.status) {
    //   return {
    //     status: false,
    //     data: checkWazirxBalance.message,
    //   };
    // }

    var sendPrice = 0;
    var payload = {};
    let newOrderPayloadObj = payloadObj;

    if (payloadObj.buyorsell == "buy") {
      sendPrice = calculateMarkup(
        payloadObj.price,
        pairData.markupPercentage,
        "-"
      );
    } else if (payloadObj.buyorsell == "sell") {
      sendPrice = calculateMarkup(
        payloadObj.price,
        pairData.markupPercentage,
        "+"
      );
    }

    if (payloadObj.orderType == "limit") {
      payload = {
        symbol: symbol,
        side: payloadObj.buyorsell,
        type: payloadObj.orderType,
        quantity: payloadObj.quantity,
        price: sendPrice,
        timestamp: timeStamp,
        recvWindow: 50000,
      };
    }

    if (payloadObj.orderType == "marketOrder") {
      payload = {
        symbol: symbol,
        side: payloadObj.side,
        type: "limit",
        quantity: payloadObj.quantity,
        price: payloadObj.price,
        timestamp: timeStamp,
        recvWindow: 50000,
      };
    }

    if (payloadObj.orderType == "stop_limit") {
      payload = {
        symbol: symbol,
        side: payloadObj.side,
        type: payloadObj.type,
        quantity: payloadObj.quantity,
        price: sendPrice,
        stopPrice: payloadObj.stopPrice, //stop price
        timestamp: timeStamp,
        recvWindow: 100000000,
      };
    }

    console.log("signature paylod", payload);
    // var payload = {
    //   symbol: "ltcbtc",
    //   side: "buy",
    //   type: "limit",
    //   quantity: 10,
    //   price: 500,
    //   recvWindow: 50000,
    //   timestamp: timeStamp,
    // };

    var queryString = qs.stringify(payload);
    let signature = crypto
      .createHmac("sha256", secret)
      .update(queryString)
      .digest("hex");
    console.log(" orderplace signature  Signature: ", signature);

    let result = await orderPlacingwrx(
      payload,
      signature,
      timeStamp,
      api,
      newOrderPayloadObj
    ); // orderPlacingwrx ==order placing Wazirix
    console.log("orderPlacingwrxorderPlacingwrx", result);
    if (result)
      return {
        status: result.status,
        data: result.data,
      };
  } catch (err) {
    console.log("...wazirix orderpalce err  errr", err);
    return {
      status: false,
      message: "Something went wrong, please try again later.",
    };
  }
};

const orderPlacingwrx = async (
  payloadObj,
  signature,
  timeStamp,
  api,
  newOrderPayloadObj
) => {
  try {
    console.log(
      "mepauload obje .........",
      payloadObj,
      signature,
      timeStamp,
      api,
      newOrderPayloadObj
    );
    let sendPayload = {};

    if (payloadObj.type == "limit") {
      sendPayload = {
        ...payloadObj,
        ...{ timestamp: timeStamp, signature: signature },
      };
    }
    if (payloadObj.type == "stop_limit") {
      sendPayload = {
        ...payloadObj,
        ...{
          stopPrice: newOrderPayloadObj.stopPrice,
          timestamp: timeStamp,
          signature: signature,
        },
      };
    }

    // console.log(" limit oe stop limit  sendPyload.......payload", sendPayload);

    try {
      console.log("sendpayloaddddddddddddd", qs.stringify(sendPayload));
      const resData = await axios({
        method: "post",
        url: "https://api.wazirx.com/sapi/v1/order/ ",
        data: qs.stringify(sendPayload),
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=utf-8",
          "X-Api-Key": api,
        },
      });

      // console.log("limit response........", Object.keys(resData.data));

      if (Object.keys(resData && resData.data).length > 0) {
        return {
          status: true,
          data: {
            orderId: resData.data.id,
            status: resData.data.status,
          },
        };
      } else {
        return { status: false };
      }
    } catch (error) {
      console.log("orderPlacingwrxorderPlacingwrxerrr", error);
      return {
        status: false,
        message: "Something went wrong, please try again later.",
      };
    }

    // console.log("new order .......placing upate", newOrderUpdate);
  } catch (err) {
    console.log(err, "wazirxOrderPlace ----errr");
    return {
      status: false,
      message: "Something went wrong, please try again later.",
    };
  }
};
// wazirixOrderPlace();
warazix_get_allOrder.start();

export const getAllOrder = async () => {
  try {
    warazix_get_allOrder.stop();
    console.log("warazix_get_allOrderwarazix_get_allOrderwarazix_get_allOrder");
    const spotTradeData = await SpotOrder.find({
      botstatus: "wazirx",
      status: { $in: ["wait", "idle"] },
    });
    console.log("getallorder errrr", spotTradeData);
    spotTradeData &&
      spotTradeData.forEach(async (data, i) => {
        var payloadObj = {
          orderId: data.liquidityId,
        };
        var orderId = data.liquidityId;
        await getAllOrder_1(payloadObj, orderId, data);
      });
    warazix_get_allOrder.start();
  } catch (err) {
    warazix_get_allOrder.start();
    console.log("getallorder errrr", err);
  }
};

//function  getAllOrder_1  -- create signature

const getAllOrder_1 = async (payloadObj, orderId, orderData) => {
  try {
    // console.log("enter getall order function 1..............");
    const api = config.WAZIRIX.API;
    const secret = config.WAZIRIX.SECRET;

    // const serverTime = await axios.get("https://api.wazirx.com/sapi/v1/time");
    const timeStamp = new Date().getTime();

    var signaturePayload = {
      ...payloadObj,
      ...{ timestamp: timeStamp },
    };

    // console.log("signaturePayloadsignaturePayload", signaturePayload);

    var queryString = qs.stringify(signaturePayload);
    let signature = crypto
      .createHmac("sha256", secret)
      .update(queryString)
      .digest("hex");

    console.log(" get ordersignauter  Signature: ", signature, orderData);
    let sendPayload = {
      orderId: orderId,
      timestamp: timeStamp,
      signature: signature,
    };

    console.log("sendPayloadsendPayload", qs.stringify(sendPayload));

    const resData = await axios({
      method: "GET",
      url: "https://api.wazirx.com/sapi/v1/order/ ",
      data: qs.stringify(sendPayload),
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=utf-8",
        "X-Api-Key": api,
      },
    });

    console.log("Waziorxxx order update section", resData.data);
    // console.log("dsssssssssssssss", Object.keys(resData.data).length);
    if (Object.keys(resData.data).length > 0) {
      // console.log("spotTradeDataspotTradeData", spotTradeData.buyorsell);

      var currencyId =
        orderData.buyorsell == "buy"
          ? orderData.firstCurrencyId
          : orderData.secondCurrencyId;

      let resposeData = resData.data;
      let pairData = await FetchpairData(orderData.pairId);
      if (pairData) {
        if (resposeData.status == "idle" || resposeData.status == "wait") {
          console.log("inside idlee funiton call ");
          // idle_wait_status(resposeData, currencyId, orderData, pairData);
        } else if (resposeData.status == "done") {
          console.log("inside done funiton call ");

          await done_status(resposeData, currencyId, orderData, pairData);
        } else if (resposeData.status == "cancel") {
          console.log("inside done funiton call ",orderData);

          await cancelstatus(resposeData, currencyId, orderData, pairData);
        }
      }
      // }
    }
  } catch (err) {
    console.log("getalorderrrr11111111errr", err);
  }
};
const cancelstatus = async (resData, currencyId, orderData, pairData) => {
  console.log("cancelk ststass");
  let filledQty = Math.abs(
    orderData.openQuantity - parseFloat(orderData.filledQuantity)
  );

  orderData.status = "cancel";
  let balanceUpdate =
    orderData.buyorsell == "buy" ? orderData.price * filledQty : filledQty;
    // let UpdateDate=new Date(orderData.orderDate)
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
  
  let UpdateDate=moment.utc(orderData.orderDate).valueOf();
  
  orderData.orderDate=UpdateDate;
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
    type: "spot_OrderMatch_Wazarix_Cancel",
    category: "debit",
  });
  socketEmitOne(
    "updateTradeAsset",
    {
      currencyId: CoinId,
      spotBal: userBalanceUpdate,
    },
    orderData.userId
  );

console.log("orderDataorderDataorderDataorderDataorderData",orderData,UpdateDate,orderData.orderDate);
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
};
const done_status = async (resData, currencyId, orderData, pairData) => {
  try {
    console.log("done status enter ...........", resData);
    let uniqueId = Math.floor(Math.random() * 1000000000);
    let filledQty = Math.abs(
      orderData.filledQuantity + parseFloat(resData.executedQty)
    );

    orderData.status = "completed";
    orderData.filledQuantity = filledQty;
    orderData.averagePrice += orderData.price * resData.executedQty;

    let balanceUpdate =
      orderData.buyorsell == "sell"
        ? orderData.price * resData.executedQty
        : resData.executedQty;
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
    let beforBlance = userBalanceUpdate - balanceUpdatewithoutServiceFee,
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
      type: "spot_OrderMatch_Wazarix_exec",
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

    //saveOrder

    let tradeFee = calculateServiceFee({
      price:
        orderData.buyorsell == "sell"
          ? orderData.price * resData.executedQty
          : resData.executedQty,
      serviceFee: pairData.taker_fees,
    });
    console.log("bianceFILLLER", filledQty, orderData.price);
    newTradeHistory({
      buyOrderData: orderData.buyorsell == "sell" ? {} : orderData,
      sellOrderData: orderData.buyorsell == "sell" ? orderData : {}, 
      uniqueId: uniqueId,
      execPrice: orderData.price,
      Maker: orderData.buyorsell,
      buyerFee: tradeFee,
      sellerFee: tradeFee,
      execQuantity: resData.executedQty,
      ordertype:'Wazirix'
    });
    orderData.orderDate=new Date(orderData.orderDate).getTime()
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
  } catch (err) {
    console.log("... done satstus errrrr", err);
  }
};

const idle_wait_status = async (
  resData,
  currencyId,
  spotTradeData,
  pairData
) => {
  try {
    console.log("idle wait  status enter ...........", resData);

    const userAssetsData = await Assets.findOne({
      userId: ObjectId(spotTradeData.userId),
      currency: currencyId,
    });

    //  console.log("userAssetsDatauserAssetsData", userAssetsData);
    var executedQty = parseFloat(resData.executedQty);
    var price = parseFloat(resData.price);
    var filledQty = 0;
    let filledQuantity = parseFloat(spotTradeData.filledQuantity);
    let isMaker = isMakerOrder(resData);
    // var origQty=parseFloat(resData.origQty);
    if (executedQty > 0) {
      filledQty = Math.abs(spotTradeData.filledQuantity - executedQty);

      console.log("-------idel_wait filledQuantity", filledQuantity);
      console.log("-------idel_wait executedQty", executedQty);
      console.log("-------idel_wait filledQty", filledQty);

      // if (resData.side == "buy") {
      //   var spotwallet =
      //     parseFloat(userAssetsData.spotwallet) + parseFloat(filledQty);
      //   console.log("idel_wait spotwalletspotwallet", parseFloat(spotwallet));
      //   userAssetsData.spotwallet = parseFloat(spotwallet);
      //   await userAssetsData.save();
      // }
      // if (resData.side == "sell") {
      //   //  balanceQty=parseFloat(executedQty)-parseFloat( spotTradeData.filledQuantity)
      //   var total_Qty_OR_Pice = spotTradeData.price * filledQty;
      //   var spotwallet =
      //     parseFloat(userAssetsData.spotwallet) + parseFloat(total_Qty_OR_Pice);
      //   // console.log("spotwalletspotwallet", spotwallet);
      //   userAssetsData.spotwallet = parseFloat(spotwallet);
      //   await userAssetsData.save();
      // }

      await assetUpdate({
        currencyId:
          spotTradeData.buyorsell == "sell"
            ? spotTradeData.secondCurrencyId
            : spotTradeData.firstCurrencyId,
        userId: spotTradeData.userId,
        balance: withoutServiceFee({
          price:
            spotTradeData.buyorsell == "sell"
              ? spotTradeData.price * filledQty
              : filledQty,
          serviceFee: isMaker ? pairData.maker_rebate : pairData.taker_fees,
        }),
        type: "spot_trade",
        tableId: spotTradeData._id,
      });

      let update = await SpotTrade.findOneAndUpdate(
        {
          _id: spotTradeData._id,
        },
        {
          status: resData.status,
          filledQuantity: executedQty,
          updatedAt: new Date(),
          $push: {
            filled: {
              pairId: spotTradeData.pairId,
              userId: spotTradeData.userId,
              price: price,
              filledQuantity: filledQty,
              status: "filled",
              Fees: calculateServiceFee({
                price:
                  spotTradeData.buyorsell == "sell"
                    ? spotTradeData.price * filledQty
                    : filledQty,
                serviceFee: isMaker
                  ? pairData.maker_rebate
                  : pairData.taker_fees,
              }),
              Type: resData.side,
              createdAt: new Date(),
              orderValue: filledQty * price,
            },
          },
        },
        { new: true }
      );
      syncStatusUpdateDetails(update._id, update);
      await getOpenOrderSocket(spotTradeData.userId, spotTradeData.pairId);
      await getOrderHistorySocket(spotTradeData.userId, spotTradeData.pairId);
      await getTradeHistorySocket(spotTradeData.userId, spotTradeData.pairId);
    }
  } catch (err) {
    console.log("idele wait errrrrrrr .............", err);
  }
};

/*
wazirixCancelOrder
rebody :objId
*/

export const wazirixCancelOrder = async (payloadObj, orderId) => {
  try {
    console.log("payload obi obj obj .......", payloadObj);
    const api = config.WAZIRIX.API;
    const secret = config.WAZIRIX.SECRET;

    // const serverTime = await axios.get("https://api.wazirx.com/sapi/v1/time");

    const timeStamp = new Date().getTime();
    var payload = {
      ...payloadObj,
      ...{ timestamp: timeStamp },
    };

    // console.log("signaute payloadsssssssssss", payload);

    let sendPayload = {
      symbol: payload.symbol,
      orderId: orderId,
      timestamp: timeStamp,
    };

    var queryString = qs.stringify(sendPayload);
    let signature = crypto
      .createHmac("sha256", secret)
      .update(queryString)
      .digest("hex");

    sendPayload["signature"] = signature;
    const resData = await axios({
      method: "DELETE",
      url: "https://api.wazirx.com/sapi/v1/order/ ",
      data: qs.stringify(sendPayload),
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=utf-8",
        "X-Api-Key": api,
      },
    });
    if (Object.keys(resData && resData.data).length > 0) {
      return { status: true, data: resData.data };
    } else {
      return { status: false };
    }
  } catch (err) {
    console.log("cancel order after response ,,,,,,,,,,", err);

    //  console.log("cancelorderrrr11111111errr", err);
  }
};


/**
 * limit to market order best orderbook price
 */
const limitToMarketOrderPrice = async ({ pairId, ask, bid }) => {
  let marketUpdat = await SpotPair.findOneAndUpdate(
    { _id: ObjectId(pairId) },
    { $set: { last_ask: parseFloat(ask[0]), last_bid: parseFloat(bid[0]) } },
    { new: true }
  );

  await hset("spotPairdata", marketUpdat._id.toString(), marketUpdat);
};

/**
 * isMakerOrder or takerOrder
 */
const isMakerOrder = (order) => {
  if (order.createdTime != order.updatedTime) {
    return true;
  }
  return false;
};

export const ChartData = async function (pairname, type, startTime) {
  try {
    var marketbody = await axios.get(apiurl + "/exchange/v1/markets_details");

    if (marketbody.data) {
      var marketlist = marketbody.data;
      let curmarketdata = await marketlist.find((el) => el.symbol == pairname);
      var cdcxpairname = curmarketdata.pair;
      var chartdata = await axios.get(
        baseurl +
          "/market_data/candles?pair=" +
          cdcxpairname +
          "&interval=" +
          type +
          "&startTime=" +
          startTime
      );
      console.log(
        "apiurlapiurlapiurlapiurl",
        pairname,
        type,
        startTime,
        cdcxpairname
      );
      if (chartdata) {
        return chartdata.data.reverse();
      }
    }
  } catch (err) {
    console.log("------err", err);
  }
};



export const MarketOrderPlaceWazatix = async (payloadObj, pairData) => {
  try {
    let sendPayload = {};
    const api = config.WAZIRIX.API;
    const secret = config.WAZIRIX.SECRET;
    // const serverTime = await axios.get("https://api.wazirx.com/sapi/v1/time");
    const timeStamp = new Date().getTime();

    let Pair = (
      payloadObj.firstCurrency + payloadObj.secondCurrency
    ).toLowerCase();

    let wazarixSigPayload = {
      symbol: Pair,
      side: payloadObj.buyorsell,
      type: "limit",
      quantity: truncateDecimals(payloadObj.quantity, pairData.firstFloatDigit),
      price: truncateDecimals(payloadObj.price, pairData.secondFloatDigit),
      timestamp: timeStamp,
      recvWindow: 50000,
    };
    var queryString = qs.stringify(wazarixSigPayload);
    let signature = crypto
      .createHmac("sha256", secret)
      .update(queryString)
      .digest("hex");

    sendPayload = {
      symbol: Pair,
      side: payloadObj.buyorsell,
      type: "limit",
      quantity: truncateDecimals(payloadObj.quantity, pairData.firstFloatDigit),
      price: truncateDecimals(payloadObj.price, pairData.secondFloatDigit),
      timestamp: timeStamp,
      recvWindow: 50000,
      signature: signature,
    };

    console.log(
      " limit oe stop limit  sendPyload.......payload",
      wazarixSigPayload,
      sendPayload,
      pairData
    );

    try {
      console.log("sendpayloaddddddddddddd", qs.stringify(sendPayload));
      const resData = await axios({
        method: "post",
        url: "https://api.wazirx.com/sapi/v1/order/ ",
        data: qs.stringify(sendPayload),
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=utf-8",
          "X-Api-Key": api,
        },
      });

      console.log("limit response........", resData.data);

      if (Object.keys(resData && resData.data).length > 0) {
        return {
          status: true,
          data: {
            orderId: resData.data.id,
            status: resData.data.status,
          },
        };
      } else {
        return { status: false };
      }
    } catch (error) {
      console.log("orderPlacingwrxorderPlacingwrxerrr", error);
      return {
        status: false,
        message: "Something went wrong, please try again later.",
      };
    }

    // console.log("new order .......placing upate", newOrderUpdate);
  } catch (err) {
    console.log(err, "wazirxOrderPlace ----errr");
    return {
      status: false,
      message: "Something went wrong, please try again later.",
    };
  }
};
// initial call function
spotPriceTicker();