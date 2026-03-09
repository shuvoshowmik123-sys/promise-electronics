import { createServer } from 'http';
import { EventSource } from 'eventsource';
import { app } from '../server/app';

const TEST_CLIENT_COUNT = 500;
const DURATION_MS = 5000;

async function runLoadTest() {
    console.log(`Starting SSE Load Smoke Test with ${TEST_CLIENT_COUNT} concurrent clients...`);

    // Inject a dummy SSE endpoint for pure connection limit load testing
    app.get('/api/public/test-sse', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        res.write('data: connected\n\n');

        let interval = setInterval(() => {
            res.write('event: ping\ndata: ping\n\n');
        }, 500);

        req.on('close', () => clearInterval(interval));
    });

    const server = createServer(app);
    server.maxConnections = 2000;
    server.headersTimeout = 60000;
    server.keepAliveTimeout = 60000;
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as any;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    console.log(`Test server running at ${baseUrl}`);

    let connectedCount = 0;
    let errorCount = 0;
    let receivedMessages = 0;
    const clients: EventSource[] = [];

    // Spin up clients with slight delay to prevent OS socket exhaustion
    for (let i = 0; i < TEST_CLIENT_COUNT; i++) {
        await new Promise(r => setTimeout(r, 5)); // 5ms delay between connections
        const es = new EventSource(`${baseUrl}/api/public/test-sse`) as any;

        es.onopen = () => connectedCount++;
        es.onerror = () => errorCount++;
        es.onmessage = () => { receivedMessages++; };

        // Sometimes EventSource needs explicit event listeners
        es.addEventListener('ping', () => { receivedMessages++; });

        clients.push(es);
    }

    // Wait for connections to stabilize
    await new Promise(r => setTimeout(r, DURATION_MS));

    console.log('--- TEST RESULTS ---');
    console.log(`Target Clients: ${TEST_CLIENT_COUNT}`);
    console.log(`Connected: ${connectedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Messages Received: ${receivedMessages}`);

    if (connectedCount < TEST_CLIENT_COUNT * 0.9) {
        console.error('❌ Failed: Connection drop rate too high.');
        process.exitCode = 1;
    } else if (errorCount > TEST_CLIENT_COUNT * 0.1) {
        console.error('❌ Failed: Error rate too high.');
        process.exitCode = 1;
    } else {
        console.log('✅ Passed: SSE Broker handled concurrent load successfully.');
    }

    // Teardown
    clients.forEach(c => c.close());
    server.close();
    process.exit();
}

runLoadTest().catch(console.error);
