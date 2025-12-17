
import Database from "better-sqlite3";

const db = new Database("sqlite.db");

function checkData() {
    try {
        const rows = db.prepare("SELECT * FROM challans LIMIT 5").all();
        console.log("Challans rows:", JSON.stringify(rows, null, 2));
    } catch (error) {
        console.error("Error checking data:", error);
    }
}

checkData();
