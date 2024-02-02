const {SerialPort} = require("serialport");
const args = require("minimist")(process.argv.slice(2));

var common = require("./common");
var conversations = require("./conversations");

var port = new SerialPort({
    path: args["serial-port"] || "/dev/ttyACM0",
    baudRate: Number(args["baud-rate"]) || 115_200
});

var manager = new conversations.ConversationManager(0x0BBC);

manager.requestHandler = function(payload) {
    console.log("Received request:", payload.toString());

    return Promise.resolve(Buffer.from("pong"));
};

port.on("open", function() {
    console.log(`Modem connected; micro:net is up! (ID ${common.hex(manager.id)})`);

    // setInterval(function() {
    //     port.write("mm");
    //     port.write(Buffer.from([0x01, 0x01, 4]));
    //     port.write("test");
    // }, 1000);

    // setInterval(function() {
    //     if (manager.hasMessagesInOutbox) {
    //         var message = manager.getMessageFromOutbox();

    //         port.write("mm");
    //         port.write(Buffer.from([0x01, 0x01, message.length]));
    //         port.write(message);
    //     }

    //     manager.update();
    // });
});

port.on("data", function(data) {
    console.log(data);
    // manager.addMessageToInbox(data);
});