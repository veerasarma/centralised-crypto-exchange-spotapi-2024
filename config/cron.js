// import package
import cron from 'node-cron'

// import config
import config from '../config'



/**
 * Every 5 Second
 */
export const binOrderTask = cron.schedule(
  "*/5 * * * * *",
  () => {
    require("../controllers/binance.controller").checkOrder();
  },
  {
    scheduled: false,
  }
);


export const warazix_get_allOrder = cron.schedule(
  "*/5 * * * * *",
  (date) => {
    // console.log(
    //   "-----warazix_get_allOrder warazix_get_allOrder warazix_get_allOrder"
    // );
    // require('../controllers/wazarix.controller').checkOrder()
    // require("../controllers/wazarix.controller").getAllOrder();
  },
  {
    scheduled: true,
  }
);

export const warazixApi = cron.schedule("*/10 * * * *", (date) => {
  // console.log("cronwarazixApiwarazixApiwarazixApiwarazixApi */20 * * * *");
  // require("../controllers/wazarix.controller").spotPriceTicker();
});

export const depthSocket = cron.schedule("*/10 * * * * *", (date) => {
  require("../controllers/spot.controller").depthData();
});

export const referralUpdate = cron.schedule("* * * * *", () => {
  // console.log("referralUpdatereferralUpdatereferralUpdatereferralUpdate");
  // require("../controllers/referral.controller").Referralcommission();
},
  {
    scheduled: true,
  });

cron.schedule("* * * * *", (date) => {
  require("../controllers/chart/chart.controller").redisToDB('1m');
});

cron.schedule("*/5 * * * *", (date) => {
  require("../controllers/chart/chart.controller").redisToDB('5m');
});

cron.schedule("*/15 * * * *", (date) => {
  require("../controllers/chart/chart.controller").redisToDB('15m');
});

cron.schedule("*/30 * * * *", (date) => {
  require("../controllers/chart/chart.controller").redisToDB('30m');
});

cron.schedule("0 * * * *", (date) => {
  require("../controllers/chart/chart.controller").redisToDB('1h');
});

cron.schedule("0 */4 * * *", (date) => {
  require("../controllers/chart/chart.controller").redisToDB('4h');
});

cron.schedule("0 0 * * *", (date) => {
  require("../controllers/chart/chart.controller").redisToDB('1d');
});

cron.schedule("0 0 * * 0", (date) => {
  require("../controllers/chart/chart.controller").redisToDB('1W');
});

cron.schedule("0 0 1 * *", (date) => {
  require("../controllers/chart/chart.controller").redisToDB('1M');
});



cron.schedule("30 * * * * *", () => {
  require('../controllers/tradeBot.controller').checkBot();
});
cron.schedule("* * * * *", () => {
  require('../controllers/VolumeBot.controller').checkVolumeBot();
});
cron.schedule("0 12 * * 0", () => { //every sunday 12 pm
  require('../controllers/spot.controller').clearSpotRedis();
});


