// import package
import mongoose from 'mongoose';

// import config
import config from './index';

const dbConnection = (cb) => {
    console.log("-----config", config.DATABASE_URI)

    mongoose.connect(config.DATABASE_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    }, (err, data) => {
        if (err) {
            console.log("-----err", err)
            console.log("\x1b[31m", 'Error on Database connection')
            setTimeout(() => {
                dbConnection(cb)
            }, 1000)
        } else {
            console.log('\x1b[33m%s\x1b[0m', `MongoDB successfully connected.`)
            return cb(true)
        }
    })
}

export default dbConnection;