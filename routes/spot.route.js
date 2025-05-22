//  import packages
import express from "express";
import passport from 'passport';

// import controllers
import * as spotTradeCtrl from "../controllers/spot.controller";
import * as chartCtrl from "../controllers/chart/chart.controller";

// import validation
import * as spotTradeValid from "../validation/spotTrade.validation";

const router = express();
const passportAuth = passport.authenticate("usersAuth", { session: false });

//spot trade
router.route("/tradePair").get(spotTradeCtrl.getPairList);
router.route("/orderPlace").post(passportAuth, spotTradeValid.decryptValidate, spotTradeCtrl.decryptTradeOrder, spotTradeValid.orderPlaceValidate, spotTradeCtrl.orderPlace);
router.route("/ordeBook/:pairId").get(spotTradeCtrl.getOrderBook);
router.route("/openOrder/:pairId").get(passportAuth, spotTradeCtrl.getOpenOrder);
router.route("/filledOrder/:pairId").get(passportAuth, spotTradeCtrl.getFilledOrder);
router.route("/orderHistory/:pairId").get(passportAuth, spotTradeCtrl.getOrderHistory);
router.route("/tradeHistory/:pairId").get(passportAuth, spotTradeCtrl.getTradeHistory);
router.route("/marketPrice/:pairId").get(spotTradeCtrl.getMarketPrice);
router.route("/recentTrade/:pairId").get(spotTradeCtrl.getRecentTrade);
router.route("/cancelOrder").post(passportAuth, spotTradeCtrl.cancelOrder);
router.route("/depth-chart").post(spotTradeCtrl.getDepthData);

// router.route("/app-chart").get(chartCtrl.appChart);

// order History
router.route("/getMySpotHistory").get(passportAuth, spotTradeCtrl.getMySpotHistory);
router.route("/getFilledOrderHistory").get(passportAuth, spotTradeCtrl.getFilledOrderHistory);

// chart
router.route("/chart/:config").get(chartCtrl.getChartData);
router.route("/chartUpdateToDB").post(chartCtrl.AllPairUpdate);
router.route("/chartUpdateToRedis").post(chartCtrl.AllPairDbToRedis);
router.route("/get-trends").get(spotTradeCtrl.getTrends);
export default router;
