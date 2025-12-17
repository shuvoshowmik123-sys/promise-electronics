
const http = require('http');

function login(callback) {
    const data = JSON.stringify({ username: 'admin', password: 'admin123' });
    const options = {
        hostname: 'localhost',
        port: 5082,
        path: '/api/admin/login',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const req = http.request(options, (res) => {
        const cookies = res.headers['set-cookie'];
        console.log('Login Status:', res.statusCode);
        callback(cookies);
    });

    req.write(data);
    req.end();
}

function settle(cookies) {
    const data = JSON.stringify({ paymentAmount: 500, paymentMethod: "Cash" });
    const options = {
        hostname: 'localhost',
        port: 5082,
        path: '/api/due-records/TUF7IYPF0Wa4US1NEOkWZ',
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length,
            'Cookie': cookies
        }
    };

    const req = http.request(options, (res) => {
        console.log('Settle Status:', res.statusCode);
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
            console.log('BODY:', chunk);
        });
    });

    req.write(data);
    req.end();
}

login(settle);
