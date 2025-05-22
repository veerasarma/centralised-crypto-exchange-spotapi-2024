// import package
import mongoose from "mongoose";

// import models
import {
  SpotPair,
  SpotTrade,
  Admin,
  SpotOrder,
  TradeHistory,
  spotOrderHistory,
  SequenceId,
} from "../models";
import cron from "node-cron";

import { socketEmitOne, socketEmitAll } from "../config/socketIO";
// import controller
import * as binanceCtrl from "./binance.controller";
import { ChartDocHistory } from "./chart/chart.controller";
// import lib
import isEmpty from "../lib/isEmpty";
import { decryptObject } from "../lib/cryptoJS";
import { filterSearchQuery, paginationQuery } from "../lib/adminHelpers";
import { toFixed, toFixedDown, truncateDecimals } from "../lib/roundOf";
import { withoutServiceFee, calculateServiceFee } from "../lib/calculation";
import {
  hset,
  hget,
  hgetall,
  hincby,
  hincbyfloat,
  hdel,
  rpush,
  lrange,
  lpop,
} from "../controllers/redis.controller";

import { priceConversionGrpc } from "../grpc/currencyService";

// import grpc
import {
  getUserAsset,
  updateUserWallet,
  passbook,
} from "../grpc/walletService";
import { saveAdminprofit } from "../grpc/adminService";
import {
  wazirixOrderPlace,
  wazirixCancelOrder,
  calculateMarkup,
  wazirixRecentTrades,
  MarketOrderPlaceWazatix,
} from "./wazarix.controller";
import { convert } from "../lib/convert";
import { createStakerHistory, getParentData } from "../grpc/affiliateService";

const ObjectId = mongoose.Types.ObjectId;

let pairInfo = [];
let orderHistArr = [];
let tradeHistArr = [];
let isRun = false;
let tradePair = "";
/**
 * Trade Decrypt
 * BODY : token
 */
export const decryptTradeOrder = (req, res, next) => {
  try {
    let token = decryptObject(req.body.token);
    req.body = token;
    return next();
  } catch (err) {
    return res.status(500).json({ status: false, message: "Something Wrong" });
  }
};
// * Create ObjectId
function createobjectId() {
  return (
    hexval(Date.now() / 1000) +
    " ".repeat(16).replace(/./g, () => hexval(Math.random() * 16))
  );
}
function hexval(value) {
  return Math.floor(value).toString(16);
}
/**
 * Update Order Book
 * PARAMS : pairId
 */
const minTwoDigits = (n) => {
  let j = 1;
  for (let i = 0; i < n; i++) {
    j = j + "0";
  }
  return parseFloat(j);
};
/**
 * Get Spot Trade Pair List
 * METHOD: GET
 * URL : /api/spot/tradePair
 */
export const getPairList = async (req, res) => {
  try {
    let spotPairDoc = await hgetall("spotPairdata");
    let newArr = [];
    if (spotPairDoc) {
      spotPairDoc = await getActivePairs(spotPairDoc);
    }
    if (spotPairDoc?.length > 0) {
      for (let i = 0; i < spotPairDoc.length; i++) {
        if (spotPairDoc[i]._id) {
          await marketPrice(spotPairDoc[i]._id);
          let changesDoc = await hget("spot24hrsChange", spotPairDoc[i]._id);
          changesDoc = JSON.parse(changesDoc);
          newArr.push({ ...spotPairDoc[i], ...changesDoc });
        }
      }
    }
    return res
      .status(200)
      .json({ success: true, messages: "success", result: newArr });
  } catch (err) {
    console.log("err: ", err);
    return res.status(500).json({ status: false, message: "Error occured" });
  }
};

export const getMySpotHistory = async (req, res) => {
  try {
    if (req.query.export == "pdf") {
      let filter = {};
      filter["userId"] = ObjectId(req.user.id);
      if (req.query.startDate != "" && req.query.endDate != "") {
        let startDate = new Date(req.query.startDate);
        let endDate = new Date(req.query.endDate);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        filter["orderDate"] = {
          $gte: startDate,
          $lt: endDate,
        };
      }
      const data = await spotOrderHistory.find(filter).sort({ _id: -1 });
      return res.json({ status: true, result: { data, count: 0 } });
    } else {
      let pagination = paginationQuery(req.query);
      let filter = filterSearchQuery(req.query, [
        "buyorsell",
        "status",
        "orderType",
        "pairName",
      ]);

      filter["userId"] = ObjectId(req.user.id);
      if (req.query.pairName != "all") {
        filter["pairName"] = req.query.pairName;
      }
      if (req.query.pairName != "all") {
        filter["pairName"] = req.query.pairName;
      }
      if (req.query.orderType != "all") {
        filter["orderType"] = req.query.orderType;
      }
      if (req.query.buyorsell != "all") {
        filter["buyorsell"] = req.query.buyorsell;
      }
      if (req.query.status != "all") {
        filter["status"] = req.query.status;
      }
      if (req.query.searchType == "searchDate") {
        let startDate = new Date(req.query.startDate);
        let endDate = new Date(req.query.endDate);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        filter["orderDate"] = {
          $gte: startDate,
          $lt: endDate,
        };
      }
      const count = await spotOrderHistory.find(filter).count();
      const data = await spotOrderHistory
        .find(filter)
        .sort({ _id: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit);
      return res.json({ status: true, result: { data, count } });
    }
  } catch (err) {
    console.log("-------------", err);
    return res.status(500).json({ status: false, message: "Error occured" });
  }
};

//tradehistory
export const getFilledOrderHistory = async (req, res) => {
  try {
    if (req.query.export == "pdf") {
      let filter = {};
      filter["userId"] = ObjectId(req.user.id);
      filter["status"] = { $in: ["completed"] };
      if (req.query.startDate != "" && req.query.endDate != "") {
        let startDate = new Date(req.query.startDate);
        let endDate = new Date(req.query.endDate);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        filter["updatedAt"] = {
          $gte: startDate,
          $lt: endDate,
        };
      }
      const data = await spotOrderHistory.find(filter).sort({ _id: -1 });
      return res.json({ status: true, result: { data, count: 0 } });
    } else {
      let pagination = paginationQuery(req.query);
      let filter = filterSearchQuery(req.query, [
        "buyorsell",
        "status",
        "orderType",
        "pairName",
      ]);

      if (req.query.pairName != "all") {
        filter["pairName"] = req.query.pairName;
      }
      if (req.query.pairName != "all") {
        filter["pairName"] = req.query.pairName;
      }
      if (req.query.orderType != "all") {
        filter["orderType"] = req.query.orderType;
      }

      if (req.query.buyorsell != "all") {
        filter["buyorsell"] = req.query.buyorsell;
        if (req.query.buyorsell == "buy") {
          filter["buyUserId"] = ObjectId(req.user.id);
        } else {
          filter["sellUserId"] = ObjectId(req.user.id);
        }
      } else {
        filter = {
          $or: [
            { sellUserId: ObjectId(req.user.id) },
            { buyUserId: ObjectId(req.user.id) },
          ],
          ...filter,
        };
      }

      if (req.query.status != "all") {
        filter["status"] = req.query.status;
      }

      if (req.query.searchType == "searchDate") {
        let startDate = new Date(req.query.startDate);
        let endDate = new Date(req.query.endDate);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        filter["updatedAt"] = {
          $gte: startDate,
          $lt: endDate,
        };
      }

      const count = await TradeHistory.countDocuments({
        $and: [filter],
      });
      const data = await TradeHistory.find({
        $and: [filter],
      })
        .sort({ _id: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit);
      return res.json({ status: true, result: { data, count } });
    }
  } catch (err) {
    console.log("errrrr", err);
    return res.status(500).json({ status: false, message: "Error occured" });
  }
};
/**
 * Cancel Order
 * METHOD: Delete
 * URL : /api/spot/cancelOrder/:{{orderId}}
 * PARAMS: orderId
 */
export const cancelOrder = async (req, res) => {
  try {
    let data = decryptObject(req.body.id);
    let pairId = data.tableId.split("_")[1];
    if (isEmpty(data)) {
      return res
        .status(500)
        .json({ status: false, message: "Error on server" });
    }
    let checkOrder = await hget(data.tableId, data.orderId);

    if (tradePair == pairId) {
      return res.status(400).json({
        success: false,
        message: "Order has been excute processing ...",
      });
    }
    checkOrder = JSON.parse(checkOrder);
    if (checkOrder) {
      checkOrder.status = "cancel";
      let currencyId =
        checkOrder.buyorsell == "buy"
          ? checkOrder.secondCurrencyId
          : checkOrder.firstCurrencyId;
      let orderValue =
        checkOrder.buyorsell == "buy"
          ? checkOrder.price * checkOrder.quantity
          : checkOrder.quantity;
      let marketValue =
        checkOrder.orderType == "market" && checkOrder.buyorsell == "buy"
          ? checkOrder.orderValue
          : checkOrder.amount;
      let retriveValue =
        checkOrder.orderType == "limit" ? orderValue : marketValue;
      retriveValue = parseFloat(retriveValue);
      if (checkOrder.liquidityType == "off")
        if (checkOrder.orderType != "market") {
          editOrderBook({
            buyorsell: checkOrder.buyorsell,
            price: checkOrder.price,
            minusQuantity: checkOrder.quantity,
            pairId: checkOrder.pairId,
            firstFloatDigit: checkOrder.firstFloatDigit,
          });
        }
      let userWallet = await hincbyfloat(
        "walletbalance_spot",
        checkOrder.userId + "_" + currencyId,
        retriveValue
      );

      await hincbyfloat(
        "walletbalance_spot_inOrder",
        checkOrder.userId + "_" + currencyId,
        -retriveValue
      );
      await hset(
        "orderHistory_" + checkOrder.userId,
        checkOrder._id,
        checkOrder
      );
      await hdel(data.tableId, data.orderId);
      getOpenOrderSocket(checkOrder.userId, checkOrder.pairId);
      getOrderHistorySocket(checkOrder.userId, checkOrder.pairId);
      newOrderHistory(checkOrder);

      // if (checkOrder.liquidityType == "wazirx") {
      //   let option = {
      //     symbol: checkOrder.pairName.toLowerCase(),
      //     side: checkOrder.buyorsell,
      //     type: checkOrder.orderType,
      //     quantity: checkOrder.quantity,
      //     price: checkOrder.price,
      //   };
      //   await wazirixCancelOrder(option, checkOrder.liquidityId);
      // }
      if (checkOrder.liquidityType == "binance") {
        await binanceCtrl.cancelOrder({
          firstCoin: checkOrder.firstCurrency,
          secondCoin: checkOrder.secondCurrency,
          binanceId: checkOrder.liquidityId,
        });
      }
      let beforeBalanmce = userWallet - parseFloat(retriveValue);
      passbook({
        userId: checkOrder.userId,
        coin:
          checkOrder.buyorsell == "buy"
            ? checkOrder.secondCurrency
            : checkOrder.firstCurrency,
        currencyId: currencyId,
        tableId: checkOrder._id,
        beforeBalance: beforeBalanmce.toFixed(8),
        afterBalance: userWallet,
        amount: retriveValue,
        type: "order_Cancel",
        category: "credit",
      });

      socketEmitOne(
        "updateTradeAsset",
        {
          currencyId: currencyId,
          spotBal: userWallet,
        },
        req.user.id
      );
      return res
        .status(200)
        .json({ status: true, message: "Order cancelled successfully" });
    }

    return res.status(400).json({ status: false, message: "Order not found" });
  } catch (err) {
    console.log("err: ", err);
    return res.status(500).json({ status: false, message: "Error occured" });
  }
};

/**
redis pairdata fetching 
 */
export const FetchpairData = async (id = null) => {
  if (id == null) {
    return;
  }
  let pairdetials = await hget("spotPairdata", id.toString());

  if (!pairdetials) {
    let spotPairData = await SpotPair.find({}).lean();

    if (spotPairData && spotPairData.length > 0) {
      for (let i = 0; i < spotPairData.length; i++) {
        if (spotPairData[i]._id.toString() == id.toString()) {
          await hset(
            "spotPairdata",
            spotPairData[i]._id.toString(),
            spotPairData[i]
          );
          return spotPairData[i];
        }
      }
    }
  } else {
    return JSON.parse(pairdetials);
  }
};

export const getSequenceId = async (docType) => {
  try {
    const sequenceId = await SequenceId.findOneAndUpdate(
      { type: docType },
      { $inc: { lastIndex: 1 } },
      { 
        new: true,
        projection: { lastIndex: 1 },
      }
    );
  
    if (!sequenceId) {
      await SequenceId.create({ type: docType, lastIndex: 10e10 });
      return 10e10;
    }

    return parseInt(sequenceId.lastIndex);
  } catch (err) {
    console.error(err);
  }
};

/**
 * Spot Order Place
 * METHOD : POST
 * URL : /api/spotOrder
 * BODY : newdate, spotPairId, stopPrice, price, quantity, buyorsell, orderType(limit,market,stopLimit,oco), limitPrice
 */

export const orderPlace = async (req, res) => {
  try {
    let reqBody = req.body;
    if (reqBody.orderType == "limit") {
      limitOrderPlace(req, res);
    } else if (reqBody.orderType == "market") {
      marketOrderPlace(req, res);
    }
  } catch (err) {
    return res.status(400).json({
      status: false,
      message: "Error occured For the Interval_orderPlace_err",
    });
  }
};

/**
 * Limit order place
 * URL : /api/spotOrder
 * METHOD : POST
 * BODY : newdate, spotPairId, stopPrice, price, quantity, buyorsell, orderType(limit,market,stopLimit,oco), limitPrice
 */
export const limitOrderPlace = async (req, res) => {
  try {
    let reqBody = req.body;
    reqBody.price = parseFloat(reqBody.price);
    reqBody.quantity = parseFloat(reqBody.quantity);
    let spotPairData = await FetchpairData(reqBody.spotPairId);

    if (!spotPairData) {
      return res.status(400).json({ status: false, message: "Invalid Pair" });
    }
    if (spotPairData.status != "active") {
      return res
        .status(400)
        .json({ status: false, message: "Pair is not activated" });
    }
    let makerStatus = false,
      avgPrice = reqBody.price;
    if (reqBody.buyorsell == "buy" && reqBody.price >= spotPairData.markPrice && spotPairData.botstatus == "off") {
      // reqBody.price = spotPairData.markPrice;
      avgPrice = spotPairData.markPrice;
      makerStatus = true;
    }
    if (reqBody.buyorsell == "sell" && reqBody.price <= spotPairData.markPrice && spotPairData.botstatus == "off") {
      // reqBody.price = spotPairData.markPrice;
      avgPrice = spotPairData.markPrice;
      makerStatus = true;
    }
    if (reqBody.quantity < parseFloat(spotPairData.minQuantity)) {
      return res.status(400).json({
        status: false,
        message: `Quantity of contract must not be lesser than ${spotPairData.minQuantity}`,
      });
    } else if (reqBody.quantity > parseFloat(spotPairData.maxQuantity)) {
      return res.status(400).json({
        status: false,
        message: `Quantity of contract must not be higher than ${spotPairData.maxQuantity}`,
      });
    }
    let minPrice =
      spotPairData.markPrice -
      spotPairData.markPrice * (spotPairData.minPricePercentage / 100),
      maxPrice =
        spotPairData.markPrice +
        spotPairData.markPrice * (spotPairData.maxPricePercentage / 100);
    console.log(minPrice, '------505', maxPrice, spotPairData)
    if (reqBody.price < minPrice) {
      return res.status(400).json({
        status: false,
        message: `Price of contract must not be lesser than ${minPrice}`,
      });
    } else if (reqBody.price > maxPrice) {
      return res.status(400).json({
        status: false,
        message: `Price of contract must not be higher than ${maxPrice}`,
      });
    }

    if (spotPairData && spotPairData.botstatus == "binance") {
      let getPriceConverSion = await priceConversionGrpc({
        baseSymbol: spotPairData.firstCurrencySymbol,
        convertSymbol: spotPairData.secondCurrencySymbol,
      });
      if (getPriceConverSion && getPriceConverSion.status) {
        let total = truncateDecimals(getPriceConverSion.convertPrice, 8);
        let checkDoller = total * reqBody.quantity;

        if (
          spotPairData.firstCurrencySymbol == "BNB" &&
          parseFloat(checkDoller) < 5
        ) {
          return res.status(400).json({
            status: false,
            message: `Total order value should be more than 5 USDT`,
          });
        }

        if (
          parseFloat(checkDoller) < 10 &&
          spotPairData.firstCurrencySymbol != "BNB"
        )
          return res.status(400).json({
            status: false,
            message: `Total order value should be more than 10 USDT`,
          });
      }
    }

    let currencyId =
      reqBody.buyorsell == "buy"
        ? spotPairData.secondCurrencyId
        : spotPairData.firstCurrencyId;
    let usrWallet = await hget(
      "walletbalance_spot",
      req.user.id + "_" + currencyId
    );
    if (usrWallet == null) {
      let createAsset = await updateUserWallet(req.user.id);
      if (createAsset == false) {
        return res.status(400).json({
          status: false,
          message: "Error on server",
        });
      }
    }
    let orderValue =
      reqBody.buyorsell == "buy"
        ? reqBody.price * reqBody.quantity
        : reqBody.quantity;
    usrWallet = parseFloat(usrWallet)
    console.log(usrWallet, '----------872', orderValue)
    if (usrWallet < orderValue) {
      return res.status(400).json({
        status: false,
        message: "Due to insufficient balance order cannot be placed",
      });
    }
    const seqId = await getSequenceId("orderHistory");
    const newOpenOrder = {
      _id: createobjectId(),
      userId: req.user.id,
      pairId: spotPairData._id,
      firstCurrencyId: spotPairData.firstCurrencyId,
      firstCurrency: spotPairData.firstCurrencySymbol,
      firstFloatDigit: spotPairData.firstFloatDigit,
      secondCurrencyId: spotPairData.secondCurrencyId,
      secondCurrency: spotPairData.secondCurrencySymbol,
      secondFloatDigit: spotPairData.secondFloatDigit,
      makerFee: spotPairData.maker_rebate,
      takerFee: spotPairData.taker_fees,
      quantity: reqBody.quantity,
      price: reqBody.price,
      orderValue: reqBody.price * reqBody.quantity,
      pairName: `${spotPairData.firstCurrencySymbol}${spotPairData.secondCurrencySymbol}`,
      beforeBalance: parseFloat(balance),
      afterBalance: parseFloat(afterBalance),
      orderType: reqBody.orderType,
      buyorsell: reqBody.buyorsell,
      openQuantity: reqBody.quantity,
      averagePrice: spotPairData.botstatus == "bot" ? 0 : avgPrice,
      filledQuantity: 0,
      isLiquidity: false,
      isLiquidityError: false,
      liquidityType: "off", // spotPairData.botstatus,
      flag: false,
      status: "open",
      orderDate: new Date(), // Date.now(),
      userCode: req.user.userCode,
      isMaker: makerStatus ? true : false,
      orderCode: seqId,
    };
    let userbalance = await hincbyfloat(
      "walletbalance_spot",
      req.user.id + "_" + currencyId,
      -orderValue
    );
    await hincbyfloat(
      "walletbalance_spot_inOrder",
      req.user.id + "_" + currencyId,
      orderValue
    );
    if (parseFloat(userbalance) < 0) {
      let retriveBal =
        (orderValue * 10 ** spotPairData.firstFloatDigit -
          Math.abs(userbalance) * 10 ** spotPairData.firstFloatDigit) /
        10 ** spotPairData.firstFloatDigit;
      retriveBal += Math.abs(userbalance);
      let checkUp = await hincbyfloat(
        "walletbalance_spot",
        req.user.id + "_" + currencyId,
        retriveBal
      );
      await hincbyfloat(
        "walletbalance_spot_inOrder",
        req.user.id + "_" + currencyId,
        -retriveBal
      );
      let pDec =
        reqBody.buyorsell == "buy"
          ? spotPairData.firstFloatDigit
          : spotPairData.secondFloatDigit;
      passbook({
        userId: req.user.id.toString(),
        coin:
          reqBody.buyorsell == "buy"
            ? spotPairData.secondCurrencySymbol
            : spotPairData.firstCurrencySymbol,
        currencyId: currencyId,
        tableId: createobjectId(),
        beforeBalance: parseFloat(retriveBal) - Math.abs(userbalance),
        afterBalance: userbalance,
        amount: toFixedDown(orderValue, pDec),
        type: "spot_limit_orderPlace_Insufficient",
        category: "credit",
      });
      passbook({
        userId: req.user.id.toString(),
        coin:
          reqBody.buyorsell == "buy"
            ? spotPairData.secondCurrencySymbol
            : spotPairData.firstCurrencySymbol,
        currencyId: currencyId,
        tableId: createobjectId(),
        beforeBalance: parseFloat(userbalance),
        afterBalance: checkUp,
        amount: toFixedDown(parseFloat(checkUp) + Math.abs(userbalance), pDec),
        type: "spot_limit_balretrive_Insufficient_Limit",
        category: "credit",
      });
      return res.status(400).json({
        status: false,
        message: "Due to insufficient balance order cannot be placed",
      });
    }
    console.log(
      "-------------------------------id",
      newOpenOrder.buyorsell + "OpenOrders_" + newOpenOrder.pairId,
      newOpenOrder
    );
    let balance = parseFloat(userbalance) + orderValue;
    let afterBalance = parseFloat(userbalance);

    socketEmitOne(
      "updateTradeAsset",
      {
        currencyId: currencyId,
        spotBal: afterBalance,
      },
      req.user.id
    );
    console.log(makerStatus, "------761");
    if (makerStatus) {
      await liqOrdCreation(
        newOpenOrder,
        reqBody.buyorsell == "buy" ? "sell" : "buy",
        true
      );
    }
    newOpenOrder.orderDate = new Date(), //  Date.now();
      newOrderHistory(newOpenOrder);
    console.log(orderValue, "------764");
    await hset(
      newOpenOrder.buyorsell + "OpenOrders_" + newOpenOrder.pairId,
      newOpenOrder._id,
      newOpenOrder
    );
    if (spotPairData.botstatus == "bot") {
      updateOrderBook(
        newOpenOrder,
        newOpenOrder.pairId,
        spotPairData.firstFloatDigit
      );
    }
    getOpenOrderSocket(newOpenOrder.userId, newOpenOrder.pairId);
    getOrderHistorySocket(newOpenOrder.userId, newOpenOrder.pairId);
    // CREATE PASS_BOOK
    passbook({
      userId: req.user.id.toString(),
      coin:
        reqBody.buyorsell == "buy"
          ? spotPairData.secondCurrencySymbol
          : spotPairData.firstCurrencySymbol,
      currencyId:
        reqBody.buyorsell == "buy"
          ? spotPairData.secondCurrencyId
          : spotPairData.firstCurrencyId,
      tableId: newOpenOrder._id,
      beforeBalance: parseFloat(balance),
      afterBalance: afterBalance,
      amount: toFixedDown(orderValue, 8),
      type: "spot_limit_orderPlace",
      category: "debit",
    });
    return res
      .status(200)
      .json({ status: true, message: "Your order placed successfully." });
  } catch (err) {
    console.log("...err", err);
    return res
      .status(400)
      .json({ status: false, message: "Limit order match error" });
  }
};
// percentCalc(17645, 23456)
export const marketOrderPlace = async (req, res) => {
  try {
    let reqBody = req.body;
    console.log(reqBody, "------777");
    let side = reqBody.buyorsell == "buy" ? "sell" : "buy";
    let spotPairData = await FetchpairData(reqBody.spotPairId);

    if (!spotPairData) {
      return res.status(400).json({ status: false, message: "Invalid Pair" });
    }
    if (spotPairData.status != "active") {
      return res
        .status(400)
        .json({ status: false, message: "Pair is not activated" });
    }
    reqBody.quantity = toFixedDown(
      parseFloat(reqBody.quantity),
      spotPairData.firstFloatDigit
    );
    console.log(reqBody, "-------803", spotPairData);
    if (
      reqBody.buyorsell == "buy" &&
      parseFloat(reqBody.orderValue) < parseFloat(spotPairData.minOrderValue)
    ) {
      return res.status(400).json({
        status: false,
        message: `Order Value of contract must not be lesser than ${spotPairData.minOrderValue}`,
      });
    } else if (
      reqBody.buyorsell == "buy" &&
      parseFloat(reqBody.orderValue) > parseFloat(spotPairData.maxOrderValue)
    ) {
      return res.status(400).json({
        status: false,
        message: `Order Value of contract must not be higher than ${spotPairData.maxOrderValue}`,
      });
    }
    if (reqBody.buyorsell == "buy" && spotPairData.botstatus == "binance") {
      let getPriceConverSion = await priceConversionGrpc({
        baseSymbol: spotPairData.firstCurrencySymbol,
        convertSymbol: spotPairData.secondCurrencySymbol,
      });
      if (getPriceConverSion && getPriceConverSion.status) {
        let total = truncateDecimals(getPriceConverSion.convertPrice, 8);
        let checkDoller = total * reqBody.orderValue;
        console.log(checkDoller, "checkDollercheckDoller", total);
        if (checkDoller < 10)
          return res.status(400).json({
            status: false,
            message: `Total order value should be more than 10 USDT`,
          });
      }
    }

    if (
      reqBody.buyorsell == "sell" &&
      parseFloat(reqBody.amount) < parseFloat(spotPairData.minQuantity)
    ) {
      return res.status(400).json({
        status: false,
        message: `Quantity of contract must not be lesser than ${spotPairData.minQuantity}`,
      });
    } else if (
      reqBody.buyorsell == "sell" &&
      parseFloat(reqBody.amount) > parseFloat(spotPairData.maxQuantity)
    ) {
      return res.status(400).json({
        status: false,
        message: `Quantity of contract must not be higher than ${spotPairData.maxQuantity}`,
      });
    }

    let currencyId =
      reqBody.buyorsell == "buy"
        ? spotPairData.secondCurrencyId
        : spotPairData.firstCurrencyId;
    let usrWallet = await hget(
      "walletbalance_spot",
      req.user.id + "_" + currencyId
    );
    if (usrWallet == null) {
      let createAsset = await updateUserWallet(req.user.id);
      if (createAsset == false) {
        return res.status(400).json({
          status: false,
          message: "Error on server",
        });
      }
    }
    let balance = parseFloat(usrWallet),
      orderValue = 0;

    if (spotPairData.botstatus == "off") {
      let getOrders = await hgetall(`${side}OpenOrders_` + spotPairData._id);
      console.log(
        side == "buy" && reqBody.buyorsell == "sell",
        "<<< --- side --->>>"
      );
      //Custom Option
      if (side == "buy" && reqBody.buyorsell == "sell" && getOrders) {
        let GetOrders = getOrders;
        if (GetOrders) {
          GetOrders = await getvalueObj(GetOrders);
        }

        GetOrders = GetOrders.sort(function (a, b) {
          if (a.price === "market") return -1;
          else return b.price - a.price;
        });

        console.log("<<< --- getBuyOrders --- >>>", GetOrders[0]);

        // let orderPercent = percentCalc(
        //   GetOrders[0].price,
        //   spotPairData.markPrice,
        // );
        // if (spotPairData.marketPercent < orderPercent) {
        //   return res.status(400).json({
        //     status: false,
        //     message:
        //       "Due to market order price percentage difference is high, so this order cannot be placed",
        //   });
        // }
      }
    }
    if (spotPairData.botstatus == "bot") {
      let getOrders = await hgetall(`${side}OpenOrders_` + spotPairData._id);
      if (getOrders) {
        getOrders = await getvalueObj(getOrders);
        console.log('getOrders: ', getOrders);
        let checkLimit = (element) => element.price !== "market";
        let checkIndex = getOrders.findIndex(checkLimit);
        let findIndex = 0;
        let checkOrder = getOrders[checkIndex];
        console.log('checkOrder: ', checkOrder);
        if (checkOrder.userId == req.user.id) {
          let findOrder = (element) =>
            element.price !== "market" && element.userId != checkOrder.userId;
          findIndex = getOrders.findIndex(findOrder);
        }
        if (checkIndex == -1 || findIndex == -1) {
          return res
            .status(400)
            .json({ status: false, message: "No orders in order book" });
        }
      } else {
        return res
          .status(400)
          .json({ status: false, message: "No orders in order book" });
      }
    }
    orderValue =
      reqBody.buyorsell == "buy" ? reqBody.orderValue : reqBody.amount;
    orderValue = parseFloat(orderValue);
    if (reqBody.buyorsell == "buy") {
      // 100/67914.42
      let oValue = orderValue / spotPairData.markPrice;
      console.log(toFixedDown(oValue, spotPairData.firstFloatDigit), "--------862", spotPairData.markPrice);
      orderValue =
        toFixedDown(oValue, spotPairData.firstFloatDigit) *
        spotPairData.markPrice;
      orderValue = parseFloat(orderValue);
    }

    console.log(orderValue, "-------863");
    usrWallet = parseFloat(usrWallet)
    console.log(usrWallet, '----------872')
    if (usrWallet < orderValue) {
      return res.status(400).json({
        status: false,
        message: "Due to insufficient balance order cannot be placed",
      });
    }
    // else if (spotPairData.botstatus == "binance") {
    //   orderValue =
    //     reqBody.buyorsell == "buy"
    //       ? spotPairData.markPrice * reqBody.quantity
    //       : reqBody.quantity;
    //   orderPrice = spotPairData.markPrice;
    // }

    // if (spotPairData.botstatus == "off") {
    let cost = reqBody.buyorsell == "buy" ? "orderValue" : "amount";
    const seqId = await getSequenceId("orderHistory");
    let newOpenOrder = {
      _id: createobjectId(),
      userId: req.user.id,
      pairId: spotPairData._id,
      firstCurrencyId: spotPairData.firstCurrencyId,
      firstCurrency: spotPairData.firstCurrencySymbol,
      firstFloatDigit: spotPairData.firstFloatDigit,
      secondCurrencyId: spotPairData.secondCurrencyId,
      secondCurrency: spotPairData.secondCurrencySymbol,
      secondFloatDigit: spotPairData.secondFloatDigit,
      makerFee: spotPairData.maker_rebate,
      takerFee: spotPairData.taker_fees,
      price: "market",
      [cost]: reqBody.buyorsell == "buy" ? orderValue : reqBody.amount,
      quantity: reqBody.quantity,
      filledQuantity: 0,
      pairName: `${spotPairData.firstCurrencySymbol}${spotPairData.secondCurrencySymbol}`,
      beforeBalance: parseFloat(balance),
      afterBalance: parseFloat(userbalance),
      orderType: reqBody.orderType,
      buyorsell: reqBody.buyorsell,
      openQuantity: reqBody.amount,
      openOrderValue: orderValue,
      averagePrice: 0,
      filledQuantity: 0,
      isLiquidity: false,
      isLiquidityError: false,
      liquidityType: "off", //  spotPairData.botstatus,
      flag: true,
      status: "open",
      orderDate: new Date(), // Date.now(),
      userCode: req.user.userCode,
      orderCode: seqId,
    };
    let userbalance = await hincbyfloat(
      "walletbalance_spot",
      req.user.id + "_" + currencyId,
      -orderValue
    );
    if (parseFloat(userbalance) < 0) {
      let retriveBal =
        (orderValue * 10 ** spotPairData.firstFloatDigit -
          Math.abs(userbalance) * 10 ** spotPairData.firstFloatDigit) /
        10 ** spotPairData.firstFloatDigit;
      retriveBal += Math.abs(userbalance);
      let checkUp = await hincbyfloat(
        "walletbalance_spot",
        req.user.id + "_" + currencyId,
        retriveBal
      );
      passbook({
        userId: req.user.id.toString(),
        coin:
          reqBody.buyorsell == "buy"
            ? spotPairData.secondCurrencySymbol
            : spotPairData.firstCurrencySymbol,
        currencyId: currencyId,
        tableId: createobjectId(),
        beforeBalance: parseFloat(retriveBal) - Math.abs(userbalance),
        afterBalance: userbalance,
        amount: toFixedDown(orderValue, 8),
        type: "spot_market_orderPlace_Insufficient",
        category: "credit",
      });
      passbook({
        userId: req.user.id.toString(),
        coin:
          reqBody.buyorsell == "buy"
            ? spotPairData.secondCurrencySymbol
            : spotPairData.firstCurrencySymbol,
        currencyId: currencyId,
        tableId: createobjectId(),
        beforeBalance: parseFloat(userbalance),
        afterBalance: checkUp,
        amount: toFixedDown(parseFloat(checkUp) + Math.abs(userbalance), 8),
        type: "spot_limit_balretrive_Insufficient_Market",
        category: "credit",
      });
      await hdel(
        newOpenOrder.buyorsell + "OpenOrders_" + newOpenOrder.pairId,
        newOpenOrder._id
      );
      return res.status(400).json({
        status: false,
        message: "Due to insufficient balance order cannot be placed",
      });
    }
    await hset(
      newOpenOrder.buyorsell + "OpenOrders_" + newOpenOrder.pairId,
      newOpenOrder._id,
      newOpenOrder
    );

    if (newOpenOrder.liquidityType == "binance") {
      let { status, message } = await liquidityOrderPlace(
        newOpenOrder,
        spotPairData
      );
      if (!status) {
        let userReturnbal = await hincbyfloat(
          "walletbalance_spot",
          req.user.id + "_" + currencyId,
          orderValue
        );
        passbook({
          userId: req.user.id,
          coin:
            reqBody.buyorsell == "buy"
              ? spotPairData.secondCurrencySymbol
              : spotPairData.firstCurrencySymbol,
          currencyId:
            reqBody.buyorsell == "buy"
              ? spotPairData.secondCurrencyId
              : spotPairData.firstCurrencyId,
          tableId: newOpenOrder._id,
          beforeBalance: parseFloat(balance),
          afterBalance: parseFloat(userbalance),
          amount: toFixedDown(orderValue, 8),
          type: "spot_market_orderPlace",
          category: "debit",
        });
        passbook({
          userId: req.user.id.toString(),
          coin:
            reqBody.buyorsell == "buy"
              ? spotPairData.secondCurrencySymbol
              : spotPairData.firstCurrencySymbol,
          currencyId:
            reqBody.buyorsell == "buy"
              ? spotPairData.secondCurrencyId
              : spotPairData.firstCurrencyId,
          tableId: newOpenOrder._id,
          beforeBalance: parseFloat(userReturnbal) - orderValue,
          afterBalance: parseFloat(userReturnbal),
          amount: toFixed(parseFloat(orderValue), 8),
          type: "spot_market_orderPlace_market_return",
          category: "credit",
        });

        return res.status(400).json({ status, message });
      }
    }

    let afterBalance = userbalance;

    socketEmitOne(
      "updateTradeAsset",
      {
        currencyId: currencyId,
        spotBal: afterBalance,
      },
      req.user.id
    );
    getOrderHistorySocket(newOpenOrder.userId, newOpenOrder.pairId);
    if (spotPairData.botstatus == "off") {
      let nOrd = newOpenOrder;
      nOrd.price = spotPairData.markPrice;
      nOrd.quantity =
        nOrd.buyorsell == "buy"
          ? reqBody.orderValue / spotPairData.markPrice
          : reqBody.amount;
      // nOrd.orderType = "limit";
      await liqOrdCreation(nOrd, reqBody.buyorsell == "buy" ? "sell" : "buy", false); // for admin liquidity only
    }
    newOpenOrder.orderDate = new Date(), // Date.now();
      await newOrderHistory(newOpenOrder);
    passbook({
      userId: req.user.id,
      coin:
        reqBody.buyorsell == "buy"
          ? spotPairData.secondCurrencySymbol
          : spotPairData.firstCurrencySymbol,
      currencyId:
        reqBody.buyorsell == "buy"
          ? spotPairData.secondCurrencyId
          : spotPairData.firstCurrencyId,
      tableId: newOpenOrder._id,
      beforeBalance: parseFloat(balance),
      afterBalance: parseFloat(afterBalance),
      amount: toFixedDown(orderValue, 8),
      type: "spot_market_orderPlace",
      category: "debit",
    });

    return res
      .status(200)
      .json({ status: true, message: "Your order placed successfully." });
  } catch (err) {
    console.log("err: ", err);
    return res
      .status(500)
      .json({ status: false, message: "Market order match error" });
  }
};

export const updateOrderBook = async (newOrder, pairId, firstFloatDigit) => {
  try {
    let decimalval = minTwoDigits(firstFloatDigit);
    let quntitydecimal = newOrder.quantity * decimalval;
    console.log(newOrder, '---------1089')
    await hincby(
      newOrder.buyorsell + "Orders" + pairId,
      newOrder.price,
      quntitydecimal
    );
    console.log('--------------------------1095', newOrder.buyorsell + "Orders" + pairId,
      newOrder.price,
      quntitydecimal)
    getOrderBookSocket(pairId);
    return true;
  } catch (err) {
    console.log(err, '------1099')
    return false;
  }
};
export const newOrderHistory = async (orderData) => {
  try {
    let adminLiq = await hget("admin_liquidity", "liquidation");
    adminLiq = JSON.parse(adminLiq);
    console.log(orderData, "-------1135");
    let orderHistoryDetails = {
      _id: orderData._id,
      userId: orderData.userId,
      pairId: orderData.pairId,
      firstCurrencyId: orderData.firstCurrencyId,
      firstCurrency: orderData.firstCurrency,
      firstFloatDigit: orderData.firstFloatDigit,
      secondCurrencyId: orderData.secondCurrencyId,
      secondCurrency: orderData.secondCurrency,
      secondFloatDigit: orderData.secondFloatDigit,
      makerFee: orderData.makerFee,
      takerFee: orderData.takerFee,
      quantity:
        orderData.orderType == "market" ? orderData.amount : orderData.quantity,
      price: adminLiq._id.toString() == orderData.userId.toString() ? orderData.price :
        orderData.orderType == "market"
          ? orderData.orderValue
          : orderData.price,
      orderValue: orderData.orderValue,
      pairName: orderData.pairName,
      orderType: orderData.orderType,
      buyorsell: orderData.buyorsell,
      openQuantity: orderData.openQuantity,
      averagePrice: orderData.averagePrice,
      openOrderValue: orderData.openOrderValue,
      filledQuantity: orderData.filledQuantity,
      flag: orderData.flag,
      status: orderData.status,
      orderDate: orderData.orderDate,
      liquidityType: orderData.liquidityType,
      liquidityId: orderData.liquidityId,
      isLiquidityError: orderData.isLiquidityError,
      isLiquidity: orderData.isLiquidity,
      updatedAt: Date.now(),
      orderDate: orderData.orderDate,
      userCode: orderData.userCode,
    };
    SpotOrder.findOneAndUpdate(
      { _id: orderData._id },
      { 
        $set: orderHistoryDetails,
        $setOnInsert: { orderCode: orderData?.orderCode }
      },
      { upsert: true }
    ).exec()
      .then(() => { })
      .catch((err) => {
        console.log(err);
      })
    return true;
  } catch (err) {
    console.log("err on newOrderHistory---", err);
  }
};

/**
 * Stop Limit order place
 * URL : /api/spotOrder
 * METHOD : POST
 * BODY : spotPairId, stopPrice, price, quantity, buyorsell, orderType(stop_limit)
 */
export const stopLimitOrderPlace = async (req, res) => {
  try {
    let reqBody = req.body;
    reqBody.stopPrice = parseFloat(reqBody.stopPrice);
    reqBody.price = parseFloat(reqBody.price);
    reqBody.quantity = parseFloat(reqBody.quantity);

    let spotPairData = await SpotPair.findOne({ _id: reqBody.spotPairId });

    if (!spotPairData) {
      return res.status(400).json({ status: false, message: "Invalid Pair" });
    }

    if (reqBody.quantity < spotPairData.minQuantity) {
      return res.status(400).json({
        status: false,
        message: `Quantity of contract must not be lesser than ${spotPairData.minQuantity}`,
      });
    } else if (reqBody.quantity > spotPairData.maxQuantity) {
      return res.status(400).json({
        status: false,
        message: `Quantity of contract must not be higher than ${spotPairData.maxQuantity}`,
      });
    }

    let currencyId =
      reqBody.buyorsell == "buy"
        ? spotPairData.secondCurrencyId
        : spotPairData.firstCurrencyId;

    // let usrWallet = await Wallet.findOne({ _id: req.user.id });
    // let usrAsset = usrWallet.assets.id(currencyId);
    let usrAsset = await getUserAsset({
      id: req.user.id,
      currencyId: currencyId.toString(),
    });
    if (!usrAsset) {
      return res.status(500).json({ status: false, message: "Error occured" });
    }
    let balance = parseFloat(usrAsset.result.spotBal),
      orderValue =
        reqBody.buyorsell == "buy"
          ? reqBody.price * reqBody.quantity
          : reqBody.quantity;

    if (balance < orderValue) {
      return res.status(400).json({
        status: false,
        message: "Due to insuffient balance order cannot be placed",
      });
    }

    usrAsset.result.spotBal = balance - orderValue;
    await updateUserAsset({
      id: req.user.id,
      currencyId: currencyId.toString(),
      spotBal: usrAsset.result.spotBal,
    });

    socketEmitOne(
      "updateTradeAsset",
      {
        currencyId: usrAsset.result._id,
        spotBal: usrAsset.result.spotBal,
        derivativeBal: usrAsset.result.derivativeBal,
      },
      req.user.id
    );

    let conditionalType = "equal";
    if (spotPairData.markPrice < reqBody.stopPrice) {
      conditionalType = "greater_than";
    } else if (spotPairData.markPrice > reqBody.stopPrice) {
      conditionalType = "lesser_than";
    }

    const newSpotTrade = new SpotTrade({
      userId: req.user.id,
      pairId: spotPairData._id,
      firstCurrencyId: spotPairData.firstCurrencyId,
      firstCurrency: spotPairData.firstCurrencySymbol,
      secondCurrencyId: spotPairData.secondCurrencyId,
      secondCurrency: spotPairData.secondCurrencySymbol,

      stopPrice: reqBody.stopPrice,
      price: reqBody.price,
      quantity: reqBody.quantity,

      orderValue: orderValue,

      pairName: `${spotPairData.firstCurrencySymbol}${spotPairData.secondCurrencySymbol}`,
      beforeBalance: balance,
      afterBalance: usrAsset.result.spotBal,

      orderType: reqBody.orderType,
      orderDate: new Date(),
      buyorsell: reqBody.buyorsell,
      conditionalType,
      status: "conditional",
    });

    let newOrder = await newSpotTrade.save();

    if (spotPairData.botstatus == "binance") {
      let payloadObj = {
        firstCoin: spotPairData.firstCurrencySymbol,
        secondCoin: spotPairData.secondCurrencySymbol,
        side: newOrder.buyorsell,
        price: newOrder.price,
        quantity: newOrder.quantity,
        orderType: newOrder.orderType,
        markupPercentage: spotPairData.markupPercentage,
        minimumValue: 10,
        stopPrice: newOrder.stopPrice ? newOrder.stopPrice : 0,
        markPrice: spotPairData.markPrice,
      };

      let binOrder = await binanceCtrl.orderPlace(payloadObj);
      if (binOrder.status) {
        newOrder.liquidityId = binOrder.data.orderId;
        newOrder.liquidityType = "binance";
        newOrder.isLiquidity = true;
        await newOrder.save();
      }
    }

    getOpenOrderSocket(newOrder.userId, newOrder.pairId);
    return res
      .status(200)
      .json({ status: true, message: "Your order placed successfully." });
  } catch (err) {
    return res
      .status(400)
      .json({ status: false, message: "Limit order match error" });
  }
};

/**
 * Stop Market order place
 * URL : /api/spotOrder
 * METHOD : POST
 * BODY : spotPairId, stopPrice, quantity, buyorsell, orderType(stop_limit)
 */
export const stopMarketOrderPlace = async (req, res) => {
  try {
    let reqBody = req.body;
    reqBody.stopPrice = parseFloat(reqBody.stopPrice);
    reqBody.price = parseFloat(reqBody.price);
    reqBody.quantity = parseFloat(reqBody.quantity);

    let spotPairData = await SpotPair.findOne({ _id: reqBody.spotPairId });

    if (!spotPairData) {
      return res.status(400).json({ status: false, message: "Invalid Pair" });
    }

    if (reqBody.quantity < spotPairData.minQuantity) {
      return res.status(400).json({
        status: false,
        message: `Quantity of contract must not be lesser than ${spotPairData.minQuantity}`,
      });
    } else if (reqBody.quantity > spotPairData.maxQuantity) {
      return res.status(400).json({
        status: false,
        message: `Quantity of contract must not be higher than ${spotPairData.maxQuantity}`,
      });
    }

    let currencyId =
      reqBody.buyorsell == "buy"
        ? spotPairData.secondCurrencyId
        : spotPairData.firstCurrencyId;

    let usrAsset = await getUserAsset({
      id: req.user.id,
      currencyId: currencyId.toString(),
    });
    if (!usrAsset) {
      return res.status(500).json({ status: false, message: "Error occured" });
    }

    let balance = parseFloat(usrAsset.result.spotBal),
      orderValue =
        reqBody.buyorsell == "buy"
          ? reqBody.price * reqBody.quantity
          : reqBody.quantity;

    if (balance < orderValue) {
      return res.status(400).json({
        status: false,
        message: "Due to insuffient balance order cannot be placed",
      });
    }

    usrAsset.result.spotBal = balance - orderValue;
    // let updateUserAsset = await usrWallet.save();
    await updateUserAsset({
      id: req.user.id,
      currencyId: currencyId.toString(),
      spotBal: usrAsset.result.spotBal,
    });

    socketEmitOne(
      "updateTradeAsset",
      {
        currencyId: usrAsset.result._id,
        spotBal: usrAsset.result.spotBal,
        derivativeBal: usrAsset.result.derivativeBal,
      },
      req.user.id
    );

    let conditionalType = "equal";
    if (spotPairData.markPrice < reqBody.stopPrice) {
      conditionalType = "greater_than";
    } else if (spotPairData.markPrice > reqBody.stopPrice) {
      conditionalType = "lesser_than";
    }

    const newSpotTrade = new SpotTrade({
      userId: req.user.id,
      pairId: spotPairData._id,
      firstCurrencyId: spotPairData.firstCurrencyId,
      firstCurrency: spotPairData.firstCurrencySymbol,
      secondCurrencyId: spotPairData.secondCurrencyId,
      secondCurrency: spotPairData.secondCurrencySymbol,

      stopPrice: reqBody.stopPrice,
      price: reqBody.price,
      quantity: reqBody.quantity,

      orderValue: orderValue,

      pairName: `${spotPairData.firstCurrencySymbol}${spotPairData.secondCurrencySymbol}`,
      beforeBalance: balance,
      afterBalance: usrAsset.result.spotBal,

      orderType: reqBody.orderType,
      orderDate: new Date(),
      buyorsell: reqBody.buyorsell,
      conditionalType,
      status: "conditional",
    });

    let newOrder = await newSpotTrade.save();

    if (spotPairData.botstatus == "binance") {
      let payloadObj = {
        firstCoin: spotPairData.firstCurrencySymbol,
        secondCoin: spotPairData.secondCurrencySymbol,
        side: newOrder.buyorsell,
        quantity: newOrder.quantity,
        orderType: newOrder.orderType,
        markupPercentage: spotPairData.markupPercentage,
        minimumValue: 10,
        stopPrice: newOrder.stopPrice ? newOrder.stopPrice : 0,
        markPrice: spotPairData.markPrice,
      };

      let binOrder = await binanceCtrl.orderPlace(payloadObj);
      if (binOrder.status) {
        newOrder.liquidityId = binOrder.data.orderId;
        newOrder.liquidityType = "binance";
        newOrder.isLiquidity = true;
        await newOrder.save();
      }
    }

    getOpenOrderSocket(newOrder.userId, newOrder.pairId);
    return res
      .status(200)
      .json({ status: true, message: "Your order placed successfully." });
  } catch (err) {
    console.log("----err", err);
    return res
      .status(400)
      .json({ status: false, message: "Stop Market order match error" });
  }
};

/**
 * Trailing Stop order place
 * URL : /api/spotOrder
 * METHOD : POST
 * BODY : spotPairId, distance, quantity, buyorsell, orderType(trailing_stop)
 */
export const trailingStopOrderPlace = async (req, res) => {
  try {
    let reqBody = req.body;
    reqBody.distance = parseFloat(reqBody.distance);
    reqBody.quantity = parseFloat(reqBody.quantity);

    let spotPairData = await SpotPair.findOne({ _id: reqBody.spotPairId });

    if (!spotPairData) {
      return res.status(400).json({ status: false, message: "Invalid Pair" });
    }

    if (reqBody.quantity < spotPairData.minQuantity) {
      return res.status(400).json({
        status: false,
        message: `Quantity of contract must not be lesser than ${spotPairData.minQuantity}`,
      });
    } else if (reqBody.quantity > spotPairData.maxQuantity) {
      return res.status(400).json({
        status: false,
        message: `Quantity of contract must not be higher than ${spotPairData.maxQuantity}`,
      });
    }

    let currencyId =
      reqBody.buyorsell == "buy"
        ? spotPairData.secondCurrencyId
        : spotPairData.firstCurrencyId;

    // let usrWallet = await Wallet.findOne({ _id: req.user.id });
    // let usrAsset = usrWallet.assets.id(currencyId);
    let usrAsset = await getUserAsset({
      id: req.user.id,
      currencyId: currencyId.toString(),
    });
    if (!usrAsset) {
      return res.status(500).json({ status: false, message: "Error occured" });
    }

    let balance = parseFloat(usrAsset.spotBal),
      orderValue =
        reqBody.buyorsell == "buy"
          ? (spotPairData.markPrice + reqBody.distance) * reqBody.quantity
          : reqBody.quantity;

    if (balance < orderValue) {
      return res.status(400).json({
        status: false,
        message: "Due to insuffient balance order cannot be placed",
      });
    }

    usrAsset.result.spotBal = balance - orderValue;
    await updateUserAsset({
      id: req.user.id,
      currencyId: currencyId.toString(),
      spotBal: usrAsset.result.spotBal,
    });
    // let updateUserAsset = await usrWallet.save();

    socketEmitOne(
      "updateTradeAsset",
      {
        currencyId: usrAsset.result._id,
        spotBal: usrAsset.result.spotBal,
        derivativeBal: usrAsset.result.derivativeBal,
      },
      req.user.id
    );

    let conditionalType = "equal";
    if (spotPairData.markPrice < reqBody.stopPrice) {
      conditionalType = "greater_than";
    } else if (spotPairData.markPrice > reqBody.stopPrice) {
      conditionalType = "lesser_than";
    }

    const newSpotTrade = new SpotTrade({
      userId: req.user.id,
      pairId: spotPairData._id,
      firstCurrencyId: spotPairData.firstCurrencyId,
      firstCurrency: spotPairData.firstCurrencySymbol,
      secondCurrencyId: spotPairData.secondCurrencyId,
      secondCurrency: spotPairData.secondCurrencySymbol,

      marketPrice: spotPairData.markPrice,
      trailingPrice:
        reqBody.buyorsell == "buy"
          ? spotPairData.markPrice + reqBody.distance
          : spotPairData.markPrice - reqBody.distance,
      distance: reqBody.distance,
      price:
        reqBody.buyorsell == "buy"
          ? spotPairData.markPrice + reqBody.distance
          : spotPairData.markPrice - reqBody.distance,
      quantity: reqBody.quantity,
      orderValue: orderValue,

      pairName: `${spotPairData.firstCurrencySymbol}${spotPairData.secondCurrencySymbol}`,
      beforeBalance: balance,
      afterBalance: usrAsset.result.spotBal,
      orderType: reqBody.orderType,
      orderDate: new Date(),
      buyorsell: reqBody.buyorsell,
      conditionalType,
      status: "conditional",
    });

    let newOrder = await newSpotTrade.save();
    getOpenOrderSocket(newOrder.userId, newOrder.pairId);
    return res
      .status(200)
      .json({ status: true, message: "Your order placed successfully." });
  } catch (err) {
    return res
      .status(400)
      .json({ status: false, message: "Stop Market order match error" });
  }
};

/**
 * Admin Liquidity
 */
export const adminLiquidityPair = async () => {
  try {
    let pairList = await SpotPair.find({ botstatus: "binance" });
    if (pairList.length > 0) {
      let adminData = await Admin.findOne({ role: "superadmin" });
      for (let pairData of pairList) {
        if (pairData.markPrice > 0) {
          adminLiquiditySellOrder(pairData, adminData);
          adminLiquidityBuyOrder(pairData, adminData);
        }
      }
    }
  } catch (err) {
    console.log("Error on admin liquidity pair ", err);
  }
};

export const adminLiquiditySellOrder = async (pairData, adminData) => {
  try {
    let sellOrderList = await SpotTrade.find({
      pairId: pairData._id,
      buyorsell: "sell",
      price: {
        $lte: pairData.markPrice,
      },
      status: { $in: ["open", "pending"] },
    })
      .limit(100)
      .sort({ price: 1 });

    if (sellOrderList && sellOrderList.length > 0) {
      for (let sellOrderData of sellOrderList) {
        let remainingQuantity =
          sellOrderData.quantity - sellOrderData.filledQuantity;
        let buyOrderId = ObjectId();
        let uniqueId = Math.floor(Math.random() * 1000000000);

        const buyOrder = new SpotTrade({
          _id: buyOrderId,
          userId: adminData._id,
          pairId: sellOrderData.pairId,
          firstCurrencyId: sellOrderData.firstCurrencyId,
          firstCurrency: sellOrderData.firstCurrencySymbol,
          secondCurrencyId: sellOrderData.secondCurrencyId,
          secondCurrency: sellOrderData.secondCurrencySymbol,

          quantity: remainingQuantity,
          price: sellOrderData.price,
          orderValue: sellOrderData.price * remainingQuantity,

          pairName: `${sellOrderData.firstCurrencySymbol}${sellOrderData.secondCurrencySymbol}`,

          orderType: "market",
          orderDate: new Date(),
          buyorsell: "buy",
          status: "completed",

          filled: [
            {
              pairId: sellOrderData.pairId,
              sellUserId: sellOrderData.userId,
              buyUserId: adminData._id,
              userId: adminData._id,
              sellOrderId: sellOrderData._id,
              buyOrderId: buyOrderId,
              uniqueId: uniqueId,
              price: sellOrderData.price,
              filledQuantity: remainingQuantity,
              Fees: calculateServiceFee({
                price: remainingQuantity,
                serviceFee: pairData.maker_rebate,
              }),
              status: "filled",
              Type: "buy",
              createdAt: new Date(),
              orderValue: sellOrderData.price * remainingQuantity,
            },
          ],
        });

        await buyOrder.save();

        await SpotTrade.findOneAndUpdate(
          {
            _id: sellOrderData._id,
          },
          {
            $set: {
              status: "completed",
              filledQuantity: sellOrderData.filledQuantity + remainingQuantity,
            },
            $push: {
              filled: {
                pairId: sellOrderData.pairId,
                sellUserId: sellOrderData.userId,
                buyUserId: adminData._id,
                userId: sellOrderData.userId,
                sellOrderId: sellOrderData._id,
                buyOrderId: buyOrderId,
                uniqueId: uniqueId,
                price: sellOrderData.price,
                filledQuantity: remainingQuantity,
                Fees: calculateServiceFee({
                  price: sellOrderData.price * remainingQuantity,
                  serviceFee: pairData.taker_fees,
                }),
                status: "filled",
                Type: "sell",
                createdAt: new Date(),
                orderValue: sellOrderData.price * remainingQuantity,
              },
            },
          },
          { new: true }
        );

        await assetUpdate({
          currencyId: sellOrderData.secondCurrencyId,
          userId: sellOrderData.userId,
          balance: withoutServiceFee({
            price: sellOrderData.price * remainingQuantity,
            serviceFee: pairData.taker_fees,
          }),
        });

        await getOpenOrderSocket(sellOrderData.userId, sellOrderData.pairId);
        await getOrderHistorySocket(sellOrderData.userId, sellOrderData.pairId);
        await getTradeHistorySocket(sellOrderData.userId, sellOrderData.pairId);

        if (pairData.botstatus == "off") {
          await getOrderBookSocket(sellOrderData.pairId);
          await marketPriceSocket(sellOrderData.pairId);
          await recentTradeSocket(sellOrderData.pairId);
        }
      }
    }
    return true;
  } catch (err) {
    return false;
  }
};

export const adminLiquidityBuyOrder = async (pairData, adminData) => {
  try {
    let buyOrderList = await SpotTrade.find({
      pairId: pairData._id,
      buyorsell: "buy",
      price: {
        $gte: pairData.markPrice,
      },
      status: { $in: ["open", "pending"] },
    })
      .limit(100)
      .sort({ price: 1 });

    if (buyOrderList && buyOrderList.length > 0) {
      for (let buyOrderData of buyOrderList) {
        let remainingQuantity =
          buyOrderData.quantity - buyOrderData.filledQuantity;
        let sellOrderId = ObjectId();
        let uniqueId = Math.floor(Math.random() * 1000000000);

        const sellOrder = new SpotTrade({
          _id: buyOrderId,
          userId: adminData._id,
          pairId: buyOrderData.pairId,
          firstCurrencyId: buyOrderData.firstCurrencyId,
          firstCurrency: buyOrderData.firstCurrencySymbol,
          secondCurrencyId: buyOrderData.secondCurrencyId,
          secondCurrency: buyOrderData.secondCurrencySymbol,

          quantity: remainingQuantity,
          price: buyOrderData.price,
          orderValue: buyOrderData.price * remainingQuantity,

          pairName: `${buyOrderData.firstCurrencySymbol}${buyOrderData.secondCurrencySymbol}`,

          orderType: "market",
          orderDate: new Date(),
          buyorsell: "sell",
          status: "completed",

          filled: [
            {
              pairId: buyOrderData.pairId,
              sellUserId: adminData._id,
              buyUserId: buyOrderData.userId,
              userId: adminData._id,
              sellOrderId: sellOrderId,
              buyOrderId: buyOrderData._id,
              uniqueId: uniqueId,
              price: buyOrderData.price,
              filledQuantity: remainingQuantity,
              Fees: calculateServiceFee({
                price: buyOrderData.price * remainingQuantity,
                serviceFee: pairData.maker_rebate,
              }),
              status: "filled",
              Type: "sell",
              createdAt: new Date(),
              orderValue: buyOrderData.price * remainingQuantity,
            },
          ],
        });

        await sellOrder.save();

        await SpotTrade.findOneAndUpdate(
          {
            _id: buyOrderData._id,
          },
          {
            $set: {
              status: "completed",
              filledQuantity: buyOrderData.filledQuantity + remainingQuantity,
            },
            $push: {
              filled: {
                pairId: buyOrderData.pairId,
                sellUserId: adminData._id,
                buyUserId: buyOrderData.userId,
                userId: buyOrderData.userId,
                sellOrderId: sellOrderId,
                buyOrderId: buyOrderData._id,
                uniqueId: uniqueId,
                price: buyOrderData.price,
                filledQuantity: remainingQuantity,
                Fees: calculateServiceFee({
                  price: remainingQuantity,
                  serviceFee: pairData.taker_fees,
                }),
                status: "filled",
                Type: "buy",
                createdAt: new Date(),
                orderValue: buyOrderData.price * remainingQuantity,
              },
            },
          },
          { new: true }
        );

        await assetUpdate({
          currencyId: buyOrderData.firstCurrencyId,
          userId: buyOrderData.userId,
          balance: withoutServiceFee({
            price: buyOrderData.price * remainingQuantity,
            serviceFee: pairData.taker_fees,
          }),
        });

        await getOpenOrderSocket(buyOrderData.userId, buyOrderData.pairId);
        await getOrderHistorySocket(buyOrderData.userId, buyOrderData.pairId);
        await getTradeHistorySocket(buyOrderData.userId, buyOrderData.pairId);

        if (pairData.botstatus == "off") {
          await getOrderBookSocket(buyOrderData.pairId);
          await marketPriceSocket(buyOrderData.pairId);
        }
        await recentTradeSocket(buyOrderData.pairId);
      }
    }
    return true;
  } catch (err) {
    return false;
  }
};

export const assetUpdate = async ({ currencyId, userId, balance }) => {
  try {
    let usrAsset = await getUserAsset({
      id: req.user.id,
      currencyId: currencyId.toString(),
    });
    if (usrAsset) {
      usrAsset.result.spotBal = usrAsset.result.spotBal + parseFloat(balance);
      await updateUserAsset({
        id: req.user.id,
        currencyId: currencyId.toString(),
        spotBal: usrAsset.result.spotBal, // update balance
      });
      socketEmitOne(
        "updateTradeAsset",
        {
          currencyId: usrAsset._id,
          spotBal: usrAsset.result.spotBal,
          derivativeBal: usrAsset.derivativeBal,
        },
        userId
      );
    }
  } catch (err) { }
};

/**
 * Get Order Book
 * URL : /api/spot/ordeBook/:{{pairId}}
 * METHOD : GET
 * PARAMS : pairId
 */
export const getOrderBook = async (req, res) => {
  try {
    let result = await orderBookData({
      pairId: req.params.pairId,
    });
    console.log(result, '-------1873', req.params.pairId)
    return res.status(200).json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false });
  }
};

/**
 * Get Order Book Socket
 * PARAMS : pairId
 */
export const getOrderBookSocket = async (pairId) => {
  try {
    let result = await orderBookData({
      pairId: pairId,
    });
    if (result) {
      let pairDoc = await SpotPair.findOne({ _id: pairId });
      result["pairId"] = pairId;
      result["timestamp"] = Date.now();
      result["symbol"] = pairDoc?.tikerRoot;
      socketEmitOne("orderBook", result, pairDoc?.tikerRoot);
    }

    return true;
  } catch (err) {
    return false;
  }
};
export const orderBookData = async ({ pairId }) => {
  try {
    // let spotPairData = await SpotPair.findOne({ _id: pairId  },{firstFloatDigit:1});
    let spotPairData = await FetchpairData(pairId);
    let decimalval = 0;
    let ordeBookData = {};
    if (spotPairData.botstatus != "bot") {
      return;
    }
    let buyOrders = await hgetall("buyOrders" + pairId);

    let sellOrders = await hgetall("sellOrders" + pairId);
    ordeBookData.buyOrders = buyOrders
      ? Object.entries(buyOrders).map((e) => ({ price: e[0], quantity: e[1] }))
      : [];
    ordeBookData.sellOrders = sellOrders
      ? Object.entries(sellOrders).map((e) => ({ price: e[0], quantity: e[1] }))
      : [];
    // let ordeBookData = await OrderBook.findOne({ pairId: pairId });
    if (ordeBookData.buyOrders || ordeBookData.sellOrders) {
      let buyOrderData =
        ordeBookData.buyOrders.length > 0
          ? ordeBookData.buyOrders.sort((a, b) => b.price - a.price)
          : [];
      let sellOrderData =
        ordeBookData.sellOrders.length > 0
          ? ordeBookData.sellOrders.sort((a, b) => a.price - b.price)
          : [];
      let buyOrderList = [],
        sellOrderList = [];
      if (buyOrderData.length > 0) {
        let sumamount = 0;
        for (let i = 0; i < buyOrderData.length; i++) {
          decimalval = minTwoDigits(spotPairData.firstFloatDigit);
          let quantity = parseFloat(buyOrderData[i].quantity / decimalval);
          sumamount += parseFloat(quantity);
          if (buyOrderData[i]?.price > 0 && buyOrderData[i]?.price != "market") {
            buyOrderList.push({
              _id: buyOrderData[i].price,
              quantity: buyOrderData[i].quantity / decimalval,
              total: sumamount,
            });
          }
        }
      }

      if (sellOrderData.length > 0) {
        let sumamount = 0;
        for (let i = 0; i < sellOrderData.length; i++) {
          decimalval = minTwoDigits(spotPairData.firstFloatDigit);
          let quantity = parseFloat(sellOrderData[i].quantity / decimalval);
          sumamount += parseFloat(quantity);
          if (sellOrderData[i]?.price > 0 && sellOrderData[i]?.price != "market") {
            sellOrderList.push({
              _id: sellOrderData[i].price,
              quantity: sellOrderData[i].quantity / decimalval,
              total: sumamount,
            });
          }
        }
      }
      await SpotPair.findOneAndUpdate(
        { _id: pairId },
        {
          $set: {
            last_ask: sellOrderList[0]?._id,
            last_bid: buyOrderList[0]?._id,
          },
        }
      );
      return {
        buyOrder: buyOrderList.splice(0, 20),
        sellOrder: sellOrderList.splice(0, 20),
      };
    } else {
      return {
        buyOrder: [],
        sellOrder: [],
      };
    }
  } catch (err) {
    console.log(err, "---1979");
    return {
      buyOrder: [],
      sellOrder: [],
    };
  }
};

/**
 * Get User Open Order
 * URL : /api/spot/openOrder/{{pairId}}
 * METHOD : GET
 * Query : page, limit
 */
export const getOpenOrder = async (req, res) => {
  try {
    let pagination = paginationQuery(req.query);
    let data = [];
    let pairList = await hgetall("spotPairdata");
    if (pairList) {
      pairList = await getActivePairs(pairList);
    }
    for (let item of pairList) {
      let buyOrder = await hgetall("buyOpenOrders_" + item._id);
      let sellOrder = await hgetall("sellOpenOrders_" + item._id);
      if (buyOrder) {
        buyOrder = await getvalueObjbyOId(buyOrder, req.user.id, item, data);
        data = buyOrder;
        buyOrder = data.sort((a, b) => b.createdAt - a.createdAt);
      } else {
        buyOrder = [];
      }
      if (sellOrder) {
        sellOrder = await getvalueObjbyOId(sellOrder, req.user.id, item, data);
        data = sellOrder;
        sellOrder = data.sort((a, b) => b.createdAt - a.createdAt);
      } else {
        sellOrder = [];
      }
    }
    // let index = data.findIndex(obj => obj.pairId.toString() == req.params.pairId.toString());
    // if (index > -1 && data.length > 1) {
    //   let [firstVal] = data.splice(index, 1);
    //   data.unshift(firstVal);
    // }
    data.sort((a, b) => {
      // First, prioritize items with the specified pairId
      if (a.pairId === req.params.pairId && b.pairId !== req.params.pairId) {
        return -1; // a comes before b
      }
      if (a.pairId !== req.params.pairId && b.pairId === req.params.pairId) {
        return 1; // b comes before a
      }

      // If both items have the same pairId or neither has the specified pairId, sort by orderDate
      return new Date(b.orderDate) - new Date(a.orderDate); // Sort by orderDate in descending order
    });
    data = data.slice(
      pagination.skip,
      pagination.skip + pagination.limit
    );
    let count = data.length;
    let result = {
      data,
      count: count,
      currentPage: pagination.page,
      nextPage: data.length <= 0 ? true : false,
      limit: pagination.limit,
    };
    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.log("err---------- ", err);
    return res.status(500).json({ success: false });
  }
};
export const getOpenOrder_Old = async (req, res) => {
  try {
    let pagination = paginationQuery(req.query);
    let buyOrder = await hgetall("buyOpenOrders_" + req.params.pairId);
    let sellOrder = await hgetall("sellOpenOrders_" + req.params.pairId);
    let data;
    if (buyOrder) {
      buyOrder = await getvalueObjbyId(buyOrder, req.user.id);
    } else {
      buyOrder = [];
    }
    if (sellOrder) {
      sellOrder = await getvalueObjbyId(sellOrder, req.user.id);
    } else {
      sellOrder = [];
    }
    data = [...buyOrder, ...sellOrder].slice(
      pagination.skip,
      pagination.skip + pagination.limit
    );
    let count = buyOrder.length + sellOrder.length;
    let result = {
      data,
      count: count,
      currentPage: pagination.page,
      nextPage: count > data.length,
      limit: pagination.limit,
    };
    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.log("err---------- ", err);
    return res.status(500).json({ success: false });
  }
};

/**
 * Get User Open Order Socket
 * userId, pairId
 */
export const getOpenOrderSocket = async (userId, pairId) => {
  try {
    let data = [];
    let pairList = await hgetall("spotPairdata");
    if (pairList) {
      pairList = await getActivePairs(pairList);
    }
    for (let item of pairList) {
      let buyOrder = await hgetall("buyOpenOrders_" + item._id);
      let sellOrder = await hgetall("sellOpenOrders_" + item._id);
      if (buyOrder) {
        buyOrder = await getvalueObjbyOId(buyOrder, userId, item, data);
        data = buyOrder;
        buyOrder = data.sort((a, b) => b.createdAt - a.createdAt);
      } else {
        buyOrder = [];
      }
      if (sellOrder) {
        sellOrder = await getvalueObjbyOId(sellOrder, userId, item, data);
        data = sellOrder;
        sellOrder = data.sort((a, b) => b.createdAt - a.createdAt);
      } else {
        sellOrder = [];
      }
    }
    data.sort((a, b) => {
      // First, prioritize items with the specified pairId
      if (a.pairId === pairId && b.pairId !== pairId) {
        return -1; // a comes before b
      }
      if (a.pairId !== pairId && b.pairId === pairId) {
        return 1; // b comes before a
      }

      // If both items have the same pairId or neither has the specified pairId, sort by orderDate
      return new Date(b.orderDate) - new Date(a.orderDate); // Sort by orderDate in descending order
    });
    // let index = data.findIndex(obj => obj.pairId.toString() == pairId.toString());
    // if (index > -1 && data.length > 1) {
    //   let [firstVal] = data.splice(index, 1);
    //   data.unshift(firstVal);
    // }
    let result = {
      pairId,
      data,
      count: data.length,
    };
    socketEmitOne("openOrder", result, userId);
    return true;
  } catch (err) {
    console.log("gggggggggggg", err);
    return false;
  }
};

/**
 * Get User Filled Order
 * URL : /api/spot/openOrder/{{pairId}}
 * METHOD : GET
 * Query : page, limit
 */
export const getFilledOrder = async (req, res) => {
  try {
    let pagination = paginationQuery(req.query);

    let count = await SpotTrade.countDocuments({
      userId: req.user.id,
      pairId: req.params.pairId,
      status: "completed",
    });
    let data = await SpotTrade.aggregate([
      {
        $match: {
          userId: ObjectId(req.user.id),
          pairId: ObjectId(req.params.pairId),
          status: "completed",
        },
      },
      { $sort: { _id: -1 } },
      { $skip: pagination.skip },
      { $limit: pagination.limit },
      {
        $project: {
          orderDate: {
            $dateToString: {
              date: "$orderDate",
              format: "%Y-%m-%d %H:%M",
            },
          },
          firstCurrency: 1,
          secondCurrency: 1,
          orderType: 1,
          buyorsell: 1,
          price: 1,
          quantity: 1,
          filledQuantity: 1,
          orderValue: 1,
        },
      },
    ]);

    let result = {
      count,
      currentPage: pagination.page,
      nextPage: count > data.length,
      limit: pagination.limit,
      data,
    };
    return res.status(200).json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false });
  }
};

/**
 * Get User Filled Order Socket
 * userId, pairId
 */
export const getFilledOrderSocket = async (userId, pairId) => {
  try {
    let count = await SpotTrade.countDocuments({
      userId: userId,
      pairId: pairId,
      status: "completed",
    });
    let data = await SpotTrade.aggregate([
      {
        $match: {
          userId: ObjectId(userId),
          pairId: ObjectId(pairId),
          status: "completed",
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 10 },
      {
        $project: {
          orderDate: {
            $dateToString: {
              date: "$orderDate",
              format: "%Y-%m-%d %H:%M",
            },
          },
          firstCurrency: 1,
          secondCurrency: 1,
          orderType: 1,
          buyorsell: 1,
          price: 1,
          quantity: 1,
          filledQuantity: 1,
          orderValue: 1,
        },
      },
    ]);

    let result = {
      pairId,
      count,
      currentPage: 1,
      nextPage: count > data.length,
      limit: 10,
      data,
    };
    socketEmitOne("filledOrder", result, userId);
    return true;
  } catch (err) {
    return false;
  }
};

/**
 * Get User Trade History
 * URL : /api/spot/orderHistory/{{pairId}}
 * METHOD : GET
 * Query : page, limit
 */
export const getOrderHistory = async (req, res) => {
  try {
    let pagination = paginationQuery(req.query);
    let orderHistDoc = await hgetall("orderHistory_" + req.user.id);
    let buyOrder = await hgetall("buyOpenOrders_" + req.params.pairId);
    let sellOrder = await hgetall("sellOpenOrders_" + req.params.pairId);
    if (buyOrder) {
      buyOrder = await getvalueObjbyId(buyOrder, req.user.id);
      buyOrder = buyOrder.sort(
        (a, b) => new Date(b.orderDate) - new Date(a.orderDate)
      );
    } else {
      buyOrder = [];
    }
    if (sellOrder) {
      sellOrder = await getvalueObjbyId(sellOrder, req.user.id);
      sellOrder = sellOrder.sort(
        (a, b) => new Date(b.orderDate) - new Date(a.orderDate)
      );
    } else {
      sellOrder = [];
    }
    if (orderHistDoc) {
      orderHistDoc = await getvalueObjByPair(orderHistDoc, req.params.pairId);
      orderHistDoc = orderHistDoc.sort(
        (a, b) => new Date(b.orderDate) - new Date(a.orderDate)
      );
    } else {
      orderHistDoc = [];
    }
    let count = buyOrder.length + sellOrder.length + orderHistDoc.length;
    orderHistDoc = [...buyOrder, ...sellOrder, ...orderHistDoc].slice(
      pagination.skip,
      pagination.skip + pagination.limit
    );
    let result = {
      data: orderHistDoc,
      count: count,
      currentPage: 1,
      nextPage: orderHistDoc.length <= 0 ? true : false,
      limit: pagination.limit,
    };

    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.log("err: ", err);
    return res.status(500).json({ success: false });
  }
};

/**
 * Get User Order History Socket
 * userId, pairId
 */
export const getOrderHistorySocket = async (userId, pairId) => {
  try {
    let orderHistDoc = await hgetall("orderHistory_" + userId);
    let buyOrder = await hgetall("buyOpenOrders_" + pairId);
    let sellOrder = await hgetall("sellOpenOrders_" + pairId);
    if (buyOrder) {
      buyOrder = await getvalueObjbyId(buyOrder, userId);
      buyOrder = buyOrder.sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));
    } else {
      buyOrder = [];
    }
    if (sellOrder) {
      sellOrder = await getvalueObjbyId(sellOrder, userId);
      sellOrder = sellOrder.sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));
    } else {
      sellOrder = [];
    }
    if (orderHistDoc) {
      orderHistDoc = await getvalueObjByPair(orderHistDoc, pairId);
      orderHistDoc = orderHistDoc.sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));
    } else {
      orderHistDoc = [];
    }

    let count = buyOrder.length + sellOrder.length + orderHistDoc.length;
    orderHistDoc = [...buyOrder, ...sellOrder, ...orderHistDoc].slice(0, 10);
    let result = {
      pairId,
      data: orderHistDoc,
      count: count,
      currentPage: 1,
      nextPage: count > orderHistDoc.length,
      limit: 10,
    };
    socketEmitOne("orderHistory", result, userId);
    return true;
  } catch (err) {
    return false;
  }
};

/**
 * Get User Trade History
 * URL : /api/spot/tradeHistory/{{pairId}}
 * METHOD : GET
 * Query : page, limit
 */
export const getTradeHistory = async (req, res) => {
  try {
    let pagination = paginationQuery(req.query);
    let tradeDoc = await hgetall("tradeHistory_" + req.params.pairId);
    if (tradeDoc) {
      tradeDoc = await getvalueObjbyId(tradeDoc, req.user.id, "trade");
      tradeDoc = tradeDoc.sort((a, b) => b.createdAt - a.createdAt);
    } else {
      tradeDoc = [];
    }
    let count = tradeDoc.length;
    tradeDoc = tradeDoc.slice(
      pagination.skip,
      pagination.skip + pagination.limit
    );
    let result = {
      data: !isEmpty(tradeDoc) ? tradeDoc : [],
      count: count,
      currentPage: 1,
      nextPage: tradeDoc.length <= 0 ? true : false,
      limit: pagination.limit,
    };
    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.log("err: ", err);
    return res.status(500).json({ success: false });
  }
};

/**
 * Get User Trade History Socket
 * URL : /api/spot/tradeHistory/{{pairId}}
 * METHOD : GET
 * Query : page, limit
 */
export const getTradeHistorySocket = async (userId, pairId) => {
  try {
    let tradeDoc = await hgetall("tradeHistory_" + pairId);
    if (tradeDoc) {
      tradeDoc = await getvalueObjbyId(tradeDoc, userId, "trade");
      tradeDoc = tradeDoc.sort((a, b) => b.createdAt - a.createdAt);
    } else {
      tradeDoc = [];
    }
    let count = tradeDoc.length;
    tradeDoc = tradeDoc.slice(0, 10);
    let result = {
      pairId,
      data: tradeDoc,
      count: count,
      currentPage: 1,
      nextPage: count > tradeDoc.length,
      limit: 10,
    };
    socketEmitOne("tradeHistory", result, userId);
    return true;
  } catch (err) {
    console.log("toString()toString()toString()", err);
    return false;
  }
};

/**
 * Get market price
 * URL : /api/spot/marketPrice/{{pairId}}
 * METHOD : GET
 */
export const getMarketPrice = async (req, res) => {
  try {
    let tickerPrice = await marketPrice(req.params.pairId);
    if (tickerPrice.status) {
      return res
        .status(200)
        .json({ success: true, result: tickerPrice.result });
    }
    return res.status(409).json({ success: false });
  } catch (err) {
    return res.status(500).json({ success: false });
  }
};

/**
 * Get market price socket
 * pairId
 */
export const marketPriceSocket = async (pairId) => {
  try {
    let pairData = await SpotPair.findOne({ _id: pairId }, { tikerRoot: 1 });
    let tickerPrice = await marketPrice(pairId);
    if (tickerPrice.status) {
      socketEmitOne(
        "marketPrice",
        {
          pairId,
          data: tickerPrice.result,
        },
        "spot"
      );
      return true;
    }
    return false;
  } catch (err) {
    return false;
  }
};

export const marketPrice = async (pairId) => {
  try {
    let spotPairData = await FetchpairData(pairId);
    let tradeDoc = await hgetall("tradeHistory_" + pairId);
    let firstVolume = 0;
    let secondVolume = 0;
    let result = {};
    let openPrice = null;
    let closePrice = 0;
    let minPrice = 0;
    let maxPrice = 0;
    if (spotPairData && (spotPairData.botstatus == "off" || spotPairData.botstatus == "bot") && tradeDoc != null) {
      tradeDoc = await getvalueObj(tradeDoc);
      tradeDoc.sort((a, b) => {
        return a.createdAt - b.createdAt;
      });
      if (tradeDoc.length > 0) {
        for (let i = 0; i < tradeDoc.length; i++) {
          if (
            tradeDoc[i].createdAt >=
            new Date(Date.now() - 24 * 60 * 60 * 1000) &&
            tradeDoc[i].createdAt <= new Date()
          ) {
            if (openPrice == null) {
              openPrice = tradeDoc[i].tradePrice;
              maxPrice = tradeDoc[i].tradePrice;
              minPrice = tradeDoc[i].tradePrice;
            }
            if (tradeDoc[i].tradePrice > maxPrice) {
              maxPrice = tradeDoc[i].tradePrice;
            }
            if (tradeDoc[i].tradePrice < minPrice) {
              minPrice = tradeDoc[i].tradePrice;
            }
            closePrice = tradeDoc[i].tradePrice;
            secondVolume += tradeDoc[i].tradePrice * tradeDoc[i].tradeQty;
            firstVolume += tradeDoc[i].tradeQty;
          }
        }
        if (!isEmpty(openPrice)) {
          let diff = closePrice - openPrice;
          result = {
            markPrice: spotPairData.markPrice,
            last: closePrice,
            change: (diff / openPrice) * 100,
            high: maxPrice,
            low: minPrice,
            firstVolume,
            secondVolume,
            changePrice: diff,
            botstatus: spotPairData.botstatus,
            firstCurrencySymbol: spotPairData.firstCurrencySymbol,
            secondCurrencySymbol: spotPairData.secondCurrencySymbol,
            _id: pairId,
          };
          hset("spot24hrsChange", pairId, result);
          return {
            status: true,
            result,
          };
        } else {
          result = {
            markPrice: spotPairData.markPrice,
            last: 0,
            change: 0,
            high: 0,
            low: 0,
            firstVolume: 0,
            secondVolume: 0,
            changePrice: 0,
            botstatus: spotPairData.botstatus,
            _id: pairId,
          };
          hset("spot24hrsChange", pairId, result);
          return {
            status: true,
            result,
          };
        }
      } else {
        result = {
          markPrice: spotPairData.markPrice,
          last: 0,
          change: 0,
          high: 0,
          low: 0,
          firstVolume: 0,
          secondVolume: 0,
          changePrice: 0,
          botstatus: spotPairData.botstatus,
          _id: pairId,
        };
        hset("spot24hrsChange", pairId, result);
        return {
          status: true,
          result,
        };
      }
    } else {
      let spotPairData = await SpotPair.findOne({ _id: pairId });
      if (spotPairData && (spotPairData.botstatus == "off" || spotPairData.botstatus == "bot")) {
        let tradeDoc = await TradeHistory.aggregate([
          {
            $match: {
              pairId: ObjectId(pairId),
            },
          },
          {
            $match: {
              createdAt: {
                $gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                $lte: new Date(),
              },
            },
          },
          {
            $sort: { createdAt: 1 },
          },

          {
            $project: {
              tradePrice: 1,
              tradeQty: 1,
              markPrice: 1,
            },
          },
        ]);
        if (tradeDoc.length > 0) {
          for (let i = 0; i < tradeDoc.length; i++) {
            if (openPrice == null) {
              openPrice = tradeDoc[i].tradePrice;
              maxPrice = tradeDoc[i].tradePrice;
              minPrice = tradeDoc[i].tradePrice;
            }
            if (tradeDoc[i].tradePrice > maxPrice) {
              maxPrice = tradeDoc[i].tradePrice;
            }
            if (tradeDoc[i].tradePrice < minPrice) {
              minPrice = tradeDoc[i].tradePrice;
            }
            closePrice = tradeDoc[i].tradePrice;
            firstVolume += tradeDoc[i].tradeQty;
            secondVolume += tradeDoc[i].tradePrice * tradeDoc[i].tradeQty;
          }

          let diff = closePrice - openPrice;
          result = {
            markPrice: spotPairData.markPrice,
            last: closePrice,
            change: (diff * openPrice) / 100,
            high: maxPrice,
            low: minPrice,
            firstVolume,
            secondVolume,
            changePrice: diff,
            botstatus: spotPairData.botstatus,
            firstCurrencySymbol: spotPairData.firstCurrencySymbol,
            secondCurrencySymbol: spotPairData.secondCurrencySymbol,
            _id: pairId,
          };
          hset("spot24hrsChange", pairId, result);
          return {
            status: true,
            result,
          };
        } else {
          result = {
            markPrice: spotPairData.markPrice,
            last: 0,
            change: 0,
            high: 0,
            low: 0,
            firstVolume: 0,
            secondVolume: 0,
            changePrice: 0,
            botstatus: spotPairData.botstatus,
            firstCurrencySymbol: spotPairData.firstCurrencySymbol,
            secondCurrencySymbol: spotPairData.secondCurrencySymbol,
            _id: pairId,
          };
          hset("spot24hrsChange", pairId, result);
          return {
            status: true,
            result,
          };
        }
      }
    }
  } catch (err) {
    console.log("err: ", err);
    return {
      status: false,
    };
  }
};

/**
 * Trigger Stop Limit Order
 * price
 */
export const triggerStopLimitOrder = async (spotPairData) => {
  try {
    if (!isEmpty(spotPairData) && !isEmpty(spotPairData.markPrice)) {
      let takeProfitOrder = await SpotTrade.find({
        pairId: ObjectId(spotPairData._id),
        status: "conditional",
        orderType: "stop_limit",
        conditionalType: "greater_than",
        stopPrice: { $lte: spotPairData.markPrice },
        isLiquidity: false,
      });

      if (takeProfitOrder && takeProfitOrder.length > 0) {
        for (let profitOrder of takeProfitOrder) {
          let newOrder = await SpotTrade.findOneAndUpdate(
            { _id: profitOrder._id },
            { status: "open" },
            { new: true }
          );
          getOpenOrderSocket(newOrder.userId, newOrder.pairId);
          getOrderBookSocket(newOrder.pairId);
          await tradeList(newOrder, spotPairData);
        }
      }

      let stopLossOrder = await SpotTrade.find({
        pairId: ObjectId(spotPairData._id),
        status: "conditional",
        orderType: "stop_limit",
        conditionalType: "lesser_than",
        stopPrice: { $gte: spotPairData.markPrice },
        isLiquidity: false,
      });

      if (stopLossOrder && stopLossOrder.length > 0) {
        for (let lossOrder of stopLossOrder) {
          let newOrder = await SpotTrade.findOneAndUpdate(
            { _id: lossOrder._id },
            { status: "open" },
            { new: true }
          );
          getOpenOrderSocket(newOrder.userId, newOrder.pairId);
          getOrderBookSocket(newOrder.pairId);
          await tradeList(newOrder, spotPairData);
        }
      }
    }
  } catch (err) { }
};

/**
 * Trailing Stop Order
 * price
 */
export const trailingStopOrder = async (spotPairData) => {
  try {
    if (!isEmpty(spotPairData) && !isEmpty(spotPairData.markPrice)) {
      let orderList = await SpotTrade.find({
        pairId: ObjectId(spotPairData._id),
        status: "conditional",
        orderType: "trailing_stop",
      });

      if (orderList && orderList.length > 0) {
        for (let orderData of orderList) {
          if (orderData.buyorsell == "buy") {
            if (orderData.marketPrice > spotPairData.markPrice) {
              await SpotTrade.updateOne(
                {
                  _id: orderData._id,
                },
                {
                  $set: {
                    marketPrice: spotPairData.markPrice,
                    trailingPrice: spotPairData.markPrice - orderData.distance,
                  },
                }
              );
            } else if (
              orderData.marketPrice < spotPairData.markPrice &&
              spotPairData.markPrice < orderData.trailingPrice
            ) {
              await SpotTrade.updateOne(
                {
                  _id: orderData._id,
                },
                {
                  $set: {
                    marketPrice: spotPairData.markPrice,
                  },
                }
              );
            } else if (
              orderData.marketPrice < spotPairData.markPrice &&
              spotPairData.markPrice >= orderData.trailingPrice
            ) {
              let updateOrder = await SpotTrade.findOneAndUpdate(
                {
                  _id: orderData._id,
                },
                {
                  price: orderData.trailingPrice,
                  marketPrice: spotPairData.markPrice,
                  status: "open",
                },
                { new: true }
              );

              if (orderData.price > orderData.trailingPrice) {
                // Balance Retrieve
                await assetUpdate({
                  currencyId: orderData.secondCurrencyId,
                  userId: orderData.userId,
                  balance:
                    orderData.price * orderData.quantity -
                    orderData.trailingPrice * orderData.quantity,
                });
              }

              await tradeList(updateOrder, spotPairData);
            }
          } else if (orderData.buyorsell == "sell") {
            if (orderData.marketPrice < spotPairData.markPrice) {
              await SpotTrade.updateOne(
                {
                  _id: orderData._id,
                },
                {
                  $set: {
                    marketPrice: spotPairData.markPrice,
                    trailingPrice: spotPairData.markPrice - orderData.distance,
                  },
                }
              );
            } else if (
              orderData.marketPrice > spotPairData.markPrice &&
              spotPairData.markPrice > orderData.trailingPrice
            ) {
              await SpotTrade.updateOne(
                {
                  _id: orderData._id,
                },
                {
                  $set: {
                    marketPrice: spotPairData.markPrice,
                  },
                }
              );
            } else if (
              orderData.marketPrice > spotPairData.markPrice &&
              spotPairData.markPrice <= orderData.trailingPrice
            ) {
              let updateOrder = await SpotTrade.findOneAndUpdate(
                {
                  _id: orderData._id,
                },
                {
                  price: orderData.trailingPrice,
                  marketPrice: spotPairData.markPrice,
                  status: "open",
                },
                { new: true }
              );
              await tradeList(updateOrder, spotPairData);
            }
          }
        }
      }
    }
  } catch (err) { }
};

/**
 * Get Recent Trade
 * URL : /api/spot/recentTrade/{{pairId}}
 * METHOD : GET
 */
export const getRecentTrade = async (req, res) => {
  try {
    let pairData = await FetchpairData(req.params.pairId);
    if (pairData) {
      if (pairData.botstatus == "off") {
        let recentTradeData = await binanceCtrl.recentTrade({
          firstCurrencySymbol: pairData.firstCurrencySymbol,
          secondCurrencySymbol: pairData.secondCurrencySymbol,
        });
        if (recentTradeData && recentTradeData.length > 0) {
          return res.status(200).json({ success: true, result: recentTradeData });
        }
      }
      else if (pairData.botstatus == "bot") {
        let recentTradeData = await recentTrade(pairData._id);
        if (recentTradeData.status) {
          return res
            .status(200)
            .json({ success: true, result: recentTradeData.result });
        }
      }
      // } else if (pairData.botstatus == "wazirx") {
      //   let recentTradeData = await wazirixRecentTrades({
      //     firstCurrencySymbol: pairData.firstCurrencySymbol,
      //     secondCurrencySymbol: pairData.secondCurrencySymbol,
      //   });
      //   if (recentTradeData && recentTradeData.length > 0) {
      //     return res
      //       .status(200)
      //       .json({ success: true, result: recentTradeData });
      //   }
      // } else {
      //   let recentTradeData = await recentTrade(pairData._id);

      //   if (recentTradeData.status) {
      //     return res
      //       .status(200)
      //       .json({ success: true, result: recentTradeData.result });
      //   }
      // }

      return res.status(409).json({ success: false });
    }
  } catch (err) {
    console.log("err---------- ", err);
    return res.status(500).json({ success: false });
  }
};

/**
 * Get Recent Trade Socket
 * pairId
 */
export const recentTradeSocket = async (pairId) => {
  try {
    let pairData = await SpotPair.findOne({ _id: pairId }, { tikerRoot: 1 });
    let recentTradeData = await recentTrade(pairId);
    if (recentTradeData.status) {
      socketEmitOne(
        "recentTrade",
        {
          pairId,
          data: recentTradeData.result,
        },
        pairData.tikerRoot
      );
      return true;
    }
    return false;
  } catch (err) {
    return false;
  }
};

export const recentTrade = async (pairId) => {
  try {
    let recentTrade = await hgetall("tradeHistory_" + pairId);
    if (recentTrade) {
      recentTrade = await getTradevalueObj(recentTrade);
    }
    recentTrade = recentTrade
      .sort((a, b) => b.createdAt - a.createdAt)
      .splice(0, 25);
    if (recentTrade.length > 0) {
      return {
        status: true,
        result: recentTrade,
      };
    }
    return {
      status: true,
      result: [],
    };
  } catch (err) {
    return {
      status: true,
      result: [],
    };
  }
};

const getvalueObjbyId = async (allvalues, useId, type = "") => {
  if (type == "trade") {
    var keys = Object.values(allvalues);
    let newarray = [];
    for (var i = 0; i < keys.length; i++) {
      var str = [keys[i]];
      str = JSON.parse(str);
      if (str.buyUserId == useId) {
        let data = {
          createdAt: str.createdAt,
          firstCurrency: str.firstCurrency,
          secondCurrency: str.secondCurrency,
          pair: str.firstCurrency / str.secondCurrency,
          buyorsell: "buy",
          tradePrice: str.tradePrice,
          tradeQty: str.tradeQty,
          fee: str.buyerFee,
          pairId: str.pairId,
          orderCode: str.buyOrdCode,
        };
        newarray.push(data);
      } else if (str.sellUserId == useId) {
        let data = {
          createdAt: str.createdAt,
          firstCurrency: str.firstCurrency,
          secondCurrency: str.secondCurrency,
          pair: str.firstCurrency / str.secondCurrency,
          buyorsell: "sell",
          tradePrice: str.tradePrice,
          tradeQty: str.tradeQty,
          fee: str.sellerFee,
          pairId: str.pairId,
          orderCode: str.sellOrdCode,
        };
        newarray.push(data);
      }
    }
    return newarray;
  } else {
    var keys = Object.values(allvalues);
    let newarray = [];
    for (var i = 0; i < keys.length; i++) {
      var str = [keys[i]];
      str = JSON.parse(str);
      if (str.userId == useId) {
        newarray.push(str);
      }
    }
    return newarray;
  }
};
export const getvalueObjbyOId = async (allvalues, useId, pairDet, data) => {
  var keys = Object.values(allvalues);
  for (var i = 0; i < keys.length; i++) {
    var str = [keys[i]];
    str = JSON.parse(str);
    if (str.userId == useId) {
      data.push({ ...str, ...{ pairDetail: pairDet } });
    }
  }
  return data;
}
export const fetchAllpairs = async () => {
  try {
    pairInfo = [];
    let pairdetials = await hgetall("spotPairdata");
    if (pairdetials) {
      pairdetials = await intialPair(pairdetials);
    }
    if (pairdetials?.length > 0) {
      pairInfo = pairdetials;
    } else {
      pairInfo = [];
    }
    if (!pairdetials) {
      let spotPairData = await SpotPair.find({ status: "active" })
        .lean()
        .select({ firstCurrencySymbol: 1 });
      if (spotPairData.length > 0) {
        pairInfo = spotPairData;
      } else {
        pairInfo = [];
      }
    }
  } catch (err) {
    console.log("-----------err on fetchAllpairs", err);
  }
};
const intialPair = async (allvalues) => {
  var keys = Object.values(allvalues);
  let newarray = [];
  for (var i = 0; i < keys.length; i++) {
    var str = [keys[i]];
    str = JSON.parse(str);
    if (str.status === "active") {
      newarray.push({
        pair: str.firstCurrencySymbol,
        _id: str._id,
        botstatus: str.botstatus,
        firstCurrencySymbol: str.firstCurrencySymbol,
        secondCurrencySymbol: str.secondCurrencySymbol,
      });
    }
  }
  return newarray;
};
export const getActivePairs = async (allvalues) => {
  var keys = Object.values(allvalues);
  let newarray = [];
  for (var i = 0; i < keys.length; i++) {
    var str = [keys[i]];
    str = JSON.parse(str);
    if (str.status === "active") {
      newarray.push(str);
    }
  }
  return newarray;
};
const getvalueObjByPair = async (allvalues, id) => {
  var keys = Object.values(allvalues);
  let newarray = [];
  for (var i = 0; i < keys.length; i++) {
    var str = [keys[i]];
    str = JSON.parse(str);
    if (str.pairId == id) {
      newarray.push(str);
    }
  }
  return newarray;
};
export const getTradevalueObj = async (allvalues) => {
  var keys = Object.values(allvalues);
  let newarray = [];
  for (var i = 0; i < keys.length; i++) {
    var str = [keys[i]];
    str = JSON.parse(str);
    let data = {
      createdAt: str.createdAt,
      Type: str.isMaker,
      tradePrice: str.tradePrice,
      tradeQty: str.tradeQty,
    };
    newarray.push(data);
  }
  return newarray;
};

export const getvalueObj = async (allvalues) => {
  var keys = Object.values(allvalues);
  let newarray = [];
  for (var i = 0; i < keys.length; i++) {
    var str = [keys[i]];
    newarray.push(JSON.parse(str));
  }
  return newarray;
};

cron.schedule("* * * * * *", async () => {
  try {
    if (isEmpty(pairInfo)) {
      return;
    }
    for (let i = 0; i < pairInfo.length; i++) {
      if (isRun == false) {
        matchingcall(pairInfo[i]._id);
      }
    }
  } catch (err) {
    console.log("-----------err on match call cron", err);
  }
});

export const matchingcall = async (pairId) => {
  // console.log("-----3050");
  let pairData;
  let spotPairData = await FetchpairData(pairId);
  if (spotPairData) {
    pairData = spotPairData;
  } else {
    pairData = await SpotPair.findOne({ _id: pairId });
  }
  if (!isEmpty(pairData)) {
    let orderList = await hgetall("buyOpenOrders_" + pairData._id);
    if (orderList) {
      orderList = await getvalueObj(orderList);
      orderList = orderList.sort((a, b) => a.orderDate - b.orderDate);
    }
    let sellorderList = await hgetall("sellOpenOrders_" + pairData._id);
    if (sellorderList) {
      sellorderList = await getvalueObj(sellorderList);
      sellorderList = sellorderList.sort((a, b) => a.orderDate - b.orderDate);
    }
    await tradeMatching(orderList, sellorderList, pairData);
  }
};

export const liqOrdCreation = async (data, side, timeDelay) => {
  try {
    let adminLiq = await hget("admin_liquidity", "liquidation");
    adminLiq = JSON.parse(adminLiq);
    console.log(adminLiq, "---------3075");
    if (data?.userId.toString() == adminLiq._id.toString()) return true;
    let cost = side == "buy" ? "orderValue" : "amount";
    let newOpenOrder = { ...data };
    console.log(newOpenOrder, "---------3344");
    newOpenOrder[cost] = side == "buy" ? data.orderValue : data.amount;

    newOpenOrder._id = createobjectId();
    newOpenOrder.orderCode = await getSequenceId("orderHistory");
    newOpenOrder.buyorsell = side;
    if (newOpenOrder.orderType == "limit") {
      newOpenOrder.price = newOpenOrder.averagePrice;
    }
    newOpenOrder.flag = false;
    newOpenOrder.orderDate = new Date(), // Date.now();
      newOpenOrder.userCode = adminLiq.userId;
    newOpenOrder.userId = adminLiq._id;
    console.log(newOpenOrder, "--------3350");
    console.log(new Date(), '----------3115', timeDelay)
    if (timeDelay) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    console.log(new Date(), '-----------3119')
    await hset(
      newOpenOrder.buyorsell + "OpenOrders_" + newOpenOrder.pairId,
      newOpenOrder._id,
      newOpenOrder
    );
    newOrderHistory(newOpenOrder);
  } catch (err) {
    console.log("---------------416", err);
  }
};

const brokerageFeeCalc = async (fee, data, curId, curName) => {
  try {
    const { status, data: parentData } = await getParentData(data.userId)
    if (status) {
      const parsedData = JSON.parse(parentData)
      console.log('parsedData: ', parsedData);
      const reqData = {
        baseSymbol: curName,
        convertSymbol: "B5"
      }
      const { status, convertPrice, tokenId } = await priceConversionGrpc(reqData)
      console.log('convertPrice: ', convertPrice);
      let brokerageFee = fee * (parsedData.planDetails.brokerage / 100)
      const remainingFee = fee - brokerageFee
      brokerageFee = brokerageFee * convertPrice
      brokerageFee = toFixedDown(brokerageFee, 8)
      console.log('brokerageFee: ', brokerageFee);
      console.log('data.userId: ', data.userId);
      console.log('curName: ', curName);
      console.log('data.userId: ', data.userId);
      let wallet = await hget(
        "walletbalance_affiliate",
        parsedData.userId + "_" + tokenId
      );
      let afterBalance = await hincbyfloat(
        "walletbalance_affiliate",
        parsedData.userId.toString() + "_" + tokenId.toString(),
        brokerageFee
      );
      passbook({
        userId: parsedData.userId.toString(),
        coin: "B5",
        currencyId: tokenId,
        tableId: parsedData._id.toString(),
        beforeBalance: wallet,
        afterBalance: afterBalance,
        amount: brokerageFee,
        type: "brokerage_fee",
        category: "credit",
      });
      createStakerHistory(parentData, brokerageFee, "brokerage_fee", data.userId, "B5", data.contributor, tokenId.toString())
      // return remainingFee
      return fee
    }
    return fee
  } catch (error) {
    console.log("error--------", error);
  }
}

export const tradeMatching = async (bOrders, sOrders, pairData) => {
  try {
    isRun = true;
    let buyOrders = bOrders;
    let sellOrders = sOrders;
    // console.log("----------31022");
    // console.log(buyOrders && buyOrders.length, "---------buyOrders");
    // console.log(sellOrders && sellOrders.length, "---------sellOrders");
    // console.log(pairData.markPrice, "---------pairData.markPrice");
    if (sellOrders != null && pairData.botstatus == "off") {
      // console.log("---------3109");
      for (let element of sellOrders) {
        if (element.price == "market") {
        } else if (element.price <= pairData.markPrice && !element.isMaker) {
          let bO = await liqOrdCreation(element, "buy", false);
          break;
        }
      }
      let bOrd = await hgetall("buyOpenOrders_" + pairData._id);
      if (bOrd) {
        bOrd = await getvalueObj(bOrd);
        bOrd = bOrd.sort((a, b) => a.orderDate - b.orderDate);
        buyOrders = bOrd;
      }
    }
    if (buyOrders != null && pairData.botstatus == "off") {
      // console.log("-------------3123");
      for (let element of buyOrders) {
        if (element.price == "market") {
        } else if (element.price >= pairData.markPrice && !element.isMaker) {
          let sO = await liqOrdCreation(element, "sell", false);
          break;
        }
      }
      // console.log("-----------3130");
      let sOrd = await hgetall("sellOpenOrders_" + pairData._id);
      if (sOrd) {
        sOrd = await getvalueObj(sOrd);
        sOrd = sOrd.sort((a, b) => a.orderDate - b.orderDate);
        sellOrders = sOrd;
      }
    }

    if (pairData.botstatus == "bot") {
      if (buyOrders == null && sellOrders != null) {
        sellOrders.forEach(async (element) => {
          if (element.price === "market" && element.liquidityType == "off") {
            console.log('----SellMarket Order Remove----')
            cancelMarketOrder(`sellOpenOrders_${element.pairId}`, element._id);
          }
        });
      }
      if (sellOrders == null && buyOrders != null) {
        buyOrders.forEach(async (element) => {
          if (element.price === "market" && element.liquidityType == "off") {
            console.log('----BuyMarket Order Remove----')
            cancelMarketOrder(`buyOpenOrders_${element.pairId}`, element._id);
          }
        });
      }
    }
    if (buyOrders == null || sellOrders == null) {
      isRun = false;
      // console.log("-----------3140");
      return;
    }

    buyOrders = buyOrders.sort(function (a, b) {
      if (a.price === "market") return -1;
      else return b.price - a.price;
    });
    sellOrders = sellOrders.sort(function (a, b) {
      if (a.price === "market") return -1;
      else return a.price - b.price;
    });
    if (buyOrders.length > 0 && sellOrders.length > 0) {
      isRun = true;
      tradePair = pairData._id;
    }
    // console.log(isRun, "----------3153");
    while (buyOrders.length > 0 && sellOrders.length > 0) {
      let uniqueId = Math.floor(Math.random() * 1000000000);
      let current_buy = buyOrders[0];
      let current_buy_limit;
      let current_sell = sellOrders[0];
      let current_sell_limit;

      //check if order is already in liquidity
      // if (current_sell.isLiquidity && current_sell.liquidityType != "off") {
      //   sellOrders.shift();
      //   continue;
      // }
      // if (current_buy.isLiquidity && current_buy.liquidityType != "off") {
      //   buyOrders.shift();
      //   continue;
      // }
      let checkLimit = (element) => element.price !== "market";
      let buyIndex = buyOrders.findIndex(checkLimit);
      let sellIndex = sellOrders.findIndex(checkLimit);
      current_buy_limit = buyOrders[buyIndex];
      current_sell_limit = sellOrders[sellIndex];
      // console.log(current_buy, "------current_buy");
      // console.log(current_sell, "------current_sell");
      //MARKET ORDER EXECUTE
      if (
        current_buy.price == "market" &&
        current_sell.price == "market" &&
        current_buy.liquidityType == "off" &&
        current_sell.liquidityType == "off"
      ) {
        if (current_buy_limit == -1 || current_sell_limit == -1) {
          cancelMarketOrder(
            `buyOpenOrders_${current_buy.pairId}`,
            current_buy._id
          );
          // else {
          //   if (
          //     current_buy.liquidityType == "binance" &&
          //     !current_buy.isLiquidity
          //   ) {
          //     await LiquidityOrderPlace(current_buy, pairData);
          //   } else if (
          //     current_buy.liquidityType == "wazirx" &&
          //     !current_buy.isLiquidity
          //   ) {
          //     await wazirxLiquidityOrderPlace(current_buy, pairData);
          //   }
          // }
          cancelMarketOrder(
            `sellOpenOrders_${current_sell.pairId}`,
            current_sell._id
          );
          // else {
          //   if (
          //     current_sell.liquidityType == "binance" &&
          //     !current_sell.isLiquidity
          //   ) {
          //     await LiquidityOrderPlace(current_sell, pairData);
          //   } else if (
          //     current_sell.liquidityType == "wazirx" &&
          //     !current_sell.isLiquidity
          //   ) {
          //     await wazirxLiquidityOrderPlace(current_sell, pairData);
          //   }
          // }
          continue;
        }
        if (
          current_buy?.userId.toString() ==
          current_sell_limit?.userId.toString()
        ) {
          buyOrders.shift();
          sellOrders.splice(sellIndex, 1);
          continue;
        } else if (
          current_sell?.userId.toString() ==
          current_buy_limit?.userId.toString()
        ) {
          buyOrders.splice(buyIndex, 1);
          sellOrders.shift();
          continue;
        }
        let exectamount = current_buy.orderValue / current_sell_limit?.price;
        if (current_sell_limit) {
          current_buy.price = current_sell_limit.price;
          current_buy.quantity = toFixedDown(
            exectamount,
            pairData.firstFloatDigit
          );
          await marketMatching(
            buyOrders,
            sellOrders,
            current_buy,
            current_sell_limit,
            pairData
          );
        }
        if (current_buy_limit) {
          current_sell.price = current_buy_limit.price;
          current_sell.quantity = current_sell.amount;
          await marketMatching(
            buyOrders,
            sellOrders,
            current_buy_limit,
            current_sell,
            pairData
          );
        }
      } else if (
        current_buy.price == "market" &&
        current_sell.price != "market" &&
        current_buy.liquidityType == "off" &&
        current_sell.liquidityType == "off"
      ) {
        if (current_sell_limit == -1) {
          cancelMarketOrder(
            `buyOpenOrders_${current_buy.pairId}`,
            current_buy._id
          );
          //  else {
          //   if (
          //     current_buy.liquidityType == "binance" &&
          //     !current_buy.isLiquidity
          //   ) {
          //     await LiquidityOrderPlace(current_buy, pairData);
          //   } else if (
          //     current_buy.liquidityType == "wazirx" &&
          //     !current_buy.isLiquidity
          //   ) {
          //     await wazirxLiquidityOrderPlace(current_buy, pairData);
          //   }
          // }
          continue;
        }
        if (current_buy.userId.toString() == current_sell.userId.toString()) {
          // console.log('*************** -------------- ***************')
          let checkLimit = (element) =>
            element.price !== "market" && element.userId != current_buy.userId;
          let sellIndex = sellOrders.findIndex(checkLimit);
          if (sellIndex >= 0) {
            sellOrders.shift();
          } else {
            cancelMarketOrder(
              `buyOpenOrders_${current_sell.pairId}`,
              current_buy._id
            );

            buyOrders.shift();
            sellOrders.splice(sellIndex, 1);
          }

          continue;
        }
        let exectamount = current_buy.orderValue / current_sell_limit.price;
        current_buy.price = current_sell_limit.price;
        current_buy.quantity = parseFloat(exectamount);
        // toFixedDown(
        //   exectamount,
        //   pairData.firstFloatDigit
        // );
        console.log(current_buy, "-------3321");
        await marketMatching(
          buyOrders,
          sellOrders,
          current_buy,
          current_sell_limit,
          pairData
        );
      } else if (
        current_buy.price != "market" &&
        current_sell.price == "market" &&
        current_buy.liquidityType == "off" &&
        current_sell.liquidityType == "off"
      ) {
        if (current_buy_limit == -1) {
          cancelMarketOrder(
            `sellOpenOrders_${current_sell.pairId}`,
            current_sell._id
          );
          //  else {
          //   if (
          //     current_sell.liquidityType == "binance" &&
          //     !current_sell.isLiquidity
          //   ) {
          //     await LiquidityOrderPlace(current_sell, pairData);
          //   } else if (
          //     current_sell.liquidityType == "wazirx" &&
          //     !current_sell.isLiquidity
          //   ) {
          //     await wazirxLiquidityOrderPlace(current_sell, pairData);
          //   }
          // }

          continue;
        }

        if (current_buy.userId.toString() == current_sell.userId.toString()) {
          let checkLimit = (element) =>
            element.price !== "market" && element.userId != current_buy.userId;
          let buyIndex = buyOrders.findIndex(checkLimit);
          if (buyIndex >= 0) {
            buyOrders.shift();
          } else {
            cancelMarketOrder(
              `sellOpenOrders_${current_sell.pairId}`,
              current_sell._id
            );
            // else {
            //   if (
            //     current_sell.liquidityType == "binance" &&
            //     !current_sell.isLiquidity
            //   ) {
            //     await LiquidityOrderPlace(current_sell, pairData);
            //   } else if (
            //     current_sell.liquidityType == "wazirx" &&
            //     !current_sell.isLiquidity
            //   ) {
            //     await wazirxLiquidityOrderPlace(current_sell, pairData);
            //   }
            // }
            buyOrders.splice(buyIndex, 1);
            sellOrders.shift();
          }

          continue;
        }
        current_sell.price = current_buy_limit.price;
        current_sell.quantity = parseFloat(current_sell.amount);
        await marketMatching(
          buyOrders,
          sellOrders,
          current_buy_limit,
          current_sell,
          pairData
        );
      }

      ////LIMIT ORDER EXECUT
      if (
        current_buy.flag == false &&
        current_sell.flag == false &&
        current_buy.liquidityType == "off" &&
        current_sell.liquidityType == "off"
      ) {
        // console.log(
        //   current_buy.price >= current_sell.price,
        //   "------current_buy.price >= current_sell.price"
        // );
        // console.log(current_buy.orderDate, "------current_buy.orderDate");
        // console.log(current_sell.orderDate, "------current_sell.price", current_buy.orderDate < current_sell.orderDate);
        if (current_buy.price >= current_sell.price) {
          let adminLiq = await hget("admin_liquidity", "liquidation");
          adminLiq = JSON.parse(adminLiq);
          let isMaker =
            // adminLiq._id.toString() == current_buy.userId.toString() ? "buy" : "sell";
            current_buy.orderDate < current_sell.orderDate ? "buy" : "sell";
          console.log(isMaker, "--------3419");
          if (current_buy.userId.toString() == current_sell.userId.toString()) {
            if (buyOrders.length > sellOrders.length) {
              buyOrders.shift();
            } else {
              sellOrders.shift();
            }
            continue;
          }
          let exectamount = Math.min(
            current_buy.quantity,
            current_sell.quantity
          );
          console.log(exectamount, "--------3381");
          let execvalue =
            isMaker == "buy"
              ? exectamount * current_buy.price
              : exectamount * current_sell.price;
          let sellFee =
            isMaker == "sell"
              ? (execvalue * current_buy.makerFee) / 100
              : (execvalue * current_buy.takerFee) / 100;
          console.log('sellFee: ', sellFee);
          let buyFee =
            isMaker == "buy"
              ? (exectamount * current_sell.makerFee) / 100
              : (exectamount * current_sell.takerFee) / 100;
          console.log('buyFee: ', buyFee);
          if (current_buy.buyorsell === "buy") {
            buyFee = await brokerageFeeCalc(buyFee, current_buy, current_buy.firstCurrencyId, current_buy.firstCurrency)
          }
          if (current_sell.buyorsell === "sell") {
            sellFee = await brokerageFeeCalc(sellFee, current_sell, current_sell.secondCurrencyId, current_sell.secondCurrency)
          }
          console.log(buyFee, "--------3443");
          console.log(sellFee, "--------3444");
          let avgPrice =
            isMaker == "buy"
              ? current_buy.averagePrice
              : current_sell.averagePrice;
          if (pairData.botstatus == "bot") {
            avgPrice =
              isMaker == "buy"
                ? current_buy.price
                : current_sell.price;
          }
          console.log(avgPrice, "---------3400");
          // isMaker == "buy" ? current_buy.price : current_sell.price;
          let buyerWallet = await hget(
            "walletbalance_spot",
            current_buy.userId + "_" + current_buy.firstCurrencyId
          );
          let sellerWallet = await hget(
            "walletbalance_spot",
            current_sell.userId + "_" + current_sell.secondCurrencyId
          );
          /* START IGNORE TRADE FEE */
          let buyUsrDoc = await hget(
            "userToken_" + current_buy.userId,
            current_buy.userId
          );
          let sellUsrDoc = await hget(
            "userToken_" + current_sell.userId,
            current_sell.userId
          );
          // console.log(buyUsrDoc, '----buyUsrDoc')
          // console.log(sellUsrDoc, '----sellUsrDoc')
          if (buyUsrDoc) {
            buyUsrDoc = JSON.parse(buyUsrDoc);
            if (
              buyUsrDoc.feeManagement?.includes(current_buy.firstCurrencyId)
            ) {
              buyFee = 0;
            }
          }

          if (sellUsrDoc) {
            sellUsrDoc = JSON.parse(sellUsrDoc);
            if (
              sellUsrDoc.feeManagement?.includes(current_sell.secondCurrencyId)
            ) {
              sellFee = 0;
            }
          }
          /* END IGNORE TRADE FEE */
          let buyExcAmount =
            (current_buy.quantity * 10 ** current_buy.firstFloatDigit -
              exectamount * 10 ** current_buy.firstFloatDigit) /
            10 ** current_buy.firstFloatDigit;
          let sellExcAmount =
            (current_sell.quantity * 10 ** current_sell.firstFloatDigit -
              exectamount * 10 ** current_sell.firstFloatDigit) /
            10 ** current_sell.firstFloatDigit;
          let sellInOrder;
          let buyInOrder;
          buyExcAmount = toFixed((buyExcAmount * 100) / 100, current_buy.firstFloatDigit)
          sellExcAmount = toFixed((sellExcAmount * 100) / 100, current_sell.firstFloatDigit)
          console.log(buyExcAmount, '--------3601')
          console.log(sellExcAmount, '--------3602')
          sellerWallet = parseFloat(sellerWallet);
          buyerWallet = parseFloat(buyerWallet);
          current_buy.quantity = buyExcAmount;
          current_buy.filledQuantity += exectamount;
          current_sell.quantity = sellExcAmount;
          current_sell.filledQuantity += exectamount;
          if (pairData.botstatus == "bot") {
            current_buy.averagePrice += avgPrice * exectamount;
            current_sell.averagePrice += avgPrice * exectamount;
          }
          else {
            current_buy.averagePrice = avgPrice * exectamount;
            current_sell.averagePrice = avgPrice * exectamount;
          }
          current_sell.tradePrice = avgPrice;
          current_sell.tradeQty = exectamount;
          current_sell.createdAt = Date.now();
          current_buy.tradePrice = avgPrice;
          current_buy.tradeQty = exectamount;
          current_buy.createdAt = Date.now();
          current_buy.fee = buyFee;
          current_sell.fee = sellFee;
          console.log(current_buy.quantity, "------current_buy.quantity");
          //order update process
          if (current_buy.quantity == 0) {
            const filledOrderValue = avgPrice * exectamount;
            const realOrderValue = current_buy.price * exectamount;
            if (
              isMaker == "sell" &&
              toFixed(realOrderValue, pairData.secondFloatDigit) >
              toFixed(filledOrderValue, pairData.secondFloatDigit)
            ) {
              console.log("----------3509");
              const retriveBal =
                parseFloat(realOrderValue) - parseFloat(filledOrderValue);
              let buyRetrive = await hincbyfloat(
                "walletbalance_spot",
                current_buy.userId + "_" + current_buy.secondCurrencyId,
                retriveBal
              );
              let beforeBAL = parseFloat(buyRetrive) - parseFloat(retriveBal);
              passbook({
                userId: current_buy.userId,
                coin: current_buy.secondCurrency,
                currencyId: current_buy.secondCurrencyId,
                tableId: current_buy._id,
                beforeBalance: beforeBAL,
                afterBalance: buyRetrive,
                amount: toFixedDown(retriveBal, 8),
                type: "spot_limit_bal_retrieve",
                category: "credit",
              });
              // Pass Book
              socketEmitOne(
                "updateTradeAsset",
                {
                  currencyId: current_buy.secondCurrencyId,
                  spotBal: buyRetrive,
                  inOrder: buyInOrder,
                },
                current_buy.userId
              );
            }

            current_buy.status = "completed";
            let inOrderVal = current_buy.price * current_buy.filledQuantity;
            buyInOrder = await hincbyfloat(
              "walletbalance_spot_inOrder",
              current_buy.userId + "_" + current_buy.secondCurrencyId,
              -inOrderVal
            );
            hset(
              "orderHistory_" + current_buy.userId,
              current_buy._id,
              current_buy
            );
            console.log(current_buy, "---------3519");
            await hdel("buyOpenOrders_" + current_buy.pairId, current_buy._id);
            orderHistArr.push(current_buy);
            buyOrders.shift();
          } else {
            current_buy.status = "pending";
            const filledOrderValue = avgPrice * exectamount;
            const realOrderValue = current_buy.price * exectamount;
            if (
              isMaker == "sell" &&
              toFixed(realOrderValue, pairData.secondFloatDigit) >
              toFixed(filledOrderValue, pairData.secondFloatDigit)
            ) {
              const retriveBal =
                parseFloat(realOrderValue) - parseFloat(filledOrderValue);
              let buyRetrive = await hincbyfloat(
                "walletbalance_spot",
                current_buy.userId + "_" + current_buy.secondCurrencyId,
                retriveBal
              );
              let beforeBAL = parseFloat(buyRetrive) - parseFloat(retriveBal);
              passbook({
                userId: current_buy.userId,
                coin: current_buy.secondCurrency,
                currencyId: current_buy.secondCurrencyId,
                tableId: current_buy._id,
                beforeBalance: beforeBAL,
                afterBalance: buyRetrive,
                amount: parseFloat(retriveBal),
                type: "spot_limit_bal_retrieve",
                category: "credit",
              });
              // Pass Book
              socketEmitOne(
                "updateTradeAsset",
                {
                  currencyId: current_buy.secondCurrencyId,
                  spotBal: buyRetrive,
                  inOrder: buyInOrder,
                },
                current_buy.userId
              );
            }
            // if (
            //   current_buy.liquidityType == "binance" &&
            //   !current_buy.isLiquidity
            // ) {
            //   await LiquidityOrderPlace(current_buy, pairData);
            // } else if (
            //   current_buy.liquidityType == "wazirx" &&
            //   !current_buy.isLiquidity
            // ) {
            //   await wazirxLiquidityOrderPlace(current_buy, pairData);
            // } else {
            // orderSocket(current_buy.userId, current_buy, buywalletBal, 'edit');
            let inOrderVal = current_buy.price * current_buy.filledQuantity;
            buyInOrder = await hincbyfloat(
              "walletbalance_spot_inOrder",
              current_buy.userId + "_" + current_buy.secondCurrencyId,
              -inOrderVal
            );
            orderHistArr.push(current_buy);
            await hdel("buyOpenOrders_" + current_buy.pairId, current_buy._id);
            await hset(
              "buyOpenOrders_" + current_buy.pairId,
              current_buy._id,
              current_buy
            );
            // }
          }
          console.log(current_sell.quantity, "------current_sell.quantity");

          if (current_sell.quantity == 0) {
            current_sell.status = "completed";
            current_sell.triggerPrice = current_buy.price;
            // orderSocket(current_sell.userId, current_sell, sellwalletBal, 'del');
            sellInOrder = await hincbyfloat(
              "walletbalance_spot_inOrder",
              current_sell.userId + "_" + current_sell.firstCurrencyId,
              -current_sell.filledQuantity
            );
            hset(
              "orderHistory_" + current_sell.userId,
              current_sell._id,
              current_sell
            );
            await hdel(
              "sellOpenOrders_" + current_sell.pairId,
              current_sell._id
            );
            orderHistArr.push(current_sell);
            sellOrders.shift();
          } else {
            current_sell.status = "pending";
            // if (
            //   current_sell.liquidityType == "binance" &&
            //   !current_sell.isLiquidity
            // ) {
            //   await LiquidityOrderPlace(current_sell, pairData);
            // } else if (
            //   current_sell.liquidityType == "wazirx" &&
            //   !current_sell.isLiquidity
            // ) {
            //   await wazirxLiquidityOrderPlace(current_sell, pairData);
            // } else {
            sellInOrder = await hincbyfloat(
              "walletbalance_spot_inOrder",
              current_sell.userId + "_" + current_sell.firstCurrencyId,
              -current_sell.filledQuantity
            );
            current_sell.triggerPrice = current_buy.price;
            // orderSocket(current_sell.userId, current_sell, sellwalletBal, 'edit');
            orderHistArr.push(current_sell);
            await hdel(
              "sellOpenOrders_" + current_sell.pairId,
              current_sell._id
            );
            await hset(
              "sellOpenOrders_" + current_sell.pairId,
              current_sell._id,
              current_sell
            );
          }
          // }
          // update for BUY
          editOrderBook({
            buyorsell: current_buy.buyorsell,
            price: current_buy.price,
            minusQuantity: exectamount,
            pairId: current_buy.pairId,
            firstFloatDigit: current_buy.firstFloatDigit,
          });

          // //update for SELL
          editOrderBook({
            buyorsell: current_sell.buyorsell,
            price: current_sell.price,
            minusQuantity: exectamount,
            pairId: current_sell.pairId,
            firstFloatDigit: current_sell.firstFloatDigit,
          });

          passbook({
            userId: current_buy.userId,
            coin: current_buy.firstCurrency,
            currencyId: current_buy.firstCurrencyId,
            tableId: current_buy._id,
            beforeBalance: buyerWallet,
            afterBalance: buyerWallet + (exectamount - buyFee),
            amount: toFixedDown(parseFloat(exectamount - buyFee), 8),
            type: "spot_limit_match",
            category: "credit",
          });
          passbook({
            userId: current_sell.userId,
            coin: current_sell.secondCurrency,
            currencyId: current_sell.secondCurrencyId,
            tableId: current_sell._id,
            beforeBalance: sellerWallet,
            afterBalance: sellerWallet + (execvalue - sellFee),
            amount: toFixedDown(parseFloat(execvalue - sellFee), 8),
            type: "spot_limit_match",
            category: "credit",
          });
          tradeHistArr.push({
            buyOrderData: current_buy,
            sellOrderData: current_sell,
            uniqueId: uniqueId,
            execPrice: avgPrice,
            Maker: isMaker,
            buyerFee: buyFee,
            sellerFee: sellFee,
            execQuantity: exectamount,
            ordertype: "Limit",
          });
          ChartDocHistory({
            pairName: pairData.tikerRoot,
            price: avgPrice,
          }); //ChartHistory
          execvalue -= sellFee;
          exectamount -= buyFee;
          let buyerFinaleBalance = await hincbyfloat(
            "walletbalance_spot",
            current_buy.userId + "_" + current_buy.firstCurrencyId,
            exectamount
          );
          let sellerFinaleBalance = await hincbyfloat(
            "walletbalance_spot",
            current_sell.userId + "_" + current_sell.secondCurrencyId,
            execvalue
          );

          socketEmitOne(
            "updateTradeAsset",
            {
              currencyId: current_buy.firstCurrencyId,
              spotBal: buyerFinaleBalance,
              inOrder: buyInOrder,
            },
            current_buy.userId
          );
          socketEmitOne(
            "updateTradeAsset",
            {
              currencyId: current_sell.secondCurrencyId,
              spotBal: sellerFinaleBalance,
              inOrder: sellInOrder,
            },
            current_sell.userId
          );
          tradePair = "";
          getOpenOrderSocket(current_sell.userId, current_sell.pairId);
          getOpenOrderSocket(current_buy.userId, current_buy.pairId);
          getOrderHistorySocket(current_buy.userId, current_buy.pairId);
          getOrderHistorySocket(current_sell.userId, current_sell.pairId);
          // marketPriceSocket(current_buy.pairId);
        }
        // console.log('----------3779')
        break;
        //  else {
        //   if (
        //     current_buy.liquidityType == "binance" &&
        //     !current_buy.isLiquidity
        //   ) {
        //     await LiquidityOrderPlace(current_buy, pairData);
        //   } else if (
        //     current_buy.liquidityType == "wazirx" &&
        //     !current_buy.isLiquidity
        //   ) {
        //     await wazirxLiquidityOrderPlace(current_buy, pairData);
        //   }
        //   if (
        //     current_sell.liquidityType == "binance" &&
        //     !current_sell.isLiquidity
        //   ) {
        //     await LiquidityOrderPlace(current_sell, pairData);
        //   } else if (
        //     current_sell.liquidityType == "wazirx" &&
        //     !current_sell.isLiquidity
        //   ) {
        //     await wazirxLiquidityOrderPlace(current_sell, pairData);
        //   }
        // }
      }
    }
    isRun = false;
    //DB MAINTAIN
    if (orderHistArr.length > 0) {
      orderHistArr.forEach((element) => {
        newOrderHistory(element);
      });
      orderHistArr = [];
    }

    if (tradeHistArr.length > 0) {
      tradeHistArr.forEach((element) => {
        newTradeHistory(element);
      });
      tradeHistArr = [];
    }

    if (buyOrders.length <= 0) {
      sellOrders.forEach(async (element) => {
        if (
          element.price === "market" &&
          element.liquidityType == "off" &&
          !element.isLiquidity
        ) {
          cancelMarketOrder(`sellOpenOrders_${element.pairId}`, element._id);
          return;
        }
        // if (element.liquidityType == "binance" && !element.isLiquidity) {
        //   await LiquidityOrderPlace(element, pairData);
        // } else if (element.liquidityType == "wazirx" && !element.isLiquidity) {
        //   await wazirxLiquidityOrderPlace(element, pairData);
        // }
      });
    }
    if (sellOrders.length <= 0) {
      buyOrders.forEach(async (element) => {
        if (
          element.price === "market" &&
          element.liquidityType == "off" &&
          !element.isLiquidity
        ) {
          cancelMarketOrder(`buyOpenOrders_${element.pairId}`, element._id);
          return;
        }
        // if (element.liquidityType == "binance" && !element.isLiquidity) {
        //   await LiquidityOrderPlace(element, pairData);
        // } else if (element.liquidityType == "wazirx" && !element.isLiquidity) {
        //   await wazirxLiquidityOrderPlace(element, pairData);
        // }
      });
    }
    if (tradePair == pairData._id) tradePair = "";
  } catch (err) {
    console.log("----------------------TRADE MATCH ERR", err);
  }
};

export const setDepthHist = async (item, type) => {
  let buyDepth = await lrange(`buy_depth_${item.PairId}`);
  let sellDepth = await lrange(`sell_depth_${item.PairId}`);
  if (!isEmpty(buyDepth)) {
    buyDepth = await getvalueObj(buyDepth);
  }
  if (!isEmpty(sellDepth)) {
    sellDepth = await getvalueObj(sellDepth);
  }
  if (type == "buy" && (buyDepth?.length < 21 || buyDepth == null)) {
    rpush(
      `buy_depth_${item.PairId}`,
      JSON.stringify({ price: item.tradePrice, volume: item.tradeQty })
    );
  } else if (buyDepth?.length >= 21) {
    lpop(`buy_depth_${item.PairId}`);
    rpush(
      `buy_depth_${item.PairId}`,
      JSON.stringify({ price: item.tradePrice, volume: item.tradeQty })
    );
  }
  if (type == "sell" && (sellDepth?.length < 21 || sellDepth == null)) {
    rpush(
      `sell_depth_${item.PairId}`,
      JSON.stringify({ price: item.tradePrice, volume: item.tradeQty })
    );
  } else if (sellDepth?.length >= 21) {
    lpop(`sell_depth_${item.PairId}`);
    rpush(
      `sell_depth_${item.PairId}`,
      JSON.stringify({ price: item.tradePrice, volume: item.tradeQty })
    );
  }
};
export const setDepthBinanceHist = async (item, type) => {
  let buyDepth = await lrange(`buy_depth_binance_${item.PairId}`);
  let sellDepth = await lrange(`sell_depth_binance_${item.PairId}`);
  if (!isEmpty(buyDepth)) {
    buyDepth = await getvalueObj(buyDepth);
  }
  if (!isEmpty(sellDepth)) {
    sellDepth = await getvalueObj(sellDepth);
  }
  if (type == "buy" && (buyDepth?.length < 21 || buyDepth == null)) {
    rpush(
      `buy_depth_binance_${item.PairId}`,
      JSON.stringify({ price: item.tradePrice, volume: item.tradeQty })
    );
  } else if (buyDepth?.length >= 21) {
    lpop(`buy_depth_binance_${item.PairId}`);
    rpush(
      `buy_depth_binance_${item.PairId}`,
      JSON.stringify({ price: item.tradePrice, volume: item.tradeQty })
    );
  }
  if (type == "sell" && (sellDepth?.length < 21 || sellDepth == null)) {
    rpush(
      `sell_depth_binance_${item.PairId}`,
      JSON.stringify({ price: item.tradePrice, volume: item.tradeQty })
    );
  } else if (sellDepth?.length >= 21) {
    lpop(`sell_depth_binance_${item.PairId}`);
    rpush(
      `sell_depth_binance_${item.PairId}`,
      JSON.stringify({ price: item.tradePrice, volume: item.tradeQty })
    );
  }
};

export const marketMatching = async (
  buyOrders,
  sellOrders,
  current_buy,
  current_sell,
  pairData
) => {
  try {
    console.log("--------MARKET MATCH-----------");
    if (
      current_buy.liquidityType == "off" &&
      current_sell.liquidityType == "off"
    ) {
      let uniqueId = Math.floor(Math.random() * 1000000000);
      let adminLiq = await hget("admin_liquidity", "liquidation");
      adminLiq = JSON.parse(adminLiq);
      let isMaker =
        adminLiq._id.toString() == current_buy.userId.toString() ? "buy" : "sell";
      if (pairData.botstatus == "bot") {
        isMaker = current_buy.orderDate < current_sell.orderDate ? "buy" : "sell";
      }
      let sellamount = current_sell.quantity;
      let buyerWallet = await hget(
        "walletbalance_spot",
        current_buy.userId + "_" + current_buy.firstCurrencyId
      );
      buyerWallet = parseFloat(buyerWallet);
      let sellerWallet = await hget(
        "walletbalance_spot",
        current_sell.userId + "_" + current_sell.secondCurrencyId
      );
      sellerWallet = parseFloat(sellerWallet);
      let exectamount = Math.min(current_buy.quantity, current_sell.quantity);
      let execvalue =
        isMaker == "buy"
          ? exectamount * current_buy.price
          : exectamount * current_sell.price;
      let sellFee =
        isMaker == "sell"
          ? execvalue * (current_buy.makerFee / 100)
          : execvalue * (current_buy.takerFee / 100);
      let buyFee =
        isMaker == "buy"
          ? exectamount * (current_sell.makerFee / 100)
          : exectamount * (current_sell.takerFee / 100);
      console.log("sellFee---------", sellFee);
      console.log("buyFee---------", buyFee);
      if (current_buy.buyorsell === "buy") {
        buyFee = await brokerageFeeCalc(buyFee, current_buy, current_buy.firstCurrencyId, current_buy.firstCurrency)
      }
      if (current_sell.buyorsell === "sell") {
        sellFee = await brokerageFeeCalc(sellFee, current_sell, current_sell.secondCurrencyId, current_sell.secondCurrency)
      }
      console.log("4133---------", sellFee);
      console.log("4134---------", buyFee);
      let avgPrice = isMaker == "buy" ? current_buy.price : current_sell.price;
      let buyExcAmount =
        (current_buy.quantity * 10 ** current_buy.firstFloatDigit -
          exectamount * 10 ** current_buy.firstFloatDigit) /
        10 ** current_buy.firstFloatDigit;

      buyExcAmount = toFixed((buyExcAmount * 100) / 100, current_buy.firstFloatDigit)
      current_buy.quantity = buyExcAmount;
      current_buy.filledQuantity += exectamount;
      let sellExcAmount =
        (current_sell.quantity * 10 ** current_sell.firstFloatDigit -
          exectamount * 10 ** current_sell.firstFloatDigit) /
        10 ** current_sell.firstFloatDigit;
      sellExcAmount = toFixed((sellExcAmount * 100) / 100, current_sell.firstFloatDigit)
      current_sell.quantity = sellExcAmount;
      current_sell.filledQuantity += exectamount;
      console.log(avgPrice, "--------avgPrice");
      console.log(exectamount, "--------exectamount");
      console.log(isMaker, "--------isMaker");
      current_buy.averagePrice = current_buy.orderType == "limit" ? avgPrice * exectamount : current_buy.averagePrice + avgPrice * exectamount;
      current_sell.averagePrice = current_sell.orderType == "limit" ? avgPrice * exectamount : current_sell.averagePrice + avgPrice * exectamount;
      console.log(current_sell, "----------3937");
      console.log(current_buy, "----------3942");
      //order update process
      if (current_buy.quantity == 0) {
        current_buy.status = "completed";
        if (!current_buy.flag) {
          let inOrderVal = current_buy.price * current_buy.filledQuantity;
          await hincbyfloat(
            "walletbalance_spot_inOrder",
            current_buy.userId + "_" + current_buy.secondCurrencyId,
            -inOrderVal
          );
        }
        let retriveBal =
          parseFloat(current_buy.openOrderValue) -
          parseFloat(current_buy.averagePrice);

        if (retriveBal > 0) {
          if (current_buy.liquidityType == "off" && !current_buy.isLiquidity) {
            let buyRetrive = await hincbyfloat(
              "walletbalance_spot",
              current_buy.userId + "_" + current_buy.secondCurrencyId,
              retriveBal
            );

            let beforeBAL = parseFloat(buyRetrive) - parseFloat(retriveBal);
            passbook({
              userId: current_buy.userId,
              coin: current_buy.secondCurrency,
              currencyId: current_buy.secondCurrencyId,
              tableId: current_buy._id,
              beforeBalance: toFixedDown(beforeBAL, 8),
              afterBalance: toFixedDown(buyRetrive, 8),
              amount: parseFloat(retriveBal),
              type: "spot_market_bal_retrieve_buy",
              category: "credit",
            });
            socketEmitOne(
              "updateTradeAsset",
              {
                currencyId: current_buy.secondCurrencyId,
                spotBal: buyRetrive,
              },
              current_buy.userId
            );
          }
        }
        hset(
          "orderHistory_" + current_buy.userId,
          current_buy._id,
          current_buy
        );
        await hdel("buyOpenOrders_" + current_buy.pairId, current_buy._id);
        newOrderHistory(current_buy);
        buyOrders.shift();
      } else {
        if (current_buy.flag == true) {
          let checkLimit = (element) => element._id !== current_sell._id;
          let checkOrder = sellOrders.findIndex(checkLimit);
          let retriveBal =
            parseFloat(current_buy.openOrderValue) -
            parseFloat(current_buy.averagePrice);
          current_buy.orderValue = retriveBal;
          current_buy.quantity = 0;
          console.log(retriveBal, "-------retriveBal");
          console.log(checkOrder, "-------checkOrder");
          if (retriveBal > 0 && checkOrder == -1) {
            if (
              current_buy.liquidityType == "off" &&
              !current_buy.isLiquidity
            ) {
              current_buy.status = "completed";
              hset(
                "orderHistory_" + current_buy.userId,
                current_buy._id,
                current_buy
              );
              let buyRetrive = await hincbyfloat(
                "walletbalance_spot",
                current_buy.userId + "_" + current_buy.secondCurrencyId,
                retriveBal
              );
              await hdel(
                "buyOpenOrders_" + current_buy.pairId,
                current_buy._id
              );
              let beforeBAL = parseFloat(buyRetrive) - parseFloat(retriveBal);
              passbook({
                userId: current_buy.userId,
                coin: current_buy.secondCurrency,
                currencyId: current_buy.secondCurrencyId,
                tableId: current_buy._id,
                beforeBalance: beforeBAL,
                afterBalance: buyRetrive,
                amount: parseFloat(retriveBal),
                type: "spot_market_bal_retrieve_buy",
                category: "credit",
              });
              newOrderHistory(current_buy);
              socketEmitOne(
                "updateTradeAsset",
                {
                  currencyId: current_buy.secondCurrencyId,
                  spotBal: buyRetrive,
                },
                current_buy.userId
              );
            }
            // else {
            //   if (
            //     current_buy.liquidityType == "binance" &&
            //     !current_buy.isLiquidity
            //   ) {
            //     await LiquidityOrderPlace(current_buy, pairData);
            //   } else if (
            //     current_buy.liquidityType == "wazirx" &&
            //     !current_buy.isLiquidity
            //   ) {
            //     await wazirxLiquidityOrderPlace(current_buy, pairData);
            //   }
            // }
          } else {
            current_buy.price = "market";
            console.log("-------------- ELSE REOPEN BUY");
            current_buy.status = "pending";
            await hdel("buyOpenOrders_" + current_buy.pairId, current_buy._id);
            await hset(
              "buyOpenOrders_" + current_buy.pairId,
              current_buy._id,
              current_buy,
              "buyone"
            );
            newOrderHistory(current_buy);
          }
        } else {
          console.log("-------------- ELSE DOWN REOPEN BUY");
          current_buy.status = "pending";
          let inOrderVal = current_buy.price * current_buy.filledQuantity;
          await hincbyfloat(
            "walletbalance_spot_inOrder",
            current_buy.userId + "_" + current_buy.secondCurrencyId,
            -inOrderVal
          );
          await hdel("buyOpenOrders_" + current_buy.pairId, current_buy._id);
          await hset(
            "buyOpenOrders_" + current_buy.pairId,
            current_buy._id,
            current_buy,
            "buytwo"
          );
          newOrderHistory(current_buy);
        }
      }
      if (current_sell.quantity == 0) {
        console.log("--------------COMPLETE SELL");
        current_sell.status = "completed";
        if (!current_sell.flag) {
          await hincbyfloat(
            "walletbalance_spot_inOrder",
            current_sell.userId + "_" + current_sell.firstCurrencyId,
            -current_sell.filledQuantity
          );
        }
        hset(
          "orderHistory_" + current_sell.userId,
          current_sell._id,
          current_sell
        );
        await hdel("sellOpenOrders_" + current_sell.pairId, current_sell._id);
        newOrderHistory(current_sell);
        sellOrders.shift();
      } else {
        if (current_sell.flag == true) {
          let checkLimit = (element) => element._id !== current_sell._id;
          let checkOrder = buyOrders.findIndex(checkLimit);
          let retriveBal = sellamount - exectamount;
          current_sell.price = "market";
          current_sell.amount = current_sell.quantity;
          if (retriveBal > 0 && checkOrder == -1) {
            if (current_sell.liquidityType == "off") {
              current_sell.status = "completed";
              hset(
                "orderHistory_" + current_sell.userId,
                current_sell._id,
                current_sell
              );
              let sellRetrive = await hincbyfloat(
                "walletbalance_spot",
                current_sell.userId + "_" + current_sell.firstCurrencyId,
                retriveBal
              );
              await hdel(
                "sellOpenOrders_" + current_sell.pairId,
                current_sell._id
              );
              let beforeBAL = parseFloat(sellRetrive) - parseFloat(retriveBal);
              passbook({
                userId: current_sell.userId,
                coin: current_sell.firstCurrency,
                currencyId: current_sell.firstCurrencyId,
                tableId: current_sell._id,
                beforeBalance: beforeBAL,
                afterBalance: sellRetrive,
                amount: parseFloat(retriveBal),
                type: "spot_market_bal_retrieve_sell",
                category: "credit",
              });
              newOrderHistory(current_sell);
              socketEmitOne(
                "updateTradeAsset",
                {
                  currencyId: current_sell.firstCurrencyId,
                  spotBal: sellRetrive,
                },
                current_sell.userId
              );
            }
            // else {
            //   if (
            //     current_sell.liquidityType == "binance" &&
            //     !current_sell.isLiquidity
            //   ) {
            //     console.log("cureentSEEEEEELllll", current_sell);
            //     await LiquidityOrderPlace(current_sell, pairData);
            //   } else if (
            //     current_sell.liquidityType == "wazirx" &&
            //     !current_sell.isLiquidity
            //   ) {
            //     await wazirxLiquidityOrderPlace(current_sell, pairData);
            //   }
            // }
          } else {
            console.log("-------------- ELSE REOPEN SELL");
            current_buy.status = "completed";
            await hdel(
              "sellOpenOrders_" + current_sell.pairId,
              current_sell._id
            );
            await hset(
              "sellOpenOrders_" + current_sell.pairId,
              current_sell._id,
              current_sell,
              "sellone"
            );
            newOrderHistory(current_sell);
          }
        } else {
          console.log("-------------- ELSE DOWN REOPEN SELL");
          current_sell.status = "pending";
          await hincbyfloat(
            "walletbalance_spot_inOrder",
            current_sell.userId + "_" + current_sell.firstCurrencyId,
            -current_sell.filledQuantity
          );
          await hdel("sellOpenOrders_" + current_sell.pairId, current_sell._id);
          await hset(
            "sellOpenOrders_" + current_sell.pairId,
            current_sell._id,
            current_sell,
            "selltwo"
          );
          newOrderHistory(current_sell);
        }
      }
      /* START IGNORE TRADE FEE */
      let buyUsrDoc = await hget(
        "userToken_" + current_buy.userId,
        current_buy.userId
      );
      let sellUsrDoc = await hget(
        "userToken_" + current_sell.userId,
        current_sell.userId
      );
      // console.log(buyUsrDoc, '----buyUsrDoc')
      // console.log(sellUsrDoc, '----sellUsrDoc')
      if (buyUsrDoc) {
        buyUsrDoc = JSON.parse(buyUsrDoc);
        if (buyUsrDoc.feeManagement?.includes(current_buy.firstCurrencyId)) {
          buyFee = 0;
        }
      }

      if (sellUsrDoc) {
        sellUsrDoc = JSON.parse(sellUsrDoc);
        if (sellUsrDoc.feeManagement?.includes(current_sell.secondCurrencyId)) {
          sellFee = 0;
        }
      }
      //Order Book update for BUY
      if (current_sell.flag == true) {
        editOrderBook({
          buyorsell: current_buy.buyorsell,
          price: current_buy.price,
          minusQuantity: exectamount,
          pairId: current_buy.pairId,
          firstFloatDigit: pairData.firstFloatDigit,
        });
      }
      passbook({
        userId: current_buy.userId,
        coin: current_buy.firstCurrency,
        currencyId: current_buy.firstCurrencyId,
        tableId: current_buy._id,
        beforeBalance: buyerWallet,
        afterBalance: buyerWallet + (exectamount - buyFee),
        amount: parseFloat(exectamount - buyFee),
        type: "spot_market_match",
        category: "credit",
      });
      //Order Book update for SELL
      if (current_buy.flag == true) {
        editOrderBook({
          buyorsell: current_sell.buyorsell,
          price: current_sell.price,
          minusQuantity: exectamount,
          pairId: current_sell.pairId,
          firstFloatDigit: pairData.firstFloatDigit,
        });
      }
      passbook({
        userId: current_sell.userId,
        coin: current_sell.secondCurrency,
        currencyId: current_sell.secondCurrencyId,
        tableId: current_sell._id,
        beforeBalance: sellerWallet,
        afterBalance: sellerWallet + (execvalue - sellFee),
        amount: parseFloat(execvalue - sellFee),
        type: "spot_market_match",
        category: "credit",
      });
      // Trade History
      newTradeHistory({
        buyOrderData: current_buy,
        sellOrderData: current_sell,
        uniqueId: uniqueId,
        execPrice: avgPrice,
        Maker: isMaker,
        buyerFee: buyFee,
        sellerFee: sellFee,
        execQuantity: exectamount,
        ordertype: "Market",
      });
      ChartDocHistory({
        pairName: pairData.tikerRoot,
        price: avgPrice,
      }); //ChartHistory
      execvalue -= sellFee;
      exectamount -= buyFee;
      let buyWallet = await hincbyfloat(
        "walletbalance_spot",
        current_buy.userId + "_" + current_buy.firstCurrencyId,
        exectamount
      );
      let sellWallet = await hincbyfloat(
        "walletbalance_spot",
        current_sell.userId + "_" + current_sell.secondCurrencyId,
        execvalue
      );
      getOpenOrderSocket(current_sell.userId, current_sell.pairId);
      getOpenOrderSocket(current_buy.userId, current_buy.pairId);
      getOrderHistorySocket(current_buy.userId, current_buy.pairId);
      getOrderHistorySocket(current_sell.userId, current_sell.pairId);
      socketEmitOne(
        "updateTradeAsset",
        {
          currencyId: current_buy.firstCurrencyId,
          spotBal: buyWallet,
        },
        current_buy.userId
      );
      socketEmitOne(
        "updateTradeAsset",
        {
          currencyId: current_sell.secondCurrencyId,
          spotBal: sellWallet,
        },
        current_sell.userId
      );
      // marketPriceSocket(current_buy.pairId);
    }
  } catch (err) {
    console.log("-----------------Market match error");
  }
};

//Cancel Market Order

export const cancelMarketOrder = async (tableId, orderId) => {
  try {
    let checkOrder = await hget(tableId, orderId);

    checkOrder = JSON.parse(checkOrder);
    if (checkOrder) {
      checkOrder.status = "cancel";
      let currencyId =
        checkOrder.buyorsell == "buy"
          ? checkOrder.secondCurrencyId
          : checkOrder.firstCurrencyId;
      let orderValue =
        checkOrder.buyorsell == "buy"
          ? checkOrder.price * checkOrder.quantity
          : checkOrder.quantity;
      let marketValue =
        checkOrder.orderType == "market" && checkOrder.buyorsell == "buy"
          ? checkOrder.orderValue
          : checkOrder.amount;
      let retriveValue =
        checkOrder.orderType == "limit" ? orderValue : marketValue;
      retriveValue = parseFloat(retriveValue);
      if (checkOrder.orderType != "market") {
        // editOrderBook({
        //   buyorsell: checkOrder.buyorsell,
        //   price: checkOrder.price,
        //   minusQuantity: checkOrder.quantity,
        //   pairId: checkOrder.pairId,
        //   firstFloatDigit: checkOrder.firstFloatDigit,
        // });
      }
      let userWallet = await hincbyfloat(
        "walletbalance_spot",
        checkOrder.userId + "_" + currencyId,
        retriveValue
      );
      passbook({
        userId: checkOrder.userId,
        coin:
          checkOrder.buyorsell == "buy"
            ? checkOrder.secondCurrency
            : checkOrder.firstCurrency,
        currencyId: currencyId,
        tableId: checkOrder._id,
        beforeBalance: userWallet - retriveValue,
        afterBalance: userWallet,
        amount: retriveValue,
        type: "orderCancel",
        category: "credit",
      });
      await hset(
        "orderHistory_" + checkOrder.userId,
        checkOrder._id,
        checkOrder
      );
      await hdel(tableId, orderId);
      getOpenOrderSocket(checkOrder.userId, checkOrder.pairId);
      getOrderHistorySocket(checkOrder.userId, checkOrder.pairId);
      newOrderHistory(checkOrder);

      socketEmitOne(
        "updateTradeAsset",
        {
          currencyId: currencyId,
          spotBal: userWallet,
        },
        checkOrder.userId
      );
      return true;
    }
    return true;
  } catch (err) {
    console.log("err: ", err);
    return false;
  }
};

/**
 * Update Order Book
 * PARAMS : pairId
 */
export const editOrderBook = async ({
  buyorsell,
  price,
  minusQuantity,
  pairId,
  firstFloatDigit,
}) => {
  try {
    let decimalval = minTwoDigits(firstFloatDigit);
    let quntitydecimal = Math.round(minusQuantity * decimalval);
    quntitydecimal = toFixedDown(quntitydecimal, firstFloatDigit);
    console.log(buyorsell, '--------------4532', quntitydecimal)
    await hincby(buyorsell + "Orders" + pairId, price, -quntitydecimal);
    getOrderBookSocket(pairId);
    return true;
  } catch (err) {
    console.log("---4537", err);
    return false;
  }
};

export const newTradeHistory = async ({
  buyOrderData,
  sellOrderData,
  uniqueId,
  execPrice,
  Maker,
  buyerFee,
  sellerFee,
  execQuantity,
  ordertype,
}) => {
  console.log(buyOrderData, "---buyOrderData")
  console.log(sellOrderData, "---sellOrderData")
  try {
    let PairId = buyOrderData.pairId
      ? buyOrderData.pairId
      : sellOrderData.pairId;
    let firsrCurrency = buyOrderData.firstCurrency
      ? buyOrderData.firstCurrency
      : sellOrderData.firstCurrency;
    let secondCurrecny = buyOrderData.secondCurrency
      ? buyOrderData.secondCurrency
      : sellOrderData.secondCurrency;
    let PairSymbole = firsrCurrency + secondCurrecny;
    let data = {
      pairId: PairId,
      firstCurrency: firsrCurrency,
      secondCurrency: secondCurrecny,
      firstCurrencyId: buyOrderData.firstCurrencyId
        ? buyOrderData.firstCurrencyId
        : sellOrderData.firstCurrencyId,
      secondCurrencyId: buyOrderData.secondCurrencyId
        ? buyOrderData.secondCurrencyId
        : sellOrderData.secondCurrencyId,
      sellUserId: sellOrderData.userId,
      buyUserId: buyOrderData.userId,
      uniqueId: uniqueId,
      tradePrice: execPrice,
      tradeQty: execQuantity,
      buyUserCode: buyOrderData.userCode ? buyOrderData.userCode : "",
      sellUserCode: sellOrderData.userCode ? sellOrderData.userCode : "",
      buyeOrderPrice: parseFloat(
        !isEmpty(buyOrderData.price) && buyOrderData.price != "market"
          ? buyOrderData.price
          : 0
      ),
      sellerOrderPrice: parseFloat(
        !isEmpty(sellOrderData) && sellOrderData.price != "market"
          ? sellOrderData.price
          : 0
      ),
      buyerFee: buyerFee.toString(),
      sellOrderType: sellOrderData.orderType
        ? sellOrderData.orderType
        : "Liquidity",
      buyOrderType: buyOrderData.orderType
        ? buyOrderData.orderType
        : "Liquidity",
      sellerFee: sellerFee.toString(),
      isMaker: Maker,
      status: "completed",
      createdAt: Date.now(),
      orderValue: execPrice * execQuantity,
      pairName: PairSymbole,
      buyOrderId: buyOrderData._id ? buyOrderData._id : PairId,
      sellOrderId: sellOrderData._id ? sellOrderData._id : PairId,
      buyOrdCode: buyOrderData?.orderCode,
      sellOrdCode: sellOrderData?.orderCode,
    };
    let newCompletedTrade = new TradeHistory(data);
    await newCompletedTrade.save();

    if (!isEmpty(buyOrderData)) {
      saveAdminprofit({
        userId: newCompletedTrade.buyUserId,
        ordertype: newCompletedTrade.buyOrderType,
        pair:
          newCompletedTrade.firstCurrency +
          "/" +
          newCompletedTrade.secondCurrency,
        fee: newCompletedTrade.buyerFee,
        coin: newCompletedTrade.firstCurrency,
      });
    }
    if (!isEmpty(sellOrderData)) {
      saveAdminprofit({
        userId: newCompletedTrade.sellUserId,
        ordertype: newCompletedTrade.sellOrderType,
        pair:
          newCompletedTrade.firstCurrency +
          "/" +
          newCompletedTrade.secondCurrency,
        fee: newCompletedTrade.sellerFee,
        coin: newCompletedTrade.secondCurrency,
      });
    }

    await hset("tradeHistory_" + PairId, uniqueId, data);
    // await hset(
    //   "referralCommisonAdd",
    //   newCompletedTrade._id.toString(),
    //   newCompletedTrade
    // );
    setDepthHist(
      {
        PairId,
        tradePrice: execPrice,
        tradeQty: execQuantity,
      },
      Maker
    );
    if (buyOrderData.userId) {
      await getTradeHistorySocket(
        buyOrderData.userId.toString(),
        PairId.toString()
      );
    }

    if (sellOrderData.userId) {
      await getTradeHistorySocket(
        sellOrderData.userId.toString(),
        PairId.toString()
      );
    }

    recentTradeSocket(PairId);

    let getDoc = await hget("spotPairdata", PairId.toString());

    getDoc = JSON.parse(getDoc);

    if (getDoc) {
      getDoc["prevMarkPrice"] = getDoc.markPrice;
      getDoc.markPrice = execPrice;
      hset("spotPairdata", PairId.toString(), getDoc);
      SpotPair.updateOne(
        { _id: PairId },
        { markPrice: execPrice, prevMarkPrice: getDoc.markPrice },
        { upsert: true }
      ).exec();
    }
    marketPriceSocket(PairId);
    return true;
  } catch (err) {
    console.log("newTradeHistorynewTradeHistoryERRRRRRRRR", err);
  }
};

export const liquidityOrderPlace = async (element, pairData) => {
  try {
    await hdel(`${element.buyorsell}OpenOrders_` + element.pairId, element._id);

    if (element.orderType == "market") {
      const { status } = await binanceCtrl.orderPlace(element, pairData);
      if (status) {
        return {
          status: true,
          message: "Your order placed successfully.",
        };
      } else {
        return {
          status: false,
          message: "Order cannot be placed now. Please try again later",
        };
      }
    } else {
      const { status, data } = await binanceCtrl.orderPlace(element, pairData);
      if (status) {
        element.status = "pending";
        element.isLiquidity = true;
        element.isLiquidityError = false;
        element.liquidityId = data.orderId;
        await hset(
          `${element.buyorsell}OpenOrders_` + element.pairId,
          element._id,
          element
        );
        newOrderHistory(element);
        return {
          status: true,
          message: "Your order placed successfully.",
        };
      } else {
        return {
          status: false,
          message: "Order cannot be placed now. Please try again later",
        };
      }
    }
  } catch (err) {
    console.log(
      "liquidityOrderPlaceliquidityOrderPlaceliquidityOrderPlaceliquidityOrderPlace",
      err
    );
    return {
      status: false,
    };
  }
};

export const wazirxLiquidityOrderPlace = async (element, pairData) => {
  try {
    await hdel(`${element.buyorsell}OpenOrders_` + element.pairId, element._id);

    if (element.orderType == "market") {
      let priceVal =
        element.buyorsell == "buy" ? pairData.last_ask : pairData.last_bid;
      let orderValue =
        element.buyorsell == "buy"
          ? element.orderValue / priceVal
          : element.amount;
      console.log(
        "pairDatapairData",
        calculateMarkup(priceVal, pairData.markupPercentage, "+"),
        pairData.secondFloatDigit
      );
      let orderPrice =
        element.buyorsell == "buy"
          ? calculateMarkup(priceVal, pairData.markupPercentage, "+")
          : calculateMarkup(priceVal, pairData.markupPercentage, "-");
      let payload = element;
      payload.price = priceVal;
      payload.quantity = orderValue;
      console.log(
        "payloadpayloadpayloadpayload",
        payload,
        orderValue,
        orderPrice,
        priceVal
      );
      const { status, data } = await MarketOrderPlaceWazatix(payload, pairData);
      if (status) {
        // sell order balance return
        if (element.buyorsell == "buy") {
          let reMaingQuantity =
            payload.quantity -
            truncateDecimals(orderValue, pairData.firstFloatDigit);
          let RetruveBalance = truncateDecimals(reMaingQuantity * priceVal, 8);
          // console.log("wazaaaaaaaOrder",payload.quantity,orderValue,RetruveBalance,priceVal);
          let CoinId =
            element.buyorsell == "sell"
              ? element.firstCurrencyId.toString()
              : element.secondCurrencyId.toString();
          let UserId = element.userId.toString();
          let userBalanceUpdate = await hincbyfloat(
            "walletbalance_spot",
            UserId + "_" + CoinId,
            RetruveBalance
          );
          console.log(
            "datadatadatadatadatadata",
            RetruveBalance,
            payload.quantity,
            orderValue
          );
          let beforBlance = userBalanceUpdate - RetruveBalance,
            afterBalance = userBalanceUpdate;
          passbook({
            userId: UserId,
            coin:
              element.buyorsell == "sell"
                ? element.firstCurrency
                : element.secondCurrency,
            currencyId: CoinId,
            tableId: element._id,
            beforeBalance: beforBlance,
            afterBalance: afterBalance,
            amount: RetruveBalance,
            type: "spot_OrderMatch_Wazarix_Balance_return",
            category: "credit",
          });
        }

        element.status = "wait";
        element.isLiquidity = true;
        element.isLiquidityError = false;
        element.liquidityId = data.orderId;
        element.orderValue = orderPrice;
      }

      await hset(
        `${element.buyorsell}OpenOrders_` + element.pairId,
        element._id,
        element
      );
      newOrderHistory(element);
      if (!status)
        cancelMarketOrder(
          `${element.buyorsell}OpenOrders_${element.pairId}`,
          element._id
        );
    } else {
      const { status, data } = await wazirixOrderPlace(element, pairData);
      // console.log("resultresultresultresultresultresultresult",element, data, status);
      if (status) {
        element.status = "wait";
        element.isLiquidity = true;
        element.isLiquidityError = false;
        element.liquidityId = data.orderId;

        await hset(
          `${element.buyorsell}OpenOrders_` + element.pairId,
          element._id,
          element
        );
        newOrderHistory(element);
      } else {
        // await updateOrderBook(element, element.pairId, element.firstFloatDigit);

        element.liquidityType = "off";

        await hset(
          `${element.buyorsell}OpenOrders_` + element.pairId,
          element._id,
          element
        );
        newOrderHistory(element);
        console.log(
          "LiquidityOrderPlaceLiquidityOrderPlaceerr",
          status,
          data,
          element
        );
      }
    }
  } catch (err) {
    console.log("LiquidityOrderPlaceLiquidityOrderPlaceerr", err);
  }
};

export const depthData = async () => {
  let initial = [{ price: 0, volume: 0 }];
  let data = {};

  for (let i = 0; i < pairInfo.length; i++) {
    if (pairInfo[i].botstatus == "binance") {
      let buyDepth = await lrange(`buy_depth_binance_${pairInfo[i]._id}`);
      let sellDepth = await lrange(`sell_depth_binance_${pairInfo[i]._id}`);

      if (!isEmpty(buyDepth)) {
        buyDepth = await getvalueObj(buyDepth);
        buyDepth = buyDepth.sort((a, b) => b.price - a.price);
      }
      if (!isEmpty(sellDepth)) {
        sellDepth = await getvalueObj(sellDepth);
        sellDepth = sellDepth.sort((a, b) => a.price - b.price);
      }
      data = {
        pairId: pairInfo[i]._id,
        buy: buyDepth?.length > 20 ? buyDepth : initial,
        sell: sellDepth?.length > 20 ? sellDepth : initial,
      };
    } else {
      let buyDepth = await lrange("buy_depth_" + pairInfo[i]._id);
      let sellDepth = await lrange("sell_depth_" + pairInfo[i]._id);
      if (!isEmpty(buyDepth)) {
        buyDepth = await getvalueObj(buyDepth);
        buyDepth = buyDepth.sort((a, b) => b.price - a.price);
      }
      if (!isEmpty(sellDepth)) {
        sellDepth = await getvalueObj(sellDepth);
        sellDepth = sellDepth.sort((a, b) => a.price - b.price);
      }
      data = {
        pairId: pairInfo[i]._id,
        buy: buyDepth?.length > 0 ? buyDepth : initial,
        sell: sellDepth?.length > 0 ? sellDepth : initial,
      };
    }
    socketEmitOne("depthChart", data, "depthChart");
  }
};

export const clearSpotRedis = async () => {
  try {
    let tradeDoc,
      tradeArr = [];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    let orderHistDoc = await spotOrderHistory.find({
      createdAt: { $gte: sevenDaysAgo },
      status: { $in: ["completed", "cancel"] },
    });
    let pairDoc = await SpotPair.find({}).distinct("_id");
    if (pairDoc?.length > 0) {
      for (let item of pairDoc) {
        tradeDoc = await hgetall("tradeHistory_" + item.toString());
        if (tradeDoc) {
          tradeDoc = await getvalueObj(tradeDoc);
          tradeArr = tradeArr.concat(...tradeDoc);
        }
      }
    }
    if (orderHistDoc?.length > 0) {
      for (let item of orderHistDoc) {
        await hdel("orderHistory_" + item.userId, item._id);
      }
    }
    if (tradeArr?.length > 0) {
      for (let item of tradeArr) {
        await hdel("tradeHistory_" + item.pairId, item.uniqueId);
      }
    }
  } catch (err) {
    console.log("err: ", err);
  }
};

export const getDepthData = async (req, res) => {
  let initial = [{ price: 0, volume: 0 }];
  let data = {};
  let pairData = await SpotPair.findOne(
    { _id: req.body.id },
    { botstatus: 1 }
  ).lean();
  if (pairData.botstatus == "binance") {
    let buyDepth = await lrange(`buy_depth_binance_${pairData._id}`);
    let sellDepth = await lrange(`sell_depth_binance_${pairData._id}`);

    if (!isEmpty(buyDepth)) {
      buyDepth = await getvalueObj(buyDepth);
      buyDepth = buyDepth.sort((a, b) => b.price - a.price);
    }
    if (!isEmpty(sellDepth)) {
      sellDepth = await getvalueObj(sellDepth);
      sellDepth = sellDepth.sort((a, b) => a.price - b.price);
    }
    data = {
      pairId: pairData._id,
      buy: buyDepth?.length > 20 ? buyDepth : initial,
      sell: sellDepth?.length > 20 ? sellDepth : initial,
    };
  } else {
    let buyDepth = await lrange("buy_depth_" + pairData._id);
    let sellDepth = await lrange("sell_depth_" + pairData._id);
    if (!isEmpty(buyDepth)) {
      buyDepth = await getvalueObj(buyDepth);
      buyDepth = buyDepth.sort((a, b) => b.price - a.price);
    }
    if (!isEmpty(sellDepth)) {
      sellDepth = await getvalueObj(sellDepth);
      sellDepth = sellDepth.sort((a, b) => a.price - b.price);
    }
    data = {
      pairId: pairData._id,
      buy: buyDepth?.length > 0 ? buyDepth : initial,
      sell: sellDepth?.length > 0 ? sellDepth : initial,
    };
  }
  socketEmitAll("depthChart", data);
};

export const getTrends = async (req, res) => {
  try {
    let result = [];
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    let data = await TradeHistory.aggregate([
      {
        $match: { createdAt: { $gte: startOfDay, $lt: endOfDay } },
      },
      {
        $group: {
          _id: "$pairId",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);
    if (data.length > 0) {
      result = data.map((item) => item._id.toString());
    }
    return res.status(200).json({ success: true, result });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong" });
  }
};
export const createTradeHistory = async (order) => {
  let checkOrder = order;
  checkOrder.status = "cancel";
  let currencyId =
    checkOrder.buyorsell == "buy"
      ? checkOrder.secondCurrencyId
      : checkOrder.firstCurrencyId;
  let orderValue =
    checkOrder.buyorsell == "buy"
      ? checkOrder.price * checkOrder.quantity
      : checkOrder.quantity;
  let marketValue =
    checkOrder.orderType == "market" && checkOrder.buyorsell == "buy"
      ? checkOrder.orderValue
      : checkOrder.amount;
  let retriveValue = checkOrder.orderType == "limit" ? orderValue : marketValue;
  retriveValue = parseFloat(retriveValue);

  if (checkOrder.liquidityType == "off")
    if (checkOrder.orderType != "market") {
      editOrderBook({
        buyorsell: checkOrder.buyorsell,
        price: checkOrder.price,
        minusQuantity: checkOrder.quantity,
        pairId: checkOrder.pairId,
        firstFloatDigit: checkOrder.firstFloatDigit,
      });
    }
  let userWallet = await hincbyfloat(
    "walletbalance_spot",
    checkOrder.userId + "_" + currencyId,
    retriveValue
  );
  await hset("orderHistory_" + checkOrder.userId, checkOrder._id, checkOrder);

  let beforeBalanmce = userWallet - parseFloat(retriveValue);
  passbook({
    userId: checkOrder.userId,
    coin:
      checkOrder.buyorsell == "buy"
        ? checkOrder.secondCurrency
        : checkOrder.firstCurrency,
    currencyId: currencyId,
    tableId: checkOrder._id,
    beforeBalance: beforeBalanmce.toFixed(8),
    afterBalance: userWallet,
    amount: retriveValue,
    type: "order_Cancel",
    category: "credit",
  });
};

export const cancelOrderForDeactiveAcc = async (reqBody) => {
  try {
    let userId = reqBody.userId;
    // console.log(userId, 'userId')
    if (!userId) {
      return { status: false };
    }

    await SpotOrder.updateMany(
      { userId, status: { $in: ["pending", "open"] } }, // Use $in instead of $or
      { $set: { status: "cancel" } } // Wrap status in $set to update it
    );

    let spotPairDoc = await hgetall("spotPairdata");
    spotPairDoc = await getActivePairs(spotPairDoc);

    const pairIdList = spotPairDoc.map((item) => item._id);
    let orderList = [];

    for (const item of pairIdList) {
      let buyOrder = await hgetall(`buyOpenOrders_${item}`);
      if (buyOrder) {
        buyOrder = await getvalueObjbyId(buyOrder, userId);
        if (buyOrder.length > 0) orderList.push(...buyOrder);
      }
      let sellOrder = await hgetall(`sellOpenOrders_${item}`);
      if (sellOrder) {
        sellOrder = await getvalueObjbyId(sellOrder, userId);
        if (sellOrder.length > 0) orderList.push(...sellOrder);
      }
    }

    for (const item of orderList) {
      if (item.userId == userId) {
        createTradeHistory(item);
        const orderType =
          item.buyorsell === "buy" ? "buyOpenOrders_" : "sellOpenOrders_";
        await hdel(orderType + item.pairId, item._id);
        getOpenOrderSocket(item.userId, item.pairId);
        getOrderHistorySocket(item.userId, item.pairId);
      }
    }
    return { status: true };
  } catch (err) {
    console.log(err, "-------------err");
    return { status: false };
  }
};

// (async function () {
//   let changesDoc = await hget("spot24hrsChange", "664f1d73ea907e69e8f29b21");
//   console.log(changesDoc, "------5022");
// })();