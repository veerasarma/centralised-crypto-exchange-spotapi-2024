// import package
import mongoose from "mongoose";

const Schema = mongoose.Schema;
const ObjectId = Schema.ObjectId;

const recentSchema = new Schema({
	
	createdAt: {
		type: Date,
		default: Date.now
	},
	Type: {
		type: String,
		default: "buy",
	},
	tradePrice: {
		type: Number,
		default: 0
	},
    tradeQty: {
		type: Number,
		default: 0
	}
});

const WazarixRecentTradeSchema = new Schema({
  pairId: {
    type: ObjectId,
    ref: "spotpairs",
  },
  pair:{
    type: String,
    default:""
  },
  Trade: [recentSchema]
})

const WazarixRecentTrade = mongoose.model(
  "WazarixRecentTrade",
  WazarixRecentTradeSchema,
  "WazarixRecentTrade"
);

export default WazarixRecentTrade;
