import { priceConversionGrpc } from "../grpc/currencyService";
import { columnFillter, paginationQuery } from "../lib/adminHelpers";
import isEmpty from "../lib/isEmpty";
import { toFixedDown, truncateDecimals } from "../lib/roundOf";
import {

    SpotTrade, PriceConversion, User, TradeHistory
} from "../models";


export const getDashChart = async (req, res) => {
    try {
        let filter = ChartFilter(req.query.filter);
        let data = await SpotTrade.aggregate([
            {
                $match: {
                    $and: [
                        {
                            status: {
                                $in: ["pending", "completed", "cancel"],
                            },
                        },
                        filter,
                    ],
                },
            },
            { $sort: { createdAt: -1 } },
            { $unwind: "$filled" },
            {
                $group: {
                    _id: {
                        userId: "$userId",
                        secondCurrency: "$secondCurrency",
                    },
                    price: { $sum: "$filled.price" },
                },
            },
        ]);
        var arrData = [];

        for (var i = 0; i < data.length; i++) {
            let UserId = data[i]._id.userId.toString();
            let secondCurr = data[i]._id.secondCurrency;
            let price = data[i].price;

            let PriceCNV = await PriceConversion.findOne({
                baseSymbol: secondCurr,
                convertSymbol: "EUR",
            });
            if (PriceCNV) {
                var usdtprice = price * PriceCNV.convertPrice;
            } else {
                var usdtprice = 0;
            }

            var userDet = await User.findOne({ _id: ObjectId(UserId) });
            let checkIndex = arrData.findIndex(
                (el) => el.userId.toString() == UserId
            );
            if (checkIndex >= 0) {
                arrData[checkIndex]["price"] = arrData[checkIndex]["price"] + usdtprice;
            } else {
                arrData.push({
                    userId:
                        userDet && userDet.email != null
                            ? userDet.email
                            : userDet && userDet.phoneNo != null
                                ? userDet.phoneNo
                                : "",
                    price: usdtprice,
                });
            }
        }
        var Toptrader = arrData.sort(
            (teamA, teamB) =>
                teamB.price - teamA.price || teamA.userId.localeCompare(teamB.userId)
        );
        var Toptrader = Toptrader.slice(0, 5);
        return res.status(200).json({ success: true, result: Toptrader });
    } catch (err) {
        return res.status(500).json({ success: false });
    }
};

export const getAdminFee = async (req, res) => {
    try {
        let pagination = paginationQuery(req.query);
        let sortObj = !isEmpty(JSON.parse(req.query.sortObj))
            ? JSON.parse(req.query.sortObj)
            : { _id: -1 };
        let count = await TradeHistory.aggregate([{
            $group: {
                _id: "$pairName",
                firstCurrency: { $last: "$firstCurrency" },
                secondCurrency: { $last: "$secondCurrency" },
                buyerFee: { $sum: "$buyerFee" },
                sellerFee: { $sum: "$sellerFee" }
            }
        },])
        let data = await TradeHistory.aggregate([
            {
                $group: {
                    _id: "$pairName",
                    buyerFee: { $sum: "$buyerFee" },
                    sellerFee: { $sum: "$sellerFee" }
                }
            },
            { $sort: sortObj },
            { $skip: pagination.skip ? pagination.skip : 1 },
            { $limit: pagination.limit ? pagination.limit : 10 }
        ]);
        let totVal = 0
        for (let item of count) {
            if (item.firstCurrency != "USDT") {
                let getFPrice = await priceConversionGrpc({
                    baseSymbol: item.firstCurrency,
                    convertSymbol: "USDT",
                });
                if (getFPrice && getFPrice.status) {
                    let total = toFixedDown(getFPrice.convertPrice, 8)
                    totVal += total
                }
            } else {
                totVal += item.buyerFee
            }
            if (item.secondCurrency != "USDT") {
                let getSPrice = await priceConversionGrpc({
                    baseSymbol: item.secondCurrency,
                    convertSymbol: "USDT",
                });
                if (getSPrice && getSPrice.status) {
                    let total = toFixedDown(getSPrice.convertPrice, 8)
                    totVal += total
                }
            } else {
                totVal += item.sellerFee
            }
        }
        let result = {
            data, count: count.length, totVal
        }
        return res
            .status(200)
            .json({ success: true, message: "FETCH_SUCCESS.", result });
    } catch (err) {
        console.log(err, '-------145')
        return res
            .status(500)
            .json({ success: false, message: "Something went wrong" });
    }
};