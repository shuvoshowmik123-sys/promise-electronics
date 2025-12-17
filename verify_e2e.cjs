
const http = require('http');

// Helper to make requests
function request(options, data) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ statusCode: res.statusCode, headers: res.headers, body: body ? JSON.parse(body) : null });
                } catch (e) {
                    console.log("Raw Body:", body);
                    resolve({ statusCode: res.statusCode, headers: res.headers, body: body });
                }
            });
        });
        req.on('error', reject);
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

async function run() {
    try {
        // 1. Login
        console.log("Logging in...");
        const loginRes = await request({
            hostname: 'localhost',
            port: 5082,
            path: '/api/admin/login',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { username: 'admin', password: 'admin123' });

        const cookies = loginRes.headers['set-cookie'];
        console.log("Logged in.");

        // 2. Create POS Transaction
        console.log("Creating POS Transaction...");
        const posData = {
            id: `test_pos_${Date.now()}`,
            items: "[]",
            subtotal: 1000,
            tax: 0,
            taxRate: 0,
            discount: 0,
            total: 1000,
            paymentMethod: "Due",
            paymentStatus: "Pending",
            customer: "Test E2E",
            customerPhone: "01700000000"
        };
        const posRes = await request({
            hostname: 'localhost',
            port: 5082,
            path: '/api/pos-transactions',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Cookie': cookies }
        }, posData);
        console.log("POS Created:", posRes.body.invoiceNumber);

        // 3. Get Due Record
        console.log("Fetching Due Records...");
        const dueRes = await request({
            hostname: 'localhost',
            port: 5082,
            path: '/api/due-records',
            method: 'GET',
            headers: { 'Cookie': cookies }
        });

        const dueRecord = dueRes.body.find(d => d.invoice === posRes.body.invoiceNumber);
        if (!dueRecord) throw new Error("Due record not found!");
        console.log("Due Record Found:", dueRecord.id);

        // 4. Settle Payment
        console.log("Settling Payment...");
        const settleRes = await request({
            hostname: 'localhost',
            port: 5082,
            path: `/api/due-records/${dueRecord.id}`,
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Cookie': cookies }
        }, { paymentAmount: 500, paymentMethod: "Cash" });
        console.log("Payment Settled:", settleRes.statusCode);
        console.log("Settle Body:", JSON.stringify(settleRes.body));

        // 5. Check Petty Cash
        console.log("Checking Petty Cash...");
        const pcRes = await request({
            hostname: 'localhost',
            port: 5082,
            path: '/api/petty-cash',
            method: 'GET',
            headers: { 'Cookie': cookies }
        });

        // Find the record linked to this due record
        const pcRecord = pcRes.body.find(p => p.dueRecordId === dueRecord.id);

        if (pcRecord) {
            console.log("SUCCESS! Petty Cash Record Found with dueRecordId:", pcRecord.dueRecordId);
            console.log("Record Details:", JSON.stringify(pcRecord, null, 2));
        } else {
            console.log("FAILURE! Petty Cash Record NOT found for dueRecordId:", dueRecord.id);
            // Check if any record matches description
            const descMatch = pcRes.body.find(p => p.description.includes(posRes.body.invoiceNumber));
            if (descMatch) {
                console.log("Found record by description but dueRecordId is:", descMatch.dueRecordId);
            } else {
                console.log("No record found even by description.");
            }
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

run();
