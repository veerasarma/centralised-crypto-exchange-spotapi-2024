//  import packages
import express from "express";
import rateLimit from "express-rate-limit";
// import controllers
import * as SpotV1Ctrl from "../controllers/v1.controller";
const limiter = rateLimit({
    windowMs: 1000, // 1 second
    max: 3, // maximum 3 requests per second
    message: "Too many requests from this IP, please try again later.",
});
const router = express();

router.route("/summary").get(limiter, SpotV1Ctrl.getPairList);
router.route("/ticker").get(limiter, SpotV1Ctrl.getTickerList);
router.route("/orderbook").get(limiter, SpotV1Ctrl.getOrderBook);
router.route("/recentTrade").get(limiter, SpotV1Ctrl.getrecentTrade);

export default router;
