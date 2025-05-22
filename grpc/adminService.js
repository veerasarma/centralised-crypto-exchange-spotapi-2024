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

// adminservice
const ADMIN_PROTO_PATH = __dirname + "/admin.proto";
const adminPkgDef = protoLoader.loadSync(ADMIN_PROTO_PATH, options);
const Admin = grpc.loadPackageDefinition(adminPkgDef).Req;

// const AdminService = new Admin(config.GRPC.USER_URL, credentials);
const AdminService = new Admin(config.GRPC.USER_URL, grpc.credentials.createInsecure());


export const fetchAdmin = async (reqBody) => {
    return new Promise((resolve, reject) => {
       
        AdminService.fetchAdmin({
            id: reqBody.id
        }, (err, resp) => {
            if (err) reject(err);
            else (resolve(resp));
        });
    }).catch((err) => {
        return { 'status': false, 'error': 'Error on Connection' }
    });
}
export const saveAdminprofit = async (reqBody) => {
    return new Promise((resolve, reject) => {
     
        AdminService.saveAdminprofit({
            userId: reqBody.userId.toString(),
            ordertype:reqBody.ordertype,
            pair:reqBody.pair,
            fee:reqBody.fee,
            coin:reqBody.coin,
          }, (err, resp) => {
            if (err) {
                console.log(err,'eeeeeee')
                reject(err);
            }
            
            else (resolve(resp));
        });
    }).catch((err) => {
        return { 'status': false, 'error': 'Error on Connection' }
    });
}