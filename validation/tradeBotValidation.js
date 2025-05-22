// import package
import mongoose from 'mongoose';

// import lib
import isEmpty from '../lib/isEmpty';

/** 
 * Add Trade Bot For Open Order
 * URL : /adminapi/orderBot/open
 * METHOD : POST
 * BODY : pairId, side, startPrice, endPrice, startQuantity, endQuantity, count
*/
export const newBot = (req, res, next) => {
    let errors = {}, reqBody = req.body;
    console.log(reqBody, '---reqBody VALID')
    if (isEmpty(reqBody.pairId)) {
        errors.pairId = "REQUIRED";
    } else if (!mongoose.Types.ObjectId.isValid(reqBody.pairId)) {
        errors.pairId = "Invalid pair";
    }

    if (isEmpty(reqBody.side)) {
        errors.side = "REQUIRED"
    } else if (!Array.isArray(reqBody.side)) {
        errors.side = "Type field is required";
    } else if (!(reqBody.side.some(r => ['buy', 'sell'].includes(r)))) {
        errors.side = "invalid side"
    }

    if (reqBody.side && reqBody.side.includes('buy')) {
        if (isEmpty(reqBody.buyStartPricePerc)) {
            errors.buyStartPricePerc = "Start Price percentage field is Required"
        } else if (isNaN(reqBody.buyStartPricePerc)) {
            errors.buyStartPricePerc = "Start Price percentage only numeric value"
        } else if (parseFloat(reqBody.buyStartPricePerc) <= 0) {
            errors.buyStartPricePerc = "Please enter a valid percentage"
        } else if (parseFloat(reqBody.buyStartPricePerc) >= 100) {
            errors.buyStartPricePerc = "Percentage value should be 1-99."
        }

        if (isEmpty(reqBody.buyEndPricePerc)) {
            errors.buyEndPricePerc = "End Price percentage field is Required"
        } else if (isNaN(reqBody.buyEndPricePerc)) {
            errors.buyEndPricePerc = "End Price percentage only numeric value"
        } else if (parseFloat(reqBody.buyEndPricePerc) <= 0) {
            errors.buyEndPricePerc = "Please enter a valid percentage"
        } else if (parseFloat(reqBody.buyEndPricePerc) <= parseFloat(reqBody.buyStartPricePerc)) {
            errors.buyEndPricePerc = "End price percentage should be greater than start price percentage"
        } else if (parseFloat(reqBody.buyEndPricePerc) >= 100) {
            errors.buyEndPricePerc = "Percentage value should be 1-99."
        }

        if (isEmpty(reqBody.buyPercent)) {
            errors.buyPercent = "Bot Buy(%) field is Required"
        } else if (isNaN(reqBody.buyPercent)) {
            errors.buyPercent = "Bot Buy(%) only numeric value"
        } else if (parseFloat(reqBody.buyPercent) <= 0) {
            errors.buyPercent = "Please enter a valid percentage"
        } else if (parseFloat(reqBody.buyPercent) >= 100) {
            errors.buyPercent = "Percentage value should be 1-99."
        }
    }

    if (reqBody.side && reqBody.side.includes('sell')) {
        if (isEmpty(reqBody.sellStartPricePerc)) {
            errors.sellStartPricePerc = "Start Price percentage field is Required"
        } else if (isNaN(reqBody.sellStartPricePerc)) {
            errors.sellStartPricePerc = "Start Price percentage only numeric value"
        } else if (parseFloat(reqBody.sellStartPricePerc) <= 0) {
            errors.sellStartPricePerc = "Please enter a valid percentage"
        } else if (parseFloat(reqBody.sellStartPricePerc) >= 100) {
            errors.sellStartPricePerc = "Percentage value should be 1-99."
        }

        if (isEmpty(reqBody.sellEndPricePerc)) {
            errors.sellEndPricePerc = "End Price percentage field is Required"
        } else if (isNaN(reqBody.sellEndPricePerc)) {
            errors.sellEndPricePerc = "End Price percentage only numeric value"
        } else if (parseFloat(reqBody.sellEndPricePerc) <= 0) {
            errors.sellEndPricePerc = "Please enter a valid percentage"
        }
        //  else if (parseFloat(reqBody.sellEndPricePerc) >= parseFloat(reqBody.sellStartPricePerc)) {
        //     errors.sellEndPricePerc = "End price percentage should be lesser than start price percentages"
        // } 
        else if (parseFloat(reqBody.sellEndPricePerc) >= 100) {
            errors.sellEndPricePerc = "Percentage value should be 1-99."
        }

        if (isEmpty(reqBody.sellPercent)) {
            errors.sellPercent = "Bot Sell(%) field is Required"
        } else if (isNaN(reqBody.sellPercent)) {
            errors.sellPercent = "Bot Sell(%) only numeric value"
        } else if (parseFloat(reqBody.sellPercent) <= 0) {
            errors.sellPercent = "Please enter a valid percentage"
        } else if (parseFloat(reqBody.sellPercent) >= 100) {
            errors.sellPercent = "Percentage value should be 1-99."
        }
    }

    if (isEmpty(reqBody.startQuantity)) {
        errors.startQuantity = "REQUIRED";
    } else if (isNaN(reqBody.startQuantity)) {
        errors.startQuantity = "ALLOW_NUMERIC";
    } else if (parseFloat(reqBody.startQuantity) <= 0) {
        errors.startQuantity = "ALLOW_POSITIVE_NUMERIC";
    }
    if (isEmpty(reqBody.endQuantity)) {
        errors.endQuantity = "REQUIRED";
    } else if (isNaN(reqBody.endQuantity)) {
        errors.endQuantity = "ALLOW_NUMERIC";
    } else if (parseFloat(reqBody.endQuantity) <= 0) {
        errors.endQuantity = "ALLOW_POSITIVE_NUMERIC";
    } else if (parseFloat(reqBody.endQuantity) < parseFloat(reqBody.startQuantity)) {
        errors.endQuantity = "End quantity should be higher than start quantity";
    }

    if (isEmpty(reqBody.count)) {
        errors.count = "REQUIRED";
    } else if (isNaN(reqBody.count)) {
        errors.count = "ALLOW_NUMERIC";
    } else if (parseFloat(reqBody.count) <= 0) {
        errors.count = "ALLOW_POSITIVE_NUMERIC";
    }

    if (!isEmpty(errors)) {
        return res.status(400).json({ "errors": errors })
    }

    return next();
}