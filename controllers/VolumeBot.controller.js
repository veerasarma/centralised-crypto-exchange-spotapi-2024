import mongoose from 'mongoose';
// import model
import { VolumeBot, SpotPair, TradeBot, TradeHistory } from "../models";
//import lib
import isEmpty from '../lib/isEmpty'
import {
    filterSearchQuery,
    paginationQuery,
} from "../lib/adminHelpers";
import { toFixed } from '../lib/roundOf';
import { IncCntObjId } from "../lib/generalFun";
import * as random from "../lib/randomBytes";
//import service 
import { fetchBotUser } from '../grpc/userService'
//import controller
import { newOrderHistory, getvalueObj, FetchpairData, updateOrderBook, getSequenceId } from '../controllers/spot.controller'
//import redis
import { hset, hgetall } from "../controllers/redis.controller";
const ObjectId = mongoose.Types.ObjectId;

export const newVolBot = async (req, res) => {
    try {
        let reqBody = req.body, errors = {};
        reqBody.startQuantity = parseFloat(reqBody.startQuantity);
        reqBody.endQuantity = parseFloat(reqBody.endQuantity);
        let botUsr = await fetchBotUser({ id: 'volume_bot' })
        if (isEmpty(botUsr?._id)) {
            return res.status(400).json({ 'status': false, 'message': "Volume bot user not found" });
        }
        let pairData = await SpotPair.findOne(
            { '_id': ObjectId(reqBody.pairId) },
            {
                'botstatus': 1,
                'minQuantity': 1,
                'maxQuantity': 1,
                'minPricePercentage': 1,
                'maxPricePercentage': 1,
                'markPrice': 1
            }
        );

        if (!pairData) {
            return res.status(400).json({ 'status': false, 'errors': { 'pairId': "Invalid Pair" } });
        }

        if (pairData.botstatus != "bot") {
            return res.status(400).json({ 'status': false, 'message': "Permission denied for this pair" });
        }

        let checkTradeBot = await TradeBot.findOne({ 'pairId': pairData._id }).lean();
        if (!checkTradeBot) return res.status(400).json({ 'success': false, 'message': "Must add a trading bot" });

        if (checkTradeBot.status != 'active') return res.status(400).json({ 'success': false, 'message': "Please active trading bot" });
        // if (reqBody.startQuantity < pairData.minQuantity) {
        //     errors.startQuantity = `Quantity of contract must not be less than ${pairData.minQuantity}`;
        // }

        // if (reqBody.endQuantity > pairData.maxQuantity) {
        //     errors.endQuantity = `Quantity of contract must not be less than ${pairData.maxQuantity}`
        // }
        // if (reqBody.startPricePerc < pairData.minPricePercentage) {
        //     errors.startPricePerc = `Start price percentage of contract must not be less than ${pairData.minPricePercentage}`;
        // }

        // if (reqBody.endPricePerc > pairData.maxPricePercentage) {
        //     errors.endPricePerc = `End price percentage of contract must not be less than ${pairData.maxPricePercentage}`
        // }
        if (!isEmpty(errors)) {
            return res.status(400).json({ 'status': false, errors })
        }

        let botDoc = await VolumeBot.findOne({ 'pairId': reqBody.pairId, 'side': { '$in': reqBody.side } });

        if (botDoc) {
            return res.status(400).json({ 'status': false, 'message': "Volume bot already exists" });
        }
        let checkVol = getRandomHourTime(new Date())
        console.log(checkVol, '-------78')
        let newDoc = new VolumeBot({
            pairId: reqBody.pairId,
            onHourTime: checkVol
            // startQuantity: reqBody.startQuantity,
            // endQuantity: reqBody.endQuantity,
            // startPricePerc: reqBody.startPricePerc,
            // endPricePerc: reqBody.endPricePerc,
        });

        await newDoc.save();
        return res.status(200).json({ 'success': true, 'message': "Added successfully" });
    } catch (err) {
        console.log('err: ', err);
        return res.status(500).json({ 'success': false, 'message': "Something went wrong" });
    }
};
export const updateVolBot = async (req, res) => {
    try {
        let reqBody = req.body, errors = {};

        // reqBody.startQuantity = parseFloat(reqBody.startQuantity);
        // reqBody.endQuantity = parseFloat(reqBody.endQuantity);

        let pairData = await SpotPair.findOne(
            { '_id': ObjectId(reqBody.pairId) },
            {
                'botstatus': 1,
                'minQuantity': 1,
                'maxQuantity': 1,
                'minPricePercentage': 1,
                'maxPricePercentage': 1,
                'markPrice': 1
            }
        );

        if (!pairData) {
            return res.status(400).json({ 'status': false, 'errors': { 'pairId': "Invalid Pair" } });
        }

        if (pairData.botstatus != "bot") {
            return res.status(400).json({ 'status': false, 'message': "Permission denied for this pair" });
        }

        // let checkTradeBot = await TradeBot.findOne({ 'pairId' : pairData._id }).lean();
        // if(!checkTradeBot) return res.status(400).json({ 'success': false, 'message': "Must add a trading bot" });

        // if(checkTradeBot.status != 'active') return res.status(400).json({ 'success': false, 'message': "Please active trading bot" });
        // if (reqBody.startPricePerc < pairData.minPricePercentage) {
        //     errors.startPricePerc = `Start price percentage of contract must not be less than ${pairData.minPricePercentage}`;
        // }

        // if (reqBody.endPricePerc > pairData.maxPricePercentage) {
        //     errors.endPricePerc = `End price percentage of contract must not be less than ${pairData.maxPricePercentage}`
        // }

        // if (reqBody.startQuantity < pairData.minQuantity) {
        //     errors.startQuantity = `Quantity of contract must not be less than ${pairData.minQuantity}`;
        // }

        // if (reqBody.endQuantity > pairData.maxQuantity) {
        //     errors.endQuantity = `Quantity of contract must not be less than ${pairData.maxQuantity}`
        // }

        if (!isEmpty(errors)) {
            return res.status(400).json({ 'status': false, errors })
        }
        await VolumeBot.findOneAndUpdate({ _id: reqBody.id },
            {
                $set: {
                    pairId: reqBody.pairId,
                    // startQuantity: reqBody.startQuantity,
                    // endQuantity: reqBody.endQuantity,
                    // startPricePerc: reqBody.startPricePerc,
                    // endPricePerc: reqBody.endPricePerc,
                    status: reqBody.status
                }
            }, { new: true }
        )

        return res.status(200).json({ 'success': true, 'message': "Updated successfully" });
    } catch (err) {
        return res.status(500).json({ 'success': false, 'message': "Something went wrong" });
    }
}

export const volBotList = async (req, res) => {
    try {
        let pagination = paginationQuery(req.query);
        let filter = filterSearchQuery(req.query, [
            "firstCoin",
            "status",
            "secondCoin"
        ]);
        let count = await VolumeBot.aggregate([
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
                    startQuantity: 1,
                    endQuantity: 1,
                    status: 1,
                },
            },
            { $match: filter }
        ]);

        let data = await VolumeBot.aggregate([
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
                    startQuantity: 1,
                    endQuantity: 1,
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
        let data = await VolumeBot.findOne({ _id: req.params.id });
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

let tradeBot = false;
export const checkVolumeBot = async () => {
    try {
        if (tradeBot) {
            return false;
        }
        tradeBot = true;
        let botDoc = await VolumeBot.find({ 'status': 'active' });
        if (botDoc && botDoc.length > 0) {
            let botUsr = await fetchBotUser({ id: 'volume_bot' })
            if (botUsr) {
                const now = new Date();
                const currentMinute = now.getMinutes();
                // let side = randomSide(currentMinute)
                // let docSide = side == 'buy' ? 'sell' : 'buy'
                for (let item of botDoc) {
                    console.log(item, '---------267')
                    let pairData = await SpotPair.findOne({ _id: item.pairId });
                    let side = await randomSide(currentMinute, item, pairData)
                    console.log(side, '-------270')
                    let docSide = side == 'buy' ? 'sell' : 'buy'
                    if (isEmpty(pairData)) {
                        tradeBot = false
                        continue;
                    }
                    let getOrders = await hgetall(`${docSide}OpenOrders_` + pairData._id);
                    if (getOrders == null) {
                        tradeBot = false
                        continue;
                    }
                    console.log('---------274')
                    getOrders = await getvalueObj(getOrders);
                    getOrders = getOrders.filter((element) => { return element.price !== "market" })
                        .sort((a, b) => {
                            if (docSide == 'buy') {
                                return b.price - a.price
                            } else {
                                return a.price - b.price
                            }
                        })
                    if (isEmpty(getOrders)) {
                        tradeBot = false
                        continue;
                    }
                    console.log(isEmpty(getOrders), '-------280')
                    const currentTime = new Date();
                    if (pairData.botstatus == 'bot' && currentTime >= item.onHourTime) {
                        let checkVol = getRandomHourTime(new Date()) // item.onHourTime
                        console.log(checkVol, '--------284')
                        if (checkVol) {
                            await VolumeBot.findOneAndUpdate({ _id: item._id },
                                {
                                    $set: {
                                        onHourTime: checkVol
                                    }
                                }, { new: true })
                        }
                        let orderDoc = getRandomOrders(getOrders) // getOrders[0]
                        console.log(orderDoc, '--------282', side)
                        if (side == 'buy') {
                            let buyDoc = {
                                price: orderDoc.price,
                                side: "buy",
                                botUsrId: botUsr._id,
                                quantity: orderDoc.quantity
                            };
                            let volBot = await VolumeBot.findOne({ 'pairId': item.pairId, 'status': 'active' })
                            let bCount = volBot.count
                            if (volBot.count > 0) {
                                bCount -= 1
                            } else {
                                bCount = 0
                            }
                            if (parseInt(bCount) <= 0) {
                                volBot.currentSide = ""
                            }
                            volBot.count = bCount
                            volBot.price = buyDoc.price
                            volBot.quantity = buyDoc.quantity
                            volBot.side = side
                            volBot.lastMarketPrice = pairData.markPrice
                            await volBot.save()
                            // await TradeBot.updateMany(
                            //     {
                            //         pairId: pairData._id,
                            //     },
                            //     {
                            //         $set:{
                            //             lastMarketPrice: pairData.markPrice
                            //         }
                            //     }
                            // )
                            // await VolumeBot.findOneAndUpdate({}, { count: bCount, price: buyDoc.price, quantity: buyDoc.quantity, side });
                            await placeBotOrder(pairData, buyDoc);
                        }
                        if (side == 'sell') {
                            let sellDoc = {
                                price: orderDoc.price,
                                side: "sell",
                                quantity: orderDoc.quantity,
                                botUsrId: botUsr._id,
                            };
                            let volBot = await VolumeBot.findOne({ 'pairId': item.pairId, 'status': 'active' })
                            let sCount = volBot.count
                            if (volBot.count > 0) {
                                sCount -= 1
                            } else {
                                sCount = 0
                            }
                            volBot.count = sCount
                            volBot.price = sellDoc.price
                            volBot.quantity = sellDoc.quantity
                            volBot.side = side
                            volBot.lastMarketPrice = pairData.markPrice
                            await volBot.save()
                            // await TradeBot.updateMany(
                            //     {
                            //         pairId: pairData._id
                            //     },
                            //     {
                            //         $set:{
                            //             lastMarketPrice: pairData.markPrice
                            //         }
                            //     }
                            // )
                            // await VolumeBot.findOneAndUpdate({ 'pairId': item.pairId, 'status': 'active' }, { count: sCount, price: sellDoc.price, quantity: sellDoc.quantity, side });
                            await placeBotOrder(pairData, sellDoc);
                        }
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
function getRandomNumber() {
    const numbers = [0, 1, 2];
    const randomIndex = Math.floor(Math.random() * numbers.length);
    return numbers[randomIndex];
}
const getRandomOrders = (orders) => {
    try {
        let randomNumber = getRandomNumber();
        let orderData = { price: 0, quantity: 0 }
        console.log(randomNumber, '------335')
        for (let i = 0; i < randomNumber; i++) {
            orderData.price = orders[i].price
            orderData.quantity += toFixed(orders[i].quantity, orders[i].firstFloatDigit)
        }
        if (orderData?.price > 0) {
            return orderData
        }
        return orders[0]
    } catch (err) {
        console.log(err, '------339')
        return orders[0]
    }
}
const getRandomHourTime = (oneHour) => {
    try {
        const startTime = oneHour.getTime();
        console.log(new Date(startTime), '------317')
        const endTime = startTime + (5 * 60 * 1000); // 5 minutes in milliseconds
        const randomTime = Math.floor(Math.random() * (endTime - startTime + 1)) + startTime;
        const randomDate = new Date(randomTime);
        console.log(randomDate, '------334')
        if (randomDate) {
            return randomDate
        }
        return false
    } catch (err) {
        console.log(err, '------339')
        return false
    }
}
export const randomSide = async (number, item, pairData) => {
    try {
        let randomNum = Math.floor(Math.random() * 5) + 1;
        console.log(randomNum, pairData.markPrice, '-------373', item, number % 2 === 0)
        if (isEmpty(item?.count) || parseInt(item.count) == 0) {
            console.log('--------373')
            if (number % 2 === 0) {
                let tBot = await TradeBot.findOne({ pairId: item.pairId, side: { $in: "sell" } })
                console.log(tBot, '----378')
                if (!isEmpty(item.lastMarketPrice)) {
                    let sPrice =
                        parseFloat(item.lastMarketPrice) +
                        parseFloat(item.lastMarketPrice) * (tBot.sellPercent / 100);
                    console.log('-----------380', sPrice)
                    if (pairData.markPrice >= sPrice) {
                        await VolumeBot.findOneAndUpdate({ _id: item._id }, { count: randomNum, currentSide: "sell", lastMarketPrice: pairData.markPrice });
                        return "sell"
                    }
                } else {
                    await VolumeBot.findOneAndUpdate({ _id: item._id }, { lastMarketPrice: pairData.markPrice });
                }
                return "sell";
            } else {
                console.log('---------401')
                let tBot = await TradeBot.findOne({ pairId: item.pairId, side: { $in: "buy" } })
                console.log(tBot, '----389')
                if (!isEmpty(item.lastMarketPrice)) {
                    let bPrice =
                        parseFloat(item.lastMarketPrice) -
                        parseFloat(item.lastMarketPrice) * (tBot.buyPercent / 100);
                    console.log(pairData.markPrice <= bPrice, '-----------391', bPrice)
                    if (pairData.markPrice <= bPrice) {
                        console.log('---------409')
                        await VolumeBot.findOneAndUpdate({ _id: item._id }, { count: randomNum, currentSide: "buy", lastMarketPrice: pairData.markPrice });
                        return "buy"
                    }
                } else {
                    await VolumeBot.findOneAndUpdate({ _id: item._id }, { lastMarketPrice: pairData.markPrice });
                }
                return "buy";
            }
        }
        if (parseInt(item.count) > 0) {
            console.log('-----------450')
            if (item?.currentSide) {
                let tBot = await TradeBot.find({ pairId: item.pairId })
                console.log(tBot, '-------453')
                let sellPerc = tBot.find((el) => el.side.includes("sell"))
                let buyPerc = tBot.find((el) => el.side.includes("buy"))
                console.log(tBot, '----439', sellPerc, buyPerc)
                if (!isEmpty(item.lastMarketPrice)) {
                    let sPrice =
                        parseFloat(item.lastMarketPrice) +
                        parseFloat(item.lastMarketPrice) * (sellPerc.sellPercent / 100);
                    console.log('-----------443', sPrice)
                    let bPrice =
                        parseFloat(item.lastMarketPrice) -
                        parseFloat(item.lastMarketPrice) * (buyPerc.buyPercent / 100);
                    console.log('-----------449', bPrice)
                    if (pairData.markPrice <= bPrice || pairData.markPrice >= sPrice) {
                        console.log('---------452')
                        await VolumeBot.findOneAndUpdate({ _id: item._id }, { count: randomNum, currentSide: item.currentSide == "sell" ? "buy" : "sell", lastMarketPrice: pairData.markPrice });
                        return item.currentSide
                    }
                } else {
                    await VolumeBot.findOneAndUpdate({ _id: item._id }, { lastMarketPrice: pairData.markPrice });
                }
                return item.currentSide
            }
            else {
                if (number % 2 === 0) {
                    return "sell";
                } else {
                    return "buy";
                }
            }
        }
    }
    catch (err) {
        console.log(err, '-----------380')
    }
}

export const placeBotOrder = async (
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

        let cost = reqBody.side == "buy" ? "orderValue" : "amount";

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
            price: "market",
            [cost]: reqBody.side == "buy" ? reqBody.price * reqBody.quantity : reqBody.quantity,
            openOrderValue: parseFloat(reqBody.price) * parseFloat(reqBody.quantity),
            pairName: `${pairData.firstCurrencySymbol}${pairData.secondCurrencySymbol}`,
            orderType: 'market',
            buyorsell: reqBody.side,
            openQuantity: reqBody.quantity,
            averagePrice: 0,
            filledQuantity: 0,
            isLiquidity: false,
            isLiquidityError: false,
            liquidityType: 'off',
            flag: true,
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
        // updateOrderBook(
        //     newOpenOrder,
        //     newOpenOrder.pairId,
        //     pairData.firstFloatDigit
        // );
        newOrderHistory(newOpenOrder);

    } catch (err) {
        console.log("------err", err);
        return false;
    }
};