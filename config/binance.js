// import package
import binanceNodeAPI from 'node-binance-api';
import BinanceApiNode from 'binance-api-node'

// import lib
import config from './index';

const nodeBinanceAPI = new binanceNodeAPI().options({
    APIKEY: config.BINANCE_GATE_WAY.API_KEY,
    APISECRET: config.BINANCE_GATE_WAY.API_SECRET,
    'family': 4,

});

const binanceApiNode = BinanceApiNode({
    apiKey: config.BINANCE_GATE_WAY.API_KEY,
    apiSecret: config.BINANCE_GATE_WAY.API_SECRET,
    // httpBase: "https://testnet.binance.vision",
    // wsBase: "wss://testnet.binance.vision/ws",
})

export {
    nodeBinanceAPI,
    binanceApiNode
}