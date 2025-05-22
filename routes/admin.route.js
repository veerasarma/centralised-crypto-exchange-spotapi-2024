//  import packages
import express from "express";
import passport from 'passport';

// import controllers
import * as pairCtrl from "../controllers/pairManage.controller";
import * as reportCtrl from "../controllers/report.controller";
import * as dashCtrl from "../controllers/dashboard.controller";
import * as adminCtrl from "../controllers/admin.controller";
import * as tradeBotCtrl from '../controllers/tradeBot.controller'
import * as volumeBotCtrl from '../controllers/VolumeBot.controller'
// import validation
import * as pairValidate from "../validation/pair.validation";
import * as dateValid from "../validation/date.validation";
import * as tradeBotValid from "../validation/tradeBotValidation";
import * as volumeBotValid from "../validation/volumeBot.Validation";

const router = express();
const passportAuth = passport.authenticate("adminAuth", { session: false });

// Dashboard
router.route("/getNotification").get(passportAuth, dashCtrl.getNotification)
router.route("/getDashChart").get(adminCtrl.getDashChart);
// SpotTrade Pair
router.route("/spotPair")
    .get(passportAuth, pairCtrl.spotPairList)
    .post(passportAuth, pairValidate.addSpotPairValid, pairCtrl.addSpotPair)
    .put(passportAuth, pairValidate.editSpotPairValid, pairCtrl.editSpotPair);
router.route("/find-id/:id").get(passportAuth, pairCtrl.findById);
// Spot History
router.route("/spotOrderHistory").get(passportAuth, dateValid.dateValidation, reportCtrl.spotorderHistory);
router.route("/spotOrderHistory-doc").get(passportAuth, reportCtrl.spotorderHistoryDoc);
router.route("/spotTradeHistory").get(passportAuth, dateValid.dateValidation, reportCtrl.spotTradeHistory);
router.route("/spotTradeHistory-doc").get(passportAuth, reportCtrl.spotTradeHistoryDoc);
router.route("/spotTradeUserHistory").get(passportAuth, dateValid.dateValidation, reportCtrl.spotTradeUserHistory);
//bot
router.route('/newBot').post(passportAuth, tradeBotValid.newBot, tradeBotCtrl.newBot)
    .put(passportAuth, tradeBotValid.newBot, tradeBotCtrl.updateBot)
router.route('/botList').get(passportAuth, tradeBotCtrl.botList)
router.route("/bot-find-id/:id").get(passportAuth, tradeBotCtrl.findByID);
router.route("/spotPair-list").get(passportAuth, tradeBotCtrl.getPairList)
router.route("/add-bot-user").post(passportAuth, tradeBotCtrl.newBotUser)
    .get(passportAuth, tradeBotCtrl.getBotUser)
router.route('/bot-order-cancel/:botId').get(passportAuth, tradeBotCtrl.botAllOpenOrderCancel)



router.route('/newVolBot').post(passportAuth, volumeBotValid.volBotValid, volumeBotCtrl.newVolBot)
    .put(passportAuth, volumeBotValid.volBotValid, volumeBotCtrl.updateVolBot)
router.route('/volBotList').get(passportAuth, volumeBotCtrl.volBotList)
router.route("/vol-bot-find-id/:id").get(passportAuth, volumeBotCtrl.findByID);
router.route("/get-admin-fee").get(passportAuth, adminCtrl.getAdminFee);

export default router;