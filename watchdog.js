const { spawn } = require("child_process");
const keepAlive = require("./keepalive");

// Patakbuhin ang Keepalive Web Server
keepAlive();

function startBot() {
    console.log("[ WATCHDOG ] Starting VOIDLESS Engine Process...");

    // Patakbuhin ang main index.js script
    const child = spawn("node", ["index.js"], {
        stdio: "inherit",
        shell: true
    });

    // Pakinggan kapag namatay o nag-crash ang bot process
    child.on("close", (code) => {
        console.log(`[ WATCHDOG ] Bot process exited with code ${code}. Restarting in 3 seconds...`);
        setTimeout(() => {
            startBot();
        }, 3000);
    });

    child.on("error", (err) => {
        console.error("[ WATCHDOG ] Process Error:", err.message);
    });
}

// Simulan ang pagbabantay
startBot();
