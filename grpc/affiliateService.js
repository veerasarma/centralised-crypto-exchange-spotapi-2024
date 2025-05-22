const grpc = require("@grpc/grpc-js");
var protoLoader = require("@grpc/proto-loader");

// import config
import config from "../config";

import credentials from "./client-cred";

// import proto
const AFFILIATE_PROTO_PATH = __dirname + "/affiliate.proto";

const options = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

const affiliatePkgDef = protoLoader.loadSync(AFFILIATE_PROTO_PATH, options);
const Affiliate = grpc.loadPackageDefinition(affiliatePkgDef).Req;
const client = new Affiliate(
  config.GRPC.AFFILIATE_URL,
  grpc.credentials.createInsecure()
);

export const getParentData = async (userId) => {
  return new Promise((resolve, reject) => {
    client.getParentData(
      {
        userId: userId
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

export const createStakerHistory = async (data, rewardPrice, historyType, childId, curName, contributor, rewardCoinId) => {
  return new Promise((resolve, reject) => {
    client.createStakerHistoryGRPC(
      {
        data,
        rewardPrice,
        historyType,
        childId,
        curName,
        contributor,
        rewardCoinId
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
