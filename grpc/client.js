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

// Enable gRPC server logging
grpc.setLogger(console);
grpc.setLogVerbosity(grpc.logVerbosity.INFO); // Set log level

// Site setting
const SITE_SET_PROTO_PATH = __dirname + "/siteSetting.proto";
const sitePkgDef = protoLoader.loadSync(SITE_SET_PROTO_PATH, options);
const SiteSetting = grpc.loadPackageDefinition(sitePkgDef).Req;
// const SiteService = new SiteSetting(config.GRPC.SITE_INFO_URL, grpc.credentials.createInsecure());   
const SiteService = new SiteSetting(config.GRPC.SITE_INFO_URL, credentials);

export const getSiteSet = async (reqBody) => {
    return new Promise((resolve, reject) => {
        SiteService.siteSetting({}, (err, resp) => {
            if (err) reject(err);
            else (resolve(resp));
        });
    }).catch((err) => {
        console.log(err, 'err')
        return { 'status': false, 'error': 'Error on Connection' }
    });
}