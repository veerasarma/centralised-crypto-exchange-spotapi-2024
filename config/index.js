import "dotenv/config";
let key = {};
let envKey = {
  PORT: process.env.PORT,
  REDIS_URL: process.env.REDIS_URL,
  REDIS_PREFIX:process.env.REDIS_PREFIX,
  SITE_NAME: process.env.SITE_NAME,
  GRPC: {
    URL: process.env.GRPC_URL,
    USER_URL: process.env.GRPC_USER_URL,
    WALLET_URL: process.env.GRPC_WALLET_URL,
    SPOT_URL: process.env.GRPC_SPOT_URL,
    P2P_URL: process.env.GRPC_P2P_URL,
    DERIVATIVE_URL: process.env.GRPC_DERIVATIVE_URL,
    INV_DERIVATIVE_URL: process.env.GRPC_INV_DERIVATIVE_URL,
    AFFILIATE_URL: process.env.GRPC_AFFILIATE_URL,
  },
  DATABASE_URI: process.env.DATABASE_URI,
  SERVER_URL: process.env.BASE_URL,
  FRONT_URL: process.env.FRONT_URL,
  ADMIN_URL: process.env.ADMIN_URL,
  IMAGE_URL: process.env.BASE_URL,
  RECAPTCHA_SECRET_KEY: process.env.RECAPTCHA_SECRET_KEY,
  WALLET_URL: process.env.WALLET_URL,
  smsGateway: {
    TYPE: process.env.SMS_TYPE,
    TELNYX: {
      PHONE_NUMBER: process.env.TELNYX_PHONE_NUMBER,
      API_KEY: process.env.TELNYX_API_KEY,
    },
    TWILIO_ACCOUT_SID: process.env.TWILIO_ACCOUT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
    TWILIO_SERVICE_SID: process.env.TWILIO_SERVICE_SID,
  },
  BINANCE_GATE_WAY: {
    API_KEY: process.env.BINANCE_API_KEY,
    API_SECRET: process.env.BINANCE_SECRET_KEY,
    // API_URL: "https://testnet.binance.vision",
  },
  WAZIRIX: {
    API_URL: "https://api.wazirx.com",
    API: process.env.WAZIRIX_API_KEY, //using for orderplace
    SECRET: process.env.WAZIRIX_SECRET_KEY, //using for orderplace
  },
};

if (process.env.NODE_ENV === "production") {
  console.log("\x1b[35m%s\x1b[0m", `Set ${process.env.NODE_ENV} Config`);

  // const API_URL = "https://millioneroapi.wealwin.com";
  key = {
    SITE_NAME: "Millionero",
    secretOrKey: "vOVH6sdmpNWjRRIqCc7rdxs01lwHzfr3",
    cryptoSecretKey: "1234567812345678",
    RUN_CRON: true,

    IMAGE: {
      DEFAULT_SIZE: 1 * 1024 * 1024, // 1 MB,
      URL_PATH: "/images/profile/",
      PROFILE_SIZE: 1 * 1024 * 1024, // 1 MB
      PROFILE_PATH: "public/profile",
      PROFILE_URL_PATH: "/profile/",

      ID_DOC_SIZE: 12 * 1024 * 1024, // 12 MB,
      KYC_PATH: "public/kyc",
      KYC_URL_PATH: "/kyc/",

      CURRENCY_SIZE: 0.02 * 1024 * 1024, // 20 KB
      CURRENCY_PATH: "public/currency/",
      CURRENCY_URL_PATH: "/currency/",
      DEPOSIT_PATH: "public/deposit",
      DEPOSIT_URL_PATH: "/deposit/",
      SETTINGS_URL_PATH: "public/settings",
      LAUNCHPAD_SIZE: 20 * 1024 * 1024, // 500 KB
      LAUNCHPAD_PATH: "public/launchpad",
      LAUNCHPAD_URL_PATH: "/launchpad/",
      SUPPORT_PATH: "public/support",
      SUPPORT_URL_PATH: "/support/",

      P2P_SIZE: 2 * 1024 * 1024, // 2 MB
      P2P_PATH: "public/p2p",
      P2P_URL_PATH: "/p2p/",
    },

    NODE_TWOFA: {
      NAME: "Rijex",
      QR_IMAGE:
        "https://chart.googleapis.com/chart?chs=166x166&chld=L|0&cht=qr&chl=",
    },
    COIN_GATE_WAY: {
      BTC: {
        URL: "",
      },
      LTC: {
        URL: "",
      },
      DOGE: {
        URL: "",
      },
      ETH: {
        URL: "",
      },
    },

    coinGateway: {
      eth: {
        url: "",
        startBlock: 11504800,
        address: "",
        privateKey: "",
        etherscanUrl: "https://api.etherscan.io/api?", // https://api-ropsten.etherscan.io/api?
        ethDepositUrl:
          "https://api-ropsten.etherscan.io/api?module=account&action=txlist&address=##USER_ADDRESS##&startblock=##START_BLOCK##&endblock=##END_BLOCK##&sort=asc&apikey=CSM5YXQG5MTE8XWM57UWH6DBXQRS8SQP3K",
        ethTokenDepositUrl:
          "https://api-ropsten.etherscan.io/api?module=account&action=tokentx&address=##USER_ADDRESS##&startblock=##START_BLOCK##&endblock=##END_BLOCK##&sort=asc&apikey=CSM5YXQG5MTE8XWM57UWH6DBXQRS8SQP3K",
      },
      btc: {
        url: "",
      },
    },

    coinpaymentGateway: {
      PUBLIC_KEY: "",
      PRIVATE_KEY: "",
      IPN_SECRET: "testing",
      MERCHANT_ID: "",
    },
    CLOUDINARY_GATE_WAY: {
      CLOUD_NAME: "",
      API_KEY: "",
      API_SECRET: "",
    },
    COINMARKETCAP: {
      API_KEY: "",
      PRICE_CONVERSION: "",
    },
    MAILGUN_GATE_WAY: {
      API_KEY: "",
      DOMAIN: "",
      URL: "",
    },
  };
} else if (process.env.NODE_ENV === "development") {
  console.log("\x1b[35m%s\x1b[0m", `Set ${process.env.NODE_ENV} Config`);

  const API_URL = "";
  key = {
    SITE_NAME: "Millionero",
    secretOrKey: "vOVH6sdmpNWjRRIqCc7rdxs01lwHzfr3",
    cryptoSecretKey: "1234567812345678",
    RUN_CRON: true,

    IMAGE: {
      DEFAULT_SIZE: 1 * 1024 * 1024, // 1 MB,
      URL_PATH: "/images/profile/",
      PROFILE_SIZE: 1 * 1024 * 1024, // 1 MB
      PROFILE_PATH: "public/profile",
      PROFILE_URL_PATH: "/profile/",

      ID_DOC_SIZE: 12 * 1024 * 1024, // 12 MB,
      KYC_PATH: "public/kyc",
      KYC_URL_PATH: "/kyc/",

      CURRENCY_SIZE: 0.02 * 1024 * 1024, // 20 KB
      CURRENCY_PATH: "public/currency/",
      CURRENCY_URL_PATH: "/currency/",
      DEPOSIT_PATH: "public/deposit",
      DEPOSIT_URL_PATH: "/deposit/",
      SETTINGS_URL_PATH: "public/settings",
      LAUNCHPAD_SIZE: 20 * 1024 * 1024, // 500 KB
      LAUNCHPAD_PATH: "public/launchpad",
      LAUNCHPAD_URL_PATH: "/launchpad/",
      SUPPORT_PATH: "public/support",
      SUPPORT_URL_PATH: "/support/",

      P2P_SIZE: 2 * 1024 * 1024, // 2 MB
      P2P_PATH: "public/p2p",
      P2P_URL_PATH: "/p2p/",
    },
    NODE_TWOFA: {
      NAME: "Rijex",
      QR_IMAGE:
        "https://chart.googleapis.com/chart?chs=166x166&chld=L|0&cht=qr&chl=",
    },
    COIN_GATE_WAY: {
      BTC: {
        URL: "",
      },
      LTC: {
        URL: "",
      },
      DOGE: {
        URL: "",
      },
      ETH: {
        URL: "",
      },
    },

    coinGateway: {
      eth: {
        url: "",
        startBlock: 11504800,
        address: "",
        privateKey: "",
        etherscanUrl: "", // https://api-ropsten.etherscan.io/api?
        ethDepositUrl:
          "https://api-ropsten.etherscan.io/api?module=account&action=txlist&address=##USER_ADDRESS##&startblock=##START_BLOCK##&endblock=##END_BLOCK##&sort=asc&apikey=CSM5YXQG5MTE8XWM57UWH6DBXQRS8SQP3K",
        ethTokenDepositUrl:
          "https://api-ropsten.etherscan.io/api?module=account&action=tokentx&address=##USER_ADDRESS##&startblock=##START_BLOCK##&endblock=##END_BLOCK##&sort=asc&apikey=CSM5YXQG5MTE8XWM57UWH6DBXQRS8SQP3K",
      },
      btc: {
        url: "http://3.1.6.100:3003",
      },
    },

    coinpaymentGateway: {
      PUBLIC_KEY: "",
      PRIVATE_KEY: "",
      IPN_SECRET: "testing",
      MERCHANT_ID: "",
    },
    CLOUDINARY_GATE_WAY: {
      CLOUD_NAME: "",
      API_KEY: "",
      API_SECRET: "",
    },
    COINMARKETCAP: {
      API_KEY: "",
      PRICE_CONVERSION: "",
    },
    MAILGUN_GATE_WAY: {
      API_KEY: "",
      DOMAIN: "",
      URL: "https://api.eu.mailgun.net",
    },
  };
} else {
  console.log("\x1b[35m%s\x1b[0m", `Set Development Config`);
  const API_URL = "http://localhost";
  key = {
    SITE_NAME: "Rijex",
    secretOrKey: "vOVH6sdmpNWjRRIqCc7rdxs01lwHzfr3",
    cryptoSecretKey: "1234567812345678",
    RUN_CRON: "true",

    //EnailGateWay
    // emailGateway: {
    //     SENDGRID_API_KEY: 'G2_6DHfmSaWcrRQ1RxTHrQ',
    //     fromMail: "support@alwin.com",
    //     nodemailer: {
    //         host: "smtp.gmail.com",
    //         port: 587,
    //         secure: false, // true for 465, false for other ports
    //         auth: {
    //             user: 'ajith@britisheducationonline.org', // generated ethereal user
    //             pass: 'Ajith@97', // generated ethereal password
    //         },
    //     }
    // },

    IMAGE: {
      DEFAULT_SIZE: 1 * 1024 * 1024, // 1 MB,
      URL_PATH: "/images/profile/",
      PROFILE_SIZE: 1 * 1024 * 1024, // 1 MB
      PROFILE_PATH: "public/profile",
      PROFILE_URL_PATH: "/profile/",

      ID_DOC_SIZE: 5 * 1024 * 1024, // 12 MB,
      KYC_PATH: "public/kyc",
      KYC_URL_PATH: "/kyc/",

      CURRENCY_SIZE: 0.02 * 1024 * 1024, // 20 KB
      CURRENCY_PATH: "public/currency/",
      CURRENCY_URL_PATH: "/currency/",
      DEPOSIT_PATH: "public/deposit",
      DEPOSIT_URL_PATH: "/deposit/",
      SETTINGS_URL_PATH: "public/settings",
      LAUNCHPAD_SIZE: 20 * 1024 * 1024, // 500 KB
      LAUNCHPAD_PATH: "public/launchpad",
      LAUNCHPAD_URL_PATH: "/launchpad/",
      SUPPORT_PATH: "public/support",
      SUPPORT_URL_PATH: "/support/",

      P2P_SIZE: 2 * 1024 * 1024, // 2 MB
      P2P_PATH: "public/p2p",
      P2P_URL_PATH: "/p2p/",
    },

    NODE_TWOFA: {
      NAME: "Rijex",
      QR_IMAGE:
        "https://chart.googleapis.com/chart?chs=166x166&chld=L|0&cht=qr&chl=",
    },

    COIN_GATE_WAY: {
      BTC: {
        URL: "",
      },
      LTC: {
        URL: "",
      },
      DOGE: {
        URL: "",
      },
      ETH: {
        URL: "",
      },
    },

    coinGateway: {
      eth: {
        url: "",
        startBlock: 11504800,
        address: "",
        privateKey: "",
        etherscanUrl: "https://api.etherscan.io/api?", // https://api-ropsten.etherscan.io/api?
        ethDepositUrl:
          "https://api-ropsten.etherscan.io/api?module=account&action=txlist&address=##USER_ADDRESS##&startblock=##START_BLOCK##&endblock=##END_BLOCK##&sort=asc&apikey=CSM5YXQG5MTE8XWM57UWH6DBXQRS8SQP3K",
        ethTokenDepositUrl:
          "https://api-ropsten.etherscan.io/api?module=account&action=tokentx&address=##USER_ADDRESS##&startblock=##START_BLOCK##&endblock=##END_BLOCK##&sort=asc&apikey=CSM5YXQG5MTE8XWM57UWH6DBXQRS8SQP3K",
      },
      btc: {
        url: "",
      },
    },

    coinpaymentGateway: {
      PUBLIC_KEY: "",
      PRIVATE_KEY: "",
      IPN_SECRET: "testing",
      MERCHANT_ID: "",
    },
    CLOUDINARY_GATE_WAY: {
      CLOUD_NAME: "",
      API_KEY: "",
      API_SECRET: "",
    },
    COINMARKETCAP: {
      API_KEY: "",
      PRICE_CONVERSION: "",
    },
    MAILGUN_GATE_WAY: {
      API_KEY: "",
      DOMAIN: "",
      URL: "https://api.eu.mailgun.net",
    },
  };
}

export default {
  ...envKey,
  ...key,
};
