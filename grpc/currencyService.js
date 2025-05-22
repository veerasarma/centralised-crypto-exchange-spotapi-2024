const grpc = require("@grpc/grpc-js");
var protoLoader = require("@grpc/proto-loader");

// import config
import config from '../config'

import credentials from './client-cred'

const PROTO_PATH = __dirname + "/currency.proto";

const options = {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
};

const pkgDef = protoLoader.loadSync(PROTO_PATH, options);
const Client = grpc.loadPackageDefinition(pkgDef).Req;

const client = new Client(config.GRPC.WALLET_URL, grpc.credentials.createInsecure());

export const currencyId = async (reqBody) => {
    return new Promise((resolve, reject) => {
        client.currencyId({
            id: reqBody.id
        }, (err, resp) => {
            if (err) reject(err);
            else (resolve(resp));
        });
    }).catch((err) => {
        return { 'status': false, 'error': 'Error on Connection' }
    });
}

export const currencySymbol = async (reqBody) => {
    return new Promise((resolve, reject) => {
        client.currencySymbol({
            currencySymbol: reqBody.currencySymbol
        }, (err, resp) => {
            if (err) reject(err);
            else (resolve(resp));
        });
    }).catch((err) => {
        return { 'status': false, 'error': 'Error on Connection' }
    });
}

export const priceConversionGrpc = async (reqBody) => {
    return new Promise((resolve, reject) => {
        client.priceConversionGrpc({
            baseSymbol: reqBody.baseSymbol,
            convertSymbol: reqBody.convertSymbol
        }, (err, resp) => {
            if (err) reject(err);
            else (resolve(resp));
        });
    }).catch((err) => {
        return { 'status': false, 'error': 'Error on Connection' }
    });
}