
const http = require('http');

const data = JSON.stringify({
    paymentAmount: 500,
    paymentMethod: "Cash"
});

const options = {
    hostname: 'localhost',
    port: 5082,
    path: '/api/due-records/TUF7IYPF0Wa4US1NEOkWZ',
    method: 'PATCH',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Cookie': 'connect.sid=s%3A...' // I need the cookie.
    }
};

// I'll use curl instead, it's easier with cookie file.
