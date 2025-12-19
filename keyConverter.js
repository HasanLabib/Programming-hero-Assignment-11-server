const fs = require('fs');
const key = fs.readFileSync('./decoration-booking-firebase-adminsdk-fbsvc-b86b2d7ed5.json', 'utf8')
const base64 = Buffer.from(key).toString('base64')
console.log(base64)