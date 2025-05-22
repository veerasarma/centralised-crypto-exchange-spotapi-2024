// import model
import { SpotTrade, spotOrderHistory, TradeHistory, SpotOrder } from "../models";

import { paginationQuery, columnFillter, tradeHistoryFilter } from "../lib/adminHelpers";
import isEmpty from "../lib/isEmpty";
import { momentFormat } from "../lib/dateTimeHelper";
import { convert, stripExponential } from "../lib/convert"
import mongoose from "mongoose";
import "csv-express"
import capitalize from "../lib/capitalize";
import { hget } from "./redis.controller";

export const spotorderHistory = async (req, res) => {
  try {
    let pagination = paginationQuery(req.query);
    let filter = columnFillter(req.query, req.headers.timezone);
    console.log('filter: ', filter);
    let sortObj = !isEmpty(JSON.parse(req.query.sortObj))
      ? JSON.parse(req.query.sortObj)
      : { _id: -1 };
    // if (filter.userId && filter.userId.length > 0 && (filter.userId.length < 24 || filter.userId.length > 24)) filter.userId = '000000000000000000000000'
    // if (filter.userId) filter.userId = new mongoose.Types.ObjectId(filter.userId)
    let count = await spotOrderHistory.aggregate([
      {
        $project: {
          orderDate: 1,
          _id: 1,
          firstCurrency: 1,
          secondCurrency: 1,
          orderType: 1,
          buyorsell: 1,
          averagePrice: 1,
          price: 1,
          filledQuantity: 1,
          openQuantity: 1,
          orderValue: 1,
          conditionalType: 1,
          userCode: 1,
          status: 1,
          flag: 1,
          userId: 1,
          orderCode: 1,
          // email: "$UserInfo.email",
        },
      },
      { $match: filter },
      { $sort: sortObj },
    ],{allowDiskUse: true});
    let data = await spotOrderHistory.aggregate([

      {
        $project: {
          orderDate: 1,
          _id: 1,
          userCode: 1,
          firstCurrency: 1,
          secondCurrency: 1,
          orderType: 1,
          buyorsell: 1,
          averagePrice: 1,
          price: 1,
          filledQuantity: 1,
          openQuantity: 1,
          orderValue: 1,
          conditionalType: 1,
          status: 1,
          flag: 1,
          userId: 1,
          orderCode: 1,
          Price: { $cond: [{ $eq: ["$flag", true] }, "market", "$price"] },
          execPrice: { $cond: [{ $eq: ["$filledQuantity", 0] }, "0", { $divide: ["$averagePrice", "$filledQuantity"] }] }
        },
      },
      { $match: filter },
      { $sort: sortObj },
      { $skip: pagination.skip },
      { $limit: pagination.limit },
    ],{allowDiskUse: true});
    let result = {
      count: count.length,
      data,
    };
    // console.log(result);
    return res.status(200).json({ success: true, messages: "success", result });
  } catch (err) {
    console.log("wuuywueyhuwyh", err);
    return res
      .status(500)
      .json({ success: false, errors: { messages: "Error on server" } });
  }
};

export const spotorderHistoryDoc = async (req, res) => {
  try {

    let type = {};
    let Export = req.query.doc;
    const header = [
      "Date",
      "User Id",
      "Reference Id",
      "Base Currency",
      "Quote Currency",
      "Type",
      "Side",
      "Executed price",
      "Price",
      "Filled Amount",
      "Amount",
      "Total",
      "Status"
    ];
    let sortObj = !isEmpty(JSON.parse(req.query.sortObj))
      ? JSON.parse(req.query.sortObj)
      : { _id: -1 };
    if (Export == "csv" || Export == "xls") {
      if (req.query.fillter != "" && req.query.fillter != undefined) {
        let fillterQuery = columnFillter(req.query, req.headers.timezone);
        type = fillterQuery
      }
      if (type.userId && type.userId.length > 0 && (type.userId.length < 24 || type.userId.length > 24)) type.userId = '000000000000000000000000'
      if (type.userId) type.userId = new mongoose.Types.ObjectId(type.userId)
      let exportData = await spotOrderHistory.aggregate([

        {
          $project: {
            orderDate: 1,
            _id: 1,
            userCode: 1,
            firstCurrency: 1,
            secondCurrency: 1,
            orderType: 1,
            buyorsell: 1,
            averagePrice: 1,
            price: 1,
            filledQuantity: 1,
            openQuantity: 1,
            orderValue: 1,
            conditionalType: 1,
            status: 1,
            flag: 1,
            userId: 1,
            Price: { $cond: [{ $eq: ["$flag", true] }, "market", "$price"] },
            execPrice: { $cond: [{ $eq: ["$filledQuantity", 0] }, "0", { $divide: ["$averagePrice", "$filledQuantity"] }] }
          },
        },
        { $match: type },
        { $sort: sortObj },
      ]);
      let csvData = [header];

      if (exportData && exportData.length > 0) {
        for (let item of exportData) {
          let status = item.status == 'cancel' ? "Cancelled" : item.status
          let arr = [];
          arr.push(
            momentFormat(String(item.orderDate)),
            item._id,
            item.userCode,
            item.firstCurrency,
            item.secondCurrency,
            capitalize(item.orderType),
            capitalize(item.buyorsell),
            item && item.execPrice ? parseFloat(item.execPrice).toFixed(8) : '0',
            (item && item.flag == true) ? 'Market' : item.price,
            item.filledQuantity,
            item.orderType == 'market' && item.buyorsell == 'buy'
              ? parseFloat(item.filledQuantity).toFixed(8)
              : parseFloat(item.openQuantity).toFixed(8),
            item.averagePrice,
            capitalize(status),
          );
          csvData.push(arr);
        }
      }
      return res.csv(csvData);
    } else {
      let fillterQuery = columnFillter(req.query, req.headers.timezone);
      type = fillterQuery
      if (type.userId && type.userId.length > 0 && (type.userId.length < 24 || type.userId.length > 24)) type.userId = '000000000000000000000000'
      if (type.userId) type.userId = new mongoose.Types.ObjectId(type.userId)
      let data = await spotOrderHistory.aggregate([
        {
          $project: {
            orderDate: 1,
            _id: 1,
            userCode: 1,
            firstCurrency: 1,
            secondCurrency: 1,
            orderType: 1,
            buyorsell: 1,
            averagePrice: 1,
            price: 1,
            filledQuantity: 1,
            openQuantity: 1,
            orderValue: 1,
            conditionalType: 1,
            status: 1,
            flag: 1,
            userId: 1,
            Price: { $cond: [{ $eq: ["$flag", true] }, "market", "$price"] },
            execPrice: { $cond: [{ $eq: ["$filledQuantity", 0] }, "0", { $divide: ["$averagePrice", "$filledQuantity"] }] }
          },
        },
        { $match: type },
        { $sort: sortObj },
      ]);

      let result = {
        data,
      };
      return res
        .status(200)
        .json({ success: true, messages: "success", result });
    }
  } catch (err) {
    console.log("..errrrrrrrrrrrrrrrr", err);
    return res
      .status(500)
      .json({ success: false, errors: { messages: "Error on server" } });
  }
}

export const spotTradeHistory = async (req, res) => {
  try {
    let pagination = paginationQuery(req.query);
    let adminLiq = await hget("admin_liquidity", "liquidation");
    adminLiq = JSON.parse(adminLiq);

    // Parse the fillter JSON string into an object
    let fillterObj = JSON.parse(req.query.fillter);

    // Add the adminId filter
    fillterObj.adminId = adminLiq._id;

    // Convert the fillter object back to a JSON string
    req.query.fillter = JSON.stringify(fillterObj);
    let filter = columnFillter(req.query, req.headers.timezone);
    console.log('filter: ', filter);
    let sortObj = !isEmpty(JSON.parse(req.query.sortObj))
      ? JSON.parse(req.query.sortObj)
      : { _id: -1 };

    let statusmatch = {};
    statusmatch["status"] = "completed";
    // if (req.query.type == "searchType") {
    //   statusmatch["createdAt"] = filter.createdAt;
    // }
    // filter = { ...filter, ...{ buyerFee: 0.001613054 } }
    let count = await TradeHistory.aggregate([
      { $match: statusmatch },
      { $match: filter },
    ],{allowDiskUse: true});
    let data = await TradeHistory.aggregate([
      {
        $project: {
          firstCurrency: 1,
          _id: 1,
          secondCurrency: 1,
          buyorsell: 1,
          tradePrice: 1,
          tradeQty: 1,
          orderValue: 1,
          sellUserId: 1,
          buyUserId: 1,
          buyerFee: 1,
          sellerFee: 1,
          createdAt: 1,
          isMaker: 1,
          buyUserCode: 1,
          sellUserCode: 1,
          buyOrdCode: 1,
          sellOrdCode: 1,
          execPrice: 1,
          adminId: adminLiq._id,
        },
      },
      { $match: filter },
      { $sort: sortObj },
      { $skip: pagination.skip },
      { $limit: pagination.limit },
    ],{allowDiskUse:true});
    console.log('--------data', data)
    let result = {
      count: count.length,
      data,
      adminData: adminLiq
    };
    return res.status(200).json({ success: true, messages: "success", result });
  } catch (err) {
    console.log("..errrrrrrrrrrrrrrrr", err);
    return res
      .status(500)
      .json({ success: false, errors: { messages: "Error on server" } });
  }
};
/* export const spotTradeHistoryDoc = async (req, res) => {
  try {
    let reqBody = req.query;
    let filter = columnFillter(req.query, req.headers.timezone);
    let sortObj = !isEmpty(JSON.parse(req.query.sortObj))
      ? JSON.parse(req.query.sortObj)
      : { _id: -1 };
    let statusmatch = {};
    statusmatch["status"] = { $in: ["pending", "completed", "cancel"] };
    // if (req.query.fillter != "" && req.query.fillter != undefined) {
    //   filter = columnFillter(req.query, req.headers.timezone);
    //   statusmatch["createdAt"] = filter.createdAt;
    // }
    if (reqBody.export === "pdf") {
      let data = await SpotTrade.aggregate([
        { $match: statusmatch },
        { $unwind: "$filled" },
        {
          $lookup: {
            from: "user",
            localField: "filled.buyUserId",
            foreignField: "_id",
            as: "BuyerDetails",
          },
        },
        { $unwind: "$BuyerDetails" },

        {
          $lookup: {
            from: "user",
            localField: "filled.sellUserId",
            foreignField: "_id",
            as: "SelletDetails",
          },
        },
        { $unwind: "$SelletDetails" },

        {
          $project: {
            firstCurrency: 1,
            _id: 1,
            secondCurrency: 1,
            buyorsell: 1,
            price: "$filled.price",
            filledQuantity: "$filled.filledQuantity",
            orderValue: "$filled.orderValue",
            buyeremail: "$BuyerDetails.email",
            selleremail: "$SelletDetails.email",
            Fees: "$filled.Fees",
            createdAt: "$filled.createdAt",
          },
        },
        { $match: filter },
        { $sort: sortObj },
      ]);

      console.log("...filllterrrrrrrrrr", data);
      let result = {
        data,
      };
      return res
        .status(200)
        .json({ success: true, messages: "success", result });
    } else {
      console.log("pdf ......eneter ...............");
      const header = [
        "Date",
        "Reference Id",
        "Buyer Email",
        "Seller Email",
        "Base Currency",
        "Quote Currency",
        "Side",
        "Price",
        "Excuted",
        "Total",
        "Fees",
      ];
      let exportData = await SpotTrade.aggregate([
        { $match: statusmatch },
        { $unwind: "$filled" },
        {
          $lookup: {
            from: "user",
            localField: "filled.buyUserId",
            foreignField: "_id",
            as: "BuyerDetails",
          },
        },
        { $unwind: "$BuyerDetails" },

        {
          $lookup: {
            from: "user",
            localField: "filled.sellUserId",
            foreignField: "_id",
            as: "SelletDetails",
          },
        },
        { $unwind: "$SelletDetails" },

        {
          $project: {
            firstCurrency: 1,
            _id: 1,
            secondCurrency: 1,
            buyorsell: 1,
            price: "$filled.price",
            filledQuantity: "$filled.filledQuantity",
            orderValue: "$filled.orderValue",
            buyeremail: "$BuyerDetails.email",
            selleremail: "$SelletDetails.email",
            Fees: "$filled.Fees",
            createdAt: "$filled.createdAt",
          },
        },
        { $match: filter },
        { $sort: sortObj },
      ]);
      let csvData = [header];
      if (exportData && exportData.length > 0) {
        for (let item of exportData) {
          let arr = [];
          arr.push(
            momentFormat(item.createdAt.toString()),
            // item.createdAt.toLocaleString(),
            item._id,
            item.buyeremail,
            item.selleremail,
            item.firstCurrency,
            item.secondCurrency,
            item.buyorsell,
            item.price,
            item.filledQuantity,
            item.orderValue,
            item.Fees
          );
          csvData.push(arr);
        }
      }
      return res.csv(csvData);
    }
  } catch (err) {
    console.log("errrrrrrrrrrrrrrrrrrrr", err);

    return res
      .status(500)
      .json({ success: false, errors: { messages: "Error on server" } });
  }
}; */


export const spotTradeHistoryDoc = async (req, res) => {
  try {
    let type = {};
    let Export = req.query.export;
    const header = [
      "Date",
      "Reference Id",
      "Buyer Id",
      "Seller Id",
      "Base Currency",
      "Quote Currency",
      "Side",
      "Price",
      "Executed",
      "Total",
      "Buy Fee",
      "Sell Fee"
    ]
    let sortObj = !isEmpty(JSON.parse(req.query.sortObj))
      ? JSON.parse(req.query.sortObj)
      : { _id: -1 };
    console.log(sortObj);
    //     if (Export == "csvv" || Export == "xlsv") {
    //       console.log("hit", "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
    //       if (req.query.fillter != "" && req.query.fillter != undefined) {
    //         if(req.query.mode === 'userhistory'){
    //           let fillterQuery = tradeHistoryFilter(req.query);
    //           type= fillterQuery
    //         } else {
    //           let fillterQuery = columnFillter(req.query, req.headers.timezone);
    //           type= fillterQuery
    //         }
    //       }
    //       let statusmatch = {};
    //       statusmatch["status"] = "completed";
    // console.log(type , '-------------------------------------');
    //       let exportData = await TradeHistory.aggregate([
    //         {
    //         $project: {
    //           firstCurrency: 1,
    //           _id: 1,
    //           secondCurrency: 1,
    //           buyorsell: 1,
    //           execPrice: 1,
    //           quantity: 1,
    //           orderValue: 1,
    //           buyerFee: 1,
    //           buyUserId:1,
    //           sellUserId:1,
    //           sellerFee: 1,
    //           createdAt: 1,
    //           isMaker: 1,
    //           isMaker: 1,
    //           buyUserCode:1,
    //           sellUserCode:1,
    //           tradeQty: 1,
    //           tradePrice: 1,
    //         },
    //       },
    //       { $match: type },
    //       { $sort: sortObj },
    //       ]);

    //       let csvData = [header];

    //       if (exportData && exportData.length > 0) {
    //         for (let item of exportData) {
    //           let arr = [];
    //           var buyerfee = convert(item && item.buyerFee)
    //           var sellerfee = convert(item && item.sellerFee)
    //           arr.push(
    //             momentFormat(item.createdAt.toString()),
    //             item._id,
    //             item.buyUserCode,
    //             item.sellUserCode,
    //             item.firstCurrency,
    //             item.secondCurrency,
    //             item.isMaker,
    //             String(item.tradePrice),
    //             String(item.tradeQty),
    //             String(item.orderValue),
    //             buyerfee,
    //             sellerfee
    //           );
    //           csvData.push(arr);
    //         }
    //       }
    //       console.log(csvData,'heyyyy');

    //       return res.csv(csvData);
    //     } 

    if (req.query.mode === "userhistory") {
      let fillterQuery = tradeHistoryFilter(req.query);
      type = fillterQuery
    } else {
      let fillterQuery = columnFillter(req.query, req.headers.timezone);
      type = fillterQuery
    }
    let data = await TradeHistory.aggregate([
      {
        $project: {
          firstCurrency: 1,
          _id: 1,
          secondCurrency: 1,
          buyorsell: 1,
          execPrice: 1,
          quantity: 1,
          orderValue: 1,
          buyerFee: 1,
          buyUserId: 1,
          sellUserId: 1,
          sellerFee: 1,
          createdAt: 1,
          buyUserCode: 1,
          sellUserCode: 1,
          isMaker: 1,
          tradeQty: 1,
          tradePrice: 1,
        },
      },
      { $match: type },
      { $sort: sortObj },
    ]);

    let result = {
      data,
    };
    return res
      .status(200)
      .json({ success: true, messages: "success", result });

  } catch (err) {
    console.log("..errrrrrrrrrrrrrrrr", err);
    return res
      .status(500)
      .json({ success: false, errors: { messages: "Error on server" } });
  }
}

export const spotTradeUserHistory = async (req, res) => {
  try {
    let pagination = paginationQuery(req.query);
    let filter = tradeHistoryFilter(req.query);
    let searcher = columnFillter(req.query, req.headers.timezone)
    delete searcher['sellUserId']
    delete searcher['buyUserId']
    filter = { ...filter, ...searcher }
    let sortObj = !isEmpty(JSON.parse(req.query.sortObj))
      ? JSON.parse(req.query.sortObj)
      : { _id: -1 };

    console.log("fileteaerarrayyyy", filter);
    let statusmatch = {};
    statusmatch["status"] = "completed";
    // if (req.query.type == "searchType") {
    //   statusmatch["createdAt"] = filter.createdAt;
    // }
    console.log(filter);
    let count = await TradeHistory.countDocuments({ ...filter, ...statusmatch })
    let data = await TradeHistory.aggregate([

      {
        $project: {
          firstCurrency: 1,
          _id: 1,
          secondCurrency: 1,
          buyorsell: 1,
          execPrice: 1,
          quantity: 1,
          orderValue: 1,
          buyerFee: 1,
          buyUserId: 1,
          sellUserId: 1,
          sellerFee: 1,
          createdAt: 1,
          buyUserCode: 1,
          sellUserCode: 1,
          isMaker: 1,
          tradeQty: 1,
          tradePrice: 1,
        },
      },
      { $match: filter },
      { $sort: sortObj },
      { $skip: pagination.skip },
      { $limit: pagination.limit },
    ]);
    let result = {
      count: count,
      data,
    };
    return res.status(200).json({ success: true, messages: "success", result });
  } catch (err) {
    console.log("..errrrrrrrrrrrrrrrr", err);
    return res
      .status(500)
      .json({ success: false, errors: { messages: "Error on server" } });
  }
};
// function conve(){
// console.log(convert(4.0000000000000003e-7),'convvv')
// }
// conve()