
import net from "net";

const port = 5083;
const client = new net.Socket();

client.setTimeout(2000);

client.connect(port, "127.0.0.1", () => {
    console.log(`Port ${port} is OPEN`);
    client.destroy();
});

client.on("error", (err) => {
    console.log(`Port ${port} is CLOSED or unreachable: ${err.message}`);
    client.destroy();
});

client.on("timeout", () => {
    console.log(`Port ${port} TIMEOUT`);
    client.destroy();
});
