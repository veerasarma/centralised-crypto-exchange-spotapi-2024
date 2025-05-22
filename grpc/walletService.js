const grpc = require("@grpc/grpc-js");
var protoLoader = require("@grpc/proto-loader");

// import config
import config from "../config";

import credentials from "./client-cred";

// import proto
const WALLET_PROTO_PATH = __dirname + "/wallet.proto";

const options = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

const walletPkgDef = protoLoader.loadSync(WALLET_PROTO_PATH, options);
const Wallet = grpc.loadPackageDefinition(walletPkgDef).Req;
const client = new Wallet(
  config.GRPC.WALLET_URL,
  grpc.credentials.createInsecure()
);

export const getUserAsset = async (reqBody) => {
  return new Promise((resolve, reject) => {
    client.getUserAsset(
      {
        id: reqBody.id,
        currencyId: reqBody.currencyId,
      },
      (err, resp) => {
        if (err) reject(err);
        else resolve(resp);
      }
    );
  }).catch((err) => {
    return { status: false, error: "Error on Connection" };
  });
};

export const updateUserAsset = async (reqBody) => {
  return new Promise((resolve, reject) => {
    client.updateUserAsset(
      {
        id: reqBody.id,
        currencyId: reqBody.currencyId,
        spotBal: reqBody.spotBal,
      },
      (err, resp) => {
        if (err) reject(err);
        else resolve(resp);
      }
    );
  }).catch((err) => {
    return { status: false, error: "Error on Connection" };
  });
};
export const updateUserWallet = async (id) => {
  return new Promise((resolve, reject) => {
    client.updateUserWallet(
      {
        id: id,
      },
      (err, resp) => {
        if (err) reject(err);
        else resolve(resp);
      }
    );
  }).catch((err) => {
    return { status: false, error: "Error on Connection" };
  });
};
export const passbook = async (reqBody) => {
  return new Promise((resolve, reject) => {
    client.passbook(
      {
        userId: reqBody.userId,
        coin: reqBody.coin,
        currencyId: reqBody.currencyId,
        tableId: reqBody.tableId,
        beforeBalance: reqBody.beforeBalance.toString(),
        afterBalance: reqBody.afterBalance.toString(),
        amount: reqBody.amount.toString(),
        type: reqBody.type,
        category: reqBody.category,
      },
      (err, resp) => {
        if (err) reject(err);
        else resolve(resp);
      }
    );
  }).catch((err) => {
    return { status: false, error: "Error on Connection" };
  });
};
