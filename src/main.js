const {SerialPort} = require("serialport");
const args = require("minimist")(process.argv.slice(2));

var protocol = require("./protocol");

var port = new SerialPort({
    path: args["serial-port"] || "/dev/ttyACM0",
    baudRate: Number(args["baud-rate"]) || 115_200
});

console.log(protocol.parseMessage(protocol.createRequestConversation(0xAAA, 0x0BBC, 0x1234, 317, 2)));

port.on("open", function() {
    var request = protocol.createRequestConversation(0xAAAA, 0x0BBC, 0x1234, 317, 2);

    console.log(request);

    port.write(request);
});

port.on("data", function(data) {
    process.stdout.write(data);
});