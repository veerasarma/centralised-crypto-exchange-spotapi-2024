// import models
import {
    SpotPair, TradeHistory,
} from "../models";
let orderBookArr = []

export const getPairList = async (req, res) => {
    try {
        let spotDoc = await SpotPair.aggregate([
            { $match: { status: 'active' } },
            {
                $project: {
                    _id: 0,
                    trading_pairs: { $concat: ['$firstCurrencySymbol', "_", '$secondCurrencySymbol'] },
                    last_price: '$markPrice',
                    base_volume: "$firstVolume",
                    quote_volume: "$secondVolume",
                    highest_price_24h: "$high",
                    lowest_price_24h: "$low",
                    price_change_percent_24h: "$change",
                    lowest_ask: "$last_ask",
                    highest_bid: "$last_bid"
                }
            }
        ]);

        return res.send(spotDoc)
    } catch (err) {
        return res.status(500).json({ status: false, message: "Error occured" });
    }
};

export const getTickerList = async (req, res) => {
    try {
        let spotDoc = await SpotPair.find({ status: 'active' }).lean();
        const result = {};
        spotDoc.forEach((item) => {
            result[`${item.firstCurrencySymbol}_${item.secondCurrencySymbol}`] = {
                last_price: item.markPrice,
                quote_volume: item.firstVolume,
                base_volume: item.secondVolume,
            };
        });
        return res.send(result)
    } catch (err) {
        return res.status(500).json({ status: false, message: "Error occured" });
    }
}
export const getOrderBook = async (req, res) => {
    try {
        let bitArr = [];
        let askArr = [];
        let result = {};
        if (req.query.ticker_root) {
            let orderBoookDoc = orderBookArr.find(item => item.symbol == req.query.ticker_root)
            if (orderBoookDoc) {
                if (orderBoookDoc?.buyOrder?.length > 0) {
                    for (let item of orderBoookDoc.buyOrder) {
                        bitArr.push([item._id, item.quantity])
                    }
                }
                if (orderBoookDoc?.sellOrder?.length > 0) {
                    for (let item of orderBoookDoc.sellOrder) {
                        askArr.push([item._id, item.quantity])
                    }
                }
                result['timestamp'] = orderBoookDoc.timestamp
                result['bids'] = bitArr
                result['asks'] = askArr
                return res.send(result)
            }
        } else {
            return res.status(400).json({ success: false, message: "Error occured" })
        }
    } catch (err) {
        return res.status(500).json({ success: false, message: "Error occured" })
    }
}
export const getrecentTrade = async (req, res) => {
    try {
        let tradeDoc = await TradeHistory.aggregate(
            [
                { $match: { pairName: req.query.ticker_root } },
                {
                    $addFields: {
                        timestamp: {
                            $divide: [
                                { $subtract: ["$createdAt", new Date("1970-01-01")] },
                                1000
                            ]
                        }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        trade_id: '$_id',
                        price: '$tradePrice',
                        timestamp: 1,
                        type: {
                            $cond: [{ $eq: ["$isMaker", "buy"] }, 'sell', 'buy']
                        },
                        base_volume: '$tradeQty',
                        quote_volume: { $multiply: ['$tradePrice', '$tradeQty'] }
                    }
                },
                {
                    $limit: 10
                }
            ])
        res.send(tradeDoc)
    } catch (err) {
        return res.status(500).json({ success: false, message: "Error occured" })
    }
}

export const setOrderBookData = (data) => {
    let checkLimit = (element) => element.symbol == data.symbol;
    let checkIndex = orderBookArr.findIndex(checkLimit)
    if (checkIndex >= 0) {
        orderBookArr.splice(checkIndex, 1, data)
    } else {
        orderBookArr.push(data)
    }
}