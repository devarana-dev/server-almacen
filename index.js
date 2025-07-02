const express = require('express')
const bodyParser = require('body-parser')
const passport = require('passport')
const cors = require('cors')
const app = express()
const dbConfig = require('./config/db')
const cookieSession = require('express-session');
const router = require('./routes')
require('./utils/cronSchedule')
const { configureSockets, socketService } = require('./services/socketService')
const { logError } = require('./services/LogtailService')

require('dotenv').config()
require('./services/googleStrategy')
require('./services/jwtStrategy')
require('./models')

const COOKIE_SECRET = process.env.COOKIE_SECRET;

app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())
app.use(cors( { origin: process.env.CLIENT_URL, credentials:true } ));

app.use(cookieSession({
    secret: COOKIE_SECRET,
    saveUninitialized: true,
    resave: false,
    name: 'erp-session',
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 24 hours,
        sameSite: process.env.NODE_ENV === "production" ? 'none' : 'lax', // must be 'none' to enable cross-site delivery
        secure: process.env.NODE_ENV === "production", // must be true if sameSite='none'
    }
}));

app.use(passport.initialize());
app.use(passport.session());
app.set("trust proxy", 1);

app.use('/api', router)


dbConfig.sync()
.then( () => {
    console.log('DB Connected')
})
.catch( err => {
    const errorinfo = `${new Date(Date.now()).toLocaleString()} - ${err} \n`
    console.log(errorinfo);
    logError(err)
})


process.on('uncaughtException', (err) => {
    const errorinfo = `${new Date(Date.now()).toLocaleString()} - ${err} \n`
    console.log(errorinfo);
    logError(err)
});

process.on('unhandledRejection', (err) => {
    const errorinfo = `${new Date(Date.now()).toLocaleString()} - ${err} \n`
    console.log(errorinfo);
    logError(err)
});


const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "127.0.0.1"

const server = app.listen(PORT, HOST, () => {
    console.log(`Server running on port ${process.env.PORT}`);
    console.log(server.address())
});



socketService(server)




