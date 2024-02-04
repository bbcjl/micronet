const {SerialPort} = require("serialport");
const args = require("minimist")(process.argv.slice(2));

var common = require("./common");
var conversations = require("./conversations");

const IS_SERVER = args["serial-port"] == "/dev/ttyACM1";

var port = new SerialPort({
    path: args["serial-port"] || "/dev/ttyACM0",
    baudRate: Number(args["baud-rate"]) || 115_200
});

var dataStream = Buffer.alloc(0);
var modemCommand = null;
var modemPayloadLength = 0;

var manager = new conversations.ConversationManager(IS_SERVER ? 0x0BBC : 0xAAAA);

manager.requestHandler = function(payload) {
    console.log("Received request:", payload.toString());

    return Promise.resolve(Buffer.from("pong"));
};

port.on("open", function() {
    console.log(`Modem connected; micro:net is up! (ID ${common.hex(manager.id)})`);

    if (!IS_SERVER) {
        manager.createRequest(0x0BBC, Buffer.from("ping")).then(function(payload) {
            console.log("Received response:", payload.toString());
        });
    }

    setInterval(function() {
        if (manager.hasMessagesInOutbox) {
            var message = manager.getMessageFromOutbox();

            port.write("mm");
            port.write(Buffer.from([0x01, 0x01, message.length]));
            port.write(message);
        }

        manager.update();
    });
});

port.on("data", function(data) {
    dataStream = Buffer.concat([dataStream, data]);

    if (modemCommand == null && dataStream.length >= 5) {
        if (dataStream.subarray(0, 3).equals(Buffer.from([0x4D, 0x4D, 0x01]))) {
            modemCommand = dataStream[3];
            modemPayloadLength = dataStream[4] || 0;

            dataStream = dataStream.subarray(5);
        } else {
            dataStream = dataStream.subarray(1);
        }
    }

    if (modemCommand != null && dataStream.length >= modemPayloadLength) {
        var data = dataStream.subarray(0, modemPayloadLength);

        switch (modemCommand) {
            case 0x01:
                manager.addMessageToInbox(data);
                break;
    
            default:
                console.warn(`Unknown micro:modem command: ${common.hex(modemCommand, 2)}`);
                break;
        }

        dataStream = dataStream.subarray(modemPayloadLength);
        modemCommand = null;
        modemPayloadLength = 0;

        return;
    }
});