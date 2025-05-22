// import package
import mongoose from "mongoose";

const Schema = mongoose.Schema;
const ObjectId = Schema.ObjectId;

const OrderHistorySchema = new Schema({
  orderId: {
    type: ObjectId,
    // ref: 'spotpairs',
  },
  orderCode: {
    type: String,
    default: "",
  },
  pairId: {
    type: ObjectId,
    ref: "spotpairs",
  },
  userId: {
    type: ObjectId,
    ref: "users",
  },
  userCode: {
    type: String,
    default: "",
  },
  firstCurrencyId: {
    type: ObjectId,
    ref: "currency",
  },
  firstCurrency: {
    type: String,
    default: "",
  },
  firstFloatDigit: {
    type: Number,
    default: "",
  },
  secondCurrencyId: {
    type: ObjectId,
    ref: "currency",
  },
  secondCurrency: {
    type: String,
    default: "",
  },
  secondFloatDigit: {
    type: Number,
    default: "",
  },
  quantity: {
    ofMixed: Number,
    defalut: "",
  },
  price: {
    type: Schema.Types.Mixed,
    defalut: 0,
  },
  orderValue: {
    type: Number,
    defalut: 0,
  },
  openOrderValue: {
    type: Number,
    defalut: 0,
  },
  wazarixOrderPrice: {
    type: Number,
    defalut: 0,
  },
  wazarixOrderQuantity: {
    type: Number,
    defalut: 0,
  },
  pairName: {
    type: String,
    default: "",
  },
  orderType: {
    type: String,
    default: "",
  },
  buyorsell: {
    type: String,
    default: "",
  },
  openQuantity: {
    type: Number,
    default: 0,
  },
  averagePrice: {
    type: Number,
    default: 0,
  },
  filledQuantity: {
    type: Number,
    default: 0,
  },
  flag: {
    type: Boolean,
    required: true,
  },
  makerFee: {
    type: Number,
    default: 0,
  },
  takerFee: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    defalut: "open",
    enum: ["open", "pending", "completed", "cancel"],
  },
  updatedAt: {
    type: Date,
  },
  orderDate: {
    type: Date,
  },
  liquidityId: {
    type: String,
    default: "",
  },
  liquidityType: {
    type: String,
    enum: ["local", "binance", "admin"],
    default: "local",
  },
  isLiquidity: {
    type: Boolean,
    default: false,
  },
  isLiquidityError: {
    type: Boolean,
    default: false,
  },
  isMaker: {
    type: Boolean,
    default: false,
  },
});

const OrderHistory = mongoose.model(
  "orderHistory",
  OrderHistorySchema,
  "orderHistory"
);

export default OrderHistory;
