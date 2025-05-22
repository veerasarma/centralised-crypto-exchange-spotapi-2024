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
export const volBotValid = (req, res, next) => {
    let errors = {}, reqBody = req.body;
    if (isEmpty(reqBody.pairId)) {
        errors.pairId = "REQUIRED";
    } else if (!mongoose.Types.ObjectId.isValid(reqBody.pairId)) {
        errors.pairId = "Invalid pair";
    }
    // if (isEmpty(reqBody.startQuantity)) {
    //     errors.startQuantity = "REQUIRED";
    // } else if (isNaN(reqBody.startQuantity)) {
    //     errors.startQuantity = "ALLOW_NUMERIC";
    // } else if (parseFloat(reqBody.startQuantity) <= 0) {
    //     errors.startQuantity = "ALLOW_POSITIVE_NUMERIC";
    // }
    // if (isEmpty(reqBody.endQuantity)) {
    //     errors.endQuantity = "REQUIRED";
    // } else if (isNaN(reqBody.endQuantity)) {
    //     errors.endQuantity = "ALLOW_NUMERIC";
    // } else if (parseFloat(reqBody.endQuantity) <= 0) {
    //     errors.endQuantity = "ALLOW_POSITIVE_NUMERIC";
    // } else if (parseFloat(reqBody.endQuantity) < parseFloat(reqBody.startQuantity)) {
    //     errors.endQuantity = "End quantity should be higher than start quantity";
    // }
    // if (isEmpty(reqBody.startPricePerc)) {
    //     errors.startPricePerc = "REQUIRED";
    // } else if (isNaN(reqBody.startPricePerc)) {
    //     errors.startPricePerc = "ALLOW_NUMERIC";
    // } else if (parseFloat(reqBody.startPricePerc) <= 0) {
    //     errors.startPricePerc = "ALLOW_POSITIVE_NUMERIC";
    // }
    // if (isEmpty(reqBody.endPricePerc)) {
    //     errors.endPricePerc = "REQUIRED";
    // } else if (isNaN(reqBody.endPricePerc)) {
    //     errors.endPricePerc = "ALLOW_NUMERIC";
    // } else if (parseFloat(reqBody.endPricePerc) <= 0) {
    //     errors.endPricePerc = "ALLOW_POSITIVE_NUMERIC";
    // }
    if (!isEmpty(errors)) {
        return res.status(400).json({ "errors": errors })
    }

    return next();
}