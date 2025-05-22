// import package
import mongoose from "mongoose";
// import model
import { SpotPair, TradeBot, VolumeBot } from "../models";

// import controller
import * as binanceCtrl from "./binance.controller";
import * as symbolDatabase from "./chart/symbols_database";
import * as spotTradeCtrl from "./spot.controller";
import config from "../config";
import { hset } from './redis.controller'
// import lib
import {
  paginationQuery,
  columnFillter,
} from "../lib/adminHelpers";
import isEmpty from "../lib/isEmpty";

// grpc
import { currencyId } from "../grpc/currencyService";
const ObjectId = mongoose.Types.ObjectId
/**
 * Add Spot Trade Pair
 * METHOD : POST
 * URL : /adminapi/spotPair
 * BODY : firstCurrencyId, firstFloatDigit, secondCurrencyId, secondFloatDigit, minPricePercentage, maxPricePercentage, maxQuantity, minQuantity, maker_rebate, taker_fees, markupPercentage, botstatus
 */
export const addSpotPair = async (req, res) => {
  let reqBody = req.body;
  try {
    // let firstCurrencyData = await Currency.findOne({ _id: reqBody.firstCurrencyId });
    let firstCurrencyData = await currencyId({ id: reqBody.firstCurrencyId });
    if (!firstCurrencyData) {
      return res
        .status(400)
        .json({
          success: false,
          errors: { firstCurrencyId: "Invalid Currency" },
        });
    }
    let secondCurrencyData = await currencyId({ id: reqBody.secondCurrencyId });
    if (!secondCurrencyData) {
      return res
        .status(400)
        .json({
          success: false,
          errors: { secondCurrencyId: "Invalid Currency" },
        });
    }
    let checkSpotPair = await SpotPair.findOne({
      firstCurrencyId: reqBody.firstCurrencyId,
      secondCurrencyId: reqBody.secondCurrencyId,
    });
    if (checkSpotPair) {
      return res
        .status(400)
        .json({
          success: false,
          errors: { firstCurrencyId: "Currency Pair  Already Exists" },
        });
    }
    let doc = {
      tikerRoot: `${firstCurrencyData.coin}${secondCurrencyData.coin}`,
      firstCurrencyId: reqBody.firstCurrencyId,
      firstCurrencySymbol: firstCurrencyData.coin,
      firstFloatDigit: parseInt(reqBody.firstFloatDigit),
      secondCurrencyId: reqBody.secondCurrencyId,
      secondCurrencySymbol: secondCurrencyData.coin,
      secondFloatDigit: parseInt(reqBody.secondFloatDigit),
      minPricePercentage: reqBody.minPricePercentage,
      maxPricePercentage: reqBody.maxPricePercentage,
      minQuantity: reqBody.minQuantity,
      maxQuantity: reqBody.maxQuantity,
      minOrderValue: reqBody.minOrderValue,
      maxOrderValue: reqBody.maxOrderValue,
      maker_rebate: reqBody.maker_rebate,
      markPrice: reqBody.markPrice,
      taker_fees: reqBody.taker_fees,
      markupPercentage: reqBody.markupPercentage,
      botstatus: reqBody.botstatus,
      marketPercent: reqBody.marketPercent,
      status: "active",
    };
    let newDoc = new SpotPair(doc);
    let addedDoc = await newDoc.save();
    let obj = {
      _id: newDoc._id,
      firstCurrencyImage: config.WALLET_URL +
        config.IMAGE.CURRENCY_URL_PATH + firstCurrencyData.image,
      secondCurrencyImage: config.WALLET_URL +
        config.IMAGE.CURRENCY_URL_PATH + secondCurrencyData.image
    }
    symbolDatabase.initialChartSymbol();
    await hset("spotPairdata", (newDoc._id).toString(), { ...doc, ...obj });
    // if (addedDoc.botstatus == "binance") {
    binanceCtrl.getSpotPair();
    binanceCtrl.spotOrderBookWS();
    binanceCtrl.spotTickerPriceWS();
    // }
    spotTradeCtrl.fetchAllpairs();
    return res
      .status(200)
      .json({
        success: true,
        message: "Pair Added Successfully. Refreshing Data...",
      });
  } catch (err) {
    console.log(err, "err");
    return res.status(500).json({ success: false, message: "Error On Server" });
  }
};

/**
 * Add Spot Trade Pair
 * METHOD : POST
 * URL : /adminapi/spotPair
 * BODY : pairId, firstCurrencyId, firstFloatDigit, secondCurrencyId, secondFloatDigit, minPricePercentage, maxPricePercentage, maxQuantity, minQuantity, maker_rebate, taker_fees, markupPercentage, botstatus
 */
export const editSpotPair = async (req, res) => {
  let reqBody = req.body;
  try {
    if (reqBody.botstatus != 'bot') {
      let botDoc = await TradeBot.findOne({ pairId: reqBody.pairId, status: 'active' });
      if (!isEmpty(botDoc)) {
        return res.status(400).json({ success: false, message: "A trade bot is already active for the specified pair. Please turn off the existing bot before starting a liqudity." })
      }
    }

    let firstCurrencyData = await currencyId({ id: reqBody.firstCurrencyId });
    if (!firstCurrencyData) {
      return res
        .status(400)
        .json({
          success: false,
          errors: { firstCurrencyId: "Invalid Currency" },
        });
    }
    let secondCurrencyData = await currencyId({ id: reqBody.secondCurrencyId });
    if (!secondCurrencyData) {
      return res
        .status(400)
        .json({
          success: false,
          errors: { secondCurrencyId: "Invalid Currency" },
        });
    }
    let checkSpotPair = await SpotPair.findOne({
      firstCurrencyId: reqBody.firstCurrencyId,
      secondCurrencyId: reqBody.secondCurrencyId,
      _id: { $ne: reqBody.pairId },
    });
    if (checkSpotPair) {
      return res
        .status(400)
        .json({
          success: false,
          errors: { firstCurrencyId: "Currency Pair  Already Exists" },
        });
    }
    let doc = {
      _id: reqBody.pairId,
      tikerRoot: `${firstCurrencyData.coin}${secondCurrencyData.coin}`,
      firstCurrencyId: reqBody.firstCurrencyId,
      firstCurrencySymbol: firstCurrencyData.coin,
      firstFloatDigit: parseInt(reqBody.firstFloatDigit),
      secondCurrencyId: reqBody.secondCurrencyId,
      secondCurrencySymbol: secondCurrencyData.coin,
      secondFloatDigit: parseInt(reqBody.secondFloatDigit),
      minPricePercentage: reqBody.minPricePercentage,
      maxPricePercentage: reqBody.maxPricePercentage,
      minQuantity: reqBody.minQuantity,
      maxQuantity: reqBody.maxQuantity,
      minOrderValue: reqBody.minOrderValue,
      maxOrderValue: reqBody.maxOrderValue,
      maker_rebate: reqBody.maker_rebate,
      taker_fees: reqBody.taker_fees,
      markPrice: reqBody.markPrice,
      minOrderValue: reqBody.minOrderValue,
      maxOrderValue: reqBody.maxOrderValue,
      markupPercentage: reqBody.markupPercentage,
      botstatus: reqBody.botstatus,
      status: reqBody.status,
      marketPercent: reqBody.marketPercent,
    }

    let updateDoc = await SpotPair.findOneAndUpdate(
      { _id: reqBody.pairId },
      doc
    );
    symbolDatabase.initialChartSymbol();
    // if (updateDoc.botstatus == "binance") {
    binanceCtrl.getSpotPair();
    binanceCtrl.spotOrderBookWS();
    binanceCtrl.spotTickerPriceWS();
    // }
    await VolumeBot.findOneAndUpdate({ pairId: reqBody.pairId }, { count: 0, currentSide: "", lastMarketPrice: reqBody.markPrice });
    // wazirx sockets disconnect & reset
    // let wazirxStatus = reqBody.botstatus == "wazirx" ? "enable":"disable";
    // await wazirxCtrl.spotPriceTicker(updateDoc.tikerRoot.toLowerCase(),wazirxStatus);
    let obj = {
      firstCurrencyImage:
        config.WALLET_URL +
        config.IMAGE.CURRENCY_URL_PATH +
        firstCurrencyData.image,
      secondCurrencyImage:
        config.WALLET_URL +
        config.IMAGE.CURRENCY_URL_PATH +
        secondCurrencyData.image,
    };
    // await hdel('spotPairdata', updateDoc._id.toString())
    await hset("spotPairdata", updateDoc._id.toString(), { ...doc, ...obj });
    spotTradeCtrl.fetchAllpairs();
    return res.status(200).json({
      success: true,
      message: "Pair Updated Successfully. Refreshing Data...",
    });
  } catch (err) {
    console.log(err, "err");
    return res.status(500).json({ success: false, message: "Error on server" });
  }
};

/**
 * Get Spot Trade Pair
 * METHOD : GET
 */
export const spotPairList = async (req, res) => {
  try {
    let pagination = paginationQuery(req.query);
    let filter = columnFillter(req.query, req.headers.timezone);
    let sortObj = !isEmpty(JSON.parse(req.query.sortObj))
      ? JSON.parse(req.query.sortObj)
      : { _id: -1 };
    let count = await SpotPair.countDocuments(filter);
    let data = await SpotPair.find(filter, {
      firstCurrencyId: 1,
      firstCurrencySymbol: 1,
      firstFloatDigit: 1,
      secondCurrencyId: 1,
      secondCurrencySymbol: 1,
      secondFloatDigit: 1,
      minPricePercentage: 1,
      maxPricePercentage: 1,
      minQuantity: 1,
      maxQuantity: 1,
      maker_rebate: 1,
      taker_fees: 1,
      markPrice: 1,
      markupPercentage: 1,
      botstatus: 1,
      status: 1,
      marketPercent: 1
    })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .sort(sortObj);

    let result = {
      count,
      data,
    };
    return res.status(200).json({ success: true, messages: "success", result });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, errors: { messages: "Error on server" } });
  }
};

export const findById = async (req, res) => {
  try {
    let data = await SpotPair.findOne(
      {
        _id: req.params.id,
      },
      {
        firstCurrencyId: 1,
        firstCurrencySymbol: 1,
        firstFloatDigit: 1,
        secondCurrencyId: 1,
        secondCurrencySymbol: 1,
        secondFloatDigit: 1,
        minPricePercentage: 1,
        maxPricePercentage: 1,
        minQuantity: 1,
        maxQuantity: 1,
        minOrderValue: 1,
        maxOrderValue: 1,
        maker_rebate: 1,
        taker_fees: 1,
        markPrice: 1,
        markupPercentage: 1,
        botstatus: 1,
        status: 1,
        marketPercent: 1
      }
    );
    return res
      .status(200)
      .json({ success: true, messages: "success", result: data });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, errors: { messages: "Error on server" } });
  }
};


export const getAllMarkPrice = async (reqbody) => {
  let pairData = await SpotPair.find({}, { _id: 0, tikerRoot: 1, markPrice: 1 })
  return {
    result: pairData
  }
}

