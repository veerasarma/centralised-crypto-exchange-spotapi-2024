// import helpers
import isEmpty from "../lib/isEmpty.js";

export const dateValidation = (req, res, next) => {
  let errors = {};
  let reqQuery = req.query;
  // console.log("reqQueryreqQueryreqQuery", reqQuery);
  if (reqQuery.type == "searchType") {
    let parseData = JSON.parse(reqQuery.fillter);

    console.log(Object.keys(parseData), "-parseData")

    let startDate =
      Object.keys(parseData)[0] == "sefd_orderDate"
        ? parseData.sefd_orderDate?.startDate
        : parseData.sefd_createdAt?.startDate;
    let endDate =
      Object.keys(parseData)[0] == "sefd_orderDate"
        ? parseData.sefd_orderDate?.endDate
        : parseData.sefd_createdAt?.endDate;

    startDate = new Date(startDate);
    endDate = new Date(endDate);
    let currentDate = new Date();
    if (
      isEmpty(
        Object.keys(parseData).includes("sefd_orderDate") //when searching date field is orderdate,
          ? parseData.sefd_orderDate?.startDate
          : parseData.sefd_createdAt?.startDate
      )
    ) {
      errors.date = "Choose start date";
    } else if (startDate.getTime() > currentDate.getTime()) {
      errors.date = " Invalid start date";
    } else if (
      isEmpty(
        Object.keys(parseData).includes("sefd_orderDate") // when searching date field is orderdate,
          ? parseData.sefd_orderDate?.endDate
          : parseData.sefd_createdAt?.endDate
      )
    ) {
      errors.date = "Choose end date";
    } else if (endDate.getTime() > currentDate.getTime()) {
      errors.date = " Invalid end date";
    }
    if (startDate != "" && endDate != "") {
      if (startDate.getTime() > endDate.getTime()) {
        errors.date = " Invalid date";
      }
    }
  }
  if (!isEmpty(errors)) {
    return res.status(400).json({ success: false, errors: errors });
  } else {
    return next();
  }
};
