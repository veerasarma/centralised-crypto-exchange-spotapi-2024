
import mongoose from 'mongoose';
// import model
import { TradeBot, SpotPair, spotOrderHistory, VolumeBot } from "../models";
//import lib
import isEmpty from '../lib/isEmpty'
import {
    filterSearchQuery,
    columnFillter,
    paginationQuery,
} from "../lib/adminHelpers";
import { toFixedDown, toFixed } from '../lib/roundOf';
import { IncCntObjId } from "../lib/generalFun";
import * as random from "../lib/randomBytes";
//import redis
import { hset, hgetall, hget, hdel, hdetall, hdelAll } from "../controllers/redis.controller";
//import service 
import { botUser, fetchBotUser } from '../grpc/userService'
//import controller
import { updateOrderBook, newOrderHistory, getvalueObj, FetchpairData, editOrderBook, getOrderBookSocket, getSequenceId } from '../controllers/spot.controller'
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
const ObjectId = mongoose.Types.ObjectId;
/**
 * Create Bot User
 * METHOD : POST
 * URL : /adminapi/botUser
 * BODY : name, email
 */
export const newBotUser = async (req, res) => {
    try {
        let reqBody = req.body;
        let emailRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,6}))$/;
        if (isEmpty(reqBody.firstName)) {
            return res.status(400).json({ 'status': false, 'errors': { 'firstName': 'FirstName field is required' } });
        }
        if (isEmpty(reqBody.lastName)) {
            return res.status(400).json({ 'status': false, 'errors': { 'lastName': 'LastName field is required' } });
        }
        if (isEmpty(reqBody.email)) {
            return res.status(400).json({ 'status': false, 'errors': { 'email': 'Email field is required' } });
        } else if (!(emailRegex.test(reqBody.email))) {
            return res.status(400).json({ 'status': false, 'errors': { 'email': 'Email is invalid' } });
        }
        let resp = await botUser(reqBody)
        if (resp.status) {
            return res
                .status(200)
                .json({ success: true, message: "Added successfully" });
        } else {
            return res
                .status(400)
                .json({ success: false, message: "Something went wrong" });
        }


    } catch (err) {
        return res
            .status(500)
            .json({ success: false, message: "Something went wrong" });
    }
};


export const newBot = async (req, res) => {
    try {
        let reqBody = req.body, errors = {};

        reqBody.startQuantity = parseFloat(reqBody.startQuantity);
        reqBody.endQuantity = parseFloat(reqBody.endQuantity);
        reqBody.startPrice = parseFloat(reqBody.startPrice);
        reqBody.endPrice = parseFloat(reqBody.endPrice);
        reqBody.count = parseFloat(reqBody.count);
        reqBody.buyPercent = parseFloat(reqBody.buyPercent);
        reqBody.sellPercent = parseFloat(reqBody.sellPercent);


        let pairData = await SpotPair.findOne(
            { '_id': ObjectId(reqBody.pairId) },
            {
                'botstatus': 1,
                'minQuantity': 1,
                'maxQuantity': 1,
                'minPricePercentage': 1,
                'maxPricePercentage': 1,
                'markPrice': 1,
            }
        );

        if (!pairData) {
            return res.status(400).json({ 'status': false, 'errors': { 'pairId': "Invalid Pair" } });
        }

        if (pairData.botstatus != "bot") {
            return res.status(400).json({ 'status': false, 'message': "Permission denied for this pair" });
        }

        if (reqBody.startQuantity < pairData.minQuantity) {
            errors.startQuantity = `Quantity of contract must not be lesser than ${pairData.minQuantity}`;
        }

        if (reqBody.endQuantity > pairData.maxQuantity) {
            errors.endQuantity = `Quantity of contract must not be lesser than ${pairData.maxQuantity}`
        }

        console.log(errors, '---errors')
        if (!isEmpty(errors)) {
            return res.status(400).json({ 'status': false, errors })
        }

        let botDoc = await TradeBot.findOne({ 'pairId': reqBody.pairId, 'side': { '$in': reqBody.side } });

        if (botDoc) {
            return res.status(400).json({ 'status': false, 'errors': { 'pairId': "Pair and side already exists" } });
        }
        let percent = reqBody.side == "buy" ? "buyPercent" : "sellPercent";
        let newDoc = new TradeBot({
            pairId: reqBody.pairId,
            side: reqBody.side,
            buyStartPricePerc: reqBody.buyStartPricePerc,
            buyEndPricePerc: reqBody.buyEndPricePerc,
            sellStartPricePerc: reqBody.sellStartPricePerc,
            sellEndPricePerc: reqBody.sellEndPricePerc,
            startQuantity: reqBody.startQuantity,
            endQuantity: reqBody.endQuantity,
            count: reqBody.count,
            [percent]: reqBody.side == "buy" ? reqBody.buyPercent : reqBody.sellPercent
        });

        await newDoc.save();
        return res.status(200).json({ 'success': true, 'message': "Added successfully" });
    } catch (err) {
        console.log(err, '-------142')
        return res.status(500).json({ 'success': false, 'message': "Something went wrong" });
    }
};
export const updateBot = async (req, res) => {
    try {
        let reqBody = req.body, errors = {};

        reqBody.startQuantity = parseFloat(reqBody.startQuantity);
        reqBody.endQuantity = parseFloat(reqBody.endQuantity);
        reqBody.startPrice = parseFloat(reqBody.startPrice);
        reqBody.endPrice = parseFloat(reqBody.endPrice);
        reqBody.count = parseFloat(reqBody.count);
        reqBody.buyPercent = parseFloat(reqBody.buyPercent);
        reqBody.sellPercent = parseFloat(reqBody.sellPercent);

        let checkBot = await TradeBot.findOne({ _id: { $ne: reqBody.id }, pairId: reqBody.pairId, side: { $in: reqBody.side } })
        if (!isEmpty(checkBot)) {
            return res.status(400).json({ 'status': false, 'message': 'A similar trade bot already exists for the specified pair ID and side. Please modify the existing bot or choose a different pair or side.' });
        }
        let pairData = await SpotPair.findOne(
            { '_id': ObjectId(reqBody.pairId) },
            {
                'botstatus': 1,
                'minQuantity': 1,
                'maxQuantity': 1,
                'minPricePercentage': 1,
                'maxPricePercentage': 1,
                'markPrice': 1,
            }
        );

        if (!pairData) {
            return res.status(400).json({ 'status': false, 'errors': { 'pairId': "Invalid Pair" } });
        }

        if (pairData.botstatus != "bot") {
            return res.status(400).json({ 'status': false, 'message': "Permission denied for this pair" });
        }

        if (reqBody.startQuantity < pairData.minQuantity) {
            errors.startQuantity = `Quantity of contract must not be lesser than ${pairData.minQuantity}`;
        }

        if (reqBody.endQuantity > pairData.maxQuantity) {
            errors.endQuantity = `Quantity of contract must not be lesser than ${pairData.maxQuantity}`
        }

        if (!isEmpty(errors)) {
            return res.status(400).json({ 'status': false, errors })
        }
        await TradeBot.findOneAndUpdate({ _id: reqBody.id },
            {
                $set: {
                    pairId: reqBody.pairId,
                    side: reqBody.side,
                    buyStartPricePerc: reqBody.buyStartPricePerc,
                    buyEndPricePerc: reqBody.buyEndPricePerc,
                    sellStartPricePerc: reqBody.sellStartPricePerc,
                    sellEndPricePerc: reqBody.sellEndPricePerc,
                    startQuantity: reqBody.startQuantity,
                    endQuantity: reqBody.endQuantity,
                    count: reqBody.count,
                    buyPercent: reqBody.buyPercent,
                    sellPercent: reqBody.sellPercent,
                    status: reqBody.status
                }
            }, { new: true }
        )

        return res.status(200).json({ 'success': true, 'message': "Updated successfully" });
    } catch (err) {
        return res.status(500).json({ 'success': false, 'message': "Something went wrong" });
    }
};
/**
 * Get Bot User
 * METHOD : GET
 * URL : /adminapi/botUser
 */

// **
//  * Trade Bot List
//     * METHOD : GET
//         * URL : /adminapi/botList
//             * /
export const botList = async (req, res) => {
    try {
        let pagination = paginationQuery(req.query);
        let filter = columnFillter(req.query, req.headers.timezone);
        let count = await TradeBot.aggregate([
            {
                $lookup: {
                    from: "spotpair",
                    localField: "pairId",
                    foreignField: "_id",
                    as: "pairInfo",
                },
            },
            { $unwind: "$pairInfo" },
            {
                $project: {
                    firstCoin: "$pairInfo.firstCurrencySymbol",
                    secondCoin: "$pairInfo.secondCurrencySymbol",
                    createdAt: 1,
                    side: 1,
                    buyStartPricePerc: 1,
                    buyEndPricePerc: 1,
                    sellStartPricePerc: 1,
                    sellEndPricePerc: 1,
                    startQuantity: 1,
                    endQuantity: 1,
                    count: 1,
                    buyPercent: 1,
                    sellPercent: 1,
                    status: 1,
                },
            },
            { $match: filter }
        ]);

        let data = await TradeBot.aggregate([
            {
                $lookup: {
                    from: "spotpair",
                    localField: "pairId",
                    foreignField: "_id",
                    as: "pairInfo",
                },
            },
            { $unwind: "$pairInfo" },
            {
                $project: {
                    firstCoin: "$pairInfo.firstCurrencySymbol",
                    secondCoin: "$pairInfo.secondCurrencySymbol",
                    createdAt: 1,
                    side: 1,
                    buyStartPricePerc: 1,
                    buyEndPricePerc: 1,
                    sellStartPricePerc: 1,
                    sellEndPricePerc: 1,
                    startQuantity: 1,
                    endQuantity: 1,
                    count: 1,
                    buyPercent: 1,
                    sellPercent: 1,
                    status: 1,
                },
            },
            { $match: filter },
            { $skip: pagination.skip },
            { $limit: pagination.limit },
        ]);
        let result = {
            data,
            count: count.length
        }
        return res
            .status(200)
            .json({ success: true, message: "FETCH_SUCCESS.", result });
    } catch (err) {
        console.log(err)
        return res
            .status(500)
            .json({ success: false, message: "Something went wrong" });
    }
};
export const findByID = async (req, res) => {
    try {
        let data = await TradeBot.findOne({ _id: req.params.id });
        let result = {
            data,
        }
        return res
            .status(200)
            .json({ success: true, message: "FETCH_SUCCESS.", result });
    } catch (err) {
        console.log(err)
        return res
            .status(500)
            .json({ success: false, message: "Something went wrong" });
    }
};


/**
 * Get Spot Trade Pair
 * METHOD : GET
 */
export const getPairList = async (req, res) => {
    try {

        let data = await SpotPair.find({ status: 'active', botstatus: 'bot' }, {
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

        let result = {
            data,
        };
        return res.status(200).json({ success: true, messages: "success", result });
    } catch (err) {
        return res
            .status(500)
            .json({ success: false, errors: { messages: "Error on server" } });
    }
};



export const getBotUser = async (req, res) => {
    try {
        let resp = await fetchBotUser({ id: req.query.id })
        if (!isEmpty(resp)) {
            return res.status(200).json({ success: true, result: resp })
        } else {
            return res.status(200).json({ success: false, message: 'Not found' })
        }
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Not found' })
    }
}
/**
 * Place Bot Order
 * startPrice, endPrice, startQuantity, endQuantity, side
 */
export const placeBotOrder = async (
    pairData,
    reqBody,
    startCnt = 0,
    endCnt = 0
) => {
    try {

        console.log(startCnt, endCnt, "----------- BOT ORDER PLACE ---------------", reqBody);

        if (isEmpty(pairData)) {
            return true;
        } else if (startCnt >= endCnt) {
            return true;
        }

        let price = toFixed(random.range(reqBody.startPrice, reqBody.endPrice), pairData.secondFloatDigit),
            quantity = toFixed(random.range(reqBody.startQuantity, reqBody.endQuantity), pairData.firstFloatDigit);

        if ((reqBody.side == 'buy' && price < pairData.markPrice) || (reqBody.side == 'sell' && price > pairData.markPrice)) {
            const seqId = await getSequenceId("orderHistory");
            const newOpenOrder = {
                _id: createobjectId(),
                userId: reqBody.botUsrId,
                pairId: pairData._id,
                firstCurrencyId: pairData.firstCurrencyId,
                firstCurrency: pairData.firstCurrencySymbol,
                firstFloatDigit: pairData.firstFloatDigit,
                secondCurrencyId: pairData.secondCurrencyId,
                secondCurrency: pairData.secondCurrencySymbol,
                secondFloatDigit: pairData.secondFloatDigit,
                makerFee: pairData.maker_rebate,
                takerFee: pairData.taker_fees,
                quantity: quantity,
                price: price,
                orderValue: price * quantity,
                pairName: `${pairData.firstCurrencySymbol}${pairData.secondCurrencySymbol}`,
                orderType: 'limit',
                buyorsell: reqBody.side,
                openQuantity: quantity,
                averagePrice: 0, //price
                filledQuantity: 0,
                isLiquidity: false,
                isLiquidityError: false,
                liquidityType: 'off',
                flag: false,
                status: "open",
                orderDate: new Date(), // Date.now(),
                userCode: IncCntObjId(reqBody.botUsrId),
                orderCode: seqId
            };
            await hset(
                newOpenOrder.buyorsell + "OpenOrders_" + newOpenOrder.pairId,
                newOpenOrder._id,
                newOpenOrder
            );
            updateOrderBook(
                newOpenOrder,
                newOpenOrder.pairId,
                pairData.firstFloatDigit
            );
            newOrderHistory(newOpenOrder);

        }

        return await placeBotOrder(pairData, reqBody, startCnt + 1, endCnt);
    } catch (err) {
        console.log("------err", err);
        return false;
    }
};

let tradeBot = false;
export const checkBot = async () => {
    console.log('************** TRADE BOT *****************')
    try {

        if (tradeBot) {
            return false;
        }

        tradeBot = true;
        let conditionBot = true
        let botDoc = await TradeBot.find({ 'status': 'active' });
        if (botDoc && botDoc.length > 0) {
            let botUsr = await fetchBotUser({ id: 'trade_bot' })
            console.log(botUsr, '-------454', botDoc.length)
            if (botUsr) {
                for (let item of botDoc) {
                    const now = new Date();
                    const currentMinute = now.getMinutes();
                    let checkSide = randomSide(currentMinute)
                    let pairData = await FetchpairData(item.pairId);
                    if (pairData) {
                        let volDoc = await VolumeBot.find({ 'pairId': item.pairId, 'status': 'active' });
                        // if (item.lastMarketPrice != pairData.markPrice && isEmpty(volDoc)) { // Old Version

                        // New Condition 
                        let bPrice =
                            parseFloat(item.lastMarketPrice) -
                            parseFloat(item.lastMarketPrice) * (item.buyPercent / 100);
                        let sPrice =
                            parseFloat(item.lastMarketPrice) +
                            parseFloat(item.lastMarketPrice) * (item.sellPercent / 100);
                        console.log(bPrice, '-------bPrice', sPrice, '---------sPrice', conditionBot)
                        console.log(parseFloat(item.lastMarketPrice), item.side, '-------item.lastMarketPrice', pairData.markPrice, '------pairData.markPrice')
                        if ((parseFloat(item.lastMarketPrice) != pairData.markPrice &&
                            ((item.side.includes("buy") && pairData.markPrice < bPrice) ||
                                (item.side.includes("sell") && pairData.markPrice > sPrice)) && conditionBot)) {
                            tradeBot = false;
                            conditionBot = false
                            return await resetBotOrders({ 'botId': item._id })
                        }
                        if (item.side.includes("buy")) {
                            if (item.buyStartPricePerc >= 0 && item.buyEndPricePerc >= 0) {
                                let startPrice = parseFloat(pairData.markPrice) - (parseFloat(pairData.markPrice) * parseFloat(item.buyStartPricePerc) / 100)
                                let endPrice = parseFloat(pairData.markPrice) - (parseFloat(pairData.markPrice) * parseFloat(item.buyEndPricePerc) / 100)

                                let buyRefillDoc = {
                                    startPrice: toFixedDown(startPrice, pairData.secondFloatDigit),
                                    endPrice: toFixedDown(endPrice, pairData.secondFloatDigit),
                                    startQuantity: item.startQuantity,
                                    endQuantity: item.endQuantity,
                                    side: "buy",
                                    botUsrId: botUsr._id,
                                };

                                let buyorderList = await hgetall("buyOpenOrders_" + pairData._id);
                                if (buyorderList) {
                                    buyorderList = await getvalueObj(buyorderList);
                                }
                                if (!isEmpty(buyorderList)) {
                                    if (!isEmpty(volDoc) && checkSide == 'sell' && volDoc?.side == 'sell') {
                                        let buyDoc = {
                                            price: toFixedDown(volDoc.price, pairData.secondFloatDigit),
                                            side: "buy",
                                            botUsrId: botUsr._id,
                                            quantity: toFixed(random.range(99, 100), pairData.firstFloatDigit)
                                        };
                                        await marketBalanceOrder(pairData, buyDoc, buyorderList);
                                    }
                                    buyorderList = buyorderList.filter((item) => item.userId == botUsr._id)
                                    if (buyorderList.length < item.count) {
                                        let refillCount = parseFloat(item.count) - parseFloat(buyorderList.length)
                                        await placeBotOrder(pairData, buyRefillDoc, 0, refillCount);
                                    }
                                } else {
                                    await placeBotOrder(pairData, buyRefillDoc, 0, item.count);
                                }
                            }
                        }

                        if (item.side.includes("sell")) {
                            if (item.sellStartPricePerc >= 0 && item.sellEndPricePerc >= 0) {
                                let startPrice = parseFloat(pairData.markPrice) + (parseFloat(pairData.markPrice) * parseFloat(item.sellStartPricePerc) / 100)
                                let endPrice = parseFloat(pairData.markPrice) + (parseFloat(pairData.markPrice) * parseFloat(item.sellEndPricePerc) / 100)
                                let sellRefillDoc = {
                                    startPrice: toFixedDown(startPrice, pairData.secondFloatDigit),
                                    endPrice: toFixedDown(endPrice, pairData.secondFloatDigit),
                                    startQuantity: item.startQuantity,
                                    endQuantity: item.endQuantity,
                                    side: "sell",
                                    botUsrId: botUsr._id,
                                };
                                let sellorderList = await hgetall("sellOpenOrders_" + pairData._id);
                                if (sellorderList) {
                                    sellorderList = await getvalueObj(sellorderList);
                                }
                                if (!isEmpty(sellorderList)) {
                                    if (!isEmpty(volDoc) && checkSide == 'buy' && volDoc?.side == 'buy') {
                                        let sellDoc = {
                                            price: toFixedDown(volDoc.price, pairData.secondFloatDigit),
                                            side: "sell",
                                            botUsrId: botUsr._id,
                                            quantity: toFixed(random.range(99, 100), pairData.firstFloatDigit)
                                        };
                                        await marketBalanceOrder(pairData, sellDoc, sellorderList);
                                    }
                                    sellorderList = sellorderList.filter((item) => item.userId == botUsr._id)
                                    if (sellorderList.length < item.count) {
                                        let refillCount = parseFloat(item.count) - parseFloat(sellorderList.length)
                                        await placeBotOrder(pairData, sellRefillDoc, 0, refillCount);
                                    }
                                } else {
                                    await placeBotOrder(pairData, sellRefillDoc, 0, item.count);
                                }
                            }
                        }
                        await TradeBot.findOneAndUpdate({ _id: item._id }, { $set: { lastMarketPrice: pairData.markPrice } })
                    }
                }
            }
        }
        tradeBot = false;
        return true;
    } catch (err) {
        console.log("-----err", err);
        tradeBot = false;
        return false;
    }
};
/**
 * BOT ALL OPEN ORDERS CANCEL
 * METHOD : GET
 * URL : /adminapi/bot-order-cancel/{{botId}}
 * PARAMS : botId
 */

export const botAllOpenOrderCancel = async (req, res) => {
    try {
        let botUsr = await fetchBotUser({ id: 'trade_bot' })
        if (!botUsr) {
            return res.status(400).json({ 'success': false, 'message': 'NO_TRADE_BOT_USER' })
        }
        let reqParam = req.params;
        if (isEmpty(reqParam.botId)) {
            return res.status(400).json({ 'success': false, 'message': 'Bot Id is required' })
        }

        let botDoc = await TradeBot.findOne({ '_id': reqParam.botId });

        if (isEmpty(botDoc)) {
            return res.status(400).json({ 'success': false, 'message': 'NO_DATA' })
        }

        let pairData = await SpotPair.findOne({ '_id': botDoc.pairId });

        if (isEmpty(pairData)) {
            return res.status(400).json({ 'success': false, 'message': 'NO_DATA' })
        }
        let findQuery = { 'userId': botUsr._id, 'pairId': pairData._id, 'status': { '$in': ['open', 'pending'] }, 'buyorsell': { '$in': botDoc.side } };
        let findList = await spotOrderHistory.find(findQuery)
        for (let i = 0; i < findList.length; i++) {
            let checkOrder = await hget(`${findList[i].buyorsell}OpenOrders_` + findList[i].pairId.toString(), findList[i]._id);
            checkOrder = JSON.parse(checkOrder)
            if (checkOrder) {
                checkOrder.status = "cancel"
                if (checkOrder.orderType != "market") {
                    editOrderBook({
                        buyorsell: checkOrder.buyorsell,
                        price: checkOrder.price,
                        minusQuantity: checkOrder.quantity,
                        pairId: checkOrder.pairId,
                        firstFloatDigit: checkOrder.firstFloatDigit,
                    });
                }
                await hset("orderHistory_" + checkOrder.userId, checkOrder._id, checkOrder);
                await hdel(`${findList[i].buyorsell}OpenOrders_` + findList[i].pairId.toString(), findList[i]._id);
                await hdelAll(botDoc.side + "Orders" + findList[i].pairId.toString());
                getOrderBookSocket(findList[i].pairId.toString());
                await newOrderHistory(checkOrder)
            }
        }
        return res.status(200).json({ 'success': true, message: "All bot orders cancelled successfully" });
    } catch (err) {
        console.log('err: ', err);
        return res.status(500).json({ 'success': false, 'message': 'Error on server' })
    }
}

export const resetBotOrders = async (reqBody) => {
    try {
        let botUsr = await fetchBotUser({ id: 'trade_bot' })
        if (isEmpty(botUsr)) {
            return
        }
        if (isEmpty(reqBody.botId.toString())) {
            return
        }

        let botDoc = await TradeBot.findOne({ '_id': reqBody.botId });
        let checkSide = botDoc.side == "buy" ? "sell" : "buy"
        let botSide = await TradeBot.findOne({ pairId: botDoc.pairId, side: { '$in': checkSide } })
        if (isEmpty(botDoc)) {
            return
        }

        let pairData = await SpotPair.findOne({ '_id': botDoc.pairId });

        if (isEmpty(pairData)) {
            return
        }
        await TradeBot.findOneAndUpdate({ _id: reqBody.botId }, { $set: { lastMarketPrice: pairData.markPrice } })
        if (botSide) {
            await TradeBot.findOneAndUpdate({ _id: botSide._id }, { $set: { lastMarketPrice: pairData.markPrice } })
        }
        let findQuery = { 'userId': botUsr._id, 'pairId': pairData._id, 'status': { '$in': ['open', 'pending'] }, 'buyorsell': { '$in': ['buy', 'sell'] } }; // botDoc.side
        let findList = await spotOrderHistory.find(findQuery)
        await spotOrderHistory.deleteMany(findQuery);
        for (let i = 0; i < findList.length; i++) {
            let checkOrder = await hget(`${findList[i].buyorsell}OpenOrders_` + findList[i].pairId.toString(), findList[i]._id);
            checkOrder = JSON.parse(checkOrder)
            console.log(!isEmpty(checkOrder), '----------673')
            if (!isEmpty(checkOrder)) {
                if (checkOrder.status == 'pending') {
                    checkOrder.status = "cancel"
                    if (checkOrder.orderType != "market") {
                        editOrderBook({
                            buyorsell: checkOrder.buyorsell,
                            price: checkOrder.price,
                            minusQuantity: checkOrder.quantity,
                            pairId: checkOrder.pairId,
                            firstFloatDigit: checkOrder.firstFloatDigit,
                        });
                    }
                    await hset("orderHistory_" + checkOrder.userId, checkOrder._id, checkOrder);
                    await hdel(`${findList[i].buyorsell}OpenOrders_` + findList[i].pairId.toString(), findList[i]._id);
                    await newOrderHistory(checkOrder)
                } else if (checkOrder.status == 'open') {
                    if (checkOrder.orderType != "market") {
                        editOrderBook({
                            buyorsell: checkOrder.buyorsell,
                            price: checkOrder.price,
                            minusQuantity: checkOrder.quantity,
                            pairId: checkOrder.pairId,
                            firstFloatDigit: checkOrder.firstFloatDigit,
                        });
                    }
                    await hdel(`${findList[i].buyorsell}OpenOrders_` + findList[i].pairId.toString(), findList[i]._id);
                    await hdel("orderHistory_" + checkOrder.userId, findList[i]._id);
                }
            }
        }
        await checkBot()
    } catch (err) {
        console.log('err:---------------------------------------- ', err);
    }

}
function randomSide(number) {
    if (number % 2 === 0) {
        return "sell";
    } else {
        return "buy";
    }
}
function getRandomNumber(min, max) {
    return Math.random() * (max - min) + min;
}
export const marketBalanceOrder = async (
    pairData,
    reqBody,
) => {
    try {
        if (isEmpty(pairData)) {
            return true;
        }
        if (isEmpty(reqBody.botUsrId)) {
            return true
        }

        const seqId = await getSequenceId("orderHistory");
        const newOpenOrder = {
            _id: ObjectId(),
            userId: reqBody.botUsrId,
            pairId: pairData._id,
            firstCurrencyId: pairData.firstCurrencyId,
            firstCurrency: pairData.firstCurrencySymbol,
            firstFloatDigit: pairData.firstFloatDigit,
            secondCurrencyId: pairData.secondCurrencyId,
            secondCurrency: pairData.secondCurrencySymbol,
            secondFloatDigit: pairData.secondFloatDigit,
            makerFee: pairData.maker_rebate,
            takerFee: pairData.taker_fees,
            quantity: reqBody.quantity,
            price: reqBody.price,
            orderValue: parseFloat(reqBody.price) * parseFloat(reqBody.quantity),
            pairName: `${pairData.firstCurrencySymbol}${pairData.secondCurrencySymbol}`,
            orderType: 'limit',
            buyorsell: reqBody.side,
            openQuantity: reqBody.quantity,
            averagePrice: reqBody.price,
            filledQuantity: 0,
            isLiquidity: false,
            isLiquidityError: false,
            liquidityType: 'off',
            flag: false,
            status: "open",
            orderDate: new Date(), // Date.now(),
            userCode: IncCntObjId(reqBody.botUsrId),
            orderCode: seqId,
        };
        await hset(
            newOpenOrder.buyorsell + "OpenOrders_" + newOpenOrder.pairId,
            newOpenOrder._id,
            newOpenOrder
        );
        updateOrderBook(
            newOpenOrder,
            newOpenOrder.pairId,
            pairData.firstFloatDigit
        );
        newOrderHistory(newOpenOrder);

    } catch (err) {
        console.log("------err", err);
        return false;
    }
};
