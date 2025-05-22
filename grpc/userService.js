const grpc = require("@grpc/grpc-js");
var protoLoader = require("@grpc/proto-loader");

// import config
import config from '../config'

import credentials from './client-cred';

const options = {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
};

// userservice
const USER_PATH = __dirname + "/user.proto";
const userPkgDef = protoLoader.loadSync(USER_PATH, options);
const User = grpc.loadPackageDefinition(userPkgDef).Req;

const UserService = new User(config.GRPC.USER_URL, grpc.credentials.createInsecure());

export const fetchUser = async (reqBody) => {
    return new Promise((resolve, reject) => {
        UserService.fetchUser({
            id: reqBody.id
        }, (err, resp) => {
            if (err) {
                console.log(err, 'err')
                reject(err);
            }
            else (resolve(resp));
        });
    }).catch((err) => {
        return { 'status': false, 'error': 'Error on Connection' }
    });
}
export const fetchBotUser = async (reqBody) => {
    return new Promise((resolve, reject) => {
        UserService.fetchBotUser({
            id: reqBody.id
        }, (err, resp) => {
            if (err) {
                console.log(err, 'err')
                reject(err);
            }
            else (resolve(resp));
        });
    }).catch((err) => {
        return { 'status': false, 'error': 'Error on Connection' }
    });
}

//refferal
export const fetchReferralUser = async (reqBody) => {

    return new Promise((resolve, reject) => {
        UserService.fetchReferralUser({
            _id: reqBody._id
        }, (err, resp) => {

            if (err) {
                console.log(err, 'fetchReferralUsererr')
                reject(err);
            }
            else (resolve(resp));
        });
    }).catch((err) => {
        console.log(err, 'errerrerrerr')
        return { 'status': false, 'error': 'Error on Connection' }
    });
}

export const updateReferralAmount = async (reqBody) => {
    return new Promise((resolve, reject) => {

        UserService.updateReferralAmount({
            _id: reqBody._id,
            ust_value: reqBody.ust_value,
            amount: reqBody.amount,
            currency: reqBody.currency,
            rewardCurrency: reqBody.rewardCurrency
        }, (err, resp) => {
            if (err) {
                console.log(err, 'err')
                reject(err);
            }
            else (resolve(resp));
        });
    }).catch((err) => {
        console.log(err)
        return { 'status': false, 'error': 'Error on Connection' }
    });
}

export const insertReferralRewaedHistory = async (reqBody) => {
    return new Promise((resolve, reject) => {

        UserService.insertReferralRewaedHistory({
            refertalTableId: reqBody.refertalTableId,
            userId: reqBody.userId,
            refer_child: reqBody.refer_child,
            tradeId: reqBody.tradeId,
            rewardCurrency: reqBody.currency,
            amount: reqBody.amount,
        }, (err, resp) => {
            if (err) {
                console.log(err, 'err')
                reject(err);
            }
            else (resolve(resp));
        });
    }).catch((err) => {
        console.log(err)
        return { 'status': false, 'error': 'Error on Connection' }
    });
}

export const botUser = async (reqBody) => {

    return new Promise((resolve, reject) => {

        UserService.botUser({
            firstName: reqBody.firstName,
            lastName: reqBody.lastName,
            email: reqBody.email,
            type: reqBody.type,
        }, (err, resp) => {
            if (err) {
                console.log(err, 'err')
                reject(err);
            }
            else (resolve(resp));
        });
    }).catch((err) => {
        console.log(err)
        return { 'status': false, 'error': 'Error on Connection' }
    });
}
