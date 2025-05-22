// import package
import express from "express";
import morgan from "morgan";
import cors from "cors";
import http from "http";
import passport from "passport";
import bodyParser from "body-parser";

// import config
import config from "./config";
import dbConnection from "./config/dbConnection";
import { createSocketIO } from "./config/socketIO";
import "./config/cron";

// import routes
import adminAPI from "./routes/admin.route";
import spotAPI from "./routes/spot.route";
import dashboardAPI from "./routes/dashboard.route";
import SpotV1API from "./routes/v1.route";

const app = express();
app.use(morgan("dev"));
app.use(cors({ origin: "*" }));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// passport
app.use(passport.initialize());
require("./config/passport").usersAuth(passport);
require("./config/passport").adminAuth(passport);

app.use(express.static(__dirname + "/public"));
app.use("/api/admin", adminAPI);
app.use("/api/spot", spotAPI);
app.use("/api/dashboard", dashboardAPI);
app.use("/v1/spot", SpotV1API);

//App Use
app.use("/app/spot", spotAPI);
app.use("/app/dashboard", dashboardAPI);

app.get("/", (req, res) => {
  return res.send("Successfully Testing Thank You");
});
var ip = require("ip");
var myip = ip.address();
let server = http.createServer(app);

createSocketIO(server);

// DATABASE CONNECTION
dbConnection((done) => {
  if (done) {
    server = server.listen(config.PORT, function () {
      console.log(
        "\x1b[34m%s\x1b[0m",
        `server is running on port ${config.PORT}`
      );
      require("./grpc/server");
      setTimeout(() => {
        require("./controllers/spot.controller").fetchAllpairs();
      }, 1000);
    });
  }
});
