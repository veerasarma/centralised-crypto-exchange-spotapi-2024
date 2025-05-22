// import package
import mongoose from "mongoose";
// import model
import { Wallet, Currency, PriceConversion } from "../models";
import {
  hset,
  hget,
  hgetall,
  hincbyfloat,
  hdel,
} from "../controllers/redis.controller";
import { IncCntObjId } from "../lib/generalFun";
import {
  passbook,
} from "../grpc/walletService";
import { saveAdminprofit } from "../grpc/adminService";
// import grpc
import { fetchReferralUser, insertReferralRewaedHistory } from "../grpc/userService";
import { priceConversionGrpc } from "../grpc/currencyService";

import { referralUpdate } from '../config/cron'
const ObjectId = mongoose.Types.ObjectId;
import { truncateDecimals } from "../lib/roundOf";
/**
 * Sent Email
 * URL: /api/getEmailId
 * METHOD : GET
 * BODY : identifier, Subject (object)userId
 */
referralUpdate.start()
export const Referralcommission = async () => {
  try {
    // referralUpdate.stop()
    let orderList = await hgetall("referralCommisonAdd");
    if (orderList) {
      orderList = await getvalueObj(orderList);
      for (const tradeItem of orderList) {


        //Seller 
        if (tradeItem.sellUserId) {
          // console.log("orderListorderList", tradeItem);
          let fetchReferralUserDetail = await fetchReferralUser({
            _id: tradeItem.sellUserId.toString(),
          });
          // console.log("fetchReferralUserDetailfetchReferralUserDetail", fetchReferralUserDetail);
          if (fetchReferralUserDetail.status) {
            let getPriceConverSion;
            if (tradeItem.secondCurrency == fetchReferralUserDetail.currencySymbol) {
              getPriceConverSion = {
                status: true,
                convertPrice: 1
              }
            } else {
              getPriceConverSion = await priceConversionGrpc({
                baseSymbol: tradeItem.secondCurrency,
                convertSymbol: fetchReferralUserDetail.currencySymbol
              });
            }

            // console.log("getPriceConverSion", getPriceConverSion);

            if (getPriceConverSion.status) {
              let total = truncateDecimals(getPriceConverSion.convertPrice, 8) * tradeItem.sellerFee;
              let reward = truncateDecimals(total, 8) * (fetchReferralUserDetail.percentage / 100);

              //find Admin profilt value
              reward = truncateDecimals(reward, 8)
              console.log(total, reward, "bbbbbbbbbbb", getPriceConverSion.convertPrice, tradeItem.sellerFee, fetchReferralUserDetail.percentage);
              let adminProfit = tradeItem.sellerFee * ((100 - fetchReferralUserDetail.percentage) / 100);


              let balaceUpdate = await hincbyfloat(
                "walletbalance_spot",
                fetchReferralUserDetail.userId.toString() +
                "_" +
                fetchReferralUserDetail.currencyId.toString(),
                parseFloat(reward)
              );

              if (balaceUpdate) {
                passbook({
                  userId: fetchReferralUserDetail.userId,
                  coin: fetchReferralUserDetail.currencySymbol,
                  currencyId: fetchReferralUserDetail.currencyId,
                  tableId: fetchReferralUserDetail.refertalTableId,
                  beforeBalance: parseFloat(balaceUpdate) - parseFloat(reward),
                  afterBalance: parseFloat(balaceUpdate),
                  amount: parseFloat(reward),
                  type: "referral",
                  category: "credit",
                });
                const newrefcommission = await insertReferralRewaedHistory({
                  refertalTableId: fetchReferralUserDetail.refertalTableId,
                  userId: fetchReferralUserDetail.userId.toString(),
                  refer_child: tradeItem.sellUserId.toString(),
                  tradeId: tradeItem._id.toString(),
                  amount: parseFloat(reward),
                  currency: fetchReferralUserDetail.currencySymbol,
                });

                saveAdminprofit({
                  userId: tradeItem.sellUserId,
                  ordertype: tradeItem.sellOrderType,
                  pair:
                    tradeItem.firstCurrency +
                    "/" +
                    tradeItem.secondCurrency,
                  fee: adminProfit,
                  coin: tradeItem.secondCurrency,
                });
                await hdel("referralCommisonAdd", tradeItem._id);

              }
            } else {
              await hset("referralCommisonAdd", tradeItem._id, tradeItem);
            }

          } else {
            await hdel("referralCommisonAdd", tradeItem._id);

            //No referral
            saveAdminprofit({
              userId: tradeItem.sellUserId,
              ordertype: tradeItem.sellOrderType,
              pair:
                tradeItem.firstCurrency +
                "/" +
                tradeItem.secondCurrency,
              fee: tradeItem.sellerFee,
              coin: tradeItem.secondCurrency,
            });
          }

        }



        //buyer
        if (tradeItem.buyUserId) {
          // console.log("orderListorderList", tradeItem);
          let fetchReferralUserDetail = await fetchReferralUser({
            _id: tradeItem.buyUserId.toString(),
          });
          // console.log("fetchReferralUserDetailfetchReferralUserDetail", fetchReferralUserDetail);
          if (fetchReferralUserDetail.status) {


            let getPriceConverSion;
            if (tradeItem.firstCurrency == fetchReferralUserDetail.currencySymbol) {
              getPriceConverSion = {
                status: true,
                convertPrice: 1
              }
            } else {
              getPriceConverSion = await priceConversionGrpc({
                baseSymbol: tradeItem.firstCurrency,
                convertSymbol: fetchReferralUserDetail.currencySymbol
              });
            }
            // console.log("getPriceConverSiongetPriceConverSion",getPriceConverSion);
            if (getPriceConverSion.status) {
              let total = truncateDecimals(getPriceConverSion.convertPrice, 8) * tradeItem.buyerFee;
              let reward = truncateDecimals(total, 8) * (fetchReferralUserDetail.percentage / 100);

              //find Admin profilt value
              reward = truncateDecimals(reward, 8)
              console.log(total, reward, "bbbbbbbbbbb", getPriceConverSion.convertPrice, tradeItem.buyerFee, fetchReferralUserDetail.percentage);
              let adminProfit = tradeItem.buyerFee * ((100 - fetchReferralUserDetail.percentage) / 100);

              let balaceUpdate = await hincbyfloat(
                "walletbalance_spot",
                fetchReferralUserDetail.userId.toString() +
                "_" +
                fetchReferralUserDetail.currencyId.toString(),
                parseFloat(reward)
              );

              if (balaceUpdate) {
                await passbook({
                  userId: fetchReferralUserDetail.userId,
                  coin: fetchReferralUserDetail.currencySymbol,
                  currencyId: fetchReferralUserDetail.currencyId,
                  tableId: fetchReferralUserDetail.refertalTableId,
                  beforeBalance: parseFloat(balaceUpdate) - parseFloat(reward),
                  afterBalance: parseFloat(balaceUpdate),
                  amount: parseFloat(reward),
                  type: "referral",
                  category: "credit",
                });
                const newrefcommission = await insertReferralRewaedHistory({
                  refertalTableId: fetchReferralUserDetail.refertalTableId,
                  userId: fetchReferralUserDetail.userId.toString(),
                  refer_child: tradeItem.buyUserId.toString(),
                  tradeId: tradeItem._id.toString(),
                  amount: parseFloat(reward),
                  currency: fetchReferralUserDetail.currencySymbol,
                });

                await saveAdminprofit({
                  userId: tradeItem.buyUserId,
                  ordertype: tradeItem.buyOrderType,
                  pair:
                    tradeItem.firstCurrency +
                    "/" +
                    tradeItem.secondCurrency,
                  fee: adminProfit,
                  coin: tradeItem.firstCurrency,
                });
                await hdel("referralCommisonAdd", tradeItem._id);

              }
            } else {
              await hset("referralCommisonAdd", tradeItem._id, tradeItem);
            }

          } else {
            await hdel("referralCommisonAdd", tradeItem._id);

            //No referral
            await saveAdminprofit({
              userId: tradeItem.buyUserId,
              ordertype: tradeItem.buyOrderType,
              pair:
                tradeItem.firstCurrency +
                "/" +
                tradeItem.secondCurrency,
              fee: tradeItem.buyerFee,
              coin: tradeItem.firstCurrency,
            });
          }

        }
      }
    }


    referralUpdate.start()
  } catch (err) {
    referralUpdate.start()
    console.log(err, "Commission err");
  }
};


const getvalueObj = async (allvalues) => {
  var keys = Object.values(allvalues);
  let newarray = [];
  for (var i = 0; i < keys.length; i++) {
    var str = [keys[i]];
    newarray.push(JSON.parse(str));
  }
  return newarray;
};