//import npm package
const JwtStrategy = require("passport-jwt").Strategy,
  ExtractJwt = require("passport-jwt").ExtractJwt;

//import function
import config from "./index";

var opts = {};
opts.jwtFromRequest = ExtractJwt.fromAuthHeaderAsBearerToken();
opts.secretOrKey = config.secretOrKey;

// import lib
import isEmpty from "../lib/isEmpty";

// import grpc
import { fetchAdmin } from "../grpc/adminService";

// import controller
import { hget } from "../controllers/redis.controller";

export const usersAuth = (passport) => {
  console.log(passport, "-------------22");
  passport.use(
    "usersAuth",
    new JwtStrategy(opts, async function (payload, done) {
      console.log(payload, "-----24");
      if (payload.role == "user" || payload.role == "app-user") {
        let userDoc = await hget("userToken", payload._id);
        userDoc = JSON.parse(userDoc);
        console.log(userDoc, "------29");
        if (isEmpty(userDoc) || userDoc.userLocked != "false") {
          return done(null, false);
        } else if (userDoc.tokenId != payload.tokenId) {
          return done(null, false);
        }
        let data = {
          id: payload._id,
          userCode: userDoc.userCode,
          type: userDoc.type,
          email: userDoc.email,
          secret2FA: userDoc.secret2FA,
        };
        return done(null, data);
      }
      return done(null, false);
    })
  );
};

export const adminAuth = (passport) => {
  passport.use(
    "adminAuth",
    new JwtStrategy(opts, async function (jwt_payload, done) {
      const data = await fetchAdmin({ id: jwt_payload._id });
      if (!data.isAuth) {
        return done(null, false);
      }
      return done(null, data);
    })
  );
};
