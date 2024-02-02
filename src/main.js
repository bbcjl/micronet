const {SerialPort} = require("serialport");
const args = require("minimist")(process.argv.slice(2));

var common = require("./common");
var conversations = require("./conversations");

var port = new SerialPort({
    path: args["serial-port"] || "/dev/ttyACM0",
    baudRate: Number(args["baud-rate"]) || 115_200
});

var manager = new conversations.ConversationManager();

manager.requestHandler = function(payload) {
    console.log("Received request:", payload);

    return Promise.resolve(Buffer.from([0x01, 0x02, 0x03, 0x04]));
};

port.on("open", function() {
    console.log(`Modem connected; micro:net is up! (ID ${common.hex(manager.id)})`);

    setInterval(function() {
        if (manager.hasMessagesInOutbox) {
            port.write(manager.getMessageFromOutbox());
        }

        manager.update();
    });
});

port.on("data", function(data) {
    manager.addMessageToInbox(data);
});