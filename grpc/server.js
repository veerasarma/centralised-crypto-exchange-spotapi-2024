const grpc = require("@grpc/grpc-js");
var protoLoader = require("@grpc/proto-loader");
import fs from 'fs'

// import config
import config from '../config'

// import controller
import { getAllMarkPrice } from '../controllers/pairManage.controller'
// import { getCurrencyId } from '../controllers/currency.controller'
import { cancelOrderForDeactiveAcc } from "../controllers/spot.controller";
// const PROTO_PATH = __dirname + "/news.proto";
const P2P_PROTO_PATH = __dirname + "/p2p.proto";
const SPOT_PROTO_PATH = __dirname + "/spot.proto";

// Enable gRPC server logging
grpc.setLogger(console);
grpc.setLogVerbosity(grpc.logVerbosity.INFO); // Set log level


const server = new grpc.Server();
const options = {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
};


const spotPkgRef = protoLoader.loadSync(SPOT_PROTO_PATH, options);
const spotProto = grpc.loadPackageDefinition(spotPkgRef);

server.addService(spotProto.Req.service, {
    cancelOrderForDeactiveAcc: async (_, callback) => {
        let data = await cancelOrderForDeactiveAcc(_.request);
        callback(null, { status: true });
    },
});

// var packageDefinition = protoLoader.loadSync(PROTO_PATH, options);
// const newsProto = grpc.loadPackageDefinition(packageDefinition);

// Wallet Service
const p2pPkgDef = protoLoader.loadSync(P2P_PROTO_PATH, options);
const p2pProto = grpc.loadPackageDefinition(p2pPkgDef);

server.addService(p2pProto.Req.service, {
    fetchSpotPrice: async (_, callback) => {
        let data = await getAllMarkPrice(_.request)
        callback(null, data);
    },

})

// Currency Service
// const CURRENCY_PROTO_PATH = __dirname + "/currency.proto";
// const curPkgDef = protoLoader.loadSync(CURRENCY_PROTO_PATH, options);
// const curProto = grpc.loadPackageDefinition(curPkgDef);
// server.addService(curProto.Req.service, {
//     currencyId: async (_, callback) => {
//         let data = await getCurrencyId(_.request)
//         callback(null, data);
//     },
// })

// const news = [
//     { id: "1", title: "Note 1", body: "Content 1", postImage: "Post image 1" },
//     { id: "2", title: "Note 2", body: "Content 2", postImage: "Post image 2" },
// ];


// server.addService(newsProto.NewsService.service, {
//     getAllNews: (_, callback) => {
//         console.log("-----news", news)
//         callback(null, { news });
//     },
//     getNews: (_, callback) => {
//         const newsId = _.request.id;
//         const newsItem = news.find(({ id }) => newsId == id);
//         callback(null, newsItem);
//     },
//     deleteNews: (_, callback) => {
//         const newsId = _.request.id;
//         news = news.filter(({ id }) => id !== newsId);
//         callback(null, {});
//     },
//     editNews: (_, callback) => {
//         const newsId = _.request.id;
//         const newsItem = news.find(({ id }) => newsId == id);
//         newsItem.body = _.request.body;
//         newsItem.postImage = _.request.postImage;
//         newsItem.title = _.request.title;
//         callback(null, newsItem);
//     },
//     addNews: (call, callback) => {
//         let _news = { id: Date.now(), ...call.request };
//         news.push(_news);
//         callback(null, _news);
//     },
// });


let credentials = grpc.ServerCredentials.createSsl(
    fs.readFileSync('./private/server-certs/ca.crt'), [{
        cert_chain: fs.readFileSync('./private/server-certs/server.crt'),
        private_key: fs.readFileSync('./private/server-certs/server.key')
    }], true);

server.bindAsync(config.GRPC.URL,
    grpc.ServerCredentials.createInsecure(),
    (error, port) => {
        console.log("Server at port:", port);
        server.start();
    }
);
