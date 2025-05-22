// import package
import WebSocket from 'ws';
import mongoose from 'mongoose';
import axios from 'axios';
import cron from "node-cron";

// import model
import { PerpetualPair } from '../../models'

// import controller
import * as redisCtrl from '../redis.controller'

// import lib
import isEmpty from '../../lib/isEmpty'
import { subtractDate, unix } from '../../lib/moment'

const ObjectId = mongoose.Types.ObjectId;
let bybitPairs = [];



/** 
 * kline
 * pairName, expiryDate, interval, fromTimeStamp
*/
export const kline = async (reqBody) => {
    try {
        let respData = await axios({
            'method': 'get',
            'url': 'https://api.bybit.com/public/linear/kline',
            'params': {
                'symbol': reqBody.pairName,
                'interval': reqBody.interval,
                'from': parseInt(reqBody.fromTimeStamp),
            }
        })
        if (respData && respData.data && respData.data.ret_code == 0) {
            return respData.data.result
        }
        return []
    } catch (err) {
        return []
    }
}

export const getChart = async (reqBody) => {
    let record = await redisCtrl.get(`${reqBody.pairName}_${reqBody.interval}`)
    return JSON.parse(record)
}


let timeFrame = {
    '1m': {
        'start': null,
        'end': null,
        'cron': false,
        'interval': 1
    },
    '5m': {
        'start': null,
        'end': null,
        'cron': false,
        'interval': 5
    },
    '15m': {
        'start': null,
        'end': null,
        'cron': false,
        'interval': 15
    },
    '30m': {
        'start': null,
        'end': null,
        'cron': false,
        'interval': 30
    },
    '1h': {
        'start': null,
        'end': null,
        'cron': false,
        'interval': 60
    },
    '1d': {
        'start': null,
        'end': null,
        'cron': false,
        'interval': 'D'
    },
    '1M': {
        'start': null,
        'end': null,
        'cron': false,
        'interval': 'W'
    },
}


cron.schedule("* * * * *", async () => {
    if (timeFrame['1m'].cron) {
        chart1m()
    }
});

cron.schedule("*/5 * * * *", async () => {
    if (timeFrame['5m'].cron) {
        chart5m()
    }
});

cron.schedule("*/15 * * * *", async () => {
    if (timeFrame['15m'].cron) {
        chart15m()
    }
});

cron.schedule("*/30 * * * *", async () => {
    if (timeFrame['30m'].cron) {
        chart30m()
    }
});

cron.schedule("0 */1 * * *", async () => {
    if (timeFrame['1h'].cron) {
        chart1h()
    }
});

cron.schedule("0 0 */1 * *", async () => {
    if (timeFrame['1d'].cron) {
        chart1D()
    }
});

cron.schedule("0 0 */7 * *", async () => {
    if (timeFrame['1M'].cron) {
        chart1W()
    }
});

export const chart1m = async (isInitial = false, interval = '1m') => {
    try {
        for (let item of bybitPairs) {
            if (isInitial) {
                await redisCtrl.del(`${item.symbol}_${interval}`)
            }

            let curDate = new Date();
            if (!timeFrame[interval].start) {
                timeFrame[interval].start = subtractDate(200, 'minutes', 'timestamp', curDate)
                timeFrame[interval].end = unix(curDate)
            } else {
                timeFrame[interval].start = subtractDate(200, 'minutes', 'timestamp', curDate)
                // timeFrame[interval].start = timeFrame[interval].end
                timeFrame[interval].end = unix(curDate)
            }

            let record = await kline({
                pairName: item.symbol,
                interval: timeFrame[interval].interval,
                fromTimeStamp: timeFrame[interval].start,
                toTimeStamp: timeFrame[interval].end,
            })
            if (record && record.length > 0) {
                let prevRecord = await redisCtrl.get(`${item.symbol}_${interval}`)
                if (prevRecord) {
                    prevRecord = JSON.parse(prevRecord)
                    if (prevRecord.length == 1000) {
                        prevRecord.shift();
                    }
                } else {
                    prevRecord = []
                }
                await redisCtrl.set(`${item.symbol}_${interval}`, JSON.stringify([...prevRecord, ...record]))
                if (isInitial) {
                    timeFrame[interval].cron = true
                }
            }
        }
    } catch (err) {
        console.log('err: ', err);
    }
}

export const chart5m = async (isInitial = false, interval = '5m') => {
    try {
        let curDate = new Date();
        if (!timeFrame[interval].start) {
            timeFrame[interval].start = subtractDate(1000, 'minutes', 'timestamp', curDate)
            timeFrame[interval].end = unix(curDate)
        } else {
            timeFrame[interval].start = timeFrame[interval].end
            timeFrame[interval].end = unix(curDate)
        }

        for (let item of bybitPairs) {
            if (isInitial) {
                await redisCtrl.del(`${item.symbol}_${interval}`)
            }

            let record = await kline({
                pairName: item.symbol,
                interval: timeFrame[interval].interval,
                fromTimeStamp: timeFrame[interval].start,
                toTimeStamp: timeFrame[interval].end,
            })
            if (record && record.length > 0) {
                let prevRecord = await redisCtrl.get(`${item.symbol}_${interval}`)
                if (prevRecord) {
                    prevRecord = JSON.parse(prevRecord)
                    if (prevRecord.length == 1000) {
                        prevRecord.shift();
                    }
                } else {
                    prevRecord = []
                }
                await redisCtrl.set(`${item.symbol}_${interval}`, JSON.stringify([...prevRecord, ...record]))
                timeFrame[interval].cron = true
            }
        }
    } catch (err) {
    }
}

export const chart15m = async (isInitial = false, interval = '15m') => {
    try {
        let curDate = new Date();
        if (!timeFrame[interval].start) {
            timeFrame[interval].start = subtractDate(50, 'hours', 'timestamp', curDate)
            timeFrame[interval].end = unix(curDate)
        } else {
            timeFrame[interval].start = timeFrame[interval].end
            timeFrame[interval].end = unix(curDate)
        }

        for (let item of bybitPairs) {
            if (isInitial) {
                await redisCtrl.del(`${item.symbol}_${interval}`)
            }

            let record = await kline({
                pairName: item.symbol,
                interval: timeFrame[interval].interval,
                fromTimeStamp: timeFrame[interval].start,
                toTimeStamp: timeFrame[interval].end,
            })
            if (record && record.length > 0) {
                let prevRecord = await redisCtrl.get(`${item.symbol}_${interval}`)
                if (prevRecord) {
                    prevRecord = JSON.parse(prevRecord)
                    if (prevRecord.length == 1000) {
                        prevRecord.shift();
                    }
                } else {
                    prevRecord = []
                }
                await redisCtrl.set(`${item.symbol}_${interval}`, JSON.stringify([...prevRecord, ...record]))
                timeFrame[interval].cron = true
            }
        }
    } catch (err) {
    }
}

export const chart30m = async (isInitial = false, interval = '30m') => {
    try {
        let curDate = new Date();
        if (!timeFrame[interval].start) {
            timeFrame[interval].start = subtractDate(100, 'hours', 'timestamp', curDate)
            timeFrame[interval].end = unix(curDate)
        } else {
            timeFrame[interval].start = timeFrame[interval].end
            timeFrame[interval].end = unix(curDate)
        }

        for (let item of bybitPairs) {
            if (isInitial) {
                await redisCtrl.del(`${item.symbol}_${interval}`)
            }

            let record = await kline({
                pairName: item.symbol,
                interval: timeFrame[interval].interval,
                fromTimeStamp: timeFrame[interval].start,
                toTimeStamp: timeFrame[interval].end,
            })
            if (record && record.length > 0) {
                let prevRecord = await redisCtrl.get(`${item.symbol}_${interval}`)
                if (prevRecord) {
                    prevRecord = JSON.parse(prevRecord)
                    if (prevRecord.length == 1000) {
                        prevRecord.shift();
                    }
                } else {
                    prevRecord = []
                }
                await redisCtrl.set(`${item.symbol}_${interval}`, JSON.stringify([...prevRecord, ...record]))
                timeFrame[interval].cron = true
            }
        }
    } catch (err) {
    }
}

export const chart1h = async (isInitial = false, interval = '1h') => {
    try {
        let curDate = new Date();
        if (!timeFrame[interval].start) {
            timeFrame[interval].start = subtractDate(200, 'hours', 'timestamp', curDate)
            timeFrame[interval].end = unix(curDate)
        } else {
            timeFrame[interval].start = timeFrame[interval].end
            timeFrame[interval].end = unix(curDate)
        }

        for (let item of bybitPairs) {
            if (isInitial) {
                await redisCtrl.del(`${item.symbol}_${interval}`)
            }

            let record = await kline({
                pairName: item.symbol,
                interval: timeFrame[interval].interval,
                fromTimeStamp: timeFrame[interval].start,
                toTimeStamp: timeFrame[interval].end,
            })
            if (record && record.length > 0) {
                let prevRecord = await redisCtrl.get(`${item.symbol}_${interval}`)
                if (prevRecord) {
                    prevRecord = JSON.parse(prevRecord)
                    if (prevRecord.length == 1000) {
                        prevRecord.shift();
                    }
                } else {
                    prevRecord = []
                }
                await redisCtrl.set(`${item.symbol}_${interval}`, JSON.stringify([...prevRecord, ...record]))
                timeFrame[interval].cron = true
            }
        }
    } catch (err) {
    }
}

export const chart1D = async (isInitial = false, interval = '1d') => {
    try {
        let curDate = new Date();
        if (!timeFrame[interval].start) {
            timeFrame[interval].start = subtractDate(200, 'days', 'timestamp', curDate)
            timeFrame[interval].end = unix(curDate)
        } else {
            timeFrame[interval].start = timeFrame[interval].end
            timeFrame[interval].end = unix(curDate)
        }

        for (let item of bybitPairs) {
            if (isInitial) {
                await redisCtrl.del(`${item.symbol}_${interval}`)
            }

            let record = await kline({
                pairName: item.symbol,
                interval: timeFrame[interval].interval,
                fromTimeStamp: timeFrame[interval].start,
                toTimeStamp: timeFrame[interval].end,
            })
            if (record && record.length > 0) {
                let prevRecord = await redisCtrl.get(`${item.symbol}_${interval}`)
                if (prevRecord) {
                    prevRecord = JSON.parse(prevRecord)
                    if (prevRecord.length == 1000) {
                        prevRecord.shift();
                    }
                } else {
                    prevRecord = []
                }
                await redisCtrl.set(`${item.symbol}_${interval}`, JSON.stringify([...prevRecord, ...record]))
                timeFrame[interval].cron = true
            }
        }
    } catch (err) {
    }
}

export const chart1W = async (isInitial = false, interval = '1M') => {
    try {
        let curDate = new Date();
        if (!timeFrame[interval].start) {
            timeFrame[interval].start = subtractDate(200, 'weeks', 'timestamp', curDate)
            timeFrame[interval].end = unix(curDate)
        } else {
            timeFrame[interval].start = timeFrame[interval].end
            timeFrame[interval].end = unix(curDate)
        }

        for (let item of bybitPairs) {
            if (isInitial) {
                await redisCtrl.del(`${item.symbol}_${interval}`)
            }

            let record = await kline({
                pairName: item.symbol,
                interval: timeFrame[interval].interval,
                fromTimeStamp: timeFrame[interval].start,
                toTimeStamp: timeFrame[interval].end,
            })
            if (record && record.length > 0) {
                let prevRecord = await redisCtrl.get(`${item.symbol}_${interval}`)
                if (prevRecord) {
                    prevRecord = JSON.parse(prevRecord)
                    if (prevRecord.length == 1000) {
                        prevRecord.shift();
                    }
                } else {
                    prevRecord = []
                }
                await redisCtrl.set(`${item.symbol}_${interval}`, JSON.stringify([...prevRecord, ...record]))
                timeFrame[interval].cron = true
            }
        }
    } catch (err) {
    }
}

export const chart = () => {
    chart1m(true)
    chart5m(true)
    chart15m(true)
    chart30m(true)
    chart1h(true)
    chart1W(true)
    chart1D(true)
}


export const initialize = async () => {
    try {
        let pairList = await PerpetualPair.find({ 'botstatus': 'bybit', 'status': 'active' }, { 'firstCurrencySymbol': 1, 'secondCurrencySymbol': 1 }).lean()
        if (pairList && pairList.length > 0) {
            for (let item of pairList) {
                let data = {
                    _id: item._id,
                    tikerRoot: item.firstCurrencySymbol.toUpperCase() + item.secondCurrencySymbol.toUpperCase(),
                    symbol: item.firstCurrencySymbol.toUpperCase() + item.secondCurrencySymbol.toUpperCase(),
                }
                bybitPairs.push(data)
            }
            chart()
        }

    } catch (err) {
        console.log("\x1b[31m", 'Error on bybit initialize USDT_PERPETUAL')
    }
}
