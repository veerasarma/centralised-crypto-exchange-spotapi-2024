import fs from 'fs'
const grpc = require("@grpc/grpc-js");

const credentials = grpc.credentials.createSsl(
    fs.readFileSync('./private/client-certs/ca.crt'),
    fs.readFileSync('./private/client-certs/client.key'),
    fs.readFileSync('./private/client-certs/client.crt')
);

export default credentials