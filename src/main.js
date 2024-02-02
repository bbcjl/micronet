const {SerialPort} = require("serialport");
const args = require("minimist")(process.argv.slice(2));

var common = require("./common");
var conversations = require("./conversations");

var port = new SerialPort({
    path: args["serial-port"] || "/dev/ttyACM0",
    baudRate: Number(args["baud-rate"]) || 115_200
});

var manager = new conversations.ConversationManager(0xAAAA);

manager.requestHandler = function(payload) {
    console.log("Received request:", payload.toString());

    return Promise.resolve(Buffer.from("pong"));
};

port.on("open", function() {
    console.log(`Modem connected; micro:net is up! (ID ${common.hex(manager.id)})`);

    setInterval(function() {
        if (manager.hasMessagesInOutbox) {
            port.write(manager.getMessageFromOutbox());
        }

        manager.update();
    });

    manager.createRequest(0x0BBC, Buffer.from("ping")).then(function(payload) {
        console.log("Received response:", payload.toString());
    });
});

port.on("data", function(data) {
    manager.addMessageToInbox(data);
});