const { execFile } = require('child_process');
const path = require('path');
require('dotenv').config();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

function createVoicelines(arr) {
    return new Promise((resolve, reject) => {
        const binaryPath = path.join(__dirname, 'auctioneer', 'mybinary')

        execFile(binaryPath, ["3", ELEVENLABS_API_KEY, arr[0], arr[1], arr[2]], (error, stdout, stderr) => {
            if (error) {
                console.error("execFile error:", error.message);
                return reject(error);
            }

            if (stderr) console.warn("stderr:", stderr);
            console.log("✅ stdout:", stdout);
            resolve();
        });
    });
}



module.exports = { createVoicelines };